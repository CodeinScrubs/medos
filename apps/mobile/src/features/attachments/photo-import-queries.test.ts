import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { eq } from 'drizzle-orm';

import { attachments, labPanels, noteDrafts, photoImportBatches } from '@/db/schema';
import { importTables } from '@/features/backup/import';
import {
  captureQuery,
  createCapture,
  discardCaptureIfEmpty,
  fileCaptureAsNote,
  fileCaptureAsTask,
  updateCapture,
} from '@/features/capture/queries';
import { openEncounter } from '@/features/encounters/queries';
import { createPatient, deletePatient } from '@/features/patients/queries';
import {
  datasetGeneration,
  reserveDatasetReplacement,
  DatasetBusyError,
  DatasetChangedError,
} from '@/lib/dataset-write';
import { fileJobsActive, FileWorkBusyError, reserveFileMaintenance } from '@/lib/file-work';
import { newId, stamps } from '@/lib/ids';
import { parsePhotoImportBody } from '@/lib/photo-import';
import { useTestDatabase } from '@/test/db-client';
import { photoFiles, photoNative, resetPhotoFiles } from '@/test/mocks/photo-files';
import { createTestDatabase, type TestDatabase } from '@/test/sqljs';

import { inspectMediaInventory } from './media-inventory-queries';
import { beginPhotoImport, discardPhotoImport, persistPhotoImport, resumePhotoImport } from './photo-import-queries';
import { deleteAttachment } from './queries';

jest.mock('@/db/client', () => jest.requireActual('@/test/db-client'));
jest.mock('@/platform/notifications', () => jest.requireActual('@/test/mocks/notifications'));
jest.mock('expo-file-system', () => jest.requireActual('@/test/mocks/photo-files'));
jest.mock('expo-image-manipulator', () => jest.requireActual('@/test/mocks/photo-files'));
jest.mock('expo-file-system/legacy', () => ({ copyAsync: jest.fn() }));

const now = new Date('2026-01-02T12:00:00Z');
const assets = () => [
  { uri: 'file:///cache/source-one.heic', width: 640, height: 480, mimeType: 'image/heic' },
  { uri: 'file:///cache/source-two.png', width: 640, height: 480, mimeType: 'image/png' },
];
let t: TestDatabase;
let patientId: string;
const target = () => ({
  entityType: 'patient' as const,
  entityId: patientId,
  patientId,
  kind: 'clinical_photo' as const,
});
const job = () => t.db.select().from(photoImportBatches).get()!;
const body = () => parsePhotoImportBody(job().body, job().id);
const persist = (lab = false) =>
  persistPhotoImport(
    assets(),
    { ...target(), kind: lab ? 'lab_sheet' : 'clinical_photo' },
    true,
    now,
    datasetGeneration(),
    lab,
  );
const resume = () => resumePhotoImport(job().id, now, datasetGeneration());

beforeEach(async () => {
  expect(fileJobsActive()).toBe(false);
  t = useTestDatabase(await createTestDatabase());
  patientId = await createPatient({ firstName: 'Synthetic', lastName: 'Photos' });
  resetPhotoFiles();
  assets().forEach((source, index) => photoFiles.set(source.uri, new Uint8Array([1, 2, index + 3])));
});

async function failAcknowledgment(lab = false) {
  t.sqlite.exec(
    "CREATE TRIGGER fail_photo_ack BEFORE UPDATE ON photo_import_batches WHEN NEW.state='saved' BEGIN SELECT RAISE(ABORT, 'Synthetic acknowledgment'); END;",
  );
  await expect(persist(lab)).rejects.toThrow();
  expect(job().state).toBe('ready');
  expect(t.db.select().from(attachments).all()).toEqual([]);
  t.sqlite.exec('DROP TRIGGER fail_photo_ack');
}

