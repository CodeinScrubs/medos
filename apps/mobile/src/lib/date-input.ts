import { parseJalaliInput, toIsoDate, toJalali } from './jalali';
import { toPersianDigits } from './persian';
import { parseClock } from './time';

export type DateInputResult =
  { valid: true; iso: string | null } | { valid: false; reason: 'required' | 'invalid' | 'future' };

/** Recoverable editor input, including incomplete text; never a clinical timestamp. */
export type DateTimeInput = { dateText: string; clockText: string; customOpen: boolean };

export function dateInputText(date: Date): string {
  try {
    const { jy, jm, jd } = toJalali(date);
    return toPersianDigits(`${jy}/${String(jm).padStart(2, '0')}/${String(jd).padStart(2, '0')}`);
  } catch {
    // Preserve an unsupported stored date as invalid editor text. Clearing it
    // would turn a damaged value into a seemingly intentional empty field.
    return Number.isFinite(date.getTime()) ? toIsoDate(date) : '—';
  }
}

/** Validation describes the visible text, never a previous successfully parsed value. */
export function validateDateInput(
  text: string,
  options: { required: boolean; allowFuture: boolean; now: Date },
): DateInputResult {
  if (!text.trim()) return options.required ? { valid: false, reason: 'required' } : { valid: true, iso: null };
  const parsed = parseJalaliInput(text, options.now);
  if (!parsed) return { valid: false, reason: 'invalid' };
  if (!options.allowFuture && parsed.getTime() > options.now.getTime()) return { valid: false, reason: 'future' };
  return { valid: true, iso: toIsoDate(parsed) };
}

export function validDateAndClock(dayValid: boolean, withTime: boolean, clockText: string): boolean {
  return dayValid && (!withTime || parseClock(clockText) != null);
}
