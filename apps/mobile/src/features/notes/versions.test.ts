import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import { noteVersions } from '@/db/schema';
import { useTestDatabase } from '@/test/db-client';
import { createTestDatabase, type TestDatabase } from '@/test/sqljs';

import { createPatient } from '../patients/queries';
import { createNote, deleteNote, noteQuery, restoreNoteVersion, updateNote } from './queries';
import { noteDraftQuery, writeNoteDraft } from './draft-queries';
import { backfillNoteVersionsIfNeeded, contentHashOf, noteVersionsQuery } from './version-queries';

const blankDraft = {
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

jest.mock('@/db/client', () => jest.requireActual('@/test/db-client'));
jest.mock('@/platform/notifications', () => jest.requireActual('@/test/mocks/notifications'));

/*
 * The owner asked for every version kept, with nothing pruned. So these tests
 * are as much about what is *not* removed as about what is written.
 */

let t: TestDatabase;
let patientId: string;

beforeEach(async () => {
  t = useTestDatabase(await createTestDatabase());
  patientId = await createPatient({ firstName: 'سارا', lastName: 'احمدی', status: 'outpatient' });
});

describe('note versions', () => {
  it('keeps what the note said at each save', async () => {
    const id = await createNote({ patientId, type: 'progress', subjective: 'fever' });
    await updateNote(id, { subjective: 'fever, now settled' });
    await updateNote(id, { plan: 'discharge tomorrow' });

    const versions = await noteVersionsQuery(id);
    expect(versions.map((v) => v.reason)).toEqual(['edited', 'edited', 'created']);
    expect(versions.at(-1)?.subjective).toBe('fever');
    expect(versions[0]?.plan).toBe('discharge tomorrow');
  });

  it('does not write a version when nothing changed', async () => {
    const id = await createNote({ patientId, type: 'progress', subjective: 'fever' });
    await updateNote(id, { subjective: 'fever' });
    await updateNote(id, {});

    expect(await noteVersionsQuery(id)).toHaveLength(1);
  });

  it('restores an older version without losing the newer one', async () => {
    const id = await createNote({ patientId, type: 'progress', subjective: 'first' });
    await updateNote(id, { subjective: 'second' });
    const versions = await noteVersionsQuery(id);
    const first = versions.at(-1)!;

    await restoreNoteVersion(first.id);

    expect((await noteQuery(id))[0]?.subjective).toBe('first');
    const after = await noteVersionsQuery(id);
    // created, edited, restored — the "second" text is still in the history.
    expect(after).toHaveLength(3);
    expect(after[0]?.reason).toBe('restored');
    expect(after[0]?.restoredFromId).toBe(first.id);
    expect(after.some((v) => v.subjective === 'second')).toBe(true);
  });

  it('keeps the history of a deleted note', async () => {
    const id = await createNote({ patientId, type: 'progress', subjective: 'written then deleted' });
    await deleteNote(id);

    const rows = await t.db.select().from(noteVersions);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.subjective).toBe('written then deleted');
  });

  it('gives notes written before the table a baseline, once', async () => {
    const id = await createNote({ patientId, type: 'progress', subjective: 'older note' });
    // As if this note predated the history table.
    await t.db.delete(noteVersions);

    await backfillNoteVersionsIfNeeded();
    await backfillNoteVersionsIfNeeded();

    const versions = await noteVersionsQuery(id);
    expect(versions).toHaveLength(1);
    expect(versions[0]?.reason).toBe('baseline');
    // Stamped when the note was written, not when the backfill ran.
    expect(versions[0]?.createdAt).toEqual((await noteQuery(id))[0]?.createdAt);
  });

  it('reads the same text as the same version', () => {
    const fields = {
      type: 'progress' as const,
      title: null,
      body: 'متن',
      subjective: null,
      objective: null,
      assessment: null,
      plan: null,
      noteDate: new Date(2026, 0, 1),
      doctorId: null,
      specialty: null,
      isPinned: false,
      isDraft: false,
    };
    expect(contentHashOf(fields)).toBe(contentHashOf({ ...fields }));
    expect(contentHashOf(fields)).not.toBe(contentHashOf({ ...fields, body: 'متن دیگر' }));
  });
});

describe('restoring while an unsaved edit exists', () => {
  /*
   * The editor reads the draft before the note. A restore that left an older
   * draft behind would reopen showing the text the restore replaced — and
   * saving that would put it back.
   */
  it('drops the draft that the restore made obsolete', async () => {
    const id = await createNote({ patientId, type: 'progress', subjective: 'first' });
    await updateNote(id, { subjective: 'second' });
    await writeNoteDraft('d-1', { patientId, noteId: id }, { ...blankDraft, subjective: 'half-typed third' });
    const first = (await noteVersionsQuery(id)).at(-1)!;

    await restoreNoteVersion(first.id);

    expect(await noteDraftQuery(patientId, id)).toHaveLength(0);
    expect((await noteQuery(id))[0]?.subjective).toBe('first');
  });
});