describe('durable whole photo batch', () => {
  it('refuses copying into a path owned by a legacy draft voice without loading its note body', async () => {
    const row = beginPhotoImport(assets(), target(), true, now);
    const path = parsePhotoImportBody(row.body, row.id).assets[0]!.source.path!;
    t.db
      .insert(noteDrafts)
      .values({
        id: newId(),
        ...stamps(now),
        patientId,
        body: 'Synthetic long note '.repeat(20000),
        voices: [{ relativePath: path, durationMs: 1000, sizeBytes: 3 }],
      })
      .run();
    await expect(resumePhotoImport(row.id, now, datasetGeneration())).rejects.toThrow();
    expect(photoFiles.has(`file:///documents/${path}`)).toBe(false);
    expect(t.db.select().from(attachments).all()).toHaveLength(0);
  });
  it('journals before every copy, preserves all sources before render, and publishes exact metadata together', async () => {
    photoNative.beforeCopy = (_source, destination) => {
      expect(body().paths.some((path) => destination.endsWith(path))).toBe(true);
      expect(job().state).toBe('copying');
    };
    photoNative.beforeRender = () => {
      expect(body().assets.every((item) => photoFiles.has(`file:///documents/${item.source.path}`))).toBe(true);
      expect(t.db.select().from(attachments).all()).toEqual([]);
    };
    const ids = await persist();
    expect(ids).toHaveLength(2);
    expect(t.db.select().from(attachments).all()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ originalMimeType: 'image/heic', capturedAt: now }),
        expect.objectContaining({ originalMimeType: 'image/png', capturedAt: now }),
      ]),
    );
    expect(body().assets.map((item) => item.attachmentId)).toEqual(ids);
    expect(assets().every((source) => photoFiles.has(source.uri))).toBe(true);
  });
  it('rolls back both attachments and panel when the saved journal acknowledgment fails; retries without provider', async () => {
    const encounterId = await openEncounter({ patientId, kind: 'admission' });
    await failAcknowledgment(true);
    expect(t.db.select().from(labPanels).all()).toEqual([]);
    const reservedPanel = job().entityId;
    assets().forEach((source) => photoFiles.delete(source.uri));
    const ids = await resume();
    expect(await resume()).toEqual(ids);
    expect(t.db.select().from(labPanels).all()).toEqual([
      expect.objectContaining({ id: reservedPanel, encounterId, collectedAt: now }),
    ]);
    expect(t.db.select().from(attachments).all()).toHaveLength(2);
  });
  it('rolls back the first image when inserting the second selected image fails', async () => {
    t.sqlite.exec(
      "CREATE TRIGGER fail_second_photo BEFORE INSERT ON attachments WHEN (SELECT count(*) FROM attachments)=1 BEGIN SELECT RAISE(ABORT, 'Synthetic second image'); END;",
    );
    await expect(persist()).rejects.toThrow();
    expect(t.db.select().from(attachments).all()).toEqual([]);
    expect(job().state).toBe('ready');
    t.sqlite.exec('DROP TRIGGER fail_second_photo');
    expect(await resume()).toHaveLength(2);
  });
  it('recovers source copies after derivative failure with the original picker grants gone', async () => {
    photoNative.renderError = true;
    await expect(persist()).rejects.toThrow();
    const sources = body().assets.map((item) => item.source.path);
    expect(sources.every((path) => photoFiles.has(`file:///documents/${path}`))).toBe(true);
    assets().forEach((source) => photoFiles.delete(source.uri));
    photoNative.renderError = false;
    expect(await resume()).toHaveLength(2);
    expect(body().assets.map((item) => item.source.path)).toEqual(sources);
  });
  it('retains an interrupted partial source and reserves a fresh path without overwriting it', async () => {
    photoNative.truncateCopy = true;
    await expect(persist()).rejects.toThrow();
    const old = body().assets[0]!.source.path!;
    const partial = photoFiles.get(`file:///documents/${old}`)!.slice();
    photoNative.truncateCopy = false;
    await resume();
    expect(photoFiles.get(`file:///documents/${old}`)).toEqual(partial);
    expect(body().paths).toContain(old);
    expect(body().assets[0]!.source.path).not.toBe(old);
  });
  it('refuses changed original source after a partial copy instead of accepting a different photo', async () => {
    photoNative.truncateCopy = true;
    await expect(persist()).rejects.toThrow();
    photoNative.truncateCopy = false;
    photoFiles.set(assets()[0]!.uri, new Uint8Array([9, 9, 9]));
    const paths = body().paths;
    await expect(resume()).rejects.toThrow('تغییر');
    expect(body().paths).toEqual(paths);
    expect(t.db.select().from(attachments).all()).toEqual([]);
  });
  it.each(['source', 'full', 'thumb'] as const)(
    'refuses same-size changed ready %s bytes without overwriting any copy',
    async (role) => {
      await failAcknowledgment();
      const path = body().assets[0]![role].path!;
      const changed = new Uint8Array(photoFiles.get(`file:///documents/${path}`)!.length).fill(99);
      photoFiles.set(`file:///documents/${path}`, changed);
      const savedBody = job().body;
      await expect(resume()).rejects.toThrow('تغییر');
      expect(job().body).toBe(savedBody);
      expect(photoFiles.get(`file:///documents/${path}`)).toEqual(changed);
      expect(t.db.select().from(attachments).all()).toEqual([]);
    },
  );
  it('serializes same-operation retries into one pair of attachments', async () => {
    await failAcknowledgment();
    const [first, second] = await Promise.all([resume(), resume()]);
    expect(first).toEqual(second);
    expect(t.db.select().from(attachments).all()).toHaveLength(2);
  });
  it('does not resurrect deleted attachments on saved replay', async () => {
    const ids = await persist();
    await deleteAttachment(ids[0]!);
    await expect(resume()).rejects.toThrow('تغییر');
    expect(t.db.select().from(attachments).all()).toHaveLength(2);
  });
  it('rechecks patient liveness after native copy settles; keeps copied files without clinical rows', async () => {
    photoNative.beforeCopy = async () => {
      photoNative.beforeCopy = null;
      await deletePatient(patientId);
    };
    await expect(persist(true)).rejects.toThrow();
    expect(t.db.select().from(labPanels).all()).toEqual([]);
    expect(t.db.select().from(attachments).all()).toEqual([]);
    expect([...photoFiles.keys()].some((uri) => uri.startsWith('file:///documents/'))).toBe(true);
  });
  it('refuses a replaced dataset token and holds maintenance/replacement exclusion across native work', async () => {
    const generation = datasetGeneration();
    photoNative.beforeCopy = () => {
      expect(() => reserveFileMaintenance()).toThrow(FileWorkBusyError);
      expect(() => reserveDatasetReplacement()).toThrow(DatasetBusyError);
      expect(() => inspectMediaInventory()).toThrow(FileWorkBusyError);
    };
    await persist();
    const replacement = reserveDatasetReplacement();
    replacement.committed();
    replacement.release();
    await expect(resumePhotoImport(job().id, now, generation)).rejects.toThrow(DatasetChangedError);
  });
  it('explicit discard retires the pending job while retaining originals and every partial copy', async () => {
    photoNative.truncateCopy = true;
    await expect(persist()).rejects.toThrow();
    const before = new Map([...photoFiles].map(([path, bytes]) => [path, bytes.slice()]));
    await discardPhotoImport(job().id, now, datasetGeneration());
    expect(job()).toMatchObject({ state: 'discarded', deletedAt: now });
    expect(photoFiles).toEqual(before);
    await expect(resume()).rejects.toThrow();
  });
  it('keeps copied source as a protected journal reference when the keep-original preference is off', async () => {
    await persistPhotoImport(assets(), target(), false, now, datasetGeneration());
    expect(
      t.db
        .select()
        .from(attachments)
        .all()
        .every((row) => row.originalPath === null),
    ).toBe(true);
    const inventory = inspectMediaInventory();
    expect(inventory.unreferencedCount).toBe(0);
    expect(
      inventory.files
        .filter((file) => file.path.includes('-source-'))
        .every((file) => file.references.includes('photo_import')),
    ).toBe(true);
  });
  it('strictly rejects malformed journals before any native writes', async () => {
    const row = beginPhotoImport(assets(), target(), true, now);
    t.db
      .update(photoImportBatches)
      .set({ body: row.body.replace('media/imports/', '../') })
      .where(eq(photoImportBatches.id, row.id))
      .run();
    const before = new Map(photoFiles);
    await expect(resume()).rejects.toThrow('کامل خوانده نشد');
    expect(() => inspectMediaInventory()).toThrow('کامل خوانده نشد');
    expect(photoFiles).toEqual(before);
  });
  it.each(['copying', 'ready'] as const)(
    'keeps a %s photo capture owner fixed and prevents filing/discard until recovery or explicit retirement',
    async (state) => {
      const captureId = await createCapture({ patientId });
      const other = await createPatient({ firstName: 'Synthetic', lastName: 'Other' });
      const row = beginPhotoImport(assets(), { entityType: 'capture', entityId: captureId, kind: 'photo' }, true, now);
      t.db.update(photoImportBatches).set({ state }).where(eq(photoImportBatches.id, row.id)).run();
      await expect(updateCapture(captureId, { patientId: other })).rejects.toThrow();
      await expect(fileCaptureAsTask(captureId, { title: 'Synthetic task' })).rejects.toThrow();
      await expect(fileCaptureAsNote(captureId, { patientId })).rejects.toThrow();
      expect(await discardCaptureIfEmpty(captureId)).toBe(false);
      await updateCapture(captureId, { text: 'Synthetic retained newer words' });
      expect(captureQuery(captureId).get()?.patientId).toBe(patientId);
      await discardPhotoImport(row.id, now, datasetGeneration());
      await updateCapture(captureId, { patientId: other });
      expect(captureQuery(captureId).get()?.patientId).toBe(other);
    },
  );
  it('current database restoration preserves the complete ready journal and recovers from copied bytes', async () => {
    await failAcknowledgment(true);
    const expected = job();
    const path = `/photo-current-${expected.id}.db`;
    t.conn.execSync(`VACUUM INTO '${path}'`);
    const restored = await createTestDatabase();
    restored.conn.execSync('PRAGMA foreign_keys = OFF');
    restored.conn.execSync(`ATTACH DATABASE '${path}' AS restore_src`);
    importTables(restored.conn);
    restored.conn.execSync('DETACH DATABASE restore_src');
    restored.conn.execSync('PRAGMA foreign_keys = ON');
    t = useTestDatabase(restored);
    expect(job()).toEqual(expected);
    assets().forEach((source) => photoFiles.delete(source.uri));
    expect(await resume()).toHaveLength(2);
    expect(t.conn.getAllSync('PRAGMA foreign_key_check')).toEqual([]);
  });
  it('an older backup clears absent journals while preserving unrelated original media for accounting', async () => {
    await failAcknowledgment();
    const older = await createTestDatabase();
    older.conn.execSync('DROP TABLE photo_import_batches');
    const path = `/photo-older-${job().id}.db`;
    older.conn.execSync(`VACUUM INTO '${path}'`);
    const before = new Map(photoFiles);
    t.conn.execSync('PRAGMA foreign_keys = OFF');
    t.conn.execSync(`ATTACH DATABASE '${path}' AS restore_src`);
    importTables(t.conn);
    t.conn.execSync('DETACH DATABASE restore_src');
    t.conn.execSync('PRAGMA foreign_keys = ON');
    expect(t.db.select().from(photoImportBatches).all()).toEqual([]);
    expect(photoFiles).toEqual(before);
    expect(inspectMediaInventory().unreferencedCount).toBe(6);
  });
});
