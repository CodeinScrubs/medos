import { describe, expect, it } from '@jest/globals';

import { parsePatientListRoute, patientListStatuses } from './list-route';

describe('patient list URL filters', () => {
  it('defaults safely when status is unknown, repeated, or absent', () => {
    for (const status of [undefined, 'unknown', ['admitted'], 1]) {
      expect(parsePatientListRoute({ status, starred: ['1'] })).toEqual({ scope: 'current', starredOnly: false });
    }
  });
  it('accepts explicit scopes and the exact starred flag', () => {
    expect(parsePatientListRoute({ status: 'all', starred: '1' })).toEqual({ scope: 'all', starredOnly: true });
    expect(parsePatientListRoute({ status: 'discharged', starred: '0' })).toEqual({
      scope: 'discharged',
      starredOnly: false,
    });
  });
  it('widens only the default scope during search', () => {
    expect(patientListStatuses('current', false)).toEqual(['admitted', 'outpatient', 'followup']);
    expect(patientListStatuses('current', true)).toBeUndefined();
    expect(patientListStatuses('all', false)).toBeUndefined();
    expect(patientListStatuses('admitted', true)).toEqual(['admitted']);
  });
});
