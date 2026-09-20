import { describe, expect, it } from '@jest/globals';

import { computeFlag, flagTone, formatRange, parseLabNumber, parseLabValue, parseRangeInput } from './flags';
import { parsePastedTable, sameUnitSeries } from './logic';
import { analyteDef, ANALYTE_ORDER, LAB_PRESETS, rangeFor } from './presets';

describe('parseLabNumber', () => {
  it.each([
    ['4.1', 4.1],
    ['۱۲٫۵', 12.5],
    ['7,500', 7500],
    ['250,000', 250000],
    ['<0.01', 0.01],
    ['> 1000', 1000],
    ['≤5', 5],
    ['-3', -3],
  ])('reads %j as %d', (typed, value) => {
    expect(parseLabNumber(typed)).toBe(value);
  });

  // Text results stay text: they are displayed as typed and never plotted.
  it.each(['Positive', 'trace', '1+', '12,5', 'hemolyzed', '', null])('does not read %j as a number', (typed) => {
    expect(parseLabNumber(typed)).toBeNull();
  });
});

describe('computeFlag', () => {
  it('flags against the row’s own range', () => {
    expect(computeFlag(5.6, 3.5, 5.1)).toBe('high');
    expect(computeFlag(3.2, 3.5, 5.1)).toBe('low');
    expect(computeFlag(4.1, 3.5, 5.1)).toBe('normal');
    expect(computeFlag(5.1, 3.5, 5.1)).toBe('normal');
  });

  it('works with a one-sided range', () => {
    expect(computeFlag(1.5, null, 1.2)).toBe('high');
    expect(computeFlag(40, 35, null)).toBe('normal');
  });

  it('never flags without a value or a range, and never invents a critical flag', () => {
    expect(computeFlag(null, 3.5, 5.1)).toBeNull();
    expect(computeFlag(9.9, null, null)).toBeNull();
    // K 9.9 against 3.5–5.1 is "high", not "critical": critical thresholds
    // are the physician's call, not a multiple of the normal range.
    expect(computeFlag(9.9, 3.5, 5.1)).toBe('high');
  });

  // A bounded result is not the number it contains. Dropping the sign is how a
  // troponin reported as ">100" against an upper limit of 100 ends up green.
  it('keeps the comparator a lab reported the result with', () => {
    expect(parseLabValue('>100')).toEqual({ value: 100, comparator: '>' });
    expect(parseLabValue('≤ ۰٫۰۱')).toEqual({ value: 0.01, comparator: '<=' });
    expect(parseLabValue('4.1')).toEqual({ value: 4.1, comparator: null });
    expect(parseLabValue('Positive')).toBeNull();
  });

  /*
   * The reference interval is inclusive, so a bound that still allows a normal
   * value must not be flagged. A wrong flag on a lab table reads as a fact.
   */
  it.each([
    ['>100', 'high'],
    ['>=100', null],
    ['<3', 'low'],
    ['<=3', null],
    ['<5', null],
    ['>5', null],
    ['100', 'normal'],
    ['3', 'normal'],
  ])('reads %j against an inclusive 3–100 range as %s', (typed, expected) => {
    expect(computeFlag(parseLabValue(typed), 3, 100)).toBe(expected);
  });

  it('judges a bounded result by what the bound proves', () => {
    // At or above the upper limit: high, whatever the true value is.
    expect(computeFlag(parseLabValue('>100'), null, 100)).toBe('high');
    expect(computeFlag(parseLabValue('>=0.5'), null, 0.04)).toBe('high');
    // A lower bound inside the range proves nothing — no reassuring flag.
    expect(computeFlag(parseLabValue('>0.01'), null, 0.04)).toBeNull();
    // An upper bound at or below the lower limit is low; below the upper
    // limit it is genuinely not high.
    expect(computeFlag(parseLabValue('<3.5'), 3.5, 5.1)).toBe('low');
    expect(computeFlag(parseLabValue('<0.01'), null, 0.04)).toBe('normal');
    // ...but an upper bound above the upper limit says nothing either way.
    expect(computeFlag(parseLabValue('<200'), null, 100)).toBeNull();
  });

  it('maps flags to tones', () => {
    expect(flagTone('high')).toBe('warning');
    expect(flagTone('low')).toBe('info');
    expect(flagTone('critical_high')).toBe('danger');
    expect(flagTone('normal')).toBeNull();
  });
});

describe('reference ranges', () => {
  it('formats ranges in Latin digits', () => {
    expect(formatRange(135, 145)).toBe('135–145');
    expect(formatRange(null, 1.2)).toBe('< 1.2');
    expect(formatRange(40, null)).toBe('> 40');
    expect(formatRange(null, null)).toBe('');
  });

  it.each([
    ['135-145', { low: 135, high: 145 }],
    ['۱۳۵ - ۱۴۵', { low: 135, high: 145 }],
    ['3٫5–5٫1', { low: 3.5, high: 5.1 }],
    ['150,000 - 450,000', { low: 150000, high: 450000 }],
    ['-2 to +2', { low: -2, high: 2 }],
    ['۱۰ تا ۲۰', { low: 10, high: 20 }],
    ['<5', { low: null, high: 5 }],
    ['> 40', { low: 40, high: null }],
    ['', { low: null, high: null }],
  ])('reads %j', (typed, range) => {
    expect(parseRangeInput(typed)).toEqual(range);
  });

  it.each(['145-135', 'normal', '5-', '<abc', '1,5-2'])('refuses %j', (typed) => {
    expect(parseRangeInput(typed)).toBeNull();
  });

  it('round-trips what it displays', () => {
    expect(parseRangeInput(formatRange(3.5, 5.1).replace('–', '-'))).toEqual({ low: 3.5, high: 5.1 });
    expect(parseRangeInput(formatRange(null, 1.2))).toEqual({ low: null, high: 1.2 });
  });
});

