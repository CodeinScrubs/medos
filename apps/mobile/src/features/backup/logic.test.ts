import { describe, expect, it } from '@jest/globals';

import { BACKUP_STALE_AFTER_MS, backupFreshness, isBackupDue } from './logic';

const HOUR = 3_600_000;
const NOW = 1_750_000_000_000;

describe('isBackupDue', () => {
  it('is due when there has never been a backup', () => {
    expect(isBackupDue(null, 24, NOW)).toBe(true);
  });

  it('is due once the interval has passed, and not before', () => {
    expect(isBackupDue(NOW - 23 * HOUR, 24, NOW)).toBe(false);
    expect(isBackupDue(NOW - 24 * HOUR, 24, NOW)).toBe(true);
  });

  it('is due when the last backup appears to be in the future, after a clock change', () => {
    expect(isBackupDue(NOW + 5 * HOUR, 24, NOW)).toBe(true);
  });
});

describe('backupFreshness', () => {
  it('distinguishes never, stale and fresh', () => {
    expect(backupFreshness(null, NOW)).toBe('never');
    expect(backupFreshness(NOW - HOUR, NOW)).toBe('fresh');
    expect(backupFreshness(NOW - BACKUP_STALE_AFTER_MS - 1, NOW)).toBe('stale');
    expect(backupFreshness(NOW + HOUR, NOW)).toBe('stale');
  });
});
