import { isValidJalaaliDate, jalaaliMonthLength, jalaaliToDateObject, toJalaali } from 'jalaali-js';

import { LABEL_SEPARATOR, toLatinDigits, toPersianDigits } from './persian';
import { startOfDay } from './time';

/**
 * Jalali (Shamsi) date handling.
 *
 * Storage convention across MedOS: dates are persisted as Gregorian — either a
 * `YYYY-MM-DD` ISO string or a unix millisecond timestamp — and converted to
 * Jalali only for display and input. Storing Jalali would make sorting,
 * comparison and any future export subtly wrong.
 *
 * The one exception is a recurring Persian birthday, where `occasions` keeps
 * the Jalali month and day directly: converting a stored Gregorian birthday
 * back each year drifts by a day across leap years.
 *
 * Functions that depend on "now" take it as a last parameter, defaulting to
 * the current time, so they can be tested against a fixed date.
 */

export const JALALI_MONTHS = [
  'فروردین',
  'اردیبهشت',
  'خرداد',
  'تیر',
  'مرداد',
  'شهریور',
  'مهر',
  'آبان',
  'آذر',
  'دی',
  'بهمن',
  'اسفند',
] as const;

/** Saturday-first, matching the Iranian week. */
export const WEEKDAYS = ['شنبه', 'یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنج‌شنبه', 'جمعه'] as const;

export type JalaliDate = { jy: number; jm: number; jd: number };

/* -------------------------------------------------------------------------- */
/*  Conversion                                                                  */
/* -------------------------------------------------------------------------- */

export function toJalali(date: Date): JalaliDate {
  return toJalaali(date);
}

/** Local midnight of a Jalali day. */
export function fromJalali(jy: number, jm: number, jd: number): Date {
  return jalaaliToDateObject(jy, jm, jd);
}

export function isValidJalali(jy: number, jm: number, jd: number): boolean {
  return isValidJalaaliDate(jy, jm, jd);
}

export function jalaliMonthLength(jy: number, jm: number): number {
  return jalaaliMonthLength(jy, jm);
}

/** Saturday = 0 … Friday = 6. */
export function weekdayIndex(date: Date): number {
  return (date.getDay() + 1) % 7;
}

/* -------------------------------------------------------------------------- */
/*  ISO date strings (`YYYY-MM-DD`, Gregorian)                                  */
/* -------------------------------------------------------------------------- */

export function toIsoDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** `2024-08-02` -> local midnight of that day. Rejects impossible dates like `2024-02-30`. */
export function fromIsoDate(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(y, mo - 1, d);
  return date.getFullYear() === y && date.getMonth() === mo - 1 && date.getDate() === d ? date : null;
}

/**
 * `1403/05/12` or `۱۴۰۳-۵-۱۲` typed by hand -> a `Date`, or null.
 *
 * A two-digit year is read as whichever of 13xx or 14xx is not more than a
 * year in the future: `03` is 1403 and `65` is 1365, which is what people
 * mean when they type them.
 */
export function parseJalaliInput(input: string | null | undefined, now: Date = new Date()): Date | null {
  if (!input) return null;
  const parts = toLatinDigits(input).split(/\D+/).filter(Boolean).map(Number);
  if (parts.length !== 3) return null;
  let [jy, jm, jd] = parts as [number, number, number];
  if (jy < 100) {
    const current = toJalali(now).jy;
    jy += Math.floor(current / 100) * 100;
    if (jy > current + 1) jy -= 100;
  }
  if (jy < 1000 || !isValidJalali(jy, jm, jd)) return null;
  return fromJalali(jy, jm, jd);
}

/* -------------------------------------------------------------------------- */
/*  Formatting                                                                  */
/* -------------------------------------------------------------------------- */

/** A stored date: a `Date`, unix ms, an ISO `YYYY-MM-DD` date or an ISO date-time string. */
export type DateInput = Date | number | string | null | undefined;

const ISO_DATETIME_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;

/**
 * Only the storage formats are accepted. Anything else — a Jalali string
 * that slipped through, say — renders as "—" instead of being guessed at by
 * `new Date()`, which would read `1403/05/12` as the Gregorian year 1403.
 */
function coerce(value: DateInput): Date | null {
  if (value == null) return null;
  let date: Date | null;
  if (value instanceof Date) date = value;
  else if (typeof value === 'number') date = new Date(value);
  else date = fromIsoDate(value) ?? (ISO_DATETIME_RE.test(value.trim()) ? new Date(value.trim()) : null);
  return date && !Number.isNaN(date.getTime()) ? date : null;
}

/** `۱۴۰۳/۰۵/۱۲` */
export function formatJalali(value: DateInput): string {
  const date = coerce(value);
  if (!date) return '—';
  const { jy, jm, jd } = toJalali(date);
  return toPersianDigits(`${jy}/${String(jm).padStart(2, '0')}/${String(jd).padStart(2, '0')}`);
}

/** `۱۲ مرداد ۱۴۰۳` */
export function formatJalaliLong(value: DateInput): string {
  const date = coerce(value);
  if (!date) return '—';
  const { jy, jm, jd } = toJalali(date);
  return `${toPersianDigits(jd)} ${JALALI_MONTHS[jm - 1]} ${toPersianDigits(jy)}`;
}

