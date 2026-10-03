import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { eq } from 'drizzle-orm';

import { attachments, auditLog, captureInbox, noteDrafts, recordingJobs } from '@/db/schema';
import { createCapture, updateCapture } from '@/features/capture/queries';
import { createPatient, deletePatient } from '@/features/patients/queries';
import { reserveFileMaintenance } from '@/lib/file-work';
import { stamps } from '@/lib/ids';
import type { FileFingerprint } from '@/platform/import-file';
import { useTestDatabase } from '@/test/db-client';
import { createTestDatabase, type TestDatabase } from '@/test/sqljs';

import { addAttachment, deleteAttachment } from './queries';
import {
  beginRecordingJob,
  discardRecording,
  pendingRecordingsQuery,
  persistRecording,
  recordingJobQuery,
  resumeRecording,
} from './recording-queries';

const mockFiles = new Map<string, FileFingerprint>();
const mockCopy = jest.fn(async (uri: string, path: string, size: number | null) => {
  const source = mockFiles.get(uri);
  if (!source) throw new Error('Synthetic missing source');
  expect(source.sizeBytes).toBe(size);
  mockFiles.set(path, { ...source });
  await mockAfterCopy?.();
  return { ...source };
});
let mockAfterCopy: (() => Promise<void>) | undefined;
const mockFingerprint = jest.fn(async (path: string) => {
  const file = mockFiles.get(path);
  if (!file) throw new Error('Synthetic missing bytes');
  return { ...file };
});
const mockDelete = jest.fn((path: string) => {
  mockFiles.delete(path);
});
jest.mock('@/db/client', () => jest.requireActual('@/test/db-client'));
jest.mock('@/platform/notifications', () => jest.requireActual('@/test/mocks/notifications'));
jest.mock('@/platform/import-file', () => ({
  fingerprintRecordingSource: (uri: string) => mockFingerprint(uri),
  fingerprintImportFile: (path: string) => mockFingerprint(path),
  copyImportFile: (uri: string, path: string, size: number | null) => mockCopy(uri, path, size),
}));
jest.mock('@/platform/media', () => ({
  mediaFile: (path: string) => ({
    get exists() {
      return mockFiles.has(path);
    },
    delete: () => mockDelete(path),
  }),
}));

const now = new Date('2026-01-02T12:00:00Z');
const recording = () => ({
  operationId: '73c14d3d-d3b3-4fde-807a-97fc1b8fb020',
  uri: 'file:///synthetic-cache.m4a',
  durationMs: 1400,
  capturedAt: new Date('2026-01-02T11:59:00Z'),
});
const fingerprint = { checksum: 'a'.repeat(64), sizeBytes: 1234 };
let t: TestDatabase;
let patientId: string;
const target = () => ({ entityType: 'patient' as const, entityId: patientId, patientId });

beforeEach(async () => {
  t = useTestDatabase(await createTestDatabase());
  patientId = await createPatient({ firstName: 'Synthetic', lastName: 'Recovery' });
  mockFiles.clear();
  mockFiles.set(recording().uri, { ...fingerprint });
  mockCopy.mockClear();
  mockFingerprint.mockClear();
  mockDelete.mockReset().mockImplementation((path: string) => {
    mockFiles.delete(path);
  });
  mockAfterCopy = undefined;
});

async function failPublication() {
  t.sqlite.exec(
    "CREATE TRIGGER fail_voice BEFORE INSERT ON attachments BEGIN SELECT RAISE(ABORT, 'Synthetic failure'); END;",
  );
  await expect(persistRecording(recording(), target(), now)).rejects.toThrow();
  const row = recordingJobQuery(recording().operationId).get()!;
  expect(row.state).toBe('ready');
  expect(t.db.select().from(attachments).all()).toEqual([]);
  t.sqlite.exec('DROP TRIGGER fail_voice');
  return row;
}

