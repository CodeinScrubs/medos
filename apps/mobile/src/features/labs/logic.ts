import type { LabValue } from '@/db/schema';

import { FLAG_LABEL, parseLabValue } from './flags';

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

/**
 * The rows that may share one chart: those measured in the unit of the most
 * recent result. A creatinine of 1.0 mg/dL and one of 88.4 µmol/L are the same
 * value in different units; plotted on one axis they look like a tenfold rise.
 * Converting between units is a decision per analyte, so the odd ones out are
 * left off the chart and counted instead.
 *
 * A result typed without a unit is not an odd one out — it is a result whose
 * unit was not written down, which is how most of them are entered. Only a
 * unit that is there and different excludes a row. Rows are expected oldest
 * first, the order the trend screen reads them in.
 */
export function sameUnitSeries<T extends { unit: string | null }>(
  rows: T[],
): { series: T[]; unit: string | null; excluded: number; unlabelled: number } {
  const normal = (u: string | null) => (u ?? '').trim().toLowerCase();
  let unit: string | null = null;
  for (let i = rows.length - 1; i >= 0; i -= 1) {
    if (normal(rows[i]!.unit)) {
      unit = rows[i]!.unit;
      break;
    }
  }
  const series = rows.filter((r) => !normal(r.unit) || normal(r.unit) === normal(unit));
  // Counted, not hidden: once a unit is known for the series, a point with no
  // unit is an assumption the chart is making, and the screen says so.
  const unlabelled = unit == null ? 0 : series.filter((r) => !normal(r.unit)).length;
  return { series, unit, excluded: rows.length - series.length, unlabelled };
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

type LatestRow = { value: Pick<LabValue, 'analyte' | 'value' | 'valueNum' | 'flag'>; collectedAt: Date };

const OUTSIDE_RANGE: readonly (LabValue['flag'] & string)[] = ['high', 'low', 'critical_high', 'critical_low'];

/**
 * What a patient's summary says about their labs.
 *
 * The newest result of each analyte decides: a potassium that was high
 * yesterday and normal this morning is not shown. Of those newest results,
 * only the ones that need a look are returned — flagged outside the range
 * stored with them, or typed in a way that cannot be read as a number (a
 * "5,8" that got no flag at all). Nothing here judges a result without a
 * range; it is neither shown as abnormal nor counted as normal.
 *
 * `analytes` is how many analytes have a newest result, so the summary can say
 * how much it looked at when it has nothing to show. Newest first.
 */
export function labsToReview<T extends LatestRow>(
  rows: readonly T[],
): { rows: T[]; analytes: number; latestAt: Date | null } {
  const newest = new Map<string, T>();
  for (const row of rows) {
    const key = row.value.analyte.trim().toLowerCase();
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
