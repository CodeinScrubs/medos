import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import { noteDrafts, notes } from '@/db/schema';
import { useTestDatabase } from '@/test/db-client';
import { createTestDatabase, type TestDatabase } from '@/test/sqljs';

import {
  discardNoteDraft,
  draftHasContent,
  noteDraftQuery,
  openNoteDraftsQuery,
  retargetNoteDraft,
  writeNoteDraft,
} from './draft-queries';
import { createNote } from './queries';
import { createPatient, deletePatient } from '../patients/queries';

jest.mock('@/db/client', () => jest.requireActual('@/test/db-client'));
jest.mock('@/platform/notifications', () => jest.requireActual('@/test/mocks/notifications'));

let t: TestDatabase;
let patientId: string;

const blank = {
  type: 'progress' as const,
  title: null,
  body: null,
  subjective: null,
  objective: null,
  assessment: null,
  plan: null,
  noteDate: new Date(2026, 0, 1),
  doctorId: null,
  specialty: null,
  isPinned: false,
  isDraft: false,
  voices: [],
};

beforeEach(async () => {
  t = useTestDatabase(await createTestDatabase());
  patientId = await createPatient({ firstName: 'سارا', lastName: 'احمدی', status: 'admitted' });
});

describe('note drafts', () => {
  it('writes what is being typed and gives it back, without touching the record', async () => {
    const id = 'draft-1';
    await writeNoteDraft(id, { patientId, noteId: null }, { ...blank, body: 'patient looks' });
    await writeNoteDraft(id, { patientId, noteId: null }, { ...blank, body: 'patient looks better' });

    const rows = await noteDraftQuery(patientId, null);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.body).toBe('patient looks better');
    // The chart itself has nothing in it: a draft is not a note.
    expect(await t.db.select().from(notes)).toHaveLength(0);
  });

  it('keeps a draft per note being edited, separate from the new-note one', async () => {
    const noteId = await createNote({ patientId, type: 'progress', body: 'as written' });
    await writeNoteDraft('d-new', { patientId, noteId: null }, { ...blank, body: 'a new one' });
    await writeNoteDraft('d-edit', { patientId, noteId }, { ...blank, body: 'a correction' });

    expect((await noteDraftQuery(patientId, null))[0]?.body).toBe('a new one');
    expect((await noteDraftQuery(patientId, noteId))[0]?.body).toBe('a correction');
    // And the note is still what it was until the edit is saved.
    expect((await t.db.select().from(notes))[0]?.body).toBe('as written');
  });

  it('stops offering a draft once it is discarded, and keeps the row', async () => {
    await writeNoteDraft('d-1', { patientId, noteId: null }, { ...blank, body: 'typed at 3am' });
    await discardNoteDraft('d-1');

    expect(await noteDraftQuery(patientId, null)).toHaveLength(0);
    expect(await openNoteDraftsQuery()).toHaveLength(0);
    // Soft-deleted like everything else: a discard at 3 a.m. is recoverable.
    const [row] = await t.db.select().from(noteDrafts);
    expect(row?.deletedAt).toBeInstanceOf(Date);
    expect(row?.body).toBe('typed at 3am');
  });

  it('carries the voices recorded before the note existed', async () => {
    await writeNoteDraft(
      'd-1',
      { patientId, noteId: null },
      { ...blank, voices: [{ relativePath: 'media/2026/01/a.m4a', durationMs: 4200, sizeBytes: 900 }] },
    );
    const [row] = await noteDraftQuery(patientId, null);
    expect(row?.voices).toEqual([{ relativePath: 'media/2026/01/a.m4a', durationMs: 4200, sizeBytes: 900 }]);
  });

  it('knows an empty draft from one worth keeping', () => {
    expect(draftHasContent({ ...blank })).toBe(false);
    expect(draftHasContent({ ...blank, body: '   ' })).toBe(false);
    expect(draftHasContent({ ...blank, plan: 'ceftriaxone' })).toBe(true);
    expect(draftHasContent({ ...blank, voices: [{ relativePath: 'a', durationMs: null, sizeBytes: null }] })).toBe(
      true,
    );
  });
});

describe('a draft that became a note', () => {
  /*
   * The note is written first and its voices are attached after. If attaching
   * fails and the editor is left, the draft must already belong to the note —
   * otherwise it still looks like "a new note for this patient", and saving it
   * next time writes the note a second time.
   */
  it('stops offering itself as a new note', async () => {
    await writeNoteDraft('d-1', { patientId, noteId: null }, { ...blank, body: 'admission note' });
    const noteId = await createNote({ patientId, type: 'progress', body: 'admission note' });

    await retargetNoteDraft('d-1', noteId);

    expect(await noteDraftQuery(patientId, null)).toHaveLength(0);
    expect((await noteDraftQuery(patientId, noteId))[0]?.body).toBe('admission note');
  });

  it('is not listed once its patient is gone', async () => {
    await writeNoteDraft('d-1', { patientId, noteId: null }, { ...blank, body: 'typed before the delete' });
    expect(await openNoteDraftsQuery()).toHaveLength(1);

    await deletePatient(patientId);

    expect(await openNoteDraftsQuery()).toHaveLength(0);
  });
});
