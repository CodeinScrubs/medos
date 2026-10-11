import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { eq } from 'drizzle-orm';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { Linking } from 'react-native';

import { notify } from '@/components/feedback';
import { extensions, places } from '@/db/schema';
import { datasetGeneration } from '@/lib/dataset-write';
import { logError } from '@/platform/error-log';
import { databaseRows, replacementFailure, snapshotDataset } from '@/test/dataset-snapshot';
import { useTestDatabase } from '@/test/db-client';
import { createTestDatabase, type TestDatabase } from '@/test/sqljs';

import * as actions from './actions';
import { createExtension, createPlace, extensionsQuery, placeQuery, setExtensionStarred } from './queries';
jest.mock('@/db/client', () => jest.requireActual('@/test/db-client'));
jest.mock('@/components/feedback', () => ({ notify: jest.fn() }));
jest.mock('@/platform/error-log', () => ({ logError: jest.fn() }));
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn() }));
jest.mock('expo-haptics', () => ({ notificationAsync: jest.fn(), NotificationFeedbackType: { Success: 'success' } }));
let t: TestDatabase;
let focused = true;
beforeEach(async () => {
  jest.clearAllMocks();
  focused = true;
  t = useTestDatabase(await createTestDatabase());
  jest.mocked(Clipboard.setStringAsync).mockResolvedValue(true);
  jest.mocked(Haptics.notificationAsync).mockResolvedValue(undefined);
  jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
});
async function seed() {
  const placeId = await createPlace({ name: 'Synthetic owner', kind: 'hospital', switchboard: '5550127' });
  const id = await createExtension({ placeId, department: 'Synthetic ward', extension: '2345' });
  return (await extensionsQuery()).find((row) => row.extension.id === id)!;
}
function owner(row: Awaited<ReturnType<typeof seed>>) {
  const generation = datasetGeneration();
  return { generation, expectedBasis: row.expectedBasis, owns: () => focused && generation === datasetGeneration() };
}
const copy = (row: Awaited<ReturnType<typeof seed>>) => actions.copyExtension(row.extension, owner(row));
const call = (row: Awaited<ReturnType<typeof seed>>) => actions.callExtension(row.extension, row.place, owner(row));
const count = (id: string) => t.db.select().from(extensions).where(eq(extensions.id, id)).get()!.usageCount;
const strictStar = setExtensionStarred;

describe('original extension star choices', () => {
  const now = new Date('2026-01-02T10:00:00.123Z');
  it('fresh star/unstar preserves the row and explicit timestamp with existing starred sorting', async () => {
    const row = await seed();
    const alphabeticalFirst = await createExtension({
      placeId: row.place.id,
      department: 'A synthetic other ward',
      extension: '3456',
    });
    expect((await extensionsQuery())[0]!.extension.id).toBe(alphabeticalFirst);
    await strictStar(row.extension.id, true, row.expectedBasis, now);
    expect((await extensionsQuery())[0]!.extension).toEqual({ ...row.extension, starred: true, updatedAt: now });
    const shown = (await extensionsQuery()).find((r) => r.extension.id === row.extension.id)!;
    await strictStar(row.extension.id, false, shown.expectedBasis, now);
    expect((await extensionsQuery())[0]!.extension.id).toBe(alphabeticalFirst);
    expect(t.db.select().from(extensions).where(eq(extensions.id, row.extension.id)).get()).toEqual({
      ...row.extension,
      starred: false,
      updatedAt: now,
    });
  });
  it.each(['record', 'parent', 'deleted-record', 'deleted-parent', 'missing-record'] as const)(
    'refuses stale %s star choice without changing any table',
    async (kind) => {
      const row = await seed();
      if (kind === 'record')
        t.db
          .update(extensions)
          .set({ notes: 'Synthetic hidden correction' })
          .where(eq(extensions.id, row.extension.id))
          .run();
      if (kind === 'parent')
        t.db.update(places).set({ name: 'Synthetic changed original parent' }).where(eq(places.id, row.place.id)).run();
      if (kind === 'deleted-record')
        t.db.update(extensions).set({ deletedAt: now }).where(eq(extensions.id, row.extension.id)).run();
      if (kind === 'deleted-parent')
        t.db.update(places).set({ deletedAt: now }).where(eq(places.id, row.place.id)).run();
      const before = databaseRows(t);
      await expect(
        strictStar(kind === 'missing-record' ? 'synthetic-missing' : row.extension.id, true, row.expectedBasis, now),
      ).rejects.toThrow();
      expect(databaseRows(t)).toEqual(before);
    },
  );
  it('refuses malformed basis/clock/value instead of treating an id-only call as trusted', async () => {
    const row = await seed();
    const before = databaseRows(t);
    await expect(strictStar(row.extension.id, true, '', now)).rejects.toThrow();
    await expect(strictStar(row.extension.id, true, row.expectedBasis, new Date(Number.NaN))).rejects.toThrow();
    await expect(strictStar(row.extension.id, 'false' as unknown as boolean, row.expectedBasis, now)).rejects.toThrow();
    expect(databaseRows(t)).toEqual(before);
  });
});

