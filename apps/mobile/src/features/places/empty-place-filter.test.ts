import { expect, it, jest } from '@jest/globals';
import { eq } from 'drizzle-orm';

import { places } from '@/db/schema';
import { createExtension, createPlace, extensionsQuery } from '@/features/places/queries';
import { useTestDatabase } from '@/test/db-client';
import { createTestDatabase } from '@/test/sqljs';

jest.mock('@/db/client', () => jest.requireActual('@/test/db-client'));
it('treats an explicit imported empty place filter as a real owner key', async () => {
  const t = useTestDatabase(await createTestDatabase());
  const place = await createPlace({ name: 'Synthetic original center' });
  await createExtension({ placeId: place, department: 'Synthetic original room', extension: '2345' });
  const row = t.db.select().from(places).where(eq(places.id, place)).get()!;
  t.db
    .insert(places)
    .values({ ...row, id: '', name: 'Synthetic imported empty center' })
    .run();
  const child = await createExtension({ placeId: '', department: 'Synthetic imported empty room', extension: '2346' });
  expect(
    extensionsQuery({ placeId: '' })
      .all()
      .map((row) => row.extension.id),
  ).toEqual([child]);
  expect(extensionsQuery({ placeId: 'synthetic-missing-owner' }).all()).toEqual([]);
  expect(extensionsQuery().all()).toHaveLength(2);
});
