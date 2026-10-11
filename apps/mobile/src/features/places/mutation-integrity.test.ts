import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { eq } from 'drizzle-orm';

import { extensions, places } from '@/db/schema';
import {
  createExtension,
  createPlace,
  updateExtension,
  updatePlace,
  type ExtensionInput,
  type PlaceInput,
} from '@/features/places/queries';
import { databaseRows } from '@/test/dataset-snapshot';
import { useTestDatabase } from '@/test/db-client';
import { createTestDatabase, type TestDatabase } from '@/test/sqljs';

jest.mock('@/db/client', () => jest.requireActual('@/test/db-client'));
let t: TestDatabase, placeId: string, parentId: string, extensionId: string;
beforeEach(async () => {
  t = useTestDatabase(await createTestDatabase());
  placeId = await createPlace({ name: 'Synthetic metadata target' });
  parentId = await createPlace({ name: 'Synthetic extension parent' });
  extensionId = await createExtension({ placeId: parentId, department: 'Synthetic room', extension: '2345' });
});
const values = {
  id: 'synthetic-reassigned-id',
  createdAt: new Date('2025-01-01T00:00:00Z'),
  updatedAt: new Date('2025-01-01T00:00:00Z'),
  deletedAt: new Date('2025-01-01T00:00:00Z'),
  searchText: 'synthetic forged search',
  usageCount: 999,
  starred: true,
};
describe('ordinary place and extension writer metadata boundaries', () => {
  it('retains supported fields and builds search from the actual defined correction', async () => {
    const placeInput: PlaceInput = {
      name: 'Synthetic complete place',
      kind: 'clinic',
      city: 'Synthetic city',
      address: 'Synthetic address',
      lat: '12.3456',
      lng: '45.6789',
      mapUrl: 'geo:12.3456,45.6789',
      phone: '5550120',
      switchboard: '5550121',
      website: 'https://example.invalid',
      notes: 'Synthetic old reference',
      tags: ['Synthetic tag'],
      starred: true,
    };
    const id = await createPlace(placeInput);
    expect(t.db.select().from(places).where(eq(places.id, id)).get()).toMatchObject(placeInput);
    const input: ExtensionInput = {
      placeId: id,
      department: 'Synthetic complete department',
      extension: '2346',
      directLine: '5550122',
      floor: '2',
      availableHours: '08-16',
      contactPerson: 'Synthetic contact',
      notes: 'Synthetic old reference',
    };
    const child = await createExtension(input);
    expect(t.db.select().from(extensions).where(eq(extensions.id, child)).get()).toMatchObject({
      ...input,
      usageCount: 0,
      starred: false,
    });
    await updatePlace(id, { name: 'Synthetic renamed place', city: undefined, notes: null });
    expect(t.db.select().from(places).where(eq(places.id, id)).get()).toMatchObject({
      ...placeInput,
      name: 'Synthetic renamed place',
      notes: null,
    });
    await updateExtension(child, { department: undefined, notes: null, directLine: '5550123' });
    const current = t.db.select().from(extensions).where(eq(extensions.id, child)).get()!;
    expect(current).toMatchObject({ ...input, notes: null, directLine: '5550123', usageCount: 0, starred: false });
    expect(current.searchText).toContain('synthetic renamed place');
    expect(current.searchText).toContain('synthetic complete department');
    expect(current.searchText).not.toContain('old reference');
    await updateExtension(child, { placeId: parentId });
    expect(t.db.select().from(extensions).where(eq(extensions.id, child)).get()).toMatchObject({
      placeId: parentId,
      department: input.department,
    });
  });
  it.each(['id', 'createdAt', 'updatedAt', 'deletedAt', 'searchText'] as const)(
    'refuses runtime place create metadata %s',
    async (key) => {
      const before = databaseRows(t);
      await expect(createPlace({ name: 'Synthetic new place', [key]: values[key] } as PlaceInput)).rejects.toThrow();
      expect(databaseRows(t)).toEqual(before);
    },
  );
  it.each(['id', 'createdAt', 'updatedAt', 'deletedAt', 'searchText'] as const)(
    'refuses runtime place correction metadata %s',
    async (key) => {
      const before = databaseRows(t);
      await expect(updatePlace(placeId, { [key]: values[key] } as Partial<PlaceInput>)).rejects.toThrow();
      expect(databaseRows(t)).toEqual(before);
    },
  );
  it.each(['id', 'createdAt', 'updatedAt', 'deletedAt', 'searchText', 'usageCount', 'starred'] as const)(
    'refuses runtime extension create metadata %s',
    async (key) => {
      const before = databaseRows(t);
      await expect(
        createExtension({
          placeId: parentId,
          department: 'Synthetic new room',
          extension: '2346',
          [key]: values[key],
        } as ExtensionInput),
      ).rejects.toThrow();
      expect(databaseRows(t)).toEqual(before);
    },
  );
  it.each(['id', 'createdAt', 'updatedAt', 'deletedAt', 'searchText', 'usageCount', 'starred'] as const)(
    'refuses runtime extension correction metadata %s',
    async (key) => {
      const before = databaseRows(t);
      await expect(updateExtension(extensionId, { [key]: values[key] } as Partial<ExtensionInput>)).rejects.toThrow();
      expect(databaseRows(t)).toEqual(before);
    },
  );
});