/** `شنبه ۱۲ مرداد` */
export function formatJalaliWithWeekday(value: DateInput): string {
  const date = coerce(value);
  if (!date) return '—';
  const { jm, jd } = toJalali(date);
  return `${WEEKDAYS[weekdayIndex(date)]} ${toPersianDigits(jd)} ${JALALI_MONTHS[jm - 1]}`;
}

/** `۱۴:۳۰` */
export function formatTime(value: DateInput): string {
  const date = coerce(value);
  if (!date) return '—';
  const h = String(date.getHours()).padStart(2, '0');
  const m = String(date.getMinutes()).padStart(2, '0');
  return toPersianDigits(`${h}:${m}`);
}

/** `۱۲ مرداد ۱۴۰۳، ۱۴:۳۰` — a comma, not "•", which reads as a Persian zero between digits. */
export function formatJalaliDateTime(value: DateInput): string {
  const date = coerce(value);
  if (!date) return '—';
  return `${formatJalaliLong(date)}${LABEL_SEPARATOR}${formatTime(date)}`;
}

/* -------------------------------------------------------------------------- */
/*  Relative time                                                               */
/* -------------------------------------------------------------------------- */

/** Whole calendar days from `to` until `from`, ignoring the clock. Positive = `from` is later. */
export function daysBetween(from: DateInput, to: DateInput = new Date()): number | null {
  const a = coerce(from);
  const b = coerce(to);
  if (!a || !b) return null;
  // Rounded, because a day across a daylight-saving change is 23 or 25 hours.
  return Math.round((startOfDay(a).getTime() - startOfDay(b).getTime()) / 86_400_000);
}

/**
 * `امروز`، `دیروز`، `۳ روز پیش`، `فردا`، `۵ روز دیگر`.
 * Beyond two weeks it falls back to the full date, which is more useful than
 * "۴۷ روز پیش" when scanning a patient list.
 */
export function formatRelative(value: DateInput, now: Date = new Date()): string {
  const diff = daysBetween(value, now);
  if (diff == null) return '—';
  if (diff === 0) return 'امروز';
  if (diff === 1) return 'فردا';
  if (diff === -1) return 'دیروز';
  if (diff === 2) return 'پس‌فردا';
  if (diff === -2) return 'پریروز';
  if (diff > 0 && diff <= 14) return `${toPersianDigits(diff)} روز دیگر`;
  if (diff < 0 && diff >= -14) return `${toPersianDigits(-diff)} روز پیش`;
  return formatJalaliLong(value);
}

/** `۲ ساعت پیش` for things that happened today, otherwise the relative day. */
export function formatRelativeTime(value: DateInput, now: Date = new Date()): string {
  const date = coerce(value);
  if (!date) return '—';
  const mins = Math.round((now.getTime() - date.getTime()) / 60_000);
  if (mins === 0) return 'همین الان';
  if (mins > 0 && mins < 60) return `${toPersianDigits(mins)} دقیقه پیش`;
  const hours = Math.round(mins / 60);
  if (hours > 0 && hours < 24 && daysBetween(date, now) === 0) {
    return `${toPersianDigits(hours)} ساعت پیش`;
  }
  return formatRelative(date, now);
}

/* -------------------------------------------------------------------------- */
/*  Age                                                                         */
/* -------------------------------------------------------------------------- */

/**
 * Age from a birth date. Under two years it returns months, and under two
 * months it returns days, because that is how paediatric ages are stated.
 */
export function formatAge(birthDate: DateInput, fallbackYears?: number | null, now: Date = new Date()): string {
  const date = coerce(birthDate);
  if (!date) return fallbackYears != null ? `${toPersianDigits(fallbackYears)} ساله` : '—';

  let years = now.getFullYear() - date.getFullYear();
  let months = now.getMonth() - date.getMonth();
  const days = now.getDate() - date.getDate();

  if (days < 0) months -= 1;
  if (months < 0) {
    years -= 1;
    months += 12;
  }

  if (years >= 2) return `${toPersianDigits(years)} ساله`;
  const totalMonths = years * 12 + months;
  if (totalMonths >= 2) return `${toPersianDigits(totalMonths)} ماهه`;
  const totalDays = Math.max(0, daysBetween(now, date) ?? 0);
  return `${toPersianDigits(totalDays)} روزه`;
}

/** Whole years only, for filters and calculations. */
export function ageInYears(birthDate: DateInput, fallbackYears?: number | null, now: Date = new Date()): number | null {
  const date = coerce(birthDate);
  if (!date) return fallbackYears ?? null;
  let years = now.getFullYear() - date.getFullYear();
  const m = now.getMonth() - date.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < date.getDate())) years -= 1;
  return years;
}

/* -------------------------------------------------------------------------- */
/*  Recurring Jalali occasions                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Next occurrence of a Jalali month/day on or after `from` — the birthday
 * reminder primitive. Esfand 30 in a non-leap year falls back to Esfand 29
 * rather than skipping the year.
 */
export function nextJalaliOccurrence(jm: number, jd: number, from: Date = new Date()): Date {
  const { jy } = toJalali(from);
  const inYear = (y: number) => fromJalali(y, jm, Math.min(jd, jalaliMonthLength(y, jm)));
  const thisYear = inYear(jy);
  return thisYear.getTime() >= startOfDay(from).getTime() ? thisYear : inYear(jy + 1);
}

/** Days until the next occurrence, for sorting an upcoming-occasions list. */
export function daysUntilJalaliOccurrence(jm: number, jd: number, from: Date = new Date()): number {
  return daysBetween(nextJalaliOccurrence(jm, jd, from), from) ?? 0;
}