describe('durable stopped voice jobs', () => {
  it('rechecks a null capture owner after reading the source and before copying', async () => {
    const captureId = await createCapture({ kind: 'voice', shiftId: null });
    mockFingerprint.mockImplementationOnce(async () => {
      await updateCapture(captureId, { patientId });
      return { ...fingerprint };
    });
    await expect(persistRecording(recording(), { entityType: 'capture', entityId: captureId }, now)).rejects.toThrow();
    expect(mockCopy).not.toHaveBeenCalled();
    expect(recordingJobQuery(recording().operationId).get()).toMatchObject({ patientId: null, checksum: null });
    expect(t.db.select().from(attachments).all()).toEqual([]);
  });

  it('refuses publication of a ready capture job whose null owner has changed', async () => {
    const captureId = await createCapture({ kind: 'voice', shiftId: null });
    t.sqlite.exec(
      "CREATE TRIGGER fail_voice BEFORE INSERT ON attachments BEGIN SELECT RAISE(ABORT, 'Synthetic failure'); END;",
    );
    await expect(persistRecording(recording(), { entityType: 'capture', entityId: captureId }, now)).rejects.toThrow();
    t.sqlite.exec('DROP TRIGGER fail_voice');
    await updateCapture(captureId, { patientId });
    await expect(resumeRecording(recording().operationId, now)).rejects.toThrow();
    expect(recordingJobQuery(recording().operationId).get()).toMatchObject({ state: 'ready', patientId: null });
    expect(t.db.select().from(attachments).all()).toEqual([]);
    expect(mockCopy).toHaveBeenCalledTimes(1);
  });

  it('refuses a null capture owner reassigned during copy and retains the original journal', async () => {
    const captureId = await createCapture({ kind: 'voice', shiftId: null });
    mockAfterCopy = () => updateCapture(captureId, { patientId });
    await expect(persistRecording(recording(), { entityType: 'capture', entityId: captureId }, now)).rejects.toThrow();
    expect(recordingJobQuery(recording().operationId).get()).toMatchObject({ state: 'copying', patientId: null });
    expect(t.db.select().from(attachments).all()).toEqual([]);
    await expect(resumeRecording(recording().operationId, now)).rejects.toThrow();
    t.db.update(captureInbox).set({ patientId: null }).where(eq(captureInbox.id, captureId)).run();
    mockAfterCopy = undefined;
    const id = await resumeRecording(recording().operationId, now);
    expect(t.db.select().from(attachments).get()).toMatchObject({ id, patientId: null });
    expect(await resumeRecording(recording().operationId, now)).toBe(id);
    expect(mockCopy).toHaveBeenCalledTimes(1);
  });

  it('does not copy when the source fingerprint cannot be committed', async () => {
    t.sqlite.exec(
      "CREATE TRIGGER fail_digest BEFORE UPDATE ON recording_jobs WHEN OLD.checksum IS NULL AND NEW.checksum IS NOT NULL BEGIN SELECT RAISE(ABORT, 'Synthetic digest'); END;",
    );
    await expect(persistRecording(recording(), target(), now)).rejects.toThrow();
    expect(recordingJobQuery(recording().operationId).get()).toMatchObject({
      state: 'copying',
      checksum: null,
      sizeBytes: null,
    });
    expect(mockCopy).not.toHaveBeenCalled();
    t.sqlite.exec('DROP TRIGGER fail_digest');
    await resumeRecording(recording().operationId, now);
    expect(mockCopy).toHaveBeenCalledTimes(1);
  });

  it('serializes simultaneous cancellations into one cleanup and audit', async () => {
    const row = await failPublication();
    await Promise.all([discardRecording(row.id, now), discardRecording(row.id, now), discardRecording(row.id, now)]);
    expect(mockDelete).toHaveBeenCalledTimes(1);
    expect(mockFiles.has(row.relativePath)).toBe(false);
    expect(
      t.db
        .select()
        .from(auditLog)
        .all()
        .filter((a) => a.action === 'recording.discarded'),
    ).toHaveLength(1);
  });

  it('rejects changing the identity of a retained recording object', () => {
    const capture = recording();
    beginRecordingJob(capture, target(), now);
    capture.operationId = '17816853-5816-46bb-96b2-3e2d05ec73b3';
    expect(() => beginRecordingJob(capture, target(), now)).toThrow();
    expect(t.db.select().from(recordingJobs).all()).toHaveLength(1);
  });

  it('reserves the exact destination before any native read/copy and fingerprints before copying', async () => {
    mockAfterCopy = async () => {
      const job = recordingJobQuery(recording().operationId).get()!;
      expect(job).toMatchObject({ state: 'copying', ...fingerprint, patientId });
      expect(job.capturedAt).toEqual(recording().capturedAt);
    };
    const id = await persistRecording(recording(), target(), now);
    expect(recordingJobQuery(recording().operationId).get()).toMatchObject({
      state: 'saved',
      attachmentId: id,
      ...fingerprint,
    });
    expect(t.db.select().from(attachments).get()).toMatchObject({
      id,
      patientId,
      checksum: fingerprint.checksum,
      durationMs: 1400,
    });
  });

  it('recovers ready bytes without the cache or a live JS object and keeps one attachment', async () => {
    const row = await failPublication();
    mockFiles.delete(recording().uri);
    const id = await resumeRecording(row.id, now);
    expect(await resumeRecording(row.id, now)).toBe(id);
    expect(mockCopy).toHaveBeenCalledTimes(1);
    expect(t.db.select().from(attachments).all()).toHaveLength(1);
    expect(pendingRecordingsQuery().all()).toEqual([]);
  });

  it('recovers the verified destination after an interrupted copy acknowledgement without its source', async () => {
    mockAfterCopy = async () => {
      throw new Error('Synthetic interruption after bytes');
    };
    await expect(persistRecording(recording(), target(), now)).rejects.toThrow();
    const row = recordingJobQuery(recording().operationId).get()!;
    expect(row).toMatchObject({ state: 'copying', ...fingerprint });
    mockFiles.delete(recording().uri);
    mockAfterCopy = undefined;
    await resumeRecording(row.id, now);
    expect(mockCopy).toHaveBeenCalledTimes(1);
    expect(t.db.select().from(attachments).all()).toHaveLength(1);
  });

  it('rolls back attachment and checksum if operation acknowledgement fails', async () => {
    t.sqlite.exec(
      "CREATE TRIGGER fail_ack BEFORE UPDATE ON recording_jobs WHEN NEW.state='saved' BEGIN SELECT RAISE(ABORT, 'Synthetic ack'); END;",
    );
    await expect(persistRecording(recording(), target(), now)).rejects.toThrow();
    expect(t.db.select().from(attachments).all()).toEqual([]);
    expect(recordingJobQuery(recording().operationId).get()).toMatchObject({ state: 'ready', attachmentId: null });
    t.sqlite.exec('DROP TRIGGER fail_ack');
    await resumeRecording(recording().operationId, now);
    expect(t.db.select().from(attachments).all()).toHaveLength(1);
  });

  it('serializes simultaneous retries after failure under one stable UUID', async () => {
    const row = await failPublication();
    const ids = await Promise.all([
      resumeRecording(row.id, now),
      resumeRecording(row.id, now),
      resumeRecording(row.id, now),
    ]);
    expect(new Set(ids).size).toBe(1);
    expect(t.db.select().from(attachments).all()).toHaveLength(1);
    expect(mockCopy).toHaveBeenCalledTimes(1);
  });

  it('refuses a changed ready file even when its length is unchanged', async () => {
    const row = await failPublication();
    mockFiles.set(row.relativePath, { ...fingerprint, checksum: 'b'.repeat(64) });
    await expect(resumeRecording(row.id, now)).rejects.toThrow('محتوای فایل');
    expect(t.db.select().from(attachments).all()).toEqual([]);
    expect(mockCopy).toHaveBeenCalledTimes(1);
  });

  it('does not overwrite partial bytes with a changed cache file', async () => {
    mockAfterCopy = async () => {
      throw new Error('Synthetic interruption');
    };
    await expect(persistRecording(recording(), target(), now)).rejects.toThrow();
    const row = recordingJobQuery(recording().operationId).get()!;
    mockFiles.set(row.relativePath, { checksum: 'c'.repeat(64), sizeBytes: 1 });
    mockFiles.set(row.sourceUri, { ...fingerprint, checksum: 'b'.repeat(64) });
    mockAfterCopy = undefined;
    await expect(resumeRecording(row.id, now)).rejects.toThrow('فایل اولیه');
    expect(mockFiles.get(row.relativePath)?.sizeBytes).toBe(1);
    expect(mockCopy).toHaveBeenCalledTimes(1);
  });

  it('replaces only its own interrupted partial copy when the retained source still matches', async () => {
    mockAfterCopy = async () => {
      throw new Error('Synthetic interruption');
    };
    await expect(persistRecording(recording(), target(), now)).rejects.toThrow();
    const row = recordingJobQuery(recording().operationId).get()!;
    mockFiles.set(row.relativePath, { checksum: 'c'.repeat(64), sizeBytes: 1 });
    mockAfterCopy = undefined;
    await resumeRecording(row.id, now);
    expect(mockCopy).toHaveBeenCalledTimes(2);
    expect(mockFiles.get(row.sourceUri)).toEqual(fingerprint);
  });

  it('checks patient liveness again after copying and permits explicit cancellation after deletion', async () => {
    mockAfterCopy = () => deletePatient(patientId);
    await expect(persistRecording(recording(), target(), now)).rejects.toThrow();
    const row = recordingJobQuery(recording().operationId).get()!;
    await discardRecording(row.id, now);
    expect(t.db.select().from(attachments).all()).toEqual([]);
    expect(mockFiles.has(row.sourceUri)).toBe(true);
    expect(mockFiles.has(row.relativePath)).toBe(false);
  });

  it('refuses recovery onto a patient deleted after staging without touching the copy', async () => {
    const row = await failPublication();
    await deletePatient(patientId);
    await expect(resumeRecording(row.id, now)).rejects.toThrow();
    expect(mockFiles.has(row.relativePath)).toBe(true);
    expect(t.db.select().from(attachments).all()).toEqual([]);
  });

  it('never resurrects a deleted acknowledged attachment', async () => {
    const id = await persistRecording(recording(), target(), now);
    await deleteAttachment(id);
    await expect(resumeRecording(recording().operationId, now)).rejects.toThrow();
    await expect(discardRecording(recording().operationId, now)).rejects.toThrow();
    expect(t.db.select().from(attachments).get()?.deletedAt).not.toBeNull();
    expect(mockDelete).not.toHaveBeenCalled();
  });

  it('retains a cancelled cleanup for retry and never removes source bytes', async () => {
    const row = await failPublication();
    mockDelete.mockImplementationOnce(() => {
      throw new Error('Synthetic permission failure');
    });
    await expect(discardRecording(row.id, now)).rejects.toThrow('کپی ناتمام');
    expect(pendingRecordingsQuery().all()[0]?.job).toMatchObject({ state: 'discarding', attachmentId: null });
    await expect(resumeRecording(row.id, now)).rejects.toThrow();
    await discardRecording(row.id, now);
    expect(recordingJobQuery(row.id).get()).toMatchObject({ state: 'discarded', attachmentId: null });
    expect(pendingRecordingsQuery().all()).toEqual([]);
    expect(mockFiles.has(row.relativePath)).toBe(false);
    expect(mockFiles.has(row.sourceUri)).toBe(true);
    expect(
      t.db
        .select()
        .from(auditLog)
        .all()
        .some((a) => a.action === 'recording.discarded'),
    ).toBe(true);
  });

  it('cancels an in-flight copy without acknowledging or deleting any clinical record', async () => {
    let release!: () => void;
    let entered!: () => void;
    const reached = new Promise<void>((resolve) => {
      entered = resolve;
    });
    mockAfterCopy = () =>
      new Promise<void>((resolve) => {
        release = resolve;
        entered();
      });
    const saving = persistRecording(recording(), target(), now);
    const rejected = saving.catch((error) => error);
    await reached;
    const cancellation = discardRecording(recording().operationId, now);
    release();
    await cancellation;
    expect(await rejected).toBeInstanceOf(Error);
    expect(t.db.select().from(attachments).all()).toEqual([]);
    expect(recordingJobQuery(recording().operationId).get()?.state).toBe('discarded');
    expect(mockFiles.has(recording().uri)).toBe(true);
  });

  it.each(['attachment', 'deleted attachment', 'draft', 'deleted draft'])(
    'never removes bytes protected by a %s reference',
    async (kind) => {
      const row = await failPublication();
      if (kind.includes('attachment')) {
        const id = await addAttachment({ ...target(), kind: 'voice', relativePath: row.relativePath });
        if (kind.startsWith('deleted')) await deleteAttachment(id);
      } else {
        t.db
          .insert(noteDrafts)
          .values({
            id: 'synthetic-draft',
            ...stamps(now),
            patientId,
            type: 'general',
            deletedAt: kind.startsWith('deleted') ? now : null,
            voices: [
              {
                relativePath: row.relativePath,
                durationMs: 1400,
                sizeBytes: 1234,
                capturedAt: row.capturedAt.toISOString(),
              },
            ],
          })
          .run();
      }
      await expect(discardRecording(row.id, now)).rejects.toThrow();
      expect(mockDelete).not.toHaveBeenCalled();
    },
  );

  it('refuses path traversal even on a retired cleanup job', async () => {
    const row = await failPublication();
    t.db
      .update(recordingJobs)
      .set({ relativePath: 'media/imports/../clinical.m4a' })
      .where(eq(recordingJobs.id, row.id))
      .run();
    await expect(discardRecording(row.id, now)).rejects.toThrow();
    expect(mockDelete).not.toHaveBeenCalled();
  });

  it('holds file maintenance exclusion throughout copy, digest and publication', async () => {
    const release = reserveFileMaintenance();
    await expect(persistRecording(recording(), target(), now)).rejects.toThrow();
    expect(t.db.select().from(recordingJobs).all()).toEqual([]);
    release();
    mockAfterCopy = async () => {
      expect(() => reserveFileMaintenance()).toThrow();
    };
    await persistRecording(recording(), target(), now);
    reserveFileMaintenance()();
  });

  it('filters recovery by immutable destination and hides the active recorder owner', () => {
    const row = beginRecordingJob(recording(), target(), now);
    expect(pendingRecordingsQuery(target()).all()).toHaveLength(1);
    expect(pendingRecordingsQuery(target(), row.id).all()).toEqual([]);
    expect(pendingRecordingsQuery({ entityType: 'note', entityId: patientId }).all()).toEqual([]);
  });

  it('rejects changed capture metadata under the same operation', async () => {
    beginRecordingJob(recording(), target(), now);
    await expect(persistRecording({ ...recording(), durationMs: 1500 }, target(), now)).rejects.toThrow();
    await expect(persistRecording({ ...recording(), capturedAt: new Date(now) }, target(), now)).rejects.toThrow();
    expect(mockCopy).not.toHaveBeenCalled();
  });
});
