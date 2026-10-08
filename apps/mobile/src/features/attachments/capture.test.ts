import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { ImagePickerAsset, ImagePickerOptions, ImagePickerResult } from 'expo-image-picker';

import { attachments } from '@/db/schema';
import { createPatient, deletePatient } from '@/features/patients/queries';
import { fileJobsActive, FileWorkBusyError, reserveFileMaintenance } from '@/lib/file-work';
import type { storePhoto } from '@/platform/media';
import { useTestDatabase } from '@/test/db-client';
import { createTestDatabase, type TestDatabase } from '@/test/sqljs';

import { attachPhotos, storeAndAttach, type AttachTarget } from './capture';
import * as attachmentQueries from './queries';

const mockPermission = jest.fn<() => Promise<{ granted: boolean }>>();
const mockPicker = jest.fn<(options: ImagePickerOptions) => Promise<ImagePickerResult>>();
const mockStore = jest.fn<typeof storePhoto>();
jest.mock('@/db/client', () => jest.requireActual('@/test/db-client'));
jest.mock('@/platform/notifications', () => jest.requireActual('@/test/mocks/notifications'));
jest.mock('@/components/feedback', () => ({ notify: jest.fn() }));
jest.mock('expo-image-picker', () => ({
  requestCameraPermissionsAsync: () => mockPermission(),
  launchCameraAsync: (options: ImagePickerOptions) => mockPicker(options),
  launchImageLibraryAsync: (options: ImagePickerOptions) => mockPicker(options),
}));
jest.mock('@/platform/media', () => ({ storePhoto: (...args: Parameters<typeof storePhoto>) => mockStore(...args) }));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
const asset = (): ImagePickerAsset => ({ uri: 'file:///synthetic-photo.jpg', width: 640, height: 480 });
const picked = (): ImagePickerResult => ({ canceled: false, assets: [asset()] });
const stored = (): Awaited<ReturnType<typeof storePhoto>> => ({
  relativePath: 'media/synthetic/photo.jpg',
  thumbnailPath: 'media/synthetic/thumb.jpg',
  originalPath: 'media/synthetic/original.jpg',
  mimeType: 'image/jpeg',
  sizeBytes: 100,
  width: 640,
  height: 480,
});
let t: TestDatabase;
let patientId: string;
const target = (): AttachTarget => ({ entityType: 'patient', entityId: patientId, patientId, kind: 'clinical_photo' });

beforeEach(async () => {
  expect(fileJobsActive()).toBe(false);
  t = useTestDatabase(await createTestDatabase());
  patientId = await createPatient({ firstName: 'Synthetic', lastName: 'Photo' });
  mockPermission.mockReset().mockResolvedValue({ granted: true });
  mockPicker.mockReset().mockResolvedValue(picked());
  mockStore.mockReset().mockResolvedValue(stored());
});

