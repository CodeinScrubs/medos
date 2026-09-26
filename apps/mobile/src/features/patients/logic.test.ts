import { describe, expect, it } from '@jest/globals';

import { patientIdentity, patientPickerSublabel } from './logic';

const NOW = new Date(2026, 8, 26);

describe('patientIdentity', () => {
  /* Two patients with the same name, 35 and 62, looked identical in every picker. */
  it('tells two patients with the same name apart', () => {
    const older = { birthDate: null, ageYears: 62, sex: 'male' as const, fileNumber: '4471' };
    const younger = { birthDate: null, ageYears: 35, sex: 'male' as const, fileNumber: null };
    expect(patientIdentity(older, NOW)).toBe('۶۲ ساله • مرد • پرونده 4471');
    expect(patientIdentity(younger, NOW)).toBe('۳۵ ساله • مرد');
  });

  it('says nothing it does not know', () => {
    expect(patientIdentity({ birthDate: null, ageYears: null, sex: null, fileNumber: null }, NOW)).toBe('');
  });

  it('puts identity before the summary in a picker', () => {
    expect(
      patientPickerSublabel({ birthDate: null, ageYears: 62, sex: 'male', fileNumber: null, summary: 'DM, HTN' }),
    ).toMatch(/^۶۲ ساله • مرد — DM, HTN$/);
    expect(
      patientPickerSublabel({ birthDate: null, ageYears: null, sex: null, fileNumber: null, summary: null }),
    ).toBeNull();
  });
});
