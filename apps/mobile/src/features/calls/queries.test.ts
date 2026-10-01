import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { eq } from 'drizzle-orm';

import { attachments, callImports, notes, noteVersions } from '@/db/schema';
import { readSetting } from '@/db/settings';
import { openEncounter } from '@/features/encounters/queries';
import { createPatient, deletePatient } from '@/features/patients/queries';
import { FileWorkBusyError, reserveFileMaintenance } from '@/lib/file-work';
import { useTestDatabase } from '@/test/db-client';
import { createTestDatabase, type TestDatabase } from '@/test/sqljs';

import { recordingKey } from './logic';
import {
  beginCallImport,
  callImportQuery,
  commitCallImport,
  discardCallImport,
  fileCallRecording,
  markCallImportReady,
  pendingCallImportsQuery,
  resumeCallImport,
  type CallRecording,
} from './queries';
import { callsFiled } from './settings';

const mockCopy = jest.fn(async (_uri: string, _path: string, _size: number | null) => ({
  checksum: 'a'.repeat(64),
  sizeBytes: 2048,
}));
const mockFingerprint = jest.fn(async (_path: string) => ({ checksum: 'a'.repeat(64), sizeBytes: 2048 }));
const mockDelete = jest.fn();
jest.mock('@/db/client', () => jest.requireActual('@/test/db-client'));
jest.mock('@/platform/notifications', () => jest.requireActual('@/test/mocks/notifications'));
jest.mock('@/platform/media', () => ({
  extensionOf: jest.requireActual<typeof import('@/platform/media')>('@/platform/media').extensionOf,
  mediaFile: () => ({ exists: true, delete: mockDelete }),
}));
jest.mock('@/platform/import-file', () => ({
  copyImportFile: (uri: string, path: string, size: number | null) => mockCopy(uri, path, size),
  fingerprintImportFile: (path: string) => mockFingerprint(path),
}));

let t: TestDatabase;
let patientId: string;
const recording: CallRecording = {
  uri: 'content://example/Call%20recording%20Test_260926_143012.m4a',
  name: 'Call recording Test_260926_143012.m4a',
  sizeBytes: 2048,
  recordedAt: new Date(2026, 8, 26, 14, 30, 12),
  timeSource: 'filename',
  who: 'Test',
  key: recordingKey('Call recording Test_260926_143012.m4a'),
};

beforeEach(async () => {
  t = useTestDatabase(await createTestDatabase());
  mockCopy.mockReset().mockImplementation(async () => ({ checksum: 'a'.repeat(64), sizeBytes: 2048 }));
  mockFingerprint.mockReset().mockImplementation(async () => ({ checksum: 'a'.repeat(64), sizeBytes: 2048 }));
  mockDelete.mockReset();
  patientId = await createPatient({ firstName: 'Test', lastName: 'Patient', status: 'outpatient' });
});

