import { describe, expect, it } from '@jest/globals';

import { validDateAndClock, validateDateInput } from './date-input';

const options = { now: new Date('2026-09-23T12:00:00Z'), required: true, allowFuture: false };

describe('visible date input validity', () => {
  it('rejects incomplete, impossible and future input, rather than reusing a previous date', () => {
    expect(validateDateInput('۱۴۰۵/۰۷/', options).valid).toBe(false);
    expect(validateDateInput('۱۴۰۵/۰۷/۳۱', options).valid).toBe(false);
    expect(validateDateInput('۱۴۰۶/۰۱/۰۱', options)).toEqual({ valid: false, reason: 'future' });
    expect(validateDateInput('۱۴۰۶/۰۱/۰۱', { ...options, allowFuture: true }).valid).toBe(true);
    expect(validateDateInput('۱۴۰۵/۰۷/۰۱', options)).toEqual({ valid: true, iso: '2026-09-23' });
  });
  it('distinguishes clearing an optional date from an empty required date', () => {
    expect(validateDateInput(' ', options)).toEqual({ valid: false, reason: 'required' });
    expect(validateDateInput(' ', { ...options, required: false })).toEqual({ valid: true, iso: null });
  });
  it('requires every displayed part, while an explicitly unknown clock does not invalidate its day', () => {
    expect(validDateAndClock(true, true, '۲۵:۰۰')).toBe(false);
    expect(validDateAndClock(true, true, '')).toBe(false);
    expect(validDateAndClock(true, true, '۰۹:۳۰')).toBe(true);
    expect(validDateAndClock(false, true, '09:30')).toBe(false);
    expect(validDateAndClock(true, false, '')).toBe(true);
    expect(validDateAndClock(false, false, '')).toBe(false);
  });
});
