import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import { noteVersions, notes } from '@/db/schema';
import { useTestDatabase } from '@/test/db-client';
import { createTestDatabase, type TestDatabase } from '@/test/sqljs';

import { noteDraftQuery, writeNoteDraft } from './draft-queries';
import { createNote, deleteNote, noteQuery, restoreNoteVersion, setNotePinned, updateNote } from './queries';
import { backfillNoteVersionsIfNeeded, contentHashOf, noteVersionsQuery } from './version-queries';
import { createPatient } from '../patients/queries';

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
  it('keeps a version when identical words move to a different SOAP section', async () => {
    const id = await createNote({ patientId, type: 'progress', subjective: 'pain' });
    await updateNote(id, { subjective: null, plan: 'pain' });
    const versions = await noteVersionsQuery(id);
    expect(versions).toHaveLength(2);
    expect(versions[0]?.subjective).toBeNull();
    expect(versions[0]?.plan).toBe('pain');
    expect(versions[1]?.subjective).toBe('pain');
  });

  it('compares exact snapshots even when stored hashes are old or collide', async () => {
    const id = await createNote({ patientId, type: 'progress', body: 'First' });
    const note = (await noteQuery(id))[0]!;
    await t.db.update(noteVersions).set({ contentHash: contentHashOf({ ...note, body: 'first' }) });
    await updateNote(id, { body: 'first' });
    expect(await noteVersionsQuery(id)).toHaveLength(2);
    await t.db.update(noteVersions).set({ contentHash: 'legacy-format' });
    await updateNote(id, { body: 'first' });
    expect(await noteVersionsQuery(id)).toHaveLength(2);
  });

  it('includes the doctor and field boundaries in the fingerprint', () => {
    expect(contentHashOf(blankDraft)).not.toBe(contentHashOf({ ...blankDraft, doctorId: 'doctor-1' }));
    expect(contentHashOf({ ...blankDraft, title: 'A', body: 'B' })).not.toBe(
      contentHashOf({ ...blankDraft, title: 'A B', body: null }),
    );
  });

  it('orders rapid saves even when the clock does not advance', async () => {
    const clock = jest.spyOn(Date, 'now').mockReturnValue(Date.now());
    try {
      const id = await createNote({ patientId, type: 'progress', body: 'one' });
      await updateNote(id, { body: 'two' });
      await updateNote(id, { body: 'three' });
      expect((await noteVersionsQuery(id)).map((v) => v.body)).toEqual(['three', 'two', 'one']);
    } finally {
      clock.mockRestore();
    }
  });

  it('records a pin change through the same versioned write path', async () => {
    const id = await createNote({ patientId, type: 'general', body: 'review' });
    await setNotePinned(id, true);
    expect((await noteVersionsQuery(id)).map((v) => v.isPinned)).toEqual([true, false]);
  });
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

describe('atomic note writes', () => {
  function failVersions() {
    t.sqlite.exec(
      "CREATE TRIGGER fail_version BEFORE INSERT ON note_versions BEGIN SELECT RAISE(ABORT, 'synthetic failure'); END;",
    );
  }

  it('rolls back creation when the first version cannot be written, then permits a clean retry', async () => {
    failVersions();
    await expect(createNote({ patientId, type: 'general', body: 'keep me' })).rejects.toThrow();
    expect(t.db.select().from(notes).all()).toHaveLength(0);
    expect(t.db.select().from(noteVersions).all()).toHaveLength(0);
    t.sqlite.exec('DROP TRIGGER fail_version');
    await createNote({ patientId, type: 'general', body: 'keep me' });
    expect(t.db.select().from(notes).all()).toHaveLength(1);
    expect(t.db.select().from(noteVersions).all()).toHaveLength(1);
  });

  it('keeps both the note and its history unchanged when an edit fails', async () => {
    const id = await createNote({ patientId, type: 'general', body: 'before' });
    failVersions();
    await expect(updateNote(id, { body: 'after' })).rejects.toThrow();
    expect((await noteQuery(id))[0]?.body).toBe('before');
    expect(await noteVersionsQuery(id)).toHaveLength(1);
  });

  it('keeps the newer note and recoverable draft when a restore fails', async () => {
    const id = await createNote({ patientId, type: 'general', body: 'first' });
    const first = (await noteVersionsQuery(id))[0]!;
    await updateNote(id, { body: 'second' });
    await writeNoteDraft('restore-draft', { patientId, noteId: id }, { ...blankDraft, body: 'unfinished' });
    failVersions();
    await expect(restoreNoteVersion(first.id)).rejects.toThrow();
    expect((await noteQuery(id))[0]?.body).toBe('second');
    expect((await noteDraftQuery(patientId, id))[0]?.body).toBe('unfinished');
    expect(await noteVersionsQuery(id)).toHaveLength(2);
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
