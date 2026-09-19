import { describe, expect, it } from '@jest/globals';

import {
  ageInYears,
  daysBetween,
  daysUntilJalaliOccurrence,
  formatAge,
  formatJalali,
  formatJalaliDateTime,
  formatJalaliLong,
  formatJalaliWithWeekday,
  formatRelative,
  formatRelativeTime,
  fromIsoDate,
  fromJalali,
  jalaliMonthLength,
  nextJalaliOccurrence,
  parseJalaliInput,
  toIsoDate,
  toJalali,
} from './jalali';

// Dates are built with local-time constructors throughout, so the tests hold
// in any time zone.
const d = (y: number, m: number, day: number, h = 0, min = 0) => new Date(y, m - 1, day, h, min);

describe('conversion', () => {
  it('knows Nowruz', () => {
    expect(toJalali(d(2024, 3, 20))).toEqual({ jy: 1403, jm: 1, jd: 1 });
    expect(fromJalali(1403, 1, 1)).toEqual(d(2024, 3, 20));
  });

  it('round-trips every day of a leap year', () => {
    for (
      let day = d(2024, 3, 20);
      day < d(2025, 3, 21);
      day = new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1)
    ) {
      const { jy, jm, jd } = toJalali(day);
      expect(fromJalali(jy, jm, jd)).toEqual(day);
    }
  });

  it('knows which Esfand has 30 days', () => {
    expect(jalaliMonthLength(1403, 12)).toBe(30);
    expect(jalaliMonthLength(1404, 12)).toBe(29);
    expect(jalaliMonthLength(1404, 1)).toBe(31);
    expect(jalaliMonthLength(1404, 7)).toBe(30);
  });
});

describe('ISO dates', () => {
  it('writes and reads local calendar dates', () => {
    expect(toIsoDate(d(2024, 1, 5))).toBe('2024-01-05');
    expect(fromIsoDate('2024-01-05')).toEqual(d(2024, 1, 5));
  });

  it('rejects impossible and malformed dates', () => {
    expect(fromIsoDate('2024-02-29')).toEqual(d(2024, 2, 29));
    expect(fromIsoDate('2023-02-29')).toBeNull();
    expect(fromIsoDate('2024-13-01')).toBeNull();
    expect(fromIsoDate('2024-1-5')).toBeNull();
    expect(fromIsoDate('')).toBeNull();
  });
});

describe('parseJalaliInput', () => {
  const now = fromJalali(1405, 6, 28);

  it('reads the ways a date is typed', () => {
    expect(parseJalaliInput('1403/05/12', now)).toEqual(fromJalali(1403, 5, 12));
    expect(parseJalaliInput('۱۴۰۳-۵-۱۲', now)).toEqual(fromJalali(1403, 5, 12));
    expect(parseJalaliInput(' 1403.5.12 ', now)).toEqual(fromJalali(1403, 5, 12));
  });

  it('reads a two-digit year as the nearest plausible one', () => {
    expect(parseJalaliInput('03/5/12', now)).toEqual(fromJalali(1403, 5, 12));
    expect(parseJalaliInput('65/3/12', now)).toEqual(fromJalali(1365, 3, 12));
    // Next year is still plausible (a follow-up date); the year after is not.
    expect(parseJalaliInput('06/1/15', now)).toEqual(fromJalali(1406, 1, 15));
    expect(parseJalaliInput('07/1/15', now)).toEqual(fromJalali(1307, 1, 15));
  });

  it('accepts Esfand 30 only in a leap year', () => {
    expect(parseJalaliInput('1403/12/30', now)).toEqual(fromJalali(1403, 12, 30));
    expect(parseJalaliInput('1404/12/30', now)).toBeNull();
  });

  it('rejects anything that is not exactly a day, month and year', () => {
    for (const bad of ['1403/13/01', '1403/05', '1403/05/12/08', '403/05/12', '12/05/1403', '', 'فردا']) {
      expect(parseJalaliInput(bad, now)).toBeNull();
    }
  });
});

