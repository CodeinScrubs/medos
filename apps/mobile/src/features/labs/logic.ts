import type { LabValue } from '@/db/schema';

import { FLAG_LABEL, parseLabValue } from './flags';

/** Compare labels only; never case-fold SI prefixes or infer a conversion. */
export function sameLabUnitLabel(left: string | null | undefined, right: string | null | undefined): boolean {
  return (left ?? '').trim() === (right ?? '').trim();
}

/**
 * Rows copied from Excel, Google Sheets or a CSV, as [analyte, value, unit?].
 *
 * Spreadsheet apps put a tab between cells on the clipboard; CSV uses commas
 * and quotes anything containing one; text pasted from elsewhere is often
 * aligned with runs of spaces.
 *
 * Column positions are kept exactly as they came. An empty cell used to be
 * dropped, which slid every later column one to the left — `Na<tab><tab>mmol/L`
 * became sodium with a value of "mmol/L". A row without both a name and a
 * value is skipped instead of being guessed at. A header row such as
 * "Test / Result" is dropped when its second cell is not a plausible result.
 */
export function parsePastedTable(text: string): [string, string, string | undefined][] {
  const rows: [string, string, string | undefined][] = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const cells = splitCells(line);
    const [analyte = '', value = '', unit] = cells;
    if (!analyte || !value) continue;
    if (rows.length === 0 && isHeaderRow(analyte, value)) continue;
    rows.push([analyte, value, unit || undefined]);
  }
  return rows;
}

function splitCells(line: string): string[] {
  if (line.includes('\t')) return line.split('\t').map((c) => c.trim());
  if (line.includes(',')) return splitCsv(line);
  // Space-aligned text carries no information about empty cells.
  return line
    .split(/\s{2,}/)
    .map((c) => c.trim())
    .filter(Boolean);
}

/** A CSV line, where a quoted cell may contain the separator: `Plt,"250,000",/µL`. */
function splitCsv(line: string): string[] {
  const cells: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        cell += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ',') {
      cells.push(cell.trim());
      cell = '';
    } else {
      cell += ch;
    }
  }
  cells.push(cell.trim());
  return cells;
}

const HEADER_WORDS = /^(test|analyte|name|result|value|آزمایش|نام|نتیجه|مقدار)$/i;

function isHeaderRow(first: string, second: string): boolean {
  return HEADER_WORDS.test(first) && HEADER_WORDS.test(second);
}

/**
 * A result that was meant as a number but cannot be read as one.
 *
 * `5,8` is the common case: a decimal comma, which `parseDecimal` refuses
 * rather than guesses (it could be 5.8 or a typo of 58). Refusing silently was
 * worse — the value was stored as text, got no flag, and a potassium of 5.8
 * sat in the flowsheet looking normal. For an analyte that is always numeric
 * any unreadable value counts; for a row the user named themselves, only text
 * that looks like a number does, since "negative" is a real result there.
 */
export function isUnreadableNumber(value: string, alwaysNumeric: boolean): boolean {
  const text = value.trim();
  if (!text) return false;
  if (parseLabValue(text) != null) return false;
  return alwaysNumeric || LOOKS_NUMERIC.test(text);
}

const LOOKS_NUMERIC = /^(?:<=|>=|<|>|≤|≥)?\s*[-+]?[\d.,٫٬،۰-۹٠-٩]+$/;

type LabContext = {
  panelId?: string;
  panelName?: string | null;
  labName?: string | null;
  specimen?: string | null;
  method?: string | null;
  value: Pick<LabValue, 'analyte'> & Partial<Pick<LabValue, 'unit' | 'refLow' | 'refHigh'>>;
};

