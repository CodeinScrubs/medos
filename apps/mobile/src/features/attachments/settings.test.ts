import { describe, expect, it, jest } from '@jest/globals';

import { shouldKeepOriginal } from './settings';

// The setting's definition sits next to the rule, and settings reach the
// database module even when only the rule is under test.
jest.mock('@/db/client', () => jest.requireActual('@/test/db-client'));

/*
 * A stored photo is a 2400px re-encode. Which photos also keep the file that
 * arrived is the one decision that cannot be revisited later, because by then
 * the original is gone.
 */
describe('keeping photo originals', () => {
  it('keeps them for what needs the real pixels, not for paperwork', () => {
    expect(shouldKeepOriginal('clinical', 'clinical_photo')).toBe(true);
    expect(shouldKeepOriginal('clinical', 'radiology')).toBe(true);
    expect(shouldKeepOriginal('clinical', 'lab_sheet')).toBe(false);
    expect(shouldKeepOriginal('clinical', 'document')).toBe(false);
  });

  it('follows the setting when it is not left to the kind', () => {
    expect(shouldKeepOriginal('always', 'lab_sheet')).toBe(true);
    expect(shouldKeepOriginal('never', 'clinical_photo')).toBe(false);
  });
});