describe('formatting', () => {
  const day = d(2024, 8, 2, 14, 30); // 12 Mordad 1403, a Friday

  it('formats dates in Persian digits', () => {
    expect(formatJalali(day)).toBe('۱۴۰۳/۰۵/۱۲');
    expect(formatJalaliLong(day)).toBe('۱۲ مرداد ۱۴۰۳');
    expect(formatJalaliWithWeekday(day)).toBe('جمعه ۱۲ مرداد');
    expect(formatJalaliDateTime(day)).toBe('۱۲ مرداد ۱۴۰۳ • ۱۴:۳۰');
  });

  it('accepts the storage formats: Date, unix ms, ISO date, ISO date-time', () => {
    expect(formatJalali(day.getTime())).toBe('۱۴۰۳/۰۵/۱۲');
    expect(formatJalali('2024-08-02')).toBe('۱۴۰۳/۰۵/۱۲');
    expect(formatJalali(day.toISOString())).toBe('۱۴۰۳/۰۵/۱۲');
  });

  it('never guesses at anything else', () => {
    // new Date('1403/05/12') would read this as the Gregorian year 1403.
    expect(formatJalali('1403/05/12')).toBe('—');
    expect(formatJalali('yesterday')).toBe('—');
    expect(formatJalali(null)).toBe('—');
    expect(formatJalali(new Date(Number.NaN))).toBe('—');
  });
});

describe('relative days', () => {
  const now = d(2024, 6, 10, 15, 0);

  it('counts calendar days, not 24-hour periods', () => {
    expect(daysBetween(d(2024, 6, 11, 0, 5), d(2024, 6, 10, 23, 55))).toBe(1);
    expect(daysBetween(d(2024, 6, 10, 23, 59), d(2024, 6, 10, 0, 0))).toBe(0);
  });

  it.each([
    [0, 'امروز'],
    [1, 'فردا'],
    [-1, 'دیروز'],
    [2, 'پس‌فردا'],
    [-2, 'پریروز'],
    [5, '۵ روز دیگر'],
    [-10, '۱۰ روز پیش'],
  ])('describes %d days away as %j', (offset, text) => {
    expect(formatRelative(d(2024, 6, 10 + offset, 9, 0), now)).toBe(text);
  });

  it('falls back to the date beyond two weeks', () => {
    expect(formatRelative(d(2024, 5, 1), now)).toBe(formatJalaliLong(d(2024, 5, 1)));
  });

  it('uses minutes and hours for today', () => {
    expect(formatRelativeTime(new Date(now.getTime() - 20_000), now)).toBe('همین الان');
    expect(formatRelativeTime(new Date(now.getTime() - 5 * 60_000), now)).toBe('۵ دقیقه پیش');
    expect(formatRelativeTime(d(2024, 6, 10, 12, 0), now)).toBe('۳ ساعت پیش');
    expect(formatRelativeTime(d(2024, 6, 9, 20, 0), now)).toBe('دیروز');
  });
});

describe('age', () => {
  const now = d(2024, 6, 1);

  it('states age the way it is said clinically', () => {
    expect(formatAge('2020-01-15', null, now)).toBe('۴ ساله');
    expect(formatAge('2023-06-01', null, now)).toBe('۱۲ ماهه');
    expect(formatAge('2024-04-01', null, now)).toBe('۲ ماهه');
    expect(formatAge('2024-05-01', null, now)).toBe('۳۱ روزه');
  });

  it('falls back to a recorded age in years', () => {
    expect(formatAge(null, 40, now)).toBe('۴۰ ساله');
    expect(formatAge(null, null, now)).toBe('—');
  });

  it('counts whole years up to the birthday', () => {
    expect(ageInYears('2000-06-02', null, now)).toBe(23);
    expect(ageInYears('2000-06-01', null, now)).toBe(24);
    expect(ageInYears(null, 30, now)).toBe(30);
  });
});

describe('recurring Jalali occasions', () => {
  it('finds this year’s occurrence, today included', () => {
    const from = fromJalali(1403, 5, 1);
    expect(nextJalaliOccurrence(5, 1, new Date(from.getTime() + 15 * 3_600_000))).toEqual(from);
    expect(nextJalaliOccurrence(5, 3, from)).toEqual(fromJalali(1403, 5, 3));
    expect(daysUntilJalaliOccurrence(5, 3, from)).toBe(2);
  });

  it('moves to next year once the day has passed', () => {
    expect(nextJalaliOccurrence(1, 1, fromJalali(1403, 5, 1))).toEqual(fromJalali(1404, 1, 1));
  });

  it('keeps an Esfand 30 birthday in non-leap years, on Esfand 29', () => {
    expect(nextJalaliOccurrence(12, 30, fromJalali(1403, 1, 10))).toEqual(fromJalali(1403, 12, 30));
    expect(nextJalaliOccurrence(12, 30, fromJalali(1404, 1, 10))).toEqual(fromJalali(1404, 12, 29));
  });
});