/** Context recorded on the source report. Empty or mixed gas labels are not evidence of specimen. */
export function labSeriesKey(row: LabContext): string | null {
  const normalized = (label?: string | null) => label?.trim().toLowerCase() || null;
  const panel = normalized(row.panelName);
  const specimen = normalized(row.specimen);
  const analyte = normalized(row.value.analyte);
  const bloodGas = /^(ph|pc?o[₂2]|hco[₃3]|be|s[av]o[₂2]|lactate)$/.test(analyte ?? '');
  if (specimen && /[/+]|\b(?:unknown|mixed)\b|نامشخص|ترکیبی/.test(specimen)) return null;
  if ((!panel && !specimen) || (bloodGas && !specimen && panel !== 'abg' && panel !== 'vbg')) return null;
  return JSON.stringify([
    analyte,
    panel,
    specimen,
    normalized(row.labName),
    normalized(row.method),
    row.value.unit?.trim() || null,
    row.value.refLow ?? null,
    row.value.refHigh ?? null,
  ]);
}

export function labSeriesGroups<T extends LabContext>(rows: readonly T[]): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const key = labSeriesKey(row);
    if (key === null) continue;
    const series = groups.get(key);
    if (series) series.push(row);
    else groups.set(key, [row]);
  }
  return groups;
}

type LatestRow = LabContext & {
  value: Pick<LabValue, 'analyte' | 'value' | 'valueNum' | 'flag'>;
  collectedAt: Date;
};

const OUTSIDE_RANGE: readonly (LabValue['flag'] & string)[] = ['high', 'low', 'critical_high', 'critical_low'];

/**
 * What a patient's summary says about their labs.
 *
 * The newest comparable result decides: a potassium that was high
 * yesterday and normal this morning is not shown. Of those newest results,
 * only the ones that need a look are returned — flagged outside the range
 * stored with them, or typed in a way that cannot be read as a number (a
 * "5,8" that got no flag at all). Nothing here judges a result without a
 * range; it is neither shown as abnormal nor counted as normal.
 *
 * `analytes` is the number of result groups, so the summary can say
 * how much it looked at when it has nothing to show. Newest first.
 */
export function labsToReview<T extends LatestRow>(
  rows: readonly T[],
): { rows: T[]; analytes: number; latestAt: Date | null } {
  const newest = new Map<string, T>();
  for (const row of rows) {
    const key = labSeriesKey(row) ?? JSON.stringify([row.value.analyte.trim().toLowerCase(), row.panelId ?? null]);
    const seen = newest.get(key);
    if (!seen || row.collectedAt.getTime() > seen.collectedAt.getTime()) newest.set(key, row);
  }
  const latest = [...newest.values()].sort((a, b) => b.collectedAt.getTime() - a.collectedAt.getTime());
  const review = latest.filter(
    (r) =>
      (r.value.flag != null && OUTSIDE_RANGE.includes(r.value.flag)) ||
      (r.value.valueNum == null && isUnreadableNumber(r.value.value ?? '', false)),
  );
  return { rows: review, analytes: latest.length, latestAt: latest[0]?.collectedAt ?? null };
}

/**
 * One draw as a line of results — "K 5.8 H · Cr 1.9 H · Na 138" — for the
 * timeline, where a panel's name alone said nothing about what came back.
 * Results flagged outside their range, or unreadable as a number ("?"), come
 * first so they survive when the line is cut short; the rest keep the order
 * they were entered in.
 */
export function panelResultsLine(values: readonly Pick<LabValue, 'analyte' | 'value' | 'valueNum' | 'flag'>[]): string {
  const marked = values
    .filter((v) => v.value?.trim())
    .map((v) => {
      const flag = v.flag && OUTSIDE_RANGE.includes(v.flag) ? FLAG_LABEL[v.flag] : null;
      const unreadable = v.valueNum == null && isUnreadableNumber(v.value ?? '', false);
      const mark = flag ?? (unreadable ? '?' : null);
      return { text: [v.analyte.trim(), v.value!.trim(), mark].filter(Boolean).join(' '), first: mark != null };
    });
  return [...marked.filter((m) => m.first), ...marked.filter((m) => !m.first)].map((m) => m.text).join(' · ');
}
