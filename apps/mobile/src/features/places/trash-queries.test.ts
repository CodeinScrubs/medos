import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { eq } from 'drizzle-orm';

import { tablesOf } from '@/db/query-tables';
import { auditLog, extensions, places } from '@/db/schema';
import { datasetGeneration, withDatasetWrite } from '@/lib/dataset-write';
import { stamps } from '@/lib/ids';
import { databaseRows, snapshotDataset } from '@/test/dataset-snapshot';
import { useTestDatabase } from '@/test/db-client';
import { createTestDatabase, type TestDatabase } from '@/test/sqljs';

import { createExtension, createPlace, extensionsQuery, placesQuery } from './queries';
import {
  deleteExtension,
  deletePlace,
  deletedPlacesCountQuery,
  deletedPlacesQuery,
  restoreExtension,
  restorePlace,
  type PlaceTrashKind,
} from './trash-queries';

jest.mock('@/db/client', () => jest.requireActual('@/test/db-client'));

const sameMs = new Date('2026-01-02T10:00:00.123Z');
const later = new Date('2026-01-03T10:00:00.456Z');
let t: TestDatabase;
beforeEach(async () => {
  t = useTestDatabase(await createTestDatabase());
});

async function seed() {
  const placeId = await createPlace({
    name: 'Synthetic central',
    kind: 'hospital',
    notes: 'Synthetic private place note',
  });
  const extensionId = await createExtension({
    placeId,
    department: 'Synthetic radiology',
    extension: '2345',
    notes: 'Synthetic private extension note',
  });
  // The whole restore/delete cycle can now leave every scalar column identical.
  t.db.update(places).set({ updatedAt: sameMs }).where(eq(places.id, placeId)).run();
  t.db.update(extensions).set({ updatedAt: sameMs }).where(eq(extensions.id, extensionId)).run();
  return { placeId, extensionId };
}
async function liveBasis(kind: PlaceTrashKind, id: string) {
  const result =
    kind === 'place'
      ? (await placesQuery()).find((r) => r.id === id)
      : (await extensionsQuery()).find((r) => r.extension.id === id);
  if (!result) throw new Error('Synthetic live fixture missing');
  return result.expectedBasis;
}
async function tombstone(kind: PlaceTrashKind, id: string) {
  const row = (await deletedPlacesQuery(kind)).find((r) => r.id === id);
  if (!row) throw new Error('Synthetic tombstone missing');
  return row;
}
const remove = { place: deletePlace, extension: deleteExtension };
const restore = { place: restorePlace, extension: restoreExtension };

