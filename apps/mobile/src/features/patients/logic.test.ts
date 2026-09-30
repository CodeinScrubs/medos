import { describe, expect, it } from '@jest/globals';

import { RLM } from '@/lib/persian';

import { parseAgeYears, patientIdentity, patientPickerSublabel } from './logic';

const NOW = new Date(2026, 8, 26);

describe('whole-year fallback age', () => {
  it.each(['', '   '])('keeps unknown age distinct from zero (%p)', (input) => {
    expect(parseAgeYears(input)).toEqual({ valid: true, value: null });
  });
  it.each([
    ['0', 0],
    ['۲۴', 24],
    ['٢٤', 24],
    [' 24 ', 24],
    ['1e2', 100],
  ])('parses a valid whole-year value (%s)', (input, value) => {
    expect(parseAgeYears(input)).toEqual({ valid: true, value });
  });
  it.each(['24.5', '-1', '12,5', '24 years', '24-5', 'NaN', 'Infinity', '9007199254740992'])(
    'rejects instead of guessing (%s)',
    (input) => {
      expect(parseAgeYears(input)).toEqual({ valid: false, value: null });
    },
  );
});

describe('patientIdentity', () => {
  /* Two patients with the same name, 35 and 62, looked identical in every picker. */
  it('tells two patients with the same name apart', () => {
    const older = { birthDate: null, ageYears: 62, sex: 'male' as const, fileNumber: '4471' };
    const younger = { birthDate: null, ageYears: 35, sex: 'male' as const, fileNumber: null };
    expect(patientIdentity(older, NOW)).toBe(`${RLM}۶۲ ساله، مرد، پرونده 4471`);
    expect(patientIdentity(younger, NOW)).toBe(`${RLM}۳۵ ساله، مرد`);
  });

  it('says nothing it does not know', () => {
    expect(patientIdentity({ birthDate: null, ageYears: null, sex: null, fileNumber: null }, NOW)).toBe('');
  });

  it('puts identity before the summary in a picker', () => {
    expect(
      patientPickerSublabel({ birthDate: null, ageYears: 62, sex: 'male', fileNumber: null, summary: 'DM, HTN' }),
    ).toBe(`${RLM}۶۲ ساله، مرد — DM, HTN`);
    expect(
      patientPickerSublabel({ birthDate: null, ageYears: null, sex: null, fileNumber: null, summary: null }),
    ).toBeNull();
  });
});
