import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { eq } from 'drizzle-orm';

import { auditLog, encounters, notes, noteVersions, patients } from '@/db/schema';
import { openEncounter } from '@/features/encounters/queries';
import { createPatient } from '@/features/patients/queries';
import { datasetGeneration } from '@/lib/dataset-write';
import { softDelete } from '@/lib/ids';
import { useTestDatabase } from '@/test/db-client';
import { createTestDatabase, type TestDatabase } from '@/test/sqljs';

import { patientNotePageQuery } from './list-queries';
import {
  createNote,
  deleteNote,
  deletedNotesQuery,
  restoreNote,
  restoreNoteVersion,
  setNotePinned,
  updateNote,
  type NoteInput,
} from './queries';

jest.mock('@/db/client', () => jest.requireActual('@/test/db-client'));
jest.mock('@/platform/notifications', () => jest.requireActual('@/test/mocks/notifications'));

let t: TestDatabase, patientId: string;
const stored = () => ({
  notes: t.db.select().from(notes).all(),
  versions: t.db.select().from(noteVersions).all(),
  audit: t.db.select().from(auditLog).all(),
  patients: t.db.select().from(patients).all(),
  encounters: t.db.select().from(encounters).all(),
});
beforeEach(async () => {
  t = useTestDatabase(await createTestDatabase());
  patientId = await createPatient({ firstName: 'Synthetic', lastName: 'Original note chart' });
});
afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});
function failAudit() {
  t.sqlite.exec(
    "CREATE TRIGGER fail_note_audit BEFORE INSERT ON audit_log WHEN NEW.action IN ('note.deleted', 'note.restored') BEGIN SELECT RAISE(ABORT, 'synthetic note audit failure'); END;",
  );
}

