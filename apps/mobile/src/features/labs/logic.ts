/**
 * Rows copied from Excel, Google Sheets or a CSV, as [analyte, value, unit?].
 *
 * Spreadsheet apps put a tab between cells on the clipboard; CSV uses commas;
 * text pasted from elsewhere is often aligned with runs of spaces. A line
 * needs at least a name and a value to count. A header row such as
 * "Test / Result" is dropped when its second cell is not a plausible result.
 */
export function parsePastedTable(text: string): [string, string, string | undefined][] {
  const rows: [string, string, string | undefined][] = [];
  for (const line of text.split(/\r?\n/)) {
    const cells = splitCells(line);
    if (cells.length < 2) continue;
    const [analyte, value, unit] = cells as [string, string, string | undefined];
    if (rows.length === 0 && isHeaderRow(analyte, value)) continue;
    rows.push([analyte, value, unit]);
  }
  return rows;
}

function splitCells(line: string): string[] {
  const cells = line.includes('\t') ? line.split('\t') : line.includes(',') ? line.split(',') : line.split(/\s{2,}/);
  return cells.map((c) => c.trim()).filter(Boolean);
}

const HEADER_WORDS = /^(test|analyte|name|result|value|آزمایش|نام|نتیجه|مقدار)$/i;

function isHeaderRow(first: string, second: string): boolean {
  return HEADER_WORDS.test(first) && HEADER_WORDS.test(second);
}
