import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import { readSetting } from '@/db/settings';
import { useTestDatabase } from '@/test/db-client';
import { createTestDatabase, type TestDatabase } from '@/test/sqljs';

import { recordBackupDelivery } from './delivery-queries';
import { deliveryStrength } from './logic';
import { backupLastDelivery, backupLastSuccessAt } from './settings';

jest.mock('@/db/client', () => jest.requireActual('@/test/db-client'));
let t: TestDatabase;
beforeEach(async () => {
  t = useTestDatabase(await createTestDatabase());
});

describe('backup delivery evidence', () => {
  it('stores strength and scheduling timestamp together, including manual confirmation', async () => {
    for (const strength of ['bytes', 'size', 'confirmed'] as const) {
      recordBackupDelivery(strength, 1234);
      expect(await readSetting(backupLastSuccessAt)).toBe(1234);
      expect(await readSetting(backupLastDelivery)).toEqual({ strength, at: 1234 });
    }
  });

  it('rolls back new strength if the scheduling timestamp fails, then allows retry', async () => {
    recordBackupDelivery('bytes', 1234);
    t.sqlite.exec(
      "CREATE TRIGGER fail_delivery BEFORE UPDATE ON settings WHEN NEW.key = 'backup.lastSuccessAt' BEGIN SELECT RAISE(ABORT, 'synthetic failure'); END;",
    );
    expect(() => recordBackupDelivery('size', 5678)).toThrow();
    expect(await readSetting(backupLastSuccessAt)).toBe(1234);
    expect(await readSetting(backupLastDelivery)).toEqual({ strength: 'bytes', at: 1234 });
    t.sqlite.exec('DROP TRIGGER fail_delivery');
    recordBackupDelivery('size', 5678);
    expect(await readSetting(backupLastDelivery)).toEqual({ strength: 'size', at: 5678 });
  });

  it('does not claim evidence for a legacy or different delivery timestamp', () => {
    expect(deliveryStrength(1234, null)).toBeNull();
    expect(deliveryStrength(5678, { at: 1234, strength: 'bytes' })).toBeNull();
    expect(deliveryStrength(1234, { at: 1234, strength: 'size' })).toBe('size');
  });
});
