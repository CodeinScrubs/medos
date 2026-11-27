import { describe, expect, it } from '@jest/globals';

import {
  diagnosticText,
  errorDiagnostic,
  safeCode,
  safeContext,
  safeErrorMessage,
  safeLegacyErrorText,
} from './error-diagnostic';

describe('closed default diagnostic projection', () => {
  it('uses a fixed recovery notice for a native sharing-in-progress code', () => {
    const text = safeErrorMessage({ code: 'ERR_SHARING_IN_PROGRESS', message: 'SYNTHETIC_PRIVATE_URI' });
    expect(text).not.toContain('SYNTHETIC_PRIVATE_URI');
    expect(text).toContain('پنجرهٔ ارسال قبلی');
    expect(text).toContain('دوباره باز کنید');
  });
  it('withholds arbitrary text in every error field and nested/cyclic causes', () => {
    const canary = 'SYNTHETIC_PRIVATE_CANARY';
    const error = Object.assign(new Error(canary), { name: canary, code: `ERR_${canary}` });
    error.stack = `Error: ${canary}\n    at ${canary} (address at index.android.bundle:1:0)\n    at fn (file:///${canary}.js:1:3)\n    at fn (https://example.invalid/${canary}:1:3)`;
    error.cause = Object.assign(new Error(canary), { code: 'ERR_INTERNAL_SQLITE_ERROR', cause: error });
    const output = errorDiagnostic(error);
    expect(JSON.stringify(output)).not.toContain(canary);
    expect(output.code).toBe('ERR_INTERNAL_SQLITE_ERROR');
    expect(output.frames).toEqual([{ bundle: 'android', coordinate: 'bytecode', line: 1, offset: 0 }]);
    expect(output.framesOmitted).toBe(true);
    expect(safeCode(`ERR_${canary}`)).toBeUndefined();
    expect(safeContext(canary)).toBeUndefined();
  });
  it('does not invoke unknown conversions or propagate throwing getters', () => {
    const hostile = new Proxy(
      {
        toString: () => {
          throw new Error('synthetic conversion');
        },
      },
      {
        get: () => {
          throw new Error('synthetic getter');
        },
      },
    );
    expect(() => errorDiagnostic(hostile)).not.toThrow();
    expect(errorDiagnostic(hostile)).toMatchObject({ kind: 'unknown', frames: [] });
    expect(safeErrorMessage(hostile)).not.toContain('synthetic');
  });
  it('preserves exact actionable ownership/date notices and feature-specific unknown fallbacks', () => {
    const message = 'پروندهٔ بیمار در دسترس نیست؛ نوت تغییر نکرد.';
    expect(safeErrorMessage(new Error(message))).toBe(message);
    expect(errorDiagnostic(new Error(message)).code).toBe('note.parent');
    expect(safeLegacyErrorText(message + ' SYNTHETIC_PRIVATE_CANARY', 'تاریخ را بررسی کنید.')).toBe(
      'تاریخ را بررسی کنید.',
    );
    expect(safeErrorMessage(new Error('ساعت معتبر نیست؛ پیش‌نویس نگه داشته شد.'))).toContain('ساعت معتبر نیست');
    expect(
      safeErrorMessage(new Error('Unexpected Zod field SYNTHETIC_PRIVATE_CANARY'), 'ورودی‌ها را بررسی کنید.'),
    ).toBe('ورودی‌ها را بررسی کنید.');
  });
  it('preserves source columns and Hermes offsets as different coordinates with bounded frames', () => {
    const error = new Error();
    error.stack =
      'Error\n    at fn (index.android.bundle:7:1)\n' +
      '    at fn (address at index.android.bundle:1:123)\n'.repeat(20);
    const diagnostic = errorDiagnostic(error);
    expect(diagnostic.frames).toHaveLength(12);
    expect(diagnostic.frames[0]).toEqual({ bundle: 'android', coordinate: 'source', line: 7, column: 1 });
    expect(diagnostic.frames[1]).toEqual({ bundle: 'android', coordinate: 'bytecode', line: 1, offset: 123 });
    expect(diagnostic.framesOmitted).toBe(true);
    expect(diagnosticText(diagnostic)).toContain('column 1');
    expect(diagnosticText(diagnostic)).toContain('offset 123');
  });
  it.each([
    '    at fn (index.android.bundle:1:0)',
    '    at fn (index.android.bundle:0:1)',
    '    at fn (address at index.android.bundle:1:9999999999)',
    '    at fn (SYNTHETIC_PRIVATE:1:2)',
  ])('refuses unsafe/unrecognized frame %s', (frame) => {
    expect(errorDiagnostic({ stack: frame }).frames).toEqual([]);
  });
});