describe('presets', () => {
  const adultMale = { sex: 'male' as const, ageYears: 40 };
  const adultFemale = { sex: 'female' as const, ageYears: 40 };

  it('gives sex-specific ranges only when sex is known', () => {
    const hb = analyteDef('hb');
    expect(rangeFor(hb, adultMale)).toEqual({ low: 13.5, high: 17.5 });
    expect(rangeFor(hb, adultFemale)).toEqual({ low: 12, high: 15.5 });
    expect(rangeFor(hb, { sex: null, ageYears: 40 })).toBeNull();
  });

  it('gives no adult range to children or to an unknown age', () => {
    const wbc = analyteDef('WBC');
    expect(rangeFor(wbc, adultMale)).toEqual({ low: 4, high: 10 });
    expect(rangeFor(wbc, { sex: 'male', ageYears: 6 })).toBeNull();
    expect(rangeFor(wbc, { sex: 'male', ageYears: null })).toBeNull();
  });

  it('leaves method-dependent analytes and qualitative results without a range', () => {
    expect(rangeFor(analyteDef('ALP'), adultMale)).toBeNull();
    expect(rangeFor(analyteDef('Nitrite'), adultMale)).toBeNull();
    expect(rangeFor(undefined, adultMale)).toBeNull();
  });

  it('has sane, unique entries', () => {
    const names = LAB_PRESETS.flatMap((p) => p.analytes.map((a) => a.analyte.toLowerCase()));
    expect(new Set(names).size).toBe(names.length);
    expect(ANALYTE_ORDER.size).toBe(names.length);
    for (const preset of LAB_PRESETS) {
      for (const a of preset.analytes) {
        for (const range of [a.ref, a.refMale, a.refFemale]) {
          if (range?.low != null && range.high != null) expect(range.low).toBeLessThan(range.high);
        }
      }
    }
  });
});

describe('parsePastedTable', () => {
  it('reads tab-separated rows from a spreadsheet', () => {
    expect(parsePastedTable('Na\t138\tmEq/L\nK\t4.1\tmEq/L')).toEqual([
      ['Na', '138', 'mEq/L'],
      ['K', '4.1', 'mEq/L'],
    ]);
  });

  it('reads CSV and space-aligned text, and skips a header row', () => {
    expect(parsePastedTable('Test,Result\nCr,1.1')).toEqual([['Cr', '1.1', undefined]]);
    expect(parsePastedTable('Hb    12.5    g/dL\r\nPlt   250')).toEqual([
      ['Hb', '12.5', 'g/dL'],
      ['Plt', '250', undefined],
    ]);
  });

  it('ignores lines without a name and a value', () => {
    expect(parsePastedTable('\nCBC\n\nWBC\t7.2\n')).toEqual([['WBC', '7.2', undefined]]);
  });

  // An empty cell used to be dropped, which slid every later column one to the
  // left: a row with no value took its unit as the result.
  it('keeps column positions when a cell is empty', () => {
    expect(parsePastedTable('Na\t\tmEq/L\nK\t4.1\tmEq/L')).toEqual([['K', '4.1', 'mEq/L']]);
    expect(parsePastedTable('Cr,,mg/dL\nCr,1.1,mg/dL')).toEqual([['Cr', '1.1', 'mg/dL']]);
  });

  it('reads a quoted CSV cell that contains the separator', () => {
    expect(parsePastedTable('Plt,"250,000",/µL')).toEqual([['Plt', '250,000', '/µL']]);
    expect(parseLabNumber('250,000')).toBe(250000);
  });
});

describe('sameUnitSeries', () => {
  const row = (unit: string | null, value: number) => ({ unit, value });

  // Cr 1.0 mg/dL and Cr 88.4 µmol/L are the same result. On one axis they look
  // like a tenfold rise, so the odd ones out are left off and counted.
  it('keeps the unit of the most recent result and counts what it drops', () => {
    const rows = [row('µmol/L', 88.4), row('mg/dL', 1), row('mg/dL', 1.4)];
    expect(sameUnitSeries(rows)).toEqual({ series: [rows[1], rows[2]], unit: 'mg/dL', excluded: 1, unlabelled: 0 });
  });

  it('treats spacing and case as the same unit', () => {
    expect(sameUnitSeries([row('MG/DL ', 1), row('mg/dL', 1.4)]).excluded).toBe(0);
  });

  // Most results are typed without a unit. That is a unit nobody wrote down,
  // not a different one, so it stays on the chart.
  it('keeps results typed without a unit, and takes the unit from the newest that has one', () => {
    const rows = [row('mg/dL', 1), row(null, 1.4)];
    // Kept on the chart, but counted: assuming the unit is an assumption the
    // screen has to admit to.
    expect(sameUnitSeries(rows)).toEqual({ series: rows, unit: 'mg/dL', excluded: 0, unlabelled: 1 });
    expect(sameUnitSeries([row(null, 1), row(null, 2)]).unit).toBeNull();
    expect(sameUnitSeries([row(null, 1), row(null, 2)]).unlabelled).toBe(0);
    expect(sameUnitSeries([])).toEqual({ series: [], unit: null, excluded: 0, unlabelled: 0 });
  });
});
