import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { eq } from 'drizzle-orm';

import { attachments, noteDrafts, notes, noteVersions, recordingJobs } from '@/db/schema';
import { patientMediaQuery } from '@/features/attachments/queries';
import { persistRecording, recordingJobQuery, resumeRecording } from '@/features/attachments/recording-queries';
import { createPatient } from '@/features/patients/queries';
import { newId, stamps } from '@/lib/ids';
import type { FileFingerprint } from '@/platform/import-file';
import { useTestDatabase } from '@/test/db-client';
import { createTestDatabase, type TestDatabase } from '@/test/sqljs';

import { commitNoteDraft } from './commit-queries';
import {
  discardNoteDraft,
  noteDraftQuery,
  retargetNoteDraft,
  writeNoteDraft,
  type NoteDraftFields,
} from './draft-queries';

jest.mock('@/db/client', () => jest.requireActual('@/test/db-client'));
jest.mock('@/platform/notifications', () => jest.requireActual('@/test/mocks/notifications'));
const mockFiles = new Map<string, FileFingerprint>();
const mockCopy = jest.fn(async (uri: string, path: string) => {
  const file = mockFiles.get(uri);
  if (!file) throw new Error('Synthetic missing source');
  mockFiles.set(path, { ...file });
  return { ...file };
});
jest.mock('@/platform/import-file', () => ({
  fingerprintRecordingSource: async (uri: string) => {
    const file = mockFiles.get(uri);
    if (!file) throw new Error('Synthetic missing source');
    return { ...file };
  },
  fingerprintImportFile: async (path: string) => {
    const file = mockFiles.get(path);
    if (!file) throw new Error('Synthetic missing copy');
    return { ...file };
  },
  copyImportFile: (uri: string, path: string) => mockCopy(uri, path),
}));
jest.mock('@/platform/media', () => ({
  mediaFile: (path: string) => ({
    get exists() {
      return mockFiles.has(path);
    },
    delete: () => mockFiles.delete(path),
  }),
}));

