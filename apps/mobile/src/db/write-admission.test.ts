import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { eq, sql } from 'drizzle-orm';
import { drizzle as nativeDrizzle } from 'drizzle-orm/expo-sqlite';
import type { SQLiteDatabase } from 'expo-sqlite';
import { z } from 'zod';

import { db, restoreDatabase, sqlite } from '@/db/client';
import { patients } from '@/db/schema';
import { writeSetting, defineSetting } from '@/db/settings';
import {
  datasetGeneration,
  DatasetBusyError,
  DatasetChangedError,
  reserveDatasetReplacement,
  withDatasetWrite,
} from '@/lib/dataset-write';
import { stamps } from '@/lib/ids';
import { useTestDatabase } from '@/test/db-client';
import { createTestDatabase } from '@/test/sqljs';

import { admittedDriver, restrictDatabaseClient, writeAdmission } from './write-admission';

jest.mock('@/db/client', () => jest.requireActual('@/test/db-client'));

beforeEach(async () => {
  useTestDatabase(await createTestDatabase());
  await db.insert(patients).values({ id: 'patient', ...stamps(), firstName: 'Saved', lastName: 'Synthetic' });
});

describe('ordinary SQL execution and restore authority', () => {
  it('pins the real installed Expo driver at native preparation and both native execution paths', async () => {
    const execute = jest.fn(() => ({ changes: 1, lastInsertRowId: 1 }));
    const raw = jest.fn(() => ({ getAllSync: () => [] }));
    const prepare = jest.fn((_statement: string) => ({ executeSync: execute, executeForRawResultSync: raw }));
    const native = { prepareSync: prepare } as unknown as SQLiteDatabase;
    const adapter = admittedDriver(native);
    const ordinary = restrictDatabaseClient(
      nativeDrizzle(adapter, { schema: { patients }, logger: writeAdmission() }),
      sqlite,
    );
    const prepared = ordinary.update(patients).set({ firstName: 'Native' }).prepare();
    const returning = ordinary.update(patients).set({ firstName: 'Returned' }).returning().prepare();
    const replacement = reserveDatasetReplacement();
    try {
      expect(() => prepared.run()).toThrow(DatasetBusyError);
      expect(() => returning.all()).toThrow(DatasetBusyError);
      const before = prepare.mock.calls.length;
      expect(() => ordinary.run(sql`PRAGMA query_only = OFF`)).toThrow();
      expect(prepare.mock.calls).toHaveLength(before);
      expect(execute).not.toHaveBeenCalled();
      expect(raw).not.toHaveBeenCalled();
      expect(Reflect.get(ordinary.$client, 'prepareSync')).toBeUndefined();
      expect(Reflect.get(adapter, 'nativeDatabase')).toBeUndefined();
    } finally {
      replacement.release();
    }
    prepared.run();
    returning.all();
    expect(execute).toHaveBeenCalledTimes(1);
    expect(raw).toHaveBeenCalledTimes(1);
  });
  it('rejects lazy, prepared, returning, transactional and raw writes, including the exposed client', async () => {
    const lazy = db.update(patients).set({ firstName: 'Lazy' });
    const prepared = db.update(patients).set({ firstName: 'Prepared' }).prepare();
    const returning = db.update(patients).set({ firstName: 'Returned' }).returning();
    const replacement = reserveDatasetReplacement();
    try {
      await expect(lazy).rejects.toThrow();
      expect(() => prepared.run()).toThrow();
      await expect(returning).rejects.toThrow();
      expect(() => db.transaction((tx) => tx.update(patients).set({ firstName: 'Transaction' }).run())).toThrow();
      expect(() => sqlite.execSync("SELECT 1; UPDATE patients SET first_name = 'Raw'")).toThrow(DatasetBusyError);
      expect(() => db.$client.execSync("UPDATE patients SET first_name = 'Client'")).toThrow(DatasetBusyError);
      expect(() => db.run(sql`UPDATE patients SET first_name = 'SQL'`)).toThrow();
      expect(db.select().from(patients).get()!.firstName).toBe('Saved');
      expect(Reflect.get(db.$client, 'prepareSync')).toBeUndefined();
      expect(Reflect.get(db.$client, 'nativeDatabase')).toBeUndefined();
    } finally {
      replacement.release();
    }
    await db.update(patients).set({ firstName: 'Retry' });
    expect(db.select().from(patients).get()!.firstName).toBe('Retry');
  });

  it('keeps explicit authority through an await without granting it to unrelated queries, then revokes it', async () => {
    const replacement = reserveDatasetReplacement();
    const trusted = restoreDatabase(replacement);
    const marker = defineSetting('restore.synthetic', z.number(), 0);
    try {
      await Promise.resolve();
      await writeSetting(marker, 1, trusted.db);
      await expect(db.update(patients).set({ firstName: 'Ordinary' })).rejects.toThrow();
      trusted.sqlite.execSync("UPDATE patients SET first_name = 'Trusted'");
      expect(db.select().from(patients).get()!.firstName).toBe('Trusted');
    } finally {
      replacement.release();
    }
    await expect(trusted.db.update(patients).set({ firstName: 'Expired' })).rejects.toThrow();
    expect(() => trusted.sqlite.execSync("UPDATE patients SET first_name = 'Expired'")).toThrow();
    expect(db.select().from(patients).get()!.firstName).toBe('Trusted');
  });

  it('refuses replacement for a whole asynchronous writer and rejects that old intent after commit', async () => {
    const generation = datasetGeneration();
    let finish!: () => void;
    const pending = withDatasetWrite(generation, async () => {
      await new Promise<void>((resolve) => {
        finish = resolve;
      });
      await db.update(patients).set({ firstName: 'Finished' }).where(eq(patients.id, 'patient'));
    });
    try {
      expect(() => reserveDatasetReplacement()).toThrow(DatasetBusyError);
    } finally {
      finish();
      await pending;
    }
    const failed = reserveDatasetReplacement();
    failed.release();
    expect(datasetGeneration()).toBe(generation);
    const replacement = reserveDatasetReplacement();
    replacement.committed();
    replacement.release();
    await expect(
      withDatasetWrite(generation, async () => {
        throw new Error('must not run');
      }),
    ).rejects.toThrow(DatasetChangedError);
    expect(datasetGeneration()).toBe(generation + 1);
  });
});
