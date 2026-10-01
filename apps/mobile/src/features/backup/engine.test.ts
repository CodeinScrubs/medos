import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { File, FileMode } from 'expo-file-system';

import { patients, backupRuns, settings } from '@/db/schema';
import { readSetting, writeSetting } from '@/db/settings';
import { deriveKey, equalBytes } from '@/lib/crypto';
import { stamps } from '@/lib/ids';
import { useTestDatabase } from '@/test/db-client';
import { closeFailures, memoryFiles, resetMemoryFiles } from '@/test/mocks/memory-files';
import { createTestDatabase, type TestDatabase } from '@/test/sqljs';

import { createBackup, recoverInterruptedRestore, restoreBackup } from './engine';
import { loadBackupKey } from './keys';
import { restoreInFlight, restoreMediaUnresolved } from './settings';

jest.mock('@/db/client', () => jest.requireActual('@/test/db-client'));
jest.mock('expo-file-system', () => jest.requireActual('@/test/mocks/memory-files'));
jest.mock('expo-constants', () => ({ __esModule: true, default: { expoConfig: { version: 'test' } } }));
jest.mock('expo-device', () => ({ modelName: 'Synthetic' }));
jest.mock('@/platform/media', () => ({ MEDIA_ROOT: 'media' }));
jest.mock('@/platform/error-log', () => ({ logError: jest.fn() }));
jest.mock('@/db/seed', () => ({ runSeeds: async () => {} }));
jest.mock('@/features/encounters/status', () => ({ reconcileAllPatientStatuses: async () => {} }));
jest.mock('@/features/labs/reflag', () => ({ reflagLabValuesIfNeeded: async () => {} }));
jest.mock('@/features/notes/version-queries', () => ({ backfillNoteVersionsIfNeeded: async () => {} }));
jest.mock('@/features/search/reindex', () => ({ reindexSearchIfNeeded: async () => {} }));
jest.mock('@/features/reminders/reschedule', () => ({
  rescheduleAllReminders: async () => ({ followUps: 0, tasks: 0, occasions: 0 }),
}));
jest.mock('@/lib/crypto', () => ({
  ...jest.requireActual<typeof import('@/lib/crypto')>('@/lib/crypto'),
  // KDF vectors/schemes have their own tests. Encryption/authentication here
  // are real, with one deterministic synthetic key to keep race tests fast.
  deriveKey: jest.fn(async () => new Uint8Array(32).fill(9)),
}));
jest.mock('./keys', () => ({
  hasBackupKey: async () => true,
  loadBackupKey: jest.fn(async () => ({
    key: new Uint8Array(32).fill(9),
    salt: new Uint8Array(16).fill(7),
    kdf: { scheme: 2, log2N: 15, r: 8, p: 1 },
  })),
  storeBackupKey: async () => {},
}));

let t: TestDatabase;
let fixtureUri: string;
let virtualCounter = 0;
const mediaUri = 'file:///private/media/example/audio.wav';
const savedMedia = new Uint8Array([1, 2, 3, 4]);

beforeEach(async () => {
  resetMemoryFiles();
  t = useTestDatabase(await createTestDatabase());
  const snapshots: { path: string; bytes: Uint8Array }[] = [];
  const exec = t.conn.execSync.bind(t.conn);
  // SQLite/WASM owns its own filesystem. Bridge only VACUUM/ATTACH filenames
  // to native file stand-ins; all clinical copy/rollback SQL remains real.
  jest.spyOn(t.conn, 'execSync').mockImplementation((statement) => {
    const vacuum = statement.match(/^VACUUM INTO '([^']+)'$/);
    if (vacuum) {
      const path = `/engine-${++virtualCounter}.db`;
      exec(`VACUUM INTO '${path}'`);
      const bytes = t.sqlite.export();
      snapshots.push({ path, bytes });
      memoryFiles.set(`file://${vacuum[1]!}`, bytes);
      return;
    }
    const attach = statement.match(/^ATTACH DATABASE '([^']+)' AS restore_src$/);
    if (attach) {
      const bytes = memoryFiles.get(`file://${attach[1]!}`);
      const snapshot = snapshots.find((item) => bytes && equalBytes(bytes, item.bytes));
      if (!snapshot) throw new Error('synthetic invalid database');
      exec(`ATTACH DATABASE '${snapshot.path}' AS restore_src`);
      return;
    }
    exec(statement);
  });
  await t.db.insert(patients).values({ id: 'patient', ...stamps(), firstName: 'Saved', lastName: 'Synthetic' });
  memoryFiles.set(mediaUri, savedMedia.slice());
  jest.mocked(deriveKey).mockClear();
  const backup = await createBackup({ includeMedia: true, trigger: 'manual', copyToFolder: false });
  fixtureUri = 'file:///external/fixture.medosbak';
  await backup.file.copy(new File(fixtureUri));
  t.db.update(patients).set({ firstName: 'Current' }).run();
  memoryFiles.set(mediaUri, new Uint8Array([8, 7, 6]));
});
afterEach(() => {
  jest.restoreAllMocks();
});