describe('places and extensions in the existing trash', () => {
  it('a parent hides live extensions without converting them into tombstones or reviving deleted siblings', async () => {
    const { placeId, extensionId } = await seed();
    const removedChild = await createExtension({ placeId, department: 'Synthetic laboratory', extension: '3456' });
    await deleteExtension(removedChild, await liveBasis('extension', removedChild), sameMs);
    const childBefore = t.db.select().from(extensions).all();
    await deletePlace(placeId, await liveBasis('place', placeId), sameMs);
    expect(await extensionsQuery()).toEqual([]);
    expect(t.db.select().from(extensions).all()).toEqual(childBefore);
    expect(await deletedPlacesCountQuery()).toEqual([{ count: 2 }]);
    expect((await deletedPlacesQuery()).map((r) => `${r.kind}:${r.id}`).sort()).toEqual(
      [`extension:${removedChild}`, `place:${placeId}`].sort(),
    );
    const shown = await tombstone('place', placeId);
    await restorePlace(placeId, shown.expectedBasis, later);
    expect((await extensionsQuery()).map((r) => r.extension.id)).toEqual([extensionId]);
    expect(t.db.select().from(extensions).all()).toEqual(childBefore);
    expect((await tombstone('extension', removedChild)).parentId).toBe(placeId);
  });

  it.each(['place', 'extension'] as const)(
    'restores the original %s fields/search without duplicate rows or private audit text',
    async (kind) => {
      const ids = await seed();
      const id = kind === 'place' ? ids.placeId : ids.extensionId;
      const table = kind === 'place' ? places : extensions;
      const before = t.db.select().from(table).where(eq(table.id, id)).get()!;
      await remove[kind](id, await liveBasis(kind, id), sameMs);
      const shown = await tombstone(kind, id);
      expect(JSON.stringify(shown)).not.toContain('private');
      await restore[kind](id, shown.expectedBasis, later);
      expect(t.db.select().from(table).where(eq(table.id, id)).get()).toEqual({
        ...before,
        deletedAt: null,
        updatedAt: later,
      });
      const audit = t.db.select().from(auditLog).all();
      expect(audit.map((r) => [r.action, r.entityType, r.entityId])).toEqual([
        [`${kind}.deleted`, kind, id],
        [`${kind}.restored`, kind, id],
      ]);
      expect(audit.every((r) => r.summary === null && r.detail === null)).toBe(true);
      expect(JSON.stringify(audit)).not.toContain('Synthetic');
      expect((await deletedPlacesCountQuery(kind))[0]?.count).toBe(0);
      const stable = databaseRows(t);
      await expect(restore[kind](id, shown.expectedBasis, later)).rejects.toThrow();
      expect(databaseRows(t)).toEqual(stable);
    },
  );

  it.each(['place', 'extension'] as const)(
    'rejects the old %s tombstone after an identical same-ms restore/redelete cycle',
    async (kind) => {
      const ids = await seed();
      const id = kind === 'place' ? ids.placeId : ids.extensionId;
      const table = kind === 'place' ? places : extensions;
      await remove[kind](id, await liveBasis(kind, id), sameMs);
      const oldChoice = await tombstone(kind, id);
      const oldStoredRow = t.db.select().from(table).where(eq(table.id, id)).get();
      await restore[kind](id, oldChoice.expectedBasis, sameMs);
      await remove[kind](id, await liveBasis(kind, id), sameMs);
      expect(t.db.select().from(table).where(eq(table.id, id)).get()).toEqual(oldStoredRow);
      const newChoice = await tombstone(kind, id);
      expect(newChoice.expectedBasis).not.toBe(oldChoice.expectedBasis);
      const before = databaseRows(t);
      await expect(restore[kind](id, oldChoice.expectedBasis, sameMs)).rejects.toThrow();
      expect(databaseRows(t)).toEqual(before);
      await restore[kind](id, newChoice.expectedBasis, sameMs);
    },
  );

  it.each(['place', 'extension'] as const)(
    'also refuses the original live %s delete choice after an identical same-ms cycle',
    async (kind) => {
      const ids = await seed();
      const id = kind === 'place' ? ids.placeId : ids.extensionId;
      const oldChoice = await liveBasis(kind, id);
      await remove[kind](id, oldChoice, sameMs);
      await restore[kind](id, (await tombstone(kind, id)).expectedBasis, sameMs);
      expect(await liveBasis(kind, id)).not.toBe(oldChoice);
      const before = databaseRows(t);
      await expect(remove[kind](id, oldChoice, sameMs)).rejects.toThrow();
      expect(databaseRows(t)).toEqual(before);
    },
  );

  it.each(['place', 'extension'] as const)('refuses hidden same-timestamp %s changes', async (kind) => {
    const ids = await seed();
    const id = kind === 'place' ? ids.placeId : ids.extensionId;
    const table = kind === 'place' ? places : extensions;
    await remove[kind](id, await liveBasis(kind, id), sameMs);
    const old = await tombstone(kind, id);
    t.db.update(table).set({ notes: 'Synthetic concurrent hidden change' }).where(eq(table.id, id)).run();
    const before = databaseRows(t);
    await expect(restore[kind](id, old.expectedBasis, later)).rejects.toThrow();
    expect(databaseRows(t)).toEqual(before);
  });

  it('keeps SQLite int64 distinctions in the restore basis', async () => {
    const { extensionId } = await seed();
    await deleteExtension(extensionId, await liveBasis('extension', extensionId), sameMs);
    t.sqlite.run('UPDATE extensions SET usage_count = 9223372036854775806 WHERE id = ?', [extensionId]);
    const old = await tombstone('extension', extensionId);
    t.sqlite.run('UPDATE extensions SET usage_count = 9223372036854775807 WHERE id = ?', [extensionId]);
    const next = await tombstone('extension', extensionId);
    expect(next.expectedBasis).not.toBe(old.expectedBasis);
    const before = databaseRows(t);
    await expect(restoreExtension(extensionId, old.expectedBasis, later)).rejects.toThrow();
    expect(databaseRows(t)).toEqual(before);
  });

  it('requires the original live parent, and a fresh choice after a parent name or lifecycle change', async () => {
    const { placeId, extensionId } = await seed();
    await deleteExtension(extensionId, await liveBasis('extension', extensionId), sameMs);
    const old = await tombstone('extension', extensionId);
    t.db.update(places).set({ name: 'Synthetic corrected identity' }).where(eq(places.id, placeId)).run();
    const before = databaseRows(t);
    await expect(restoreExtension(extensionId, old.expectedBasis, later)).rejects.toThrow();
    expect(databaseRows(t)).toEqual(before);
    await deletePlace(placeId, await liveBasis('place', placeId), sameMs);
    const underDeletedParent = await tombstone('extension', extensionId);
    const removed = databaseRows(t);
    await expect(restoreExtension(extensionId, underDeletedParent.expectedBasis, later)).rejects.toThrow('مکان');
    expect(databaseRows(t)).toEqual(removed);
    await restorePlace(placeId, (await tombstone('place', placeId)).expectedBasis, sameMs);
    await expect(restoreExtension(extensionId, underDeletedParent.expectedBasis, later)).rejects.toThrow();
    await restoreExtension(extensionId, (await tombstone('extension', extensionId)).expectedBasis, later);
    expect((await extensionsQuery({ search: 'corrected radiology 2345' })).map((r) => r.extension.id)).toEqual([
      extensionId,
    ]);
  });

  it('treats an imported empty parent key as an actual key, without inventing a destination', async () => {
    t.db
      .insert(places)
      .values({ id: '', ...stamps(sameMs), name: 'Synthetic empty key', kind: 'hospital' })
      .run();
    const id = await createExtension({ placeId: '', department: 'Synthetic empty owner', extension: '4567' });
    await deleteExtension(id, await liveBasis('extension', id), sameMs);
    await restoreExtension(id, (await tombstone('extension', id)).expectedBasis, later);
    expect(t.db.select().from(extensions).where(eq(extensions.id, id)).get()?.placeId).toBe('');
  });

  it('lists an orphan tombstone, but refuses to invent or replace its missing parent', async () => {
    const { extensionId } = await seed();
    await deleteExtension(extensionId, await liveBasis('extension', extensionId), sameMs);
    t.sqlite.exec('PRAGMA foreign_keys = OFF');
    try {
      t.sqlite.run('UPDATE extensions SET place_id = ? WHERE id = ?', ['synthetic-missing-parent', extensionId]);
    } finally {
      t.sqlite.exec('PRAGMA foreign_keys = ON');
    }
    const shown = await tombstone('extension', extensionId);
    expect(shown).toMatchObject({ parentId: 'synthetic-missing-parent', parentName: null });
    const before = databaseRows(t);
    await expect(restoreExtension(extensionId, shown.expectedBasis, later)).rejects.toThrow('مکان');
    expect(databaseRows(t)).toEqual(before);
  });

  it.each(['place', 'extension'] as const)(
    'missing/alive %s rows never acknowledge recovery or add an audit',
    async (kind) => {
      const ids = await seed();
      const id = kind === 'place' ? ids.placeId : ids.extensionId;
      const basis = await liveBasis(kind, id);
      const before = databaseRows(t);
      await expect(restore[kind](id, basis, later)).rejects.toThrow();
      await expect(restore[kind]('synthetic-missing', basis, later)).rejects.toThrow();
      expect(databaseRows(t)).toEqual(before);
    },
  );

  it('rejects invalid kind, page/cursor, choice and clock before any write', async () => {
    const { placeId } = await seed();
    const before = databaseRows(t);
    expect(() => deletedPlacesQuery('unknown' as PlaceTrashKind)).toThrow();
    expect(() => deletedPlacesQuery(undefined, null, 0)).toThrow();
    expect(() => deletedPlacesQuery(undefined, null, 101)).toThrow();
    expect(() => deletedPlacesQuery(undefined, { kind: 'place', id: 'x', deletedAt: new Date(Number.NaN) })).toThrow();
    await expect(deletePlace(placeId, 'not-a-basis', sameMs)).rejects.toThrow();
    await expect(deletePlace(placeId, await liveBasis('place', placeId), new Date(Number.NaN))).rejects.toThrow();
    expect(databaseRows(t)).toEqual(before);
  });

  it.each(['place.deleted', 'place.restored', 'extension.deleted', 'extension.restored'] as const)(
    'rolls back all state when required %s audit insertion fails',
    async (action) => {
      const { placeId, extensionId } = await seed();
      const kind = action.startsWith('place.') ? 'place' : 'extension';
      const id = kind === 'place' ? placeId : extensionId;
      const restoring = action.endsWith('.restored');
      if (restoring) await remove[kind](id, await liveBasis(kind, id), sameMs);
      const expectedBasis = restoring ? (await tombstone(kind, id)).expectedBasis : await liveBasis(kind, id);
      t.sqlite.exec(
        `CREATE TRIGGER refuse_place_audit BEFORE INSERT ON audit_log WHEN NEW.action = '${action}' BEGIN SELECT RAISE(ABORT, 'Synthetic audit failure'); END`,
      );
      const before = databaseRows(t);
      await expect((restoring ? restore[kind] : remove[kind])(id, expectedBasis, later)).rejects.toThrow(
        'Synthetic audit failure',
      );
      expect(databaseRows(t)).toEqual(before);
    },
  );

  it('bounds payload hydration, filters before pagination and preserves the stable tie order', async () => {
    for (let n = 0; n < 24; n++) {
      const id = `synthetic-place-${n.toString().padStart(2, '0')}`;
      t.db
        .insert(places)
        .values({
          id,
          ...stamps(sameMs),
          deletedAt: sameMs,
          name: id,
          kind: 'hospital',
          notes: 'Synthetic private bulk',
        })
        .run();
    }
    const { placeId, extensionId } = await seed();
    await deleteExtension(extensionId, await liveBasis('extension', extensionId), sameMs);
    const first = await deletedPlacesQuery('place');
    expect(first).toHaveLength(21);
    expect(first.every((r) => r.kind === 'place')).toBe(true);
    expect(first.slice(0, 20).map((r) => r.id)).toEqual(
      Array.from({ length: 20 }, (_, n) => `synthetic-place-${n.toString().padStart(2, '0')}`),
    );
    const last = first[19]!;
    expect(
      (await deletedPlacesQuery('place', { deletedAt: last.deletedAt, kind: last.kind, id: last.id })).map((r) => r.id),
    ).toEqual(['synthetic-place-20', 'synthetic-place-21', 'synthetic-place-22', 'synthetic-place-23']);
    expect(await deletedPlacesCountQuery('place')).toEqual([{ count: 24 }]);
    expect(await deletedPlacesCountQuery('extension')).toEqual([{ count: 1 }]);
    expect(JSON.stringify(first)).not.toContain('private');
    expect(deletedPlacesCountQuery().toSQL().sql).not.toContain('json_object');
    expect(new Set(tablesOf(deletedPlacesQuery()))).toEqual(new Set(['places', 'extensions', 'audit_log']));
    expect(new Set(tablesOf(placesQuery()))).toEqual(new Set(['places', 'audit_log']));
    expect(new Set(tablesOf(extensionsQuery()))).toEqual(new Set(['places', 'extensions', 'audit_log']));
    expect(placeId).toBeTruthy();
  });

  it('an old dataset intent cannot restore an identical-id archive, even though audit_log is merged', async () => {
    const { placeId } = await seed();
    await deletePlace(placeId, await liveBasis('place', placeId), sameMs);
    const old = await tombstone('place', placeId);
    const originalGeneration = datasetGeneration();
    const replace = snapshotDataset(t);
    await restorePlace(placeId, old.expectedBasis, sameMs);
    replace();
    const before = databaseRows(t);
    await expect(
      withDatasetWrite(originalGeneration, () => restorePlace(placeId, old.expectedBasis, later)),
    ).rejects.toThrow('بکاپ');
    expect(databaseRows(t)).toEqual(before);
    // The retained local restore audit remains merged. A current intent still works with a fresh token.
    expect(
      t.db
        .select()
        .from(auditLog)
        .all()
        .map((r) => r.action),
    ).toContain('place.restored');
    const current = await tombstone('place', placeId);
    expect(current.expectedBasis).not.toBe(old.expectedBasis);
    await withDatasetWrite(datasetGeneration(), () => restorePlace(placeId, current.expectedBasis, later));
  });

  it('hydrates every requested page id rather than an arbitrary inner-table id', async () => {
    const first = await seed();
    const second = await seed();
    for (const id of [first.placeId, second.placeId]) await deletePlace(id, await liveBasis('place', id), sameMs);
    const shown = await deletedPlacesQuery('place');
    expect(shown).toHaveLength(2);
    expect(shown[0]!.expectedBasis).not.toBe(shown[1]!.expectedBasis);
    for (const row of shown) await restorePlace(row.id, row.expectedBasis, later);
    expect((await placesQuery()).map((r) => r.id).sort()).toEqual([first.placeId, second.placeId].sort());
    const children = await extensionsQuery();
    for (const row of children) await deleteExtension(row.extension.id, row.expectedBasis, sameMs);
    for (const row of await deletedPlacesQuery('extension')) await restoreExtension(row.id, row.expectedBasis, later);
    expect((await extensionsQuery()).map((r) => r.extension.id).sort()).toEqual(
      [first.extensionId, second.extensionId].sort(),
    );
  });

  it('refuses an original extension choice after its owner changes to another live place', async () => {
    const { extensionId } = await seed();
    const destination = await createPlace({ name: 'Synthetic other live owner', kind: 'hospital' });
    await deleteExtension(extensionId, await liveBasis('extension', extensionId), sameMs);
    const old = await tombstone('extension', extensionId);
    t.db.update(extensions).set({ placeId: destination }).where(eq(extensions.id, extensionId)).run();
    const before = databaseRows(t);
    await expect(restoreExtension(extensionId, old.expectedBasis, later)).rejects.toThrow();
    expect(databaseRows(t)).toEqual(before);
  });

  it('restores imported empty record keys as actual ids for both notebook kinds', async () => {
    t.db
      .insert(places)
      .values({ id: '', ...stamps(sameMs), name: 'Synthetic empty key', kind: 'hospital' })
      .run();
    t.db
      .insert(extensions)
      .values({ id: '', ...stamps(sameMs), placeId: '', department: 'Synthetic empty child', extension: '4567' })
      .run();
    await deleteExtension('', await liveBasis('extension', ''), sameMs);
    await deletePlace('', await liveBasis('place', ''), sameMs);
    await restorePlace('', (await tombstone('place', '')).expectedBasis, later);
    await restoreExtension('', (await tombstone('extension', '')).expectedBasis, later);
    expect((await placesQuery())[0]?.id).toBe('');
    expect((await extensionsQuery())[0]?.extension).toMatchObject({ id: '', placeId: '' });
  });
});
