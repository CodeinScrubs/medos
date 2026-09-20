import { describe, expect, it } from '@jest/globals';

import { formatBytes } from './format';
import { redactErrorText } from './redact';
import { addDays, atTime, endOfDay, formatClock, parseClock, sameDay, startOfDay, withClock } from './time';

const d = (y: number, m: number, day: number, h = 0, min = 0, s = 0) => new Date(y, m - 1, day, h, min, s);

describe('calendar-day arithmetic', () => {
  it('finds the start and end of a day', () => {
    expect(startOfDay(d(2024, 6, 10, 15, 30))).toEqual(d(2024, 6, 10));
    expect(endOfDay(d(2024, 6, 10, 15, 30)).getTime()).toBe(d(2024, 6, 11).getTime() - 1);
  });

  it('adds calendar days and keeps the clock time', () => {
    expect(addDays(d(2024, 1, 31, 10, 30), 1)).toEqual(d(2024, 2, 1, 10, 30));
    expect(addDays(d(2024, 3, 1, 8, 0), -1)).toEqual(d(2024, 2, 29, 8, 0));
  });

  it('compares and combines days and clock times', () => {
    expect(sameDay(d(2024, 6, 10, 0, 1), d(2024, 6, 10, 23, 59))).toBe(true);
    expect(sameDay(d(2024, 6, 10), d(2024, 6, 11))).toBe(false);
    expect(withClock(d(2024, 6, 10), d(2000, 1, 1, 7, 45))).toEqual(d(2024, 6, 10, 7, 45));
    expect(atTime(d(2024, 6, 10, 18))).toEqual(d(2024, 6, 10, 9, 0));
  });
});

describe('parseClock', () => {
  it.each([
    ['9', [9, 0]],
    ['09:05', [9, 5]],
    ['9:5', [9, 5]],
    ['۰۹:۰۵', [9, 5]],
    ['0905', [9, 5]],
    ['9.30', [9, 30]],
    ['۹٫۳۰', [9, 30]],
    ['23:59', [23, 59]],
  ])('reads %j', (input, expected) => {
    expect(parseClock(input)).toEqual(expected);
  });

  it.each(['24:00', '12:60', 'abc', '', '9:', '12345'])('rejects %j', (input) => {
    expect(parseClock(input)).toBeNull();
  });

  it('formats in Persian digits', () => {
    expect(formatClock(d(2024, 1, 1, 9, 5))).toBe('۰۹:۰۵');
  });
});

describe('formatBytes', () => {
  it('uses Persian digits and units', () => {
    expect(formatBytes(0)).toBe('۰');
    expect(formatBytes(512)).toBe('۵۱۲ بایت');
    expect(formatBytes(1536)).toBe('۱٫۵ کیلوبایت');
    expect(formatBytes(25 * 1024 * 1024)).toBe('۲۵ مگابایت');
  });
});

describe('redactErrorText', () => {
  it('removes the values drizzle puts in a failed-query message', () => {
    const message = 'Failed query: insert into "patients" ("first_name") values (?)\nparams: علی,0000000019';
    expect(redactErrorText(message)).toBe(
      'Failed query: insert into "patients" ("first_name") values (?)\nparams: [redacted]',
    );
  });

  // A note or a pasted lab table contains newlines, so the parameter list in a
  // failed-query message spans several lines. Redacting only the first line
  // used to leave the rest of the patient's text in the error log.
  it('removes parameters that run over several lines', () => {
    const message = 'Failed query: insert into "notes" ("body") values (?)\nparams: سطر اول\nسطر دوم\nسطر سوم';
    expect(redactErrorText(message)).toBe('Failed query: insert into "notes" ("body") values (?)\nparams: [redacted]');
    expect(redactErrorText(message)).not.toContain('دوم');
  });

  it('leaves other text alone', () => {
    expect(redactErrorText('Network request failed')).toBe('Network request failed');
  });
});
