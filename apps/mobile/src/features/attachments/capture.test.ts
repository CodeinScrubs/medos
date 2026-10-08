import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { ImagePickerAsset, ImagePickerOptions, ImagePickerResult } from 'expo-image-picker';

import { attachments, labPanels, photoImportBatches } from '@/db/schema';
import { openEncounter } from '@/features/encounters/queries';
import { createPatient, deletePatient } from '@/features/patients/queries';
import { datasetGeneration } from '@/lib/dataset-write';
import { fileJobsActive, FileWorkBusyError, reserveFileMaintenance } from '@/lib/file-work';
import { parsePhotoImportBody } from '@/lib/photo-import';
import { useTestDatabase } from '@/test/db-client';
import { photoFiles, photoNative, resetPhotoFiles } from '@/test/mocks/photo-files';
import { createTestDatabase, type TestDatabase } from '@/test/sqljs';

import { attachLabPhotoPanel, attachPhotos, storeAndAttach, type AttachTarget } from './capture';

const mockPermission = jest.fn<() => Promise<{ granted: boolean }>>();
const mockPicker = jest.fn<(options: ImagePickerOptions) => Promise<ImagePickerResult>>();
jest.mock('@/db/client', () => jest.requireActual('@/test/db-client'));
jest.mock('@/platform/notifications', () => jest.requireActual('@/test/mocks/notifications'));
jest.mock('@/components/feedback', () => ({ notify: jest.fn() }));
jest.mock('expo-file-system', () => jest.requireActual('@/test/mocks/photo-files'));
jest.mock('expo-image-manipulator', () => jest.requireActual('@/test/mocks/photo-files'));
jest.mock('expo-file-system/legacy', () => ({ copyAsync: jest.fn() }));
jest.mock('expo-image-picker', () => ({
  requestCameraPermissionsAsync: () => mockPermission(),
  launchCameraAsync: (options: ImagePickerOptions) => mockPicker(options),
  launchImageLibraryAsync: (options: ImagePickerOptions) => mockPicker(options),
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
const asset = (): ImagePickerAsset => ({
  uri: 'file:///cache/photo.heic',
  width: 640,
  height: 480,
  mimeType: 'image/heic',
});
const picked = (): ImagePickerResult => ({ canceled: false, assets: [asset()] });
let t: TestDatabase;
let patientId: string;
const target = (): AttachTarget => ({ entityType: 'patient', entityId: patientId, patientId, kind: 'clinical_photo' });

beforeEach(async () => {
  expect(fileJobsActive()).toBe(false);
  t = useTestDatabase(await createTestDatabase());
  patientId = await createPatient({ firstName: 'Synthetic', lastName: 'Photo' });
  resetPhotoFiles();
  photoFiles.set(asset().uri, new Uint8Array([1, 2, 3]));
  mockPermission.mockReset().mockResolvedValue({ granted: true });
  mockPicker.mockReset().mockResolvedValue(picked());
});

describe('whole photo picker and durable publication exclusion', () => {
  it('publishes original MIME/checksum from the untouched source, then permits maintenance', async () => {
    await storeAndAttach([asset()], target());
    expect(t.db.select().from(attachments).get()).toMatchObject({
      mimeType: 'image/jpeg',
      originalMimeType: 'image/heic',
      checksum: expect.stringMatching(/^[a-f0-9]{64}$/),
    });
    expect(fileJobsActive()).toBe(false);
    reserveFileMaintenance()();
  });
  it('ignores native crop requests and journals the actual original picker URI', async () => {
    await attachPhotos({ ...target(), source: 'library', crop: true });
    expect(mockPicker.mock.calls[0]![0].allowsEditing).toBe(false);
    const row = t.db.select().from(photoImportBatches).get()!;
    expect(parsePhotoImportBody(row.body, row.id).assets[0]!.sourceUri).toBe(asset().uri);
  });
  it.each(['camera', 'library'] as const)(
    'reserves before the %s picker and releases on cancellation',
    async (source) => {
      const waiting = deferred<ImagePickerResult>();
      mockPicker.mockReturnValue(waiting.promise);
      const operation = attachPhotos({ ...target(), source });
      try {
        expect(() => reserveFileMaintenance()).toThrow(FileWorkBusyError);
      } finally {
        waiting.resolve({ canceled: true, assets: null });
        await operation;
      }
      expect(t.db.select().from(photoImportBatches).all()).toEqual([]);
      expect(t.db.select().from(attachments).all()).toEqual([]);
      expect(fileJobsActive()).toBe(false);
    },
  );
  it('reserves before native camera permission including denial', async () => {
    const waiting = deferred<{ granted: boolean }>();
    mockPermission.mockReturnValue(waiting.promise);
    const operation = attachPhotos({ ...target(), source: 'camera' });
    try {
      expect(() => reserveFileMaintenance()).toThrow(FileWorkBusyError);
    } finally {
      waiting.resolve({ granted: false });
      await operation;
    }
    expect(mockPicker).not.toHaveBeenCalled();
    expect(fileJobsActive()).toBe(false);
  });
  it('retains captured patient/source values while a source copy awaits and releases only after whole publication', async () => {
    const entered = deferred<void>();
    const waiting = deferred<void>();
    const chosen = [asset(), { ...asset(), uri: 'file:///cache/second.jpg' }];
    photoFiles.set(chosen[1]!.uri, new Uint8Array([4, 5, 6]));
    photoNative.beforeCopy = async () => {
      photoNative.beforeCopy = null;
      entered.resolve();
      await waiting.promise;
    };
    const captured = target();
    const operation = storeAndAttach(chosen, captured);
    await entered.promise;
    try {
      expect(() => reserveFileMaintenance()).toThrow(FileWorkBusyError);
      expect(t.db.select().from(attachments).all()).toEqual([]);
      captured.entityId = await createPatient({ firstName: 'Synthetic', lastName: 'Other' });
      captured.patientId = captured.entityId;
      chosen[0]!.uri = 'file:///changed-after-start.jpg';
    } finally {
      waiting.resolve();
      await Promise.allSettled([operation]);
    }
    expect(await operation).toHaveLength(2);
    expect(
      t.db
        .select()
        .from(attachments)
        .all()
        .every((row) => row.patientId === patientId && row.entityId === patientId),
    ).toBe(true);
    const row = t.db.select().from(photoImportBatches).get()!;
    expect(parsePhotoImportBody(row.body, row.id).assets[0]!.sourceUri).toBe(asset().uri);
    expect(fileJobsActive()).toBe(false);
  });
  it('photo-panel picker cancellation creates neither a panel nor an import journal', async () => {
    mockPicker.mockResolvedValue({ canceled: true, assets: null });
    expect(await attachLabPhotoPanel('library', patientId, datasetGeneration())).toEqual([]);
    expect(t.db.select().from(labPanels).all()).toEqual([]);
    expect(t.db.select().from(photoImportBatches).all()).toEqual([]);
  });
  it('keeps the encounter captured before the picker, including originally no encounter', async () => {
    const waiting = deferred<ImagePickerResult>();
    mockPicker.mockReturnValue(waiting.promise);
    const operation = attachLabPhotoPanel('library', patientId, datasetGeneration());
    await openEncounter({ patientId, kind: 'admission' });
    waiting.resolve(picked());
    await operation;
    expect(t.db.select().from(labPanels).get()?.encounterId).toBeNull();
  });
  it('refuses picker/storage/photo-panel work before any native action during maintenance', async () => {
    const release = reserveFileMaintenance();
    try {
      await expect(attachPhotos({ ...target(), source: 'library' })).rejects.toThrow(FileWorkBusyError);
      await expect(storeAndAttach([asset()], target())).rejects.toThrow(FileWorkBusyError);
      await expect(attachLabPhotoPanel('library', patientId, datasetGeneration())).rejects.toThrow(FileWorkBusyError);
      expect(mockPicker).not.toHaveBeenCalled();
      expect(mockPermission).not.toHaveBeenCalled();
    } finally {
      release();
    }
  });
  it('refuses a deleted target before picker or journal reservation', async () => {
    await deletePatient(patientId);
    await expect(attachPhotos({ ...target(), source: 'library' })).rejects.toThrow();
    await expect(storeAndAttach([asset()], target())).rejects.toThrow();
    expect(mockPicker).not.toHaveBeenCalled();
    expect(t.db.select().from(photoImportBatches).all()).toEqual([]);
  });
  it.each(['picker', 'storage', 'metadata'])('releases after %s failure without clinical success', async (phase) => {
    if (phase === 'picker') mockPicker.mockRejectedValue(new Error('Synthetic picker failure'));
    if (phase === 'storage') photoNative.copyError = true;
    if (phase === 'metadata')
      t.sqlite.exec(
        "CREATE TRIGGER fail_photo BEFORE INSERT ON attachments BEGIN SELECT RAISE(ABORT, 'Synthetic failure'); END;",
      );
    await expect(attachPhotos({ ...target(), source: 'library' })).rejects.toThrow();
    expect(t.db.select().from(attachments).all()).toEqual([]);
    expect(fileJobsActive()).toBe(false);
    reserveFileMaintenance()();
  });
});
