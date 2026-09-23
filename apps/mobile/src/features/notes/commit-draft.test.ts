import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import { attachments, noteDrafts, notes, noteVersions } from '@/db/schema';
import { createPatient } from '@/features/patients/queries';
import { useTestDatabase } from '@/test/db-client';
import { createTestDatabase, type TestDatabase } from '@/test/sqljs';

import { commitNoteDraft } from './commit-queries';
import { noteDraftQuery, writeNoteDraft } from './draft-queries';

jest.mock('@/db/client', () => jest.requireActual('@/test/db-client'));
jest.mock('@/platform/notifications', () => jest.requireActual('@/test/mocks/notifications'));

let t: TestDatabase;
let patientId: string;
const fields = {
  type: 'general' as const,
  title: null,
  body: 'Stored words',
  subjective: null,
  objective: null,
  assessment: null,
  plan: null,
  noteDate: new Date('2026-09-23T10:00:00Z'),
  doctorId: null,
  specialty: null,
  isPinned: false,
  isDraft: false,
  voices: [{ relativePath: 'media/test/voice.m4a', durationMs: 4000, sizeBytes: 100 }],
};

beforeEach(async () => {
  t = useTestDatabase(await createTestDatabase());
  patientId = await createPatient({ firstName: 'Test', lastName: 'Patient', status: 'outpatient' });
  await writeNoteDraft('draft', { patientId, noteId: null }, fields);
});

describe('publishing a note draft', () => {
  it('commits the note, history and voice before retiring the draft', async () => {
    const id = await commitNoteDraft('draft');
    expect(t.db.select().from(notes).all()).toHaveLength(1);
    expect(t.db.select().from(noteVersions).all()).toHaveLength(1);
    const media = t.db.select().from(attachments).all();
    expect(media).toHaveLength(1);
    expect(media[0]?.entityId).toBe(id);
    expect(await noteDraftQuery(patientId, null)).toHaveLength(0);
    await expect(commitNoteDraft('draft')).rejects.toThrow();
    expect(t.db.select().from(notes).all()).toHaveLength(1);
  });

  it('keeps the entire recoverable draft if a voice attachment fails, then retries once', async () => {
    t.sqlite.exec(
      "CREATE TRIGGER fail_attachment BEFORE INSERT ON attachments BEGIN SELECT RAISE(ABORT, 'synthetic failure'); END;",
    );
    await expect(commitNoteDraft('draft')).rejects.toThrow();
    expect(t.db.select().from(notes).all()).toHaveLength(0);
    expect(t.db.select().from(noteVersions).all()).toHaveLength(0);
    expect((await noteDraftQuery(patientId, null))[0]?.voices).toEqual(fields.voices);
    t.sqlite.exec('DROP TRIGGER fail_attachment');
    await commitNoteDraft('draft');
    expect(t.db.select().from(notes).all()).toHaveLength(1);
    expect(t.db.select().from(attachments).all()).toHaveLength(1);
  });

  it('ignores a delayed autosave after the draft has been published', async () => {
    const id = await commitNoteDraft('draft');
    await writeNoteDraft('draft', { patientId, noteId: null }, { ...fields, body: 'stale' });
    const [draft] = t.db.select().from(noteDrafts).all();
    expect(draft?.noteId).toBe(id);
    expect(draft?.body).toBe(fields.body);
    expect(draft?.deletedAt).not.toBeNull();
  });

  it('does not detach a linked draft when an older editor writes a null note id', async () => {
    const id = await commitNoteDraft('draft');
    await writeNoteDraft('edit', { patientId, noteId: id }, fields);
    await writeNoteDraft('edit', { patientId, noteId: null }, { ...fields, body: 'newer' });
    expect((await noteDraftQuery(patientId, id))[0]?.body).toBe('newer');
    expect(await noteDraftQuery(patientId, null)).toHaveLength(0);
  });
});