describe('filing a call recording', () => {
  it('retries one durable import identity without creating another note', async () => {
    const now = new Date('2026-10-01T10:00:00Z');
    const importId = 'b7bd233e-16f3-48a5-a0b5-45327df23686';
    const first = await fileCallRecording(patientId, recording, now, importId);
    const second = await fileCallRecording(patientId, recording, now, importId);
    expect(second).toBe(first);
    expect(t.db.select().from(notes).all()).toHaveLength(1);
    expect(t.db.select().from(attachments).all()).toHaveLength(1);
    expect(mockCopy).toHaveBeenCalledTimes(1);
  });

  it('serializes simultaneous retries of one durable import identity', async () => {
    const now = new Date('2026-10-01T10:00:00Z');
    const importId = 'b7bd233e-16f3-48a5-a0b5-45327df23686';
    const ids = await Promise.all([
      fileCallRecording(patientId, recording, now, importId),
      fileCallRecording(patientId, recording, now, importId),
    ]);
    expect(new Set(ids).size).toBe(1);
    expect(t.db.select().from(notes).all()).toHaveLength(1);
    expect(mockCopy).toHaveBeenCalledTimes(1);
  });

  it('copies the audio, then writes a dated phone note with it attached, and remembers it was filed', async () => {
    const noteId = await fileCallRecording(patientId, recording);

    expect(mockCopy).toHaveBeenCalledWith(
      recording.uri,
      expect.stringMatching(/^media\/imports\/[0-9a-f-]+\.m4a$/),
      2048,
    );
    const [note] = await t.db.select().from(notes);
    expect(note).toMatchObject({
      id: noteId,
      patientId,
      type: 'phone_followup',
      title: 'تماس — Test',
      noteDate: recording.recordedAt,
    });
    const [audio] = await t.db.select().from(attachments);
    expect(audio).toMatchObject({
      entityType: 'note',
      entityId: noteId,
      patientId,
      kind: 'voice',
      relativePath: expect.stringMatching(/^media\/imports\/[0-9a-f-]+\.m4a$/),
      mimeType: 'audio/mp4',
      capturedAt: recording.recordedAt,
    });
    expect(await readSetting(callsFiled)).toEqual([recording.key]);

    // Filing the same call again is allowed; it is remembered once.
    await fileCallRecording(patientId, recording);
    expect(await readSetting(callsFiled)).toEqual([recording.key]);
    expect(t.db.select().from(notes).all()).toHaveLength(2);
    expect(t.db.select().from(callImports).all()).toHaveLength(2);
  });

  it('retains its verified copy and remembers no filed marker when the note cannot be written', async () => {
    t.sqlite.exec(
      "CREATE TRIGGER fail_note BEFORE INSERT ON notes BEGIN SELECT RAISE(ABORT, 'synthetic failure'); END;",
    );

    await expect(fileCallRecording(patientId, recording)).rejects.toThrow('synthetic failure');

    expect(mockDelete).not.toHaveBeenCalled();
    expect(t.db.select().from(callImports).get()).toMatchObject({ state: 'ready', noteId: null });
    expect(await t.db.select().from(attachments)).toEqual([]);
    expect(await readSetting(callsFiled)).toEqual([]);
  });

  it('rolls back the note, history and audio when remembering the import fails; retry creates one note', async () => {
    t.sqlite.exec(
      "CREATE TRIGGER fail_filed BEFORE INSERT ON settings WHEN NEW.key = 'calls.filed' BEGIN SELECT RAISE(ABORT, 'synthetic marker failure'); END;",
    );
    const source = { ...recording, importId: 'b7bd233e-16f3-48a5-a0b5-45327df23686' };
    await expect(fileCallRecording(patientId, source)).rejects.toThrow('synthetic marker failure');
    expect(t.db.select().from(notes).all()).toEqual([]);
    expect(t.db.select().from(noteVersions).all()).toEqual([]);
    expect(t.db.select().from(attachments).all()).toEqual([]);
    expect(mockDelete).not.toHaveBeenCalled();
    t.sqlite.exec('DROP TRIGGER fail_filed');
    await fileCallRecording(patientId, source);
    expect(t.db.select().from(notes).all()).toHaveLength(1);
    expect(t.db.select().from(callImports).all()).toHaveLength(1);
    expect(mockCopy).toHaveBeenCalledTimes(1);
    expect(await readSetting(callsFiled)).toEqual([recording.key]);
  });

  it('keeps both filed markers when independent recordings finish copying together', async () => {
    const other = { ...recording, name: 'Other.m4a', key: 'Other.m4a' };
    await Promise.all([fileCallRecording(patientId, recording), fileCallRecording(patientId, other)]);
    expect(await readSetting(callsFiled)).toEqual([recording.key, other.key]);
  });

  it('refuses a patient deleted while the audio was being copied', async () => {
    mockCopy.mockImplementationOnce(async () => {
      await deletePatient(patientId);
      return { checksum: 'a'.repeat(64), sizeBytes: 2048 };
    });
    await expect(fileCallRecording(patientId, recording)).rejects.toThrow();
    expect(t.db.select().from(notes).all()).toEqual([]);
    expect(t.db.select().from(attachments).all()).toEqual([]);
    expect(mockDelete).not.toHaveBeenCalled();
  });

  it('does not silently link a historical call to the current admission', async () => {
    await openEncounter({ patientId, kind: 'admission' });
    await fileCallRecording(patientId, recording);
    expect(t.db.select().from(notes).get()!.encounterId).toBeNull();
  });

  it.each(['unknown', 'file'] as const)(
    'preserves %s time provenance instead of claiming a confirmed call time',
    async (timeSource) => {
      const now = new Date('2026-09-27T12:00:00Z');
      await fileCallRecording(
        patientId,
        { ...recording, recordedAt: timeSource === 'unknown' ? null : recording.recordedAt, timeSource },
        now,
      );
      const note = t.db.select().from(notes).get()!;
      expect(note.noteDate).toEqual(timeSource === 'unknown' ? now : recording.recordedAt);
      expect(note.body).toContain(timeSource === 'unknown' ? 'زمان ورود فایل' : 'زمان تماس تأیید نشده');
      expect(t.db.select().from(attachments).get()!.caption).toContain(
        timeSource === 'unknown' ? 'زمان ورود فایل' : 'زمان فایل',
      );
      expect(t.db.select().from(noteVersions).get()!.body).toBe(note.body);
    },
  );
});

