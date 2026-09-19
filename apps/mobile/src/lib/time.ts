import { toLatinDigits, toPersianDigits } from './persian';

/**
 * Calendar-day arithmetic in local time.
 *
 * Everything here works on the phone's local calendar day, because that is the
 * unit clinical work is counted in ("day 3 of admission", "follow up in a
 * week"). Durations in milliseconds would drift across DST changes.
 */

export function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function endOfDay(d: Date = new Date()): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
}

/** Same clock time, `days` calendar days later (negative for earlier). */
export function addDays(base: Date, days: number): Date {
  return new Date(
    base.getFullYear(),
    base.getMonth(),
    base.getDate() + days,
    base.getHours(),
    base.getMinutes(),
    base.getSeconds(),
    base.getMilliseconds(),
  );
}

export function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/** The calendar day of `day` with the clock time of `clock`. */
export function withClock(day: Date, clock: Date): Date {
  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), clock.getHours(), clock.getMinutes());
}

/** A calendar day at a given clock time, defaulting to 9am for "remind me that day". */
export function atTime(day: Date, hour = 9, minute = 0): Date {
  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), hour, minute, 0, 0);
}

/**
 * A typed clock time: `9:5`, `09:05`, `۰۹:۰۵`, `0905`, `9` -> [h, m].
 * Returns null for anything that is not a real time of day.
 */
export function parseClock(input: string): [number, number] | null {
  const text = toLatinDigits(input).trim();
  const colon = /^(\d{1,2})\s*[:.٫]\s*(\d{1,2})$/.exec(text);
  const compact = /^(\d{1,2})(\d{2})?$/.exec(text);
  const m = colon ?? compact;
  if (!m) return null;
  const h = Number(m[1]);
  const min = m[2] ? Number(m[2]) : 0;
  if (h > 23 || min > 59) return null;
  return [h, min];
}

/** `09:05` in Persian digits. */
export function formatClock(d: Date): string {
  return toPersianDigits(`${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`);
}