function restore(onProgress?: Parameters<typeof restoreBackup>[0]['onProgress']) {
  return restoreBackup({ fileUri: fixtureUri, passphrase: 'synthetic test input', onProgress });
}
const name = () => t.db.select({ name: patients.firstName }).from(patients).get()!.name;

describe('backup orchestration (real archive/authentication and migrated SQLite; native files stood in)', () => {
  it.each(['throw', 'empty', 'zero'] as const)(
    'does not publish schema zero or report a newer backup when local migration metadata is unavailable: %s',
    async (failure) => {
      const read = t.conn.getFirstSync.bind(t.conn);
      const fault = jest.spyOn(t.conn, 'getFirstSync').mockImplementation(<T>(statement: string): T | null => {
        if (statement === 'SELECT count(*) AS n FROM __drizzle_migrations') {
          if (failure === 'throw') throw new Error('synthetic schema read failure');
          return failure === 'empty' ? null : ({ n: 0 } as T);
        }
        return read<T>(statement);
      });
      await expect(createBackup({ includeMedia: true, trigger: 'manual', copyToFolder: false })).rejects.toThrow(
        'نسخهٔ دیتابیس',
      );
      expect(
        t.db
          .select()
          .from(backupRuns)
          .all()
          .filter((run) => run.status === 'success'),
      ).toHaveLength(1);
      await expect(restore()).rejects.toThrow('نسخهٔ دیتابیس');
      expect(name()).toBe('Current');
      expect(equalBytes(memoryFiles.get(mediaUri)!, new Uint8Array([8, 7, 6]))).toBe(true);
      fault.mockRestore();
      await expect(restore()).resolves.toBeTruthy();
    },
  );

  it('round-trips an encrypted database and original media, clearing the swap marker only after commit', async () => {
    const result = await restore();
    expect(name()).toBe('Saved');
    expect(equalBytes(memoryFiles.get(mediaUri)!, savedMedia)).toBe(true);
    expect(result.files).toBe(1);
    expect(result.warnings).toEqual([]);
    expect(await readSetting(restoreInFlight)).toBeNull();
    const handle = new File(fixtureUri).open(FileMode.ReadOnly);
    try {
      expect(handle.readBytes(8)).toEqual(new TextEncoder().encode('MEDOSBAK'));
    } finally {
      handle.close();
    }
  });

  it('reserves restore before its first await so another restore or backup cannot enter', async () => {
    const results = await Promise.allSettled([
      restore(),
      restore(),
      createBackup({ includeMedia: true, trigger: 'manual', copyToFolder: false }),
    ]);
    expect(results[0]!.status).toBe('fulfilled');
    for (const result of results.slice(1)) {
      expect(result.status).toBe('rejected');
      if (result.status === 'rejected') expect(String(result.reason)).toContain('در حال انجام');
    }
    expect(name()).toBe('Saved');
  });

  it('refuses recovery while a restore owns the displaced folder', async () => {
    let release!: () => void;
    let entered!: () => void;
    const paused = new Promise<void>((resolve) => {
      release = resolve;
    });
    const started = new Promise<void>((resolve) => {
      entered = resolve;
    });
    jest.mocked(deriveKey).mockImplementationOnce(async () => {
      entered();
      await paused;
      return new Uint8Array(32).fill(9);
    });
    const pending = restore();
    await started;
    const recovery = await recoverInterruptedRestore().then(
      () => 'accepted',
      (e: unknown) => String(e),
    );
    release();
    await pending;
    expect(recovery).toContain('در حال انجام');
  });

  it('refuses manual backup of unresolved media and preserves earlier copies', async () => {
    await writeSetting(restoreMediaUnresolved, 1);
    const before = t.db.select().from(backupRuns).all().length;
    await expect(createBackup({ includeMedia: true, trigger: 'manual', copyToFolder: false })).rejects.toThrow();
    expect(t.db.select().from(backupRuns).all()).toHaveLength(before);
    expect(new File(fixtureUri).exists).toBe(true);
  });

  it('retains an earlier recovery marker and its only copy when recovery fails before this restore stages files', async () => {
    const marker = { dir: 'prior', at: 1 };
    const kept = 'file:///private/restore-displaced/prior/media/example/audio.wav';
    memoryFiles.set(kept, new Uint8Array([8, 7, 6]));
    await writeSetting(restoreInFlight, marker);
    jest.spyOn(File.prototype, 'moveSync').mockImplementationOnce(() => {
      throw new Error('synthetic move refusal');
    });
    await expect(restore()).rejects.toThrow('ناتمام');
    expect(await readSetting(restoreInFlight)).toEqual(marker);
    expect(new File(kept).exists).toBe(true);
    expect(name()).toBe('Current');
    await expect(createBackup({ includeMedia: true, trigger: 'manual' })).rejects.toThrow('ناتمام');
    await recoverInterruptedRestore();
    expect(await readSetting(restoreInFlight)).toBeNull();
    expect(new File(kept).exists).toBe(false);
    expect(equalBytes(memoryFiles.get(mediaUri)!, new Uint8Array([8, 7, 6]))).toBe(true);
  });

  it.each(['broken-json', JSON.stringify({ dir: '../elsewhere', at: 1 })])(
    'does not treat corrupt or unsafe recovery metadata as no recovery: %s',
    async (value) => {
      const kept = 'file:///private/restore-displaced/prior/media/example/audio.wav';
      memoryFiles.set(kept, new Uint8Array([8, 7, 6]));
      await t.db.insert(settings).values({ key: 'restore.inFlight', value, updatedAt: new Date() });
      await expect(recoverInterruptedRestore()).rejects.toThrow();
      expect(new File(kept).exists).toBe(true);
      await expect(restore()).rejects.toThrow();
      await expect(createBackup({ includeMedia: true, trigger: 'manual' })).rejects.toThrow();
      expect(name()).toBe('Current');
    },
  );

  it('rolls back clinical import and restores displaced bytes after a real SQL failure', async () => {
    t.sqlite.exec(
      "CREATE TRIGGER refuse_restore BEFORE INSERT ON patients BEGIN SELECT RAISE(ABORT, 'synthetic failure'); END;",
    );
    await expect(restore()).rejects.toThrow('synthetic failure');
    expect(name()).toBe('Current');
    expect(equalBytes(memoryFiles.get(mediaUri)!, new Uint8Array([8, 7, 6]))).toBe(true);
    expect(await readSetting(restoreInFlight)).toBeNull();
    t.sqlite.exec('DROP TRIGGER refuse_restore');
    await restore();
    expect(name()).toBe('Saved');
  });

  it('authenticates the entire archive before snapshotting or moving clinical media', async () => {
    jest.mocked(deriveKey).mockResolvedValueOnce(new Uint8Array(32).fill(6));
    await expect(restore()).rejects.toThrow();
    expect(name()).toBe('Current');
    expect(equalBytes(memoryFiles.get(mediaUri)!, new Uint8Array([8, 7, 6]))).toBe(true);
    expect([...memoryFiles.keys()].some((path) => path.includes('/backups/'))).toBe(false);
  });

  it('surfaces failed media rollback immediately and keeps its only copies until retry succeeds', async () => {
    const nativeMove = File.prototype.moveSync;
    const refusal = () => {
      throw new Error('synthetic move failure');
    };
    jest
      .spyOn(File.prototype, 'moveSync')
      .mockImplementationOnce(function (this: File, ...args) {
        nativeMove.call(this, ...args);
      })
      .mockImplementationOnce(refusal)
      .mockImplementationOnce(refusal);
    await expect(restore()).rejects.toThrow('سر جایشان برنگشتند');
    expect(name()).toBe('Current');
    expect(await readSetting(restoreMediaUnresolved)).toBe(1);
    const marker = (await readSetting(restoreInFlight))!;
    const kept = `file:///private/restore-displaced/${marker.dir}/media/example/audio.wav`;
    expect(new File(kept).exists).toBe(true);
    await expect(createBackup({ includeMedia: true, trigger: 'manual' })).rejects.toThrow('ناتمام');
    await recoverInterruptedRestore();
    expect(await readSetting(restoreMediaUnresolved)).toBe(0);
    expect(await readSetting(restoreInFlight)).toBeNull();
    expect(equalBytes(memoryFiles.get(mediaUri)!, new Uint8Array([8, 7, 6]))).toBe(true);
  });

  it('reports a committed restore with a warning if its final progress callback throws', async () => {
    const result = await restore((progress) => {
      if (progress.phase === 'done') throw new Error('synthetic progress failure');
    });
    expect(name()).toBe('Saved');
    expect(equalBytes(memoryFiles.get(mediaUri)!, savedMedia)).toBe(true);
    expect(result.warnings).toContain('نمایش پایان بازگردانی');
  });

  it('redacts SQL parameters before persisting backup failure text', async () => {
    jest.mocked(loadBackupKey).mockRejectedValueOnce(new Error('Failed query: select; params: synthetic-private-data'));
    await expect(createBackup({ includeMedia: true, trigger: 'manual' })).rejects.toThrow();
    const failed = t.db
      .select()
      .from(backupRuns)
      .all()
      .find((row) => row.status === 'failed')!;
    expect(failed.errorText).toContain('[redacted]');
    expect(failed.errorText).not.toContain('synthetic-private-data');
  });

  // Last so the old implementation's leaked `running` flag cannot mask other
  // witnesses. The corrected implementation releases it even on close failure.
  it('keeps committed success honest and releases the lock when closing the source fails', async () => {
    closeFailures.add(fixtureUri);
    const result = await restore();
    expect(name()).toBe('Saved');
    expect(result.warnings).toContain('بستن فایل بکاپ');
    await expect(createBackup({ includeMedia: true, trigger: 'manual', copyToFolder: false })).resolves.toBeTruthy();
  });
});