const now = new Date('2026-01-02T12:00:00Z');
const fields: NoteDraftFields = {
  type: 'general',
  title: null,
  body: 'Original words',
  subjective: null,
  objective: null,
  assessment: null,
  plan: null,
  noteDate: now,
  doctorId: null,
  specialty: null,
  isPinned: false,
  isDraft: false,
  voices: [],
};
const draftType = 'note_draft' as const;
const fingerprint = { checksum: 'b'.repeat(64), sizeBytes: 2345 };
let t: TestDatabase;
let patientId: string;
let draftId: string;
const target = () => ({ entityType: draftType, entityId: draftId, patientId });
const recording = () => ({
  operationId: 'a9627abc-c6fe-4b8e-bef6-41317da687a1',
  uri: 'file:///synthetic-draft.m4a',
  durationMs: 2700,
  capturedAt: new Date('2026-01-02T11:00:00Z'),
});
beforeEach(async () => {
  t = useTestDatabase(await createTestDatabase());
  patientId = await createPatient({ firstName: 'Synthetic', lastName: 'Draft' });
  draftId = newId();
  await writeNoteDraft(draftId, { patientId, noteId: null }, fields);
  mockFiles.clear();
  mockFiles.set(recording().uri, { ...fingerprint });
  mockCopy.mockClear();
});
function seedPending(state: 'copying' | 'ready' | 'discarding') {
  t.db
    .insert(recordingJobs)
    .values({
      id: recording().operationId,
      ...stamps(now),
      ...target(),
      sourceUri: recording().uri,
      durationMs: recording().durationMs,
      capturedAt: recording().capturedAt,
      relativePath: `media/imports/voice-${recording().operationId}.m4a`,
      state,
      ...(state === 'discarding' ? { deletedAt: now } : {}),
      revision: 2,
      ...fingerprint,
    })
    .run();
}
function seedVoice() {
  const id = newId();
  t.db
    .insert(attachments)
    .values({
      id,
      ...stamps(now),
      ...target(),
      kind: 'voice',
      relativePath: 'media/test/canonical-draft.m4a',
      durationMs: 2700,
      capturedAt: recording().capturedAt,
      mimeType: 'audio/mp4',
      ...fingerprint,
    })
    .run();
  return id;
}
describe('stopped draft voice publication contract', () => {
  it.each(['copying', 'ready', 'discarding'] as const)(
    'refuses publication while a %s job still owns this draft',
    async (state) => {
      seedPending(state);
      await expect(commitNoteDraft(draftId)).rejects.toThrow();
      expect(t.db.select().from(notes).all()).toEqual([]);
      expect(t.db.select().from(noteVersions).all()).toEqual([]);
      expect((await noteDraftQuery(patientId, null))[0]?.body).toBe(fields.body);
    },
  );
  it.each(['copying', 'ready', 'discarding'] as const)(
    'does not strand a %s job by retiring its draft',
    async (state) => {
      seedPending(state);
      await expect(discardNoteDraft(draftId)).rejects.toThrow();
      expect((await noteDraftQuery(patientId, null))[0]?.deletedAt).toBeNull();
    },
  );
  it('keeps unpublished canonical voice out of the clinical gallery, then moves one metadata row on publication', async () => {
    const id = seedVoice();
    expect(await patientMediaQuery(patientId)).toEqual([]);
    const noteId = await commitNoteDraft(draftId);
    expect(t.db.select().from(attachments).all()).toHaveLength(1);
    expect(t.db.select().from(attachments).get()).toMatchObject({
      id,
      entityType: 'note',
      entityId: noteId,
      patientId,
      ...fingerprint,
    });
    expect(await patientMediaQuery(patientId)).toHaveLength(1);
  });
  it('publishes a voice-only draft without inventing text or copying media', async () => {
    await writeNoteDraft(draftId, { patientId, noteId: null }, { ...fields, body: null });
    seedVoice();
    const noteId = await commitNoteDraft(draftId);
    expect(t.db.select().from(notes).get()).toMatchObject({ id: noteId, body: null, patientId });
    expect(t.db.select().from(noteVersions).all()).toHaveLength(1);
    expect(mockCopy).not.toHaveBeenCalled();
  });
  it('rolls back note/history/retirement if canonical metadata cannot move, then retries once', async () => {
    const id = seedVoice();
    const before = t.db.select().from(attachments).get();
    t.sqlite.exec(
      "CREATE TRIGGER fail_draft_move BEFORE UPDATE OF entity_type ON attachments BEGIN SELECT RAISE(ABORT, 'Synthetic move failure'); END;",
    );
    await expect(commitNoteDraft(draftId)).rejects.toThrow();
    expect(t.db.select().from(notes).all()).toEqual([]);
    expect(t.db.select().from(noteVersions).all()).toEqual([]);
    expect(t.db.select().from(attachments).get()).toEqual(before);
    expect((await noteDraftQuery(patientId, null))[0]?.body).toBe(fields.body);
    t.sqlite.exec('DROP TRIGGER fail_draft_move');
    const noteId = await commitNoteDraft(draftId);
    expect(t.db.select().from(attachments).get()).toMatchObject({ id, entityType: 'note', entityId: noteId });
    await expect(commitNoteDraft(draftId)).rejects.toThrow();
    expect(t.db.select().from(notes).all()).toHaveLength(1);
  });
  it('recovers ready bytes without cache while retaining newer text and stable metadata through publication', async () => {
    t.sqlite.exec(
      "CREATE TRIGGER fail_draft_ack BEFORE INSERT ON attachments BEGIN SELECT RAISE(ABORT, 'Synthetic ack failure'); END;",
    );
    await expect(persistRecording(recording(), target(), now)).rejects.toThrow();
    const job = recordingJobQuery(recording().operationId).get();
    expect(job).toMatchObject({ state: 'ready', entityId: draftId, patientId, ...fingerprint });
    t.sqlite.exec('DROP TRIGGER fail_draft_ack');
    mockFiles.delete(recording().uri);
    await writeNoteDraft(draftId, { patientId, noteId: null }, { ...fields, body: 'Newer words' });
    const mediaId = await resumeRecording(recording().operationId, now);
    expect(await resumeRecording(recording().operationId, now)).toBe(mediaId);
    // A subsequent full-shape autosave must not remove the recovered canonical voice.
    await writeNoteDraft(draftId, { patientId, noteId: null }, { ...fields, body: 'Latest words', voices: [] });
    const noteId = await commitNoteDraft(draftId);
    expect(t.db.select().from(notes).get()?.body).toBe('Latest words');
    expect(t.db.select().from(attachments).get()).toMatchObject({
      id: mediaId,
      entityType: 'note',
      entityId: noteId,
      capturedAt: recording().capturedAt,
      ...fingerprint,
    });
    expect(recordingJobQuery(recording().operationId).get()).toMatchObject({
      state: 'saved',
      revision: 3,
      entityType: draftType,
      entityId: draftId,
      attachmentId: mediaId,
    });
    expect(mockCopy).toHaveBeenCalledTimes(1);
    await expect(resumeRecording(recording().operationId, now)).rejects.toThrow();
    expect(t.db.select().from(attachments).all()).toHaveLength(1);
  });
  it('refuses a changed draft parent before recovery publication instead of attaching to a new note', async () => {
    seedPending('ready');
    mockFiles.set(`media/imports/voice-${recording().operationId}.m4a`, { ...fingerprint });
    const noteId = newId();
    t.db
      .insert(notes)
      .values({ id: noteId, ...stamps(now), patientId, type: 'general', noteDate: now })
      .run();
    await expect(retargetNoteDraft(draftId, noteId)).rejects.toThrow();
    // Direct corruption keeps the journal's independent original-target check exercised.
    t.db.update(noteDrafts).set({ noteId }).where(eq(noteDrafts.id, draftId)).run();
    await expect(resumeRecording(recording().operationId, now)).rejects.toThrow();
    expect(t.db.select().from(attachments).all()).toEqual([]);
  });
  it.each(['copying', 'ready', 'discarding'] as const)(
    'refuses an autosave retarget while a %s recording still owns the draft',
    async (state) => {
      seedPending(state);
      const noteId = newId();
      t.db
        .insert(notes)
        .values({ id: noteId, ...stamps(now), patientId, type: 'general', noteDate: now })
        .run();
      await expect(
        writeNoteDraft(draftId, { patientId, noteId }, { ...fields, body: 'Wrong retarget' }),
      ).rejects.toThrow();
      expect((await noteDraftQuery(patientId, null))[0]).toMatchObject({ body: fields.body, noteId: null });
    },
  );
  it('does not retarget a completed canonical voice through a full-shape autosave', async () => {
    seedVoice();
    const noteId = newId();
    t.db
      .insert(notes)
      .values({ id: noteId, ...stamps(now), patientId, type: 'general', noteDate: now })
      .run();
    await expect(writeNoteDraft(draftId, { patientId, noteId }, fields)).rejects.toThrow();
    expect((await noteDraftQuery(patientId, null))[0]?.noteId).toBeNull();
  });
  it.each([{ checksum: null }, { checksum: 'wrong' }, { sizeBytes: 0 }, { durationMs: 1 }, { capturedAt: null }])(
    'keeps malformed canonical metadata recoverable rather than guessing on publication (%j)',
    async (patch) => {
      const id = seedVoice();
      t.db.update(attachments).set(patch).where(eq(attachments.id, id)).run();
      const before = t.db.select().from(attachments).get();
      await expect(commitNoteDraft(draftId)).rejects.toThrow();
      expect(t.db.select().from(notes).all()).toEqual([]);
      expect(t.db.select().from(noteVersions).all()).toEqual([]);
      expect(t.db.select().from(attachments).get()).toEqual(before);
      expect((await noteDraftQuery(patientId, null))[0]?.body).toBe(fields.body);
    },
  );
});
