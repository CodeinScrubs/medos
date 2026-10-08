import { beforeEach, expect, it, jest } from '@jest/globals';

import { attachments, noteDrafts } from '@/db/schema';
import { createPatient } from '@/features/patients/queries';
import { newId, stamps } from '@/lib/ids';
import { useTestDatabase } from '@/test/db-client';
import { photoFiles, resetPhotoFiles } from '@/test/mocks/photo-files';
import { createTestDatabase, type TestDatabase } from '@/test/sqljs';

import { inspectMediaInventory } from './media-inventory-queries';
import { addAttachment, deleteAttachment } from './queries';

jest.mock('@/db/client', () => jest.requireActual('@/test/db-client'));
jest.mock('@/platform/notifications', () => jest.requireActual('@/test/mocks/notifications'));
jest.mock('expo-file-system', () => jest.requireActual('@/test/mocks/photo-files'));
jest.mock('expo-image-manipulator', () => jest.requireActual('@/test/mocks/photo-files'));
jest.mock('expo-file-system/legacy', () => ({ copyAsync: jest.fn() }));
let t: TestDatabase;
let patientId: string;
beforeEach(async () => {
  t = useTestDatabase(await createTestDatabase());
  patientId = await createPatient({ firstName: 'Synthetic', lastName: 'Inventory' });
  resetPhotoFiles();
});

it('accounts for original/thumbnail/trash/draft references and missing or unrelated bytes without changing them', async () => {
  const id = await addAttachment({
    entityType: 'patient',
    entityId: patientId,
    patientId,
    kind: 'photo',
    relativePath: 'media/old/full.jpg',
    originalPath: 'media/old/original.png',
    thumbnailPath: 'media/old/thumb.jpg',
  });
  await deleteAttachment(id);
  await t.db.insert(noteDrafts).values({
    id: newId(),
    ...stamps(),
    patientId,
    voices: [{ relativePath: 'media/old/draft.m4a', durationMs: 1000, sizeBytes: 3 }],
  });
  photoFiles.set('file:///documents/media/old/full.jpg', new Uint8Array([1, 2]));
  photoFiles.set('file:///documents/media/old/original.png', new Uint8Array([3, 4, 5]));
  photoFiles.set('file:///documents/media/old/draft.m4a', new Uint8Array([6, 7, 8]));
  photoFiles.set('file:///documents/media/old/unreferenced.jpg', new Uint8Array([9, 10, 11, 12]));
  const bytes = new Map(photoFiles);
  const rows = t.db.select().from(attachments).all();
  const inventory = inspectMediaInventory();
  expect(inventory).toMatchObject({
    protectedCount: 3,
    unreferencedCount: 1,
    unreferencedBytes: 4,
    unknownSizeCount: 0,
  });
  expect(inventory.missing).toEqual([{ path: 'media/old/thumb.jpg', references: ['attachment_trash'] }]);
  expect(inventory.files.find((file) => file.path.endsWith('original.png'))?.references).toEqual(['attachment_trash']);
  expect(inventory.files.find((file) => file.path.endsWith('draft.m4a'))?.references).toEqual(['note_draft']);
  expect(photoFiles).toEqual(bytes);
  expect(t.db.select().from(attachments).all()).toEqual(rows);
});
