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
