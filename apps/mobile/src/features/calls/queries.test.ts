import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import { attachments, notes, noteVersions } from '@/db/schema';
import { readSetting } from '@/db/settings';
import { openEncounter } from '@/features/encounters/queries';
import { createPatient, deletePatient } from '@/features/patients/queries';
import { useTestDatabase } from '@/test/db-client';
import { createTestDatabase, type TestDatabase } from '@/test/sqljs';

import { recordingKey } from './logic';
import { fileCallRecording, type CallRecording } from './queries';
import { callsFiled } from './settings';

const mockStoreFile = jest.fn(async (_uri: string, ext: string) => ({
  relativePath: `media/2026/09/call.${ext}`,
  sizeBytes: 2048,
}));
const mockDelete = jest.fn();
jest.mock('@/db/client', () => jest.requireActual('@/test/db-client'));
jest.mock('@/platform/notifications', () => jest.requireActual('@/test/mocks/notifications'));
jest.mock('@/platform/media', () => ({
  storeFile: (uri: string, ext: string) => mockStoreFile(uri, ext),
  extensionOf: jest.requireActual<typeof import('@/platform/media')>('@/platform/media').extensionOf,
  mediaFile: () => ({ delete: mockDelete }),
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
  mockStoreFile.mockClear();
  mockDelete.mockClear();
  patientId = await createPatient({ firstName: 'Test', lastName: 'Patient', status: 'outpatient' });
});

describe('filing a call recording', () => {
  it('copies the audio, then writes a dated phone note with it attached, and remembers it was filed', async () => {
    const noteId = await fileCallRecording(patientId, recording);

    expect(mockStoreFile).toHaveBeenCalledWith(recording.uri, 'm4a');
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
      relativePath: 'media/2026/09/call.m4a',
      mimeType: 'audio/mp4',
      capturedAt: recording.recordedAt,
    });
    expect(await readSetting(callsFiled)).toEqual([recording.key]);

    // Filing the same call again is allowed; it is remembered once.
    await fileCallRecording(patientId, recording);
    expect(await readSetting(callsFiled)).toEqual([recording.key]);
  });

  it('removes its copy and remembers nothing when the note cannot be written', async () => {
    t.sqlite.exec(
      "CREATE TRIGGER fail_note BEFORE INSERT ON notes BEGIN SELECT RAISE(ABORT, 'synthetic failure'); END;",
    );

    await expect(fileCallRecording(patientId, recording)).rejects.toThrow('synthetic failure');

    expect(mockDelete).toHaveBeenCalledTimes(1);
    expect(await t.db.select().from(attachments)).toEqual([]);
    expect(await readSetting(callsFiled)).toEqual([]);
  });

  it('rolls back the note, history and audio when remembering the import fails; retry creates one note', async () => {
    t.sqlite.exec(
      "CREATE TRIGGER fail_filed BEFORE INSERT ON settings WHEN NEW.key = 'calls.filed' BEGIN SELECT RAISE(ABORT, 'synthetic marker failure'); END;",
    );
    await expect(fileCallRecording(patientId, recording)).rejects.toThrow('synthetic marker failure');
    expect(t.db.select().from(notes).all()).toEqual([]);
    expect(t.db.select().from(noteVersions).all()).toEqual([]);
    expect(t.db.select().from(attachments).all()).toEqual([]);
    expect(mockDelete).toHaveBeenCalledTimes(1);
    t.sqlite.exec('DROP TRIGGER fail_filed');
    await fileCallRecording(patientId, recording);
    expect(t.db.select().from(notes).all()).toHaveLength(1);
    expect(await readSetting(callsFiled)).toEqual([recording.key]);
  });

  it('keeps both filed markers when independent recordings finish copying together', async () => {
    const other = { ...recording, name: 'Other.m4a', key: 'Other.m4a' };
    await Promise.all([fileCallRecording(patientId, recording), fileCallRecording(patientId, other)]);
    expect(await readSetting(callsFiled)).toEqual([recording.key, other.key]);
  });

  it('refuses a patient deleted while the audio was being copied', async () => {
    mockStoreFile.mockImplementationOnce(async () => {
      await deletePatient(patientId);
      return { relativePath: 'media/2026/09/call.m4a', sizeBytes: 2048 };
    });
    await expect(fileCallRecording(patientId, recording)).rejects.toThrow();
    expect(t.db.select().from(notes).all()).toEqual([]);
    expect(t.db.select().from(attachments).all()).toEqual([]);
    expect(mockDelete).toHaveBeenCalledTimes(1);
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
