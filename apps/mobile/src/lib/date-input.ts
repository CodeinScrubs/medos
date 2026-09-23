import { parseJalaliInput, toIsoDate } from './jalali';
import { parseClock } from './time';

export type DateInputResult =
  { valid: true; iso: string | null } | { valid: false; reason: 'required' | 'invalid' | 'future' };

/** Validation describes the visible text, never a previous successfully parsed value. */
export function validateDateInput(
  text: string,
  options: { required: boolean; allowFuture: boolean; now: Date },
): DateInputResult {
  if (!text.trim()) return options.required ? { valid: false, reason: 'required' } : { valid: true, iso: null };
  const parsed = parseJalaliInput(text);
  if (!parsed) return { valid: false, reason: 'invalid' };
  if (!options.allowFuture && parsed.getTime() > options.now.getTime()) return { valid: false, reason: 'future' };
  return { valid: true, iso: toIsoDate(parsed) };
}

export function validDateAndClock(dayValid: boolean, withTime: boolean, clockText: string): boolean {
  return dayValid && (!withTime || parseClock(clockText) != null);
}
