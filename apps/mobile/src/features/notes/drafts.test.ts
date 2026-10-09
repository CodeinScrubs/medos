import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { eq } from 'drizzle-orm';

import { tablesOf } from '@/db/query-tables';
import { attachments, noteDrafts, notes } from '@/db/schema';
import { stamps } from '@/lib/ids';
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
import { notePreview } from './logic';
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
  it('previews meaningful SOAP fields through whitespace without modifying original body text', () => {
    expect(notePreview({ ...blank, body: ' \t\n', subjective: ' \n', plan: 'Follow consult' })).toBe('Follow consult');
    expect(notePreview({ ...blank, body: ' \nOriginal body \n', plan: 'Other field' })).toBe(' \nOriginal body \n');
  });
  it('filters empty and Unicode-whitespace drafts before the recovery limit and watches canonical media', async () => {
    await writeNoteDraft('older-useful', { patientId, noteId: null }, { ...blank, title: 'Earlier useful title' });
    t.db
      .update(noteDrafts)
      .set({ updatedAt: new Date('2025-01-01T12:00:00Z') })
      .where(eq(noteDrafts.id, 'older-useful'))
      .run();
    for (let i = 0; i < 22; i++)
      await writeNoteDraft(`empty-${i}`, { patientId, noteId: null }, { ...blank, body: ' \t\n\u00a0\u3000\ufeff' });
    const query = openNoteDraftsQuery(1);
    expect((await query)[0]?.draft.id).toBe('older-useful');
    expect(tablesOf(query)).toEqual(expect.arrayContaining(['note_drafts', 'patients', 'attachments']));
    expect(await openNoteDraftsQuery()).toHaveLength(1);
  });
  it('counts only live voice metadata under the exact draft and patient', async () => {
    const other = await createPatient({ firstName: 'Synthetic', lastName: 'Foreign voice' });
    for (const id of ['saved', 'wrong-patient', 'deleted-voice', 'wrong-parent'])
      await writeNoteDraft(id, { patientId, noteId: null }, blank);
    for (const id of ['saved', 'wrong-patient', 'deleted-voice', 'wrong-parent'])
      t.db
        .insert(attachments)
        .values({
          id: `voice-${id}`,
          ...stamps(),
          entityType: id === 'wrong-parent' ? 'note' : 'note_draft',
          entityId: id,
          patientId: id === 'wrong-patient' ? other : patientId,
          kind: 'voice',
          relativePath: `media/${id}.m4a`,
          durationMs: 1000,
          sizeBytes: 100,
          checksum: 'a'.repeat(64),
          deletedAt: id === 'deleted-voice' ? new Date() : null,
        })
        .run();
    expect(await openNoteDraftsQuery()).toEqual([
      expect.objectContaining({ draft: expect.objectContaining({ id: 'saved' }), voiceCount: 1 }),
    ]);
  });
  it('selects one exact recovery draft without falling back across patient, note or retired scope', async () => {
    await writeNoteDraft('selected-older', { patientId, noteId: null }, { ...blank, body: 'Older selected draft' });
    await writeNoteDraft('selected-newer', { patientId, noteId: null }, { ...blank, body: 'Newer draft' });
    const noteId = await createNote({ patientId, type: 'general', body: 'Published' });
    const other = await createPatient({ firstName: 'Synthetic', lastName: 'Other recovery' });
    expect((await noteDraftQuery(patientId, null, 'selected-older'))[0]?.body).toBe('Older selected draft');
    expect(await noteDraftQuery(patientId, noteId, 'selected-older')).toEqual([]);
    expect(await noteDraftQuery(other, null, 'selected-older')).toEqual([]);
    expect(await noteDraftQuery(patientId, null, 'missing-selection')).toEqual([]);
    await discardNoteDraft('selected-older');
    expect(await noteDraftQuery(patientId, null, 'selected-older')).toEqual([]);
    expect((await noteDraftQuery(patientId, null))[0]?.id).toBe('selected-newer');
  });

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

  it('refuses a write after discard instead of acknowledging discarded media as saved', async () => {
    await writeNoteDraft('d-1', { patientId, noteId: null }, { ...blank, body: 'Original' });
    await discardNoteDraft('d-1');
    await expect(
      writeNoteDraft(
        'd-1',
        { patientId, noteId: null },
        { ...blank, voices: [{ relativePath: 'media/new.m4a', durationMs: 1000, sizeBytes: 3 }] },
      ),
    ).rejects.toThrow();
    expect(t.db.select().from(noteDrafts).get()?.voices).toEqual([]);
  });

  it('refuses a stale write bound to a different patient', async () => {
    await writeNoteDraft('d-1', { patientId, noteId: null }, { ...blank, body: 'Original' });
    const otherId = await createPatient({ firstName: 'Synthetic', lastName: 'Other' });
    await expect(
      writeNoteDraft('d-1', { patientId: otherId, noteId: null }, { ...blank, body: 'Wrong target' }),
    ).rejects.toThrow();
    expect(t.db.select().from(noteDrafts).get()?.body).toBe('Original');
  });

  it('refuses writing under a deleted patient without creating a hidden draft', async () => {
    await deletePatient(patientId);
    await expect(
      writeNoteDraft('d-1', { patientId, noteId: null }, { ...blank, body: 'Keep in editor' }),
    ).rejects.toThrow();
    expect(t.db.select().from(noteDrafts).all()).toEqual([]);
  });

  it('refuses an edit draft whose note belongs to a different patient', async () => {
    const otherId = await createPatient({ firstName: 'Synthetic', lastName: 'Other' });
    const noteId = await createNote({ patientId: otherId, type: 'general', body: 'Original' });
    await expect(writeNoteDraft('d-1', { patientId, noteId }, { ...blank, body: 'Wrong target' })).rejects.toThrow();
    expect(t.db.select().from(noteDrafts).all()).toEqual([]);
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