describe('durable import recovery and cancellation', () => {
  const id = 'b7bd233e-16f3-48a5-a0b5-45327df23686';
  const now = new Date('2026-10-01T10:00:00Z');
  const fingerprint = { checksum: 'a'.repeat(64), sizeBytes: 2048 };
  const reserve = () => beginCallImport(patientId, recording, now, id);
  const ready = () => markCallImportReady(reserve(), fingerprint, now);

  it('refuses import, publication and cancellation during maintenance without changing the saved request', async () => {
    const copying = reserve();
    const row = markCallImportReady(copying, fingerprint, now);
    const release = reserveFileMaintenance();
    try {
      await expect(fileCallRecording(patientId, recording, now, id)).rejects.toThrow(FileWorkBusyError);
      await expect(resumeCallImport(id)).rejects.toThrow(FileWorkBusyError);
      await expect(discardCallImport(id)).rejects.toThrow(FileWorkBusyError);
      expect(() => beginCallImport(patientId, recording, now, '937a4e78-5d08-4b8d-80b3-03fd09121718')).toThrow(
        FileWorkBusyError,
      );
      expect(() => markCallImportReady(copying, fingerprint, now)).toThrow(FileWorkBusyError);
      expect(() => commitCallImport(row, fingerprint, now)).toThrow(FileWorkBusyError);
      expect(callImportQuery(id).get()).toEqual(row);
      expect(mockCopy).not.toHaveBeenCalled();
      expect(mockFingerprint).not.toHaveBeenCalled();
      expect(mockDelete).not.toHaveBeenCalled();
    } finally {
      release();
    }
    await resumeCallImport(id);
    expect(t.db.select().from(notes).all()).toHaveLength(1);
  });

  it('keeps maintenance out through copy and releases it on copy failure for a later retry', async () => {
    let fail!: (error: Error) => void;
    mockCopy.mockImplementationOnce(
      () =>
        new Promise((_resolve, reject) => {
          fail = reject;
        }),
    );
    const pending = fileCallRecording(patientId, recording, now, id);
    const rejected = expect(pending).rejects.toThrow('synthetic provider failure');
    try {
      expect(() => reserveFileMaintenance()).toThrow(FileWorkBusyError);
    } finally {
      fail(new Error('synthetic provider failure'));
    }
    await rejected;
    reserveFileMaintenance()();
    await resumeCallImport(id);
    expect(t.db.select().from(notes).all()).toHaveLength(1);
  });

  it('keeps maintenance out through ready-file verification and releases after a failed clinical commit', async () => {
    ready();
    let finish!: (value: typeof fingerprint) => void;
    mockFingerprint.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    t.sqlite.exec(
      "CREATE TRIGGER fail_job_commit BEFORE INSERT ON notes BEGIN SELECT RAISE(ABORT, 'synthetic clinical failure'); END;",
    );
    const pending = resumeCallImport(id);
    const rejected = expect(pending).rejects.toThrow('synthetic clinical failure');
    try {
      expect(() => reserveFileMaintenance()).toThrow(FileWorkBusyError);
      expect(t.db.select().from(notes).all()).toEqual([]);
    } finally {
      finish(fingerprint);
    }
    await rejected;
    reserveFileMaintenance()();
    t.sqlite.exec('DROP TRIGGER fail_job_commit');
    await resumeCallImport(id);
    expect(t.db.select().from(notes).all()).toHaveLength(1);
  });

  it('reserves the destination before a failed copy and retries the same path', async () => {
    mockCopy.mockImplementationOnce(async () => {
      expect(callImportQuery(id).get()).toMatchObject({ state: 'copying', relativePath: `media/imports/${id}.m4a` });
      throw new Error('Synthetic copy failure');
    });
    await expect(fileCallRecording(patientId, recording, now, id)).rejects.toThrow('Synthetic copy failure');
    expect(t.db.select().from(notes).all()).toEqual([]);
    expect(pendingCallImportsQuery().all()).toHaveLength(1);
    await resumeCallImport(id);
    expect(mockCopy.mock.calls.map((args) => args[1])).toEqual([`media/imports/${id}.m4a`, `media/imports/${id}.m4a`]);
    expect(pendingCallImportsQuery().all()).toHaveLength(0);
  });

  it('does not start copying when reserving the journal fails', async () => {
    t.sqlite.exec(
      "CREATE TRIGGER fail_journal BEFORE INSERT ON call_imports BEGIN SELECT RAISE(ABORT, 'journal failed'); END;",
    );
    await expect(fileCallRecording(patientId, recording, now, id)).rejects.toThrow('journal failed');
    expect(mockCopy).not.toHaveBeenCalled();
    expect(t.db.select().from(callImports).all()).toEqual([]);
  });

  it.each([
    ['history', 'BEFORE INSERT ON note_versions'],
    ['attachment', 'BEFORE INSERT ON attachments'],
    ['retry link', "BEFORE UPDATE ON call_imports WHEN NEW.state = 'filed'"],
  ])('keeps the verified copy and rolls back every clinical row on %s failure', async (_label, trigger) => {
    t.sqlite.exec(`CREATE TRIGGER fail_commit ${trigger} BEGIN SELECT RAISE(ABORT, 'commit failed'); END;`);
    await expect(fileCallRecording(patientId, recording, now, id)).rejects.toThrow('commit failed');
    expect(callImportQuery(id).get()).toMatchObject({
      state: 'ready',
      checksum: fingerprint.checksum,
      noteId: null,
      attachmentId: null,
    });
    expect(t.db.select().from(notes).all()).toEqual([]);
    expect(t.db.select().from(noteVersions).all()).toEqual([]);
    expect(t.db.select().from(attachments).all()).toEqual([]);
    expect(await readSetting(callsFiled)).toEqual([]);
    expect(mockDelete).not.toHaveBeenCalled();
    t.sqlite.exec('DROP TRIGGER fail_commit');
    mockCopy.mockRejectedValue(new Error('Provider no longer available'));
    const note = await resumeCallImport(id);
    expect(await resumeCallImport(id)).toBe(note);
    expect(mockCopy).toHaveBeenCalledTimes(1);
  });

  it('resumes a persisted ready row without a live promise or source grant, keeping its original unknown time', async () => {
    const source = { ...recording, recordedAt: null, timeSource: 'unknown' as const };
    markCallImportReady(beginCallImport(patientId, source, now, id), fingerprint, now);
    const noteId = await resumeCallImport(id, new Date('2026-10-02T12:00:00Z'));
    expect(mockCopy).not.toHaveBeenCalled();
    expect(mockFingerprint).toHaveBeenCalledWith(`media/imports/${id}.m4a`);
    expect(t.db.select().from(notes).get()).toMatchObject({ id: noteId, noteDate: now });
    expect(await resumeCallImport(id)).toBe(noteId);
  });

  it.each([
    { checksum: 'b'.repeat(64), sizeBytes: 2048 },
    { checksum: 'a'.repeat(64), sizeBytes: 2047 },
  ])('refuses modified bytes on a ready retry (%j)', async (changed) => {
    ready();
    mockFingerprint.mockResolvedValueOnce(changed);
    await expect(resumeCallImport(id)).rejects.toThrow('وضعیت ورود');
    expect(t.db.select().from(notes).all()).toEqual([]);
    expect(callImportQuery(id).get()!.state).toBe('ready');
    expect(mockDelete).not.toHaveBeenCalled();
  });

  it('rejects reuse with another patient/source/known size and rejects a stale ready snapshot', async () => {
    const snapshot = reserve();
    const other = await createPatient({ firstName: 'Other', lastName: 'Patient' });
    for (const [patient, source] of [
      [other, recording],
      [patientId, { ...recording, uri: 'content://example/other' }],
      [patientId, { ...recording, sizeBytes: 1 }],
    ] as const) {
      await expect(fileCallRecording(patient, source, now, id)).rejects.toThrow('وضعیت ورود');
    }
    markCallImportReady(snapshot, fingerprint, now);
    expect(() => markCallImportReady(snapshot, fingerprint, now)).toThrow('وضعیت ورود');
    expect(() => commitCallImport(snapshot, fingerprint, now)).toThrow('وضعیت ورود');
    expect(mockCopy).not.toHaveBeenCalled();
  });

  it('does not resurrect a filed note after it is soft-deleted', async () => {
    const noteId = await fileCallRecording(patientId, recording, now, id);
    t.db.update(notes).set({ deletedAt: now }).where(eq(notes.id, noteId)).run();
    await expect(resumeCallImport(id)).rejects.toThrow('دوباره ثبت نشد');
    expect(t.db.select().from(notes).all()).toHaveLength(1);
    expect(mockCopy).toHaveBeenCalledTimes(1);
    await expect(discardCallImport(id)).rejects.toThrow('وضعیت ورود');
    expect(mockDelete).not.toHaveBeenCalled();
  });

  it('protects the bytes of a soft-deleted attachment from overwrite and cancellation', async () => {
    const row = reserve();
    t.db
      .insert(attachments)
      .values({
        id: 'protected',
        patientId,
        entityType: 'patient',
        entityId: patientId,
        kind: 'voice',
        relativePath: row.relativePath,
        createdAt: now,
        updatedAt: now,
        deletedAt: now,
      })
      .run();
    await expect(resumeCallImport(id)).rejects.toThrow('وضعیت ورود');
    await expect(discardCallImport(id)).rejects.toThrow('وضعیت ورود');
    expect(mockCopy).not.toHaveBeenCalled();
    expect(mockDelete).not.toHaveBeenCalled();
  });

  it('cancels an in-flight copy before publication, then deletes only its owned incomplete file', async () => {
    let finish!: (file: typeof fingerprint) => void;
    mockCopy.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const filing = fileCallRecording(patientId, recording, now, id);
    const rejected = expect(filing).rejects.toThrow('وضعیت ورود');
    const cancelling = discardCallImport(id, now);
    expect(callImportQuery(id).get()).toMatchObject({ state: 'discarding', deletedAt: now });
    expect(mockDelete).not.toHaveBeenCalled();
    expect(() => reserveFileMaintenance()).toThrow(FileWorkBusyError);
    finish(fingerprint);
    await rejected;
    await cancelling;
    reserveFileMaintenance()();
    expect(callImportQuery(id).get()!.state).toBe('discarded');
    expect(mockDelete).toHaveBeenCalledTimes(1);
    expect(t.db.select().from(notes).all()).toEqual([]);
    expect(pendingCallImportsQuery().all()).toEqual([]);
    await expect(resumeCallImport(id)).rejects.toThrow('وضعیت ورود');
  });

  it('surfaces interrupted cleanup and retries it without reviving the cancelled import', async () => {
    ready();
    mockDelete.mockImplementationOnce(() => {
      throw new Error('Private native path');
    });
    await expect(discardCallImport(id, now)).rejects.toThrow('پاک‌کردن کپی ناتمام');
    expect(pendingCallImportsQuery().all()[0]!.import).toMatchObject({ state: 'discarding', deletedAt: now });
    await discardCallImport(id, now);
    expect(pendingCallImportsQuery().all()).toEqual([]);
    expect(callImportQuery(id).get()!.state).toBe('discarded');
    await discardCallImport(id, now);
    expect(mockDelete).toHaveBeenCalledTimes(2);
  });

  it('retries cleanup when deletion finishes but its completion write fails', async () => {
    ready();
    t.sqlite.exec(
      "CREATE TRIGGER fail_cleanup BEFORE UPDATE ON call_imports WHEN NEW.state = 'discarded' BEGIN SELECT RAISE(ABORT, 'cleanup write failed'); END;",
    );
    await expect(discardCallImport(id, now)).rejects.toThrow('cleanup write failed');
    expect(pendingCallImportsQuery().all()[0]!.import.state).toBe('discarding');
    expect(mockDelete).toHaveBeenCalledTimes(1);
    t.sqlite.exec('DROP TRIGGER fail_cleanup');
    await discardCallImport(id, now);
    expect(pendingCallImportsQuery().all()).toEqual([]);
    expect(t.db.select().from(notes).all()).toEqual([]);
  });

  it('does not hide an unfinished import when its patient was deleted', async () => {
    ready();
    await deletePatient(patientId);
    expect(pendingCallImportsQuery().all()[0]!.firstName).toBeNull();
    await expect(resumeCallImport(id)).rejects.toThrow('بیمار در دسترس نیست');
    expect(t.db.select().from(notes).all()).toEqual([]);
    await discardCallImport(id);
    expect(mockDelete).toHaveBeenCalledTimes(1);
  });
});
