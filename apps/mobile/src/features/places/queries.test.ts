import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { eq } from 'drizzle-orm';

import { extensions, places } from '@/db/schema';
import { softDelete } from '@/lib/ids';
import { useTestDatabase } from '@/test/db-client';
import { createTestDatabase, type TestDatabase } from '@/test/sqljs';

import { createExtension, createPlace, extensionsQuery, placesQuery, updateExtension, updatePlace } from './queries';

jest.mock('@/db/client', () => jest.requireActual('@/test/db-client'));

let t: TestDatabase;
const rows = () => ({ places: t.db.select().from(places).all(), extensions: t.db.select().from(extensions).all() });
const removedAt = new Date('2025-01-02T12:00:00Z');
async function place(name = 'Synthetic central') {
  return createPlace({ name, kind: 'hospital' });
}
async function extension(placeId: string) {
  return createExtension({ placeId, department: 'Radiology', extension: '2345', notes: 'Retain original' });
}
function removePlace(id: string) {
  t.db.update(places).set(softDelete(removedAt)).where(eq(places.id, id)).run();
}
beforeEach(async () => {
  t = useTestDatabase(await createTestDatabase());
});

describe('extensions remain visible only with a live parent', () => {
  it('rejects creation under a soft-deleted place without storing an invisible child', async () => {
    const id = await place();
    removePlace(id);
    const before = rows();
    await expect(extension(id)).rejects.toThrow('مکان');
    expect(rows()).toEqual(before);
    expect(await extensionsQuery()).toEqual([]);
  });

  it('rejects a missing place before insertion', async () => {
    const before = rows();
    await expect(extension('synthetic-missing')).rejects.toThrow('مکان');
    expect(rows()).toEqual(before);
  });

  it('rejects editing an existing child after its original parent is deleted', async () => {
    const placeId = await place();
    const id = await extension(placeId);
    removePlace(placeId);
    const before = rows();
    await expect(updateExtension(id, { extension: '5678' })).rejects.toThrow('مکان');
    expect(rows()).toEqual(before);
  });

  it('rejects moving a child to a deleted place without losing its live original association', async () => {
    const current = await place();
    const target = await place('Synthetic destination');
    const id = await extension(current);
    removePlace(target);
    const before = rows();
    await expect(updateExtension(id, { placeId: target, extension: '5678' })).rejects.toThrow('مکان');
    expect(rows()).toEqual(before);
    expect((await extensionsQuery())[0]?.extension.id).toBe(id);
  });

  it('does not use an ordinary edit to recover a child of a deleted original parent', async () => {
    const current = await place();
    const target = await place('Synthetic destination');
    const id = await extension(current);
    removePlace(current);
    const before = rows();
    await expect(updateExtension(id, { placeId: target })).rejects.toThrow('مکان');
    expect(rows()).toEqual(before);
  });

  it('rebuilds search from the merged child and actual destination, retaining unrelated fields', async () => {
    const current = await place();
    const target = await place('Synthetic destination');
    const id = await extension(current);
    await updateExtension(id, { placeId: target, extension: '5678' });
    const found = await extensionsQuery({ search: 'destination Radiology 5678' });
    expect(found).toHaveLength(1);
    expect(found[0]?.extension).toMatchObject({
      id,
      placeId: target,
      department: 'Radiology',
      notes: 'Retain original',
    });
    expect(await extensionsQuery({ search: 'central Radiology' })).toEqual([]);
  });

  it('refuses a deleted child without changing its tombstone or acknowledging success', async () => {
    const id = await extension(await place());
    t.db.update(extensions).set(softDelete(removedAt)).where(eq(extensions.id, id)).run();
    const before = rows();
    await expect(updateExtension(id, { notes: 'Late edit' })).rejects.toThrow('داخلی');
    expect(rows()).toEqual(before);
  });

  it('rolls back the place rename and every child index when one index write fails', async () => {
    const placeId = await place();
    await extension(placeId);
    await createExtension({ placeId, department: 'Laboratory', extension: '3456' });
    const before = rows();
    t.sqlite.exec(`CREATE TRIGGER fail_extension_index BEFORE UPDATE OF search_text ON extensions
      WHEN OLD.department = 'Laboratory' BEGIN SELECT RAISE(ABORT, 'Synthetic child index failure'); END`);
    await expect(updatePlace(placeId, { name: 'Synthetic renamed' })).rejects.toThrow('Synthetic child index failure');
    expect(rows()).toEqual(before);
    expect(await extensionsQuery({ search: 'central' })).toHaveLength(2);
    expect(await extensionsQuery({ search: 'renamed' })).toEqual([]);
  });

  it('refuses a deleted place rename and preserves every child column', async () => {
    const placeId = await place();
    await extension(placeId);
    removePlace(placeId);
    const before = rows();
    await expect(updatePlace(placeId, { name: 'Late rename' })).rejects.toThrow('مکان');
    expect(rows()).toEqual(before);
  });

  it('retains a stored place name in search when a sparse patch has an undefined name', async () => {
    const placeId = await place();
    await updatePlace(placeId, { name: undefined, city: 'Synthetic city' });
    expect((await placesQuery({ search: 'central city' })).map((p) => p.id)).toEqual([placeId]);
    expect(t.db.select().from(places).where(eq(places.id, placeId)).get()?.name).toBe('Synthetic central');
  });

  it('retains a stored department for undefined input while honoring an explicit null clear', async () => {
    const id = await extension(await place());
    await updateExtension(id, { department: undefined, extension: '5678', notes: null });
    const found = await extensionsQuery({ search: 'central Radiology 5678' });
    expect(found.map((r) => r.extension.id)).toEqual([id]);
    expect(found[0]?.extension).toMatchObject({ department: 'Radiology', notes: null });
    expect(await extensionsQuery({ search: 'Retain original' })).toEqual([]);
  });
});