describe('note mutations preserve clinical ownership and required audit', () => {
  it.each(['delete', 'restore'] as const)(
    'rolls back the %s when its required audit fails, then permits retry',
    async (action) => {
      const id = await createNote({ patientId, type: 'progress', body: 'Synthetic exact text\n  and spacing' });
      if (action === 'restore') await deleteNote(id);
      const before = stored();
      failAudit();
      await expect(action === 'delete' ? deleteNote(id) : restoreNote(id)).rejects.toThrow(
        'synthetic note audit failure',
      );
      expect(stored()).toEqual(before);
      t.sqlite.exec('DROP TRIGGER fail_note_audit');
      await (action === 'delete' ? deleteNote(id) : restoreNote(id));
      expect(t.db.select().from(notes).get()!.body).toBe(before.notes[0]!.body);
      expect(t.db.select().from(noteVersions).all()).toEqual(before.versions);
      expect(t.db.select().from(auditLog).all().at(-1)?.action).toBe(
        action === 'delete' ? 'note.deleted' : 'note.restored',
      );
    },
  );

  it('refuses an explicit encounter belonging to another patient before creating a note or history', async () => {
    const otherPatientId = await createPatient({ firstName: 'Synthetic', lastName: 'Other chart' });
    const encounterId = await openEncounter({ patientId: otherPatientId, kind: 'admission' });
    const before = stored();
    await expect(
      createNote({ patientId, encounterId, type: 'general', body: 'Synthetic foreign episode' }),
    ).rejects.toThrow();
    expect(stored()).toEqual(before);
  });

  it.each(['patientId', 'encounterId'] as const)(
    'rejects runtime identity field %s on the general note writer',
    async (field) => {
      const id = await createNote({ patientId, type: 'general', body: 'Synthetic original chart' });
      const otherPatientId = await createPatient({ firstName: 'Synthetic', lastName: 'Different owner' });
      const encounterId = await openEncounter({ patientId: otherPatientId, kind: 'outpatient' });
      const before = stored();
      const patch = { [field]: field === 'patientId' ? otherPatientId : encounterId } as Partial<NoteInput>;
      await expect(updateNote(id, patch)).rejects.toThrow();
      expect(stored()).toEqual(before);
    },
  );

  it.each(['patient', 'encounter'] as const)('does not create a note beneath a deleted %s', async (kind) => {
    const encounterId = await openEncounter({ patientId, kind: 'admission' });
    if (kind === 'patient') t.db.update(patients).set(softDelete()).where(eq(patients.id, patientId)).run();
    else t.db.update(encounters).set(softDelete()).where(eq(encounters.id, encounterId)).run();
    const before = stored();
    await expect(
      createNote({ patientId, encounterId, type: 'general', body: 'Synthetic unavailable parent' }),
    ).rejects.toThrow();
    expect(stored()).toEqual(before);
  });

  it('does not allow a runtime tombstone patch through the ordinary correction writer', async () => {
    const id = await createNote({ patientId, type: 'general', body: 'Synthetic published text' });
    const before = stored();
    await expect(updateNote(id, { deletedAt: new Date() } as unknown as Partial<NoteInput>)).rejects.toThrow();
    expect(stored()).toEqual(before);
  });

  it('ignores undefined patch fields without dropping unchanged content from search', async () => {
    const id = await createNote({
      patientId,
      type: 'general',
      title: 'Synthetic title',
      body: 'Synthetic retained body',
    });
    const before = stored();
    await updateNote(id, { body: undefined });
    expect(t.db.select().from(notes).get()!.searchText).toBe(before.notes[0]!.searchText);
    expect(t.db.select().from(noteVersions).all()).toEqual(before.versions);
  });

  it.each(['patient', 'encounter'] as const)('does not correct or delete a note beneath a deleted %s', async (kind) => {
    const encounterId = await openEncounter({ patientId, kind: 'admission' });
    const id = await createNote({ patientId, encounterId, type: 'progress', body: 'Synthetic retained text' });
    if (kind === 'patient') t.db.update(patients).set(softDelete()).where(eq(patients.id, patientId)).run();
    else t.db.update(encounters).set(softDelete()).where(eq(encounters.id, encounterId)).run();
    const before = stored();
    await expect(updateNote(id, { body: 'Synthetic rejected correction' })).rejects.toThrow();
    await expect(deleteNote(id)).rejects.toThrow();
    expect(stored()).toEqual(before);
  });

  it('preserves explicit null, active resolution, a closed original episode and an imported empty-string episode', async () => {
    const encounterId = await openEncounter({ patientId, kind: 'admission' });
    const active = await createNote({ patientId, type: 'progress', body: 'Synthetic active context' });
    const unassociated = await createNote({
      patientId,
      encounterId: null,
      type: 'general',
      body: 'Synthetic explicit null',
    });
    t.db.update(encounters).set({ isActive: false }).where(eq(encounters.id, encounterId)).run();
    const historical = await createNote({
      patientId,
      encounterId,
      type: 'progress',
      body: 'Synthetic original closed context',
    });
    const episode = t.db.select().from(encounters).get()!;
    t.db
      .insert(encounters)
      .values({ ...episode, id: '' })
      .run();
    const imported = await createNote({
      patientId,
      encounterId: '',
      type: 'general',
      body: 'Synthetic imported episode',
    });
    expect(
      t.db
        .select()
        .from(notes)
        .all()
        .map((row) => [row.id, row.encounterId]),
    ).toEqual([
      [active, encounterId],
      [unassociated, null],
      [historical, encounterId],
      [imported, ''],
    ]);
    await updateNote(historical, { body: 'Synthetic historical correction' });
    await deleteNote(imported);
    await restoreNote(imported);
    expect(t.db.select().from(notes).where(eq(notes.id, imported)).get()!.encounterId).toBe('');
  });

  it('does not rewrite a tombstone or add a false audit for a repeated or missing delete', async () => {
    const id = await createNote({ patientId, type: 'general', body: 'Synthetic tombstone' });
    await deleteNote(id);
    const before = stored();
    await expect(deleteNote(id)).rejects.toThrow();
    await expect(deleteNote('synthetic-missing-note')).rejects.toThrow();
    expect(stored()).toEqual(before);
  });

  it('refuses version restoration through an imported empty foreign encounter ID', async () => {
    const other = await createPatient({ firstName: 'Synthetic', lastName: 'Foreign episode' });
    const episodeId = await openEncounter({ patientId: other, kind: 'admission' });
    const episode = t.db.select().from(encounters).where(eq(encounters.id, episodeId)).get()!;
    t.db
      .insert(encounters)
      .values({ ...episode, id: '' })
      .run();
    const id = await createNote({ patientId, encounterId: null, type: 'general', body: 'Synthetic first' });
    const original = t.db.select().from(noteVersions).where(eq(noteVersions.noteId, id)).get()!;
    await updateNote(id, { body: 'Synthetic second' });
    t.db.update(notes).set({ encounterId: '' }).where(eq(notes.id, id)).run();
    const current = t.db.select().from(notes).where(eq(notes.id, id)).get()!;
    const before = stored();
    await expect(restoreNoteVersion(original, current, datasetGeneration())).rejects.toThrow();
    expect(stored()).toEqual(before);
  });

  it('clears explicit null in both current text and search, while retaining exact old history', async () => {
    const id = await createNote({ patientId, type: 'general', body: 'Synthetic removable term' });
    await updateNote(id, { body: null });
    expect(t.db.select().from(notes).get()!.body).toBeNull();
    expect(t.db.select().from(notes).get()!.searchText).not.toContain('removable');
    expect(
      t.db
        .select()
        .from(noteVersions)
        .all()
        .map((row) => row.body),
    ).toEqual(['Synthetic removable term', null]);
  });

  it.each(['pin', 'delete'] as const)(
    'refuses an old card after same-clock content changes and changes back: %s',
    async (action) => {
      jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });
      jest.setSystemTime(new Date('2025-01-01T12:00:00Z'));
      const id = await createNote({ patientId, type: 'general', body: 'Synthetic first words' });
      const card = patientNotePageQuery(patientId).get()!;
      await updateNote(id, { body: 'Synthetic second words' });
      await updateNote(id, { body: 'Synthetic first words' });
      const before = stored();
      expect(before.notes[0]!.updatedAt).toEqual(before.notes[0]!.createdAt);
      const basis = { patientId, stamp: card.action };
      await expect(action === 'pin' ? setNotePinned(id, true, basis) : deleteNote(id, basis)).rejects.toThrow();
      expect(stored()).toEqual(before);
    },
  );

  it('refuses an identical same-clock tombstone after a restore/delete cycle', async () => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });
    jest.setSystemTime(new Date('2025-01-01T12:00:00Z'));
    const id = await createNote({ patientId, type: 'general', body: 'Synthetic lifecycle' });
    await deleteNote(id);
    const old = deletedNotesQuery().get()!;
    await restoreNote(id, old.note, old.lifecycle);
    await deleteNote(id);
    const current = deletedNotesQuery().get()!;
    expect(current.note).toEqual(old.note);
    expect(current.lifecycle).toBe('3');
    const before = stored();
    await expect(restoreNote(id, old.note, old.lifecycle)).rejects.toThrow();
    expect(stored()).toEqual(before);
    await restoreNote(id, current.note, current.lifecycle);
    expect(t.db.select().from(notes).get()!.deletedAt).toBeNull();
  });

  it('refuses an action through a different patient or a different note token', async () => {
    const id = await createNote({ patientId, type: 'general', body: 'Synthetic original card' });
    const otherId = await createNote({ patientId, type: 'general', body: 'Synthetic second card' });
    const card = patientNotePageQuery(patientId)
      .all()
      .find((row) => row.id === id)!;
    const other = await createPatient({ firstName: 'Synthetic', lastName: 'Different route' });
    const before = stored();
    await expect(deleteNote(id, { patientId: other, stamp: card.action })).rejects.toThrow();
    await expect(deleteNote(otherId, { patientId, stamp: card.action })).rejects.toThrow();
    expect(stored()).toEqual(before);
  });
});