describe('whole photo job exclusion', () => {
  it('keeps the picker source intact even when an older caller requests crop', async () => {
    await attachPhotos({ ...target(), source: 'library', crop: true });
    expect(mockPicker.mock.calls[0]![0].allowsEditing).toBe(false);
    expect(mockStore.mock.calls[0]![0].uri).toBe(asset().uri);
  });

  it.each(['camera', 'library'] as const)('reserves before the %s picker and releases on cancel', async (source) => {
    const waiting = deferred<ImagePickerResult>();
    mockPicker.mockReturnValue(waiting.promise);
    const operation = attachPhotos({ ...target(), source });
    try {
      expect(() => reserveFileMaintenance()()).toThrow(FileWorkBusyError);
    } finally {
      waiting.resolve({ canceled: true, assets: null });
      await operation;
    }
    expect(mockStore).not.toHaveBeenCalled();
    expect(t.db.select().from(attachments).all()).toHaveLength(0);
    expect(fileJobsActive()).toBe(false);
    reserveFileMaintenance()();
  });

  it('reserves before camera permission settles, including denial', async () => {
    const waiting = deferred<{ granted: boolean }>();
    mockPermission.mockReturnValue(waiting.promise);
    const operation = attachPhotos({ ...target(), source: 'camera' });
    try {
      expect(() => reserveFileMaintenance()()).toThrow(FileWorkBusyError);
    } finally {
      waiting.resolve({ granted: false });
      await operation;
    }
    expect(mockPicker).not.toHaveBeenCalled();
    expect(fileJobsActive()).toBe(false);
  });

  it('protects direct storage until all metadata acknowledgements and keeps its captured target', async () => {
    const waiting = deferred<Awaited<ReturnType<typeof storePhoto>>>();
    mockStore.mockReturnValueOnce(waiting.promise);
    const chosen = [asset(), { ...asset(), uri: 'file:///synthetic-second.jpg' }];
    const captured = target();
    const operation = storeAndAttach(chosen, captured);
    try {
      expect(() => reserveFileMaintenance()()).toThrow(FileWorkBusyError);
      captured.entityId = await createPatient({ firstName: 'Synthetic', lastName: 'Other' });
      captured.patientId = captured.entityId;
      chosen[0]!.uri = 'file:///changed-after-start.jpg';
    } finally {
      waiting.resolve(stored());
      await Promise.allSettled([operation]);
    }
    const ids = await operation;
    expect(ids).toHaveLength(2);
    expect(
      t.db
        .select()
        .from(attachments)
        .all()
        .every((row) => row.patientId === patientId && row.entityId === patientId),
    ).toBe(true);
    expect(mockStore.mock.calls[0]![0].uri).toBe('file:///synthetic-photo.jpg');
    expect(mockStore.mock.calls[1]![0].uri).toBe('file:///synthetic-second.jpg');
    expect(fileJobsActive()).toBe(false);
    reserveFileMaintenance()();
  });

  it('retains exclusion after SQL commits until its metadata acknowledgement settles', async () => {
    const entered = deferred<void>();
    const waiting = deferred<void>();
    const actualAdd = attachmentQueries.addAttachment;
    const spy = jest.spyOn(attachmentQueries, 'addAttachment').mockImplementation(async (...args) => {
      const id = await actualAdd(...args);
      entered.resolve();
      await waiting.promise;
      return id;
    });
    const operation = storeAndAttach([asset()], target());
    try {
      await entered.promise;
      expect(t.db.select().from(attachments).all()).toHaveLength(1);
      expect(() => reserveFileMaintenance()()).toThrow(FileWorkBusyError);
    } finally {
      waiting.resolve();
      await Promise.allSettled([operation]);
      spy.mockRestore();
    }
    await expect(operation).resolves.toHaveLength(1);
    expect(fileJobsActive()).toBe(false);
    reserveFileMaintenance()();
  });

  it('refuses both public photo APIs before native work during maintenance', async () => {
    const release = reserveFileMaintenance();
    try {
      await expect(attachPhotos({ ...target(), source: 'library' })).rejects.toThrow(FileWorkBusyError);
      await expect(storeAndAttach([asset()], target())).rejects.toThrow(FileWorkBusyError);
      expect(mockPicker).not.toHaveBeenCalled();
      expect(mockPermission).not.toHaveBeenCalled();
      expect(mockStore).not.toHaveBeenCalled();
      expect(t.db.select().from(attachments).all()).toHaveLength(0);
    } finally {
      release();
    }
  });

  it('refuses a retired target before picker or storage', async () => {
    await deletePatient(patientId);
    await expect(attachPhotos({ ...target(), source: 'library' })).rejects.toThrow();
    await expect(storeAndAttach([asset()], target())).rejects.toThrow();
    expect(mockPicker).not.toHaveBeenCalled();
    expect(mockStore).not.toHaveBeenCalled();
    expect(fileJobsActive()).toBe(false);
  });

  it.each(['picker', 'storage', 'metadata'])(
    'releases after %s failure and does not claim attachment success',
    async (phase) => {
      if (phase === 'picker') mockPicker.mockRejectedValue(new Error('Synthetic picker rejection'));
      if (phase === 'storage') mockStore.mockRejectedValue(new Error('Synthetic copy rejection'));
      if (phase === 'metadata')
        t.sqlite.exec(
          "CREATE TRIGGER fail_photo BEFORE INSERT ON attachments BEGIN SELECT RAISE(ABORT, 'synthetic failure'); END;",
        );
      await expect(attachPhotos({ ...target(), source: 'library' })).rejects.toThrow();
      expect(t.db.select().from(attachments).all()).toHaveLength(0);
      expect(fileJobsActive()).toBe(false);
      reserveFileMaintenance()();
    },
  );
});
