import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import { attachments, notes } from '@/db/schema';
import { readSetting } from '@/db/settings';
import { createPatient } from '@/features/patients/queries';
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
});
