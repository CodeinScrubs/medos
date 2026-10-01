import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import { attachments } from '@/db/schema';
import { createPatient, deletePatient } from '@/features/patients/queries';
import { reserveFileMaintenance } from '@/lib/file-work';
import { useTestDatabase } from '@/test/db-client';
import { createTestDatabase, type TestDatabase } from '@/test/sqljs';

import { deleteAttachment } from './queries';
import { stageRecording } from './recordings';
import { saveRecording } from './voice-notes';

// Preserve the copy/move contract: a move consumes the only retry source.
const mockFiles = new Set<string>();
let mockSize: number | null;
let mockAfterCopy: (() => Promise<void>) | undefined;
const mockCopies =
  jest.fn<
    (
      uri: string,
      extension: string,
      options?: { move?: boolean },
    ) => Promise<{ relativePath: string; sizeBytes: number | null }>
  >();
jest.mock('@/db/client', () => jest.requireActual('@/test/db-client'));
jest.mock('@/platform/notifications', () => jest.requireActual('@/test/mocks/notifications'));
jest.mock('@/components/voice-recorder', () => ({ VoiceRecorder: 'VoiceRecorder' }));
jest.mock('@/components/voice-note-player', () => ({ VoiceNotePlayer: 'VoiceNotePlayer' }));
jest.mock('@/components/ui', () => ({ Column: 'Column' }));
jest.mock('@/components/error-notice', () => ({ ErrorNotice: 'ErrorNotice' }));
jest.mock('@/platform/media', () => ({
  extensionOf: () => 'm4a',
  mediaUri: (path: string) => path,
  storeFile: (...args: [string, string, { move?: boolean }?]) => mockCopies(...args),
}));

let t: TestDatabase;
let patientId: string;
const recording = () => ({
  uri: 'file:///synthetic-cache.m4a',
  durationMs: 1200,
  capturedAt: new Date('2026-01-01T10:00:00Z'),
});
const target = () => ({ entityType: 'patient' as const, entityId: patientId, patientId });

beforeEach(async () => {
  t = useTestDatabase(await createTestDatabase());
  patientId = await createPatient({ firstName: 'Synthetic', lastName: 'Voice' });
  mockFiles.clear();
  mockFiles.add(recording().uri);
  mockSize = 3;
  mockAfterCopy = undefined;
  mockCopies.mockReset();
  mockCopies.mockImplementation(async (uri, _ext, options = {}) => {
    if (!mockFiles.has(uri)) throw new Error('Synthetic source unavailable');
    const relativePath = `media/synthetic-${mockCopies.mock.calls.length}.m4a`;
    mockFiles.add(relativePath);
    if (options.move) mockFiles.delete(uri);
    await mockAfterCopy?.();
    return { relativePath, sizeBytes: mockSize };
  });
});

describe('stopped recording acknowledgement', () => {
  it('keeps the source and reuses its staged copy after a real SQLite insert failure', async () => {
    const rec = recording();
    t.sqlite.exec(
      "CREATE TRIGGER fail_voice BEFORE INSERT ON attachments BEGIN SELECT RAISE(ABORT, 'synthetic failure'); END;",
    );
    await expect(saveRecording(rec, target())).rejects.toThrow();
    expect(mockFiles.has(rec.uri)).toBe(true);
    expect(t.db.select().from(attachments).all()).toEqual([]);
    t.sqlite.exec('DROP TRIGGER fail_voice');
    const id = await saveRecording(rec, target());
    expect(await saveRecording(rec, target())).toBe(id);
    expect(mockCopies).toHaveBeenCalledTimes(1);
    expect(mockCopies.mock.calls[0]?.[2]?.move).not.toBe(true);
    expect(t.db.select().from(attachments).all()).toHaveLength(1);
    expect(t.db.select().from(attachments).get()?.capturedAt).toEqual(rec.capturedAt);
  });

  it('shares one copy and one attachment across simultaneous handoffs', async () => {
    const rec = recording();
    const ids = await Promise.all([
      saveRecording(rec, target()),
      saveRecording(rec, target()),
      saveRecording(rec, target()),
    ]);
    expect(new Set(ids).size).toBe(1);
    expect(mockCopies).toHaveBeenCalledTimes(1);
    expect(t.db.select().from(attachments).all()).toHaveLength(1);
  });

  it('does not silently revive a recording deleted after acknowledgement', async () => {
    const rec = recording();
    await deleteAttachment(await saveRecording(rec, target()));
    await expect(saveRecording(rec, target())).rejects.toThrow();
    expect(t.db.select().from(attachments).all()).toHaveLength(1);
    expect(t.db.select().from(attachments).get()?.deletedAt).not.toBeNull();
  });

  it('checks patient liveness before copying and again after the asynchronous copy', async () => {
    await deletePatient(patientId);
    await expect(saveRecording(recording(), target())).rejects.toThrow();
    expect(mockCopies).not.toHaveBeenCalled();
    patientId = await createPatient({ firstName: 'Synthetic', lastName: 'Second' });
    mockAfterCopy = () => deletePatient(patientId);
    await expect(saveRecording(recording(), target())).rejects.toThrow();
    expect(mockFiles.has(recording().uri)).toBe(true);
    expect(t.db.select().from(attachments).all()).toEqual([]);
  });

  it.each([null, 0, -1, 1.5, NaN])(
    'refuses an unknown/invalid copied size (%s) without consuming the source',
    async (size) => {
      mockSize = size;
      const rec = recording();
      await expect(saveRecording(rec, target())).rejects.toThrow();
      expect(mockFiles.has(rec.uri)).toBe(true);
      expect(t.db.select().from(attachments).all()).toEqual([]);
      mockSize = 3;
      await saveRecording(rec, target());
      expect(mockCopies).toHaveBeenCalledTimes(2);
    },
  );

  it('retries a failed native copy rather than caching its rejected promise', async () => {
    mockCopies.mockRejectedValueOnce(new Error('Synthetic full disk'));
    const rec = recording();
    await expect(saveRecording(rec, target())).rejects.toThrow();
    await saveRecording(rec, target());
    expect(mockCopies).toHaveBeenCalledTimes(2);
    expect(mockFiles.has(rec.uri)).toBe(true);
  });

  it('rejects mutation of the retained recording identity instead of reusing the wrong bytes', async () => {
    const rec = recording();
    await stageRecording(rec, new Date());
    rec.uri = 'file:///different.m4a';
    await expect(stageRecording(rec, new Date())).rejects.toThrow();
    expect(mockCopies).toHaveBeenCalledTimes(1);
  });

  it('holds the maintenance exclusion through copy and metadata acknowledgement', async () => {
    const release = reserveFileMaintenance();
    await expect(saveRecording(recording(), target())).rejects.toThrow();
    expect(mockCopies).not.toHaveBeenCalled();
    release();
    let copied!: () => void;
    let reached!: () => void;
    const started = new Promise<void>((resolve) => {
      reached = resolve;
    });
    mockAfterCopy = () =>
      new Promise<void>((resolve) => {
        copied = resolve;
        reached();
      });
    const saving = saveRecording(recording(), target());
    await started;
    expect(() => reserveFileMaintenance()).toThrow();
    copied();
    await saving;
    reserveFileMaintenance()();
  });
});