describe('native receipt before optional usage', () => {
  it('records no use before a dialer launch is acknowledged', async () => {
    const row = await seed();
    let acknowledge!: () => void;
    jest.mocked(Linking.openURL).mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          acknowledge = resolve;
        }),
    );
    const work = call(row);
    await Promise.resolve();
    expect(count(row.extension.id)).toBe(0);
    acknowledge();
    await work;
    expect(count(row.extension.id)).toBe(1);
    expect(notify).not.toHaveBeenCalled();
  });
  it('keeps failed native launch at zero use', async () => {
    const row = await seed();
    jest.mocked(Linking.openURL).mockRejectedValue(new Error('Synthetic private URI failure'));
    await call(row).catch(() => {});
    expect(count(row.extension.id)).toBe(0);
  });
  it('holds original dataset admission across a deferred copy receipt', async () => {
    const row = await seed();
    let acknowledge!: (saved: boolean) => void;
    jest.mocked(Clipboard.setStringAsync).mockImplementation(
      () =>
        new Promise((resolve) => {
          acknowledge = resolve;
        }),
    );
    const work = copy(row);
    await Promise.resolve();
    const blocked = replacementFailure();
    acknowledge(true);
    await work;
    expect(blocked).toBeInstanceOf(Error);
    expect(replacementFailure()).toBeNull();
  });
  it('does not record usage or haptics after the originating screen loses focus', async () => {
    const row = await seed();
    let acknowledge!: (saved: boolean) => void;
    jest.mocked(Clipboard.setStringAsync).mockImplementation(
      () =>
        new Promise((resolve) => {
          acknowledge = resolve;
        }),
    );
    const work = copy(row);
    await Promise.resolve();
    focused = false;
    acknowledge(true);
    await work;
    expect(count(row.extension.id)).toBe(0);
    expect(Haptics.notificationAsync).not.toHaveBeenCalled();
  });

  it.each(['reject', 'false'] as const)(
    'clipboard %s cannot claim success or record optional feedback',
    async (result) => {
      const row = await seed();
      if (result === 'reject')
        jest.mocked(Clipboard.setStringAsync).mockRejectedValue(new Error('Synthetic secret clipboard failure'));
      else jest.mocked(Clipboard.setStringAsync).mockResolvedValue(false);
      await expect(copy(row)).rejects.toThrow('کپی');
      expect(count(row.extension.id)).toBe(0);
      expect(Haptics.notificationAsync).not.toHaveBeenCalled();
      expect(notify).not.toHaveBeenCalled();
      expect(logError).not.toHaveBeenCalled();
    },
  );

  it('SQL counter failure stays separate from an acknowledged clipboard copy and logs only static diagnostics', async () => {
    const row = await seed();
    t.sqlite.exec(
      "CREATE TRIGGER reject_usage BEFORE UPDATE OF usage_count ON extensions BEGIN SELECT RAISE(ABORT, 'Synthetic secret/private counter failure'); END",
    );
    await expect(copy(row)).resolves.toBeUndefined();
    expect(Clipboard.setStringAsync).toHaveBeenCalledWith('2345');
    expect(count(row.extension.id)).toBe(0);
    expect(Haptics.notificationAsync).toHaveBeenCalledTimes(1);
    expect(logError).toHaveBeenCalledTimes(1);
    const logged = jest.mocked(logError).mock.calls[0]!;
    expect((logged[0] as Error).message).toBe('Optional extension usage recording failed');
    expect((logged[0] as Error).message).not.toContain('Synthetic');
  });

  it('haptic failure neither rejects a successful copy nor rolls back its one usage count', async () => {
    const row = await seed();
    jest.mocked(Haptics.notificationAsync).mockRejectedValue(new Error('Synthetic private haptic error'));
    await expect(copy(row)).resolves.toBeUndefined();
    await Promise.resolve();
    expect(count(row.extension.id)).toBe(1);
    expect((jest.mocked(logError).mock.calls[0]![0] as Error).message).toBe('Optional extension haptic failed');
    expect(notify).not.toHaveBeenCalled();
  });

  it.each(['copy', 'fallback'] as const)(
    'a synchronously thrown haptic error preserves acknowledged %s success with one literal diagnostic',
    async (kind) => {
      const original = await seed();
      if (kind === 'fallback')
        t.db.update(places).set({ switchboard: null }).where(eq(places.id, original.place.id)).run();
      const row = (await extensionsQuery())[0]!;
      jest.mocked(Haptics.notificationAsync).mockImplementation(() => {
        throw new Error('Synthetic private native failure tel:5550127,,2345');
      });
      await expect(kind === 'copy' ? copy(row) : call(row)).resolves.toBeUndefined();
      expect(Clipboard.setStringAsync).toHaveBeenCalledWith('2345');
      expect(Linking.openURL).not.toHaveBeenCalled();
      expect(count(row.extension.id)).toBe(1);
      expect(Haptics.notificationAsync).toHaveBeenCalledTimes(1);
      expect(logError).toHaveBeenCalledTimes(1);
      const [error, meta] = jest.mocked(logError).mock.calls[0]!;
      expect((error as Error).message).toBe('Optional extension haptic failed');
      expect((error as Error).stack).not.toContain('tel:5550127');
      expect(meta).toEqual({ source: 'handled', context: 'places optional device feedback' });
      expect(notify).toHaveBeenCalledTimes(kind === 'copy' ? 0 : 1);
    },
  );

  it('one failed counter and synchronous haptic throw produce two bounded literal logs without rejecting copy', async () => {
    const row = await seed();
    t.sqlite.exec(
      "CREATE TRIGGER reject_usage BEFORE UPDATE OF usage_count ON extensions BEGIN SELECT RAISE(ABORT, 'Synthetic private tel:5550127 counter failure'); END",
    );
    jest.mocked(Haptics.notificationAsync).mockImplementation(() => {
      throw new Error('Synthetic private native tel:5550127 haptic failure');
    });
    await expect(copy(row)).resolves.toBeUndefined();
    expect(count(row.extension.id)).toBe(0);
    expect(Haptics.notificationAsync).toHaveBeenCalledTimes(1);
    expect(logError).toHaveBeenCalledTimes(2);
    expect(jest.mocked(logError).mock.calls.map(([error]) => (error as Error).message)).toEqual([
      'Optional extension usage recording failed',
      'Optional extension haptic failed',
    ]);
    for (const [error, meta] of jest.mocked(logError).mock.calls) {
      expect((error as Error).stack).not.toContain('tel:5550127');
      expect(meta).toEqual({ source: 'handled', context: 'places optional device feedback' });
    }
    expect(notify).not.toHaveBeenCalled();
  });

  it.each(['record', 'parent'] as const)(
    'a hidden same-timestamp %s correction blocks the native action before dispatch',
    async (kind) => {
      const row = await seed();
      if (kind === 'record')
        t.db.update(extensions).set({ extension: '3456' }).where(eq(extensions.id, row.extension.id)).run();
      else t.db.update(places).set({ name: 'Synthetic changed parent' }).where(eq(places.id, row.place.id)).run();
      const before = databaseRows(t);
      await expect(copy(row)).rejects.toThrow();
      expect(Clipboard.setStringAsync).not.toHaveBeenCalled();
      expect(databaseRows(t)).toEqual(before);
    },
  );

  it('deleting the original parent blocks dispatch without choosing another live place', async () => {
    const row = await seed();
    await createPlace({ name: 'Synthetic other owner', kind: 'hospital', switchboard: '5550128' });
    t.db.update(places).set({ deletedAt: new Date() }).where(eq(places.id, row.place.id)).run();
    await expect(call(row)).rejects.toThrow();
    expect(Linking.openURL).not.toHaveBeenCalled();
    expect(count(row.extension.id)).toBe(0);
  });

  it('a changed row during native copy keeps the original copied text but refuses the optional usage mutation', async () => {
    const row = await seed();
    let acknowledge!: (saved: boolean) => void;
    jest.mocked(Clipboard.setStringAsync).mockImplementation(
      () =>
        new Promise((resolve) => {
          acknowledge = resolve;
        }),
    );
    const work = copy(row);
    await Promise.resolve();
    t.db.update(extensions).set({ extension: '3456' }).where(eq(extensions.id, row.extension.id)).run();
    acknowledge(true);
    await expect(work).resolves.toBeUndefined();
    expect(Clipboard.setStringAsync).toHaveBeenCalledWith('2345');
    expect(count(row.extension.id)).toBe(0);
    expect((jest.mocked(logError).mock.calls[0]![0] as Error).message).toBe(
      'Optional extension usage recording failed',
    );
  });

  it('an old original token never launches or touches a restored same-id row', async () => {
    const row = await seed();
    const originalOwner = owner(row);
    const replace = snapshotDataset(t);
    replace();
    const before = databaseRows(t);
    await expect(actions.copyExtension(row.extension, originalOwner)).rejects.toThrow('بکاپ');
    expect(Clipboard.setStringAsync).not.toHaveBeenCalled();
    expect(databaseRows(t)).toEqual(before);
  });

  it('uses explicit null versus empty keys when reading a place action', async () => {
    t.db
      .insert(places)
      .values({
        id: '',
        createdAt: new Date(),
        updatedAt: new Date(),
        name: 'Synthetic empty key',
        kind: 'hospital',
        phone: '5550127',
      })
      .run();
    expect(await placeQuery(null)).toEqual([]);
    const shown = (await placeQuery(''))[0]!;
    await actions.callPlace(shown, {
      generation: datasetGeneration(),
      expectedBasis: shown.expectedBasis,
      owns: () => true,
    });
    expect(Linking.openURL).toHaveBeenCalledWith('tel:5550127');
  });

  it('only the acknowledged no-dialer fallback copy is counted, without claiming a call happened', async () => {
    const placeId = await createPlace({ name: 'Synthetic no switchboard', kind: 'hospital' });
    const id = await createExtension({ placeId, department: 'Synthetic ward', extension: '2345' });
    const row = (await extensionsQuery()).find((r) => r.extension.id === id)!;
    await call(row);
    expect(Linking.openURL).not.toHaveBeenCalled();
    expect(Clipboard.setStringAsync).toHaveBeenCalledWith('2345');
    expect(count(id)).toBe(1);
    expect(notify).toHaveBeenCalledTimes(1);
    expect(jest.mocked(notify).mock.calls[0]![1]).toContain('کپی شد');
  });

  it('an imported nondialable extension cannot erase the clipboard or receive a usage count', async () => {
    const row = await seed();
    t.db.update(extensions).set({ extension: 'Synthetic nonnumeric' }).where(eq(extensions.id, row.extension.id)).run();
    const shown = (await extensionsQuery())[0]!;
    await expect(copy(shown)).rejects.toThrow('شمارهٔ داخلی');
    expect(Clipboard.setStringAsync).not.toHaveBeenCalled();
    expect(count(row.extension.id)).toBe(0);
  });
});
