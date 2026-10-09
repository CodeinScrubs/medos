import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { eq } from 'drizzle-orm';

import { auditLog, noteDrafts, noteVersions, notes, patients } from '@/db/schema';
import { createPatient } from '@/features/patients/queries';
import { datasetGeneration, reserveDatasetReplacement } from '@/lib/dataset-write';
import { softDelete } from '@/lib/ids';
import { useTestDatabase } from '@/test/db-client';
import { createTestDatabase, type TestDatabase } from '@/test/sqljs';

import { commitNoteDraft } from './commit-queries';
import { writeNoteDraft, type NoteDraftFields } from './draft-queries';
import { createNote, noteQuery, restoreNoteVersion, updateNote } from './queries';
import { noteVersionsQuery } from './version-queries';

jest.mock('@/db/client', () => jest.requireActual('@/test/db-client'));
jest.mock('@/platform/notifications', () => jest.requireActual('@/test/mocks/notifications'));

let t: TestDatabase, patientId: string, otherPatientId: string;
beforeEach(async () => {
  t = useTestDatabase(await createTestDatabase());
  patientId = await createPatient({ firstName: 'Synthetic', lastName: 'Original chart' });
  otherPatientId = await createPatient({ firstName: 'Synthetic', lastName: 'Other chart' });
});
const stored = () => ({
  notes: t.db.select().from(notes).all(),
  versions: t.db.select().from(noteVersions).all(),
  drafts: t.db.select().from(noteDrafts).all(),
  audit: t.db.select().from(auditLog).all(),
});

describe('note readers and version restoration own the original chart', () => {
  it('does not read a note or its versions through another patient route', async () => {
    const id = await createNote({ patientId, type: 'general', body: 'Original chart text' });
    expect(await noteQuery(id, otherPatientId)).toEqual([]);
    expect(await noteVersionsQuery(id, otherPatientId)).toEqual([]);
    expect((await noteQuery(id, patientId))[0]?.body).toBe('Original chart text');
    expect(await noteVersionsQuery(id, patientId)).toHaveLength(1);
  });

  it.each(['note', 'patient'] as const)('does not expose history when the %s is deleted', async (kind) => {
    const id = await createNote({ patientId, type: 'general', body: 'Retained history' });
    if (kind === 'note') t.db.update(notes).set(softDelete()).where(eq(notes.id, id)).run();
    else t.db.update(patients).set(softDelete()).where(eq(patients.id, patientId)).run();
    expect(await noteQuery(id, patientId)).toEqual([]);
    expect(await noteVersionsQuery(id, patientId)).toEqual([]);
    expect(t.db.select().from(noteVersions).all()[0]?.body).toBe('Retained history');
  });

  it('does not expose a malformed version attributed to another patient', async () => {
    const id = await createNote({ patientId, type: 'general', body: 'Original version' });
    t.db.update(noteVersions).set({ patientId: otherPatientId }).run();
    expect(await noteVersionsQuery(id, patientId)).toEqual([]);
  });

  async function shown() {
    const id = await createNote({ patientId, type: 'general', body: 'First version' });
    const version = (await noteVersionsQuery(id, patientId))[0]!;
    await updateNote(id, { body: 'Current version' });
    const basis = (await noteQuery(id, patientId))[0]!;
    return { id, version, basis, generation: datasetGeneration() };
  }

  const draftFields: NoteDraftFields = {
    type: 'general',
    title: null,
    body: 'Unfinished draft',
    subjective: null,
    objective: null,
    assessment: null,
    plan: null,
    noteDate: new Date('2026-09-23T10:00:00Z'),
    doctorId: null,
    specialty: null,
    isPinned: false,
    isDraft: false,
    voices: [],
  };

  it('rolls back the note, history and draft retirement when the audit insert fails, then retries', async () => {
    const intent = await shown();
    await writeNoteDraft('context-draft', { patientId, noteId: intent.id }, draftFields);
    const before = stored();
    t.sqlite.exec(
      "CREATE TRIGGER fail_restore_audit BEFORE INSERT ON audit_log BEGIN SELECT RAISE(ABORT, 'synthetic failure'); END;",
    );
    await expect(restoreNoteVersion(intent.version, intent.basis, intent.generation)).rejects.toThrow();
    expect(stored()).toEqual(before);
    t.sqlite.exec('DROP TRIGGER fail_restore_audit');
    await restoreNoteVersion(intent.version, intent.basis, intent.generation);
    expect(t.db.select().from(noteDrafts).get()!.deletedAt).not.toBeNull();
    expect(t.db.select().from(auditLog).all()).toEqual([
      expect.objectContaining({
        action: 'note.versionRestored',
        entityId: intent.id,
        entityType: 'note',
        summary: null,
        detail: null,
      }),
    ]);
  });

  it('an editor publication cannot overwrite a same-timestamp correction and retains its draft', async () => {
    const intent = await shown();
    await writeNoteDraft('context-draft', { patientId, noteId: intent.id }, draftFields);
    t.db.update(notes).set({ body: 'Concurrent current text' }).where(eq(notes.id, intent.id)).run();
    const before = stored();
    await expect(commitNoteDraft('context-draft', intent.generation, intent.basis)).rejects.toThrow();
    expect(stored()).toEqual(before);
  });

  it('publishes a fresh editor basis exactly once while retaining the previous text', async () => {
    const intent = await shown();
    await writeNoteDraft('context-draft', { patientId, noteId: intent.id }, draftFields);
    expect(await commitNoteDraft('context-draft', intent.generation, intent.basis)).toBe(intent.id);
    expect((await noteVersionsQuery(intent.id, patientId)).map((v) => v.body)).toEqual([
      'Unfinished draft',
      'Current version',
      'First version',
    ]);
    await expect(commitNoteDraft('context-draft', intent.generation, intent.basis)).rejects.toThrow();
  });

  it('refuses a same-timestamp correction without touching the new note or history', async () => {
    const intent = await shown();
    t.db.update(notes).set({ body: 'Concurrent correction' }).where(eq(notes.id, intent.id)).run();
    const before = stored();
    await expect(restoreNoteVersion(intent.version, intent.basis, intent.generation)).rejects.toThrow();
    expect(stored()).toEqual(before);
  });

  it.each(['patient', 'note', 'version'] as const)(
    'refuses a deleted %s after confirmation was opened',
    async (kind) => {
      const intent = await shown();
      if (kind === 'patient') t.db.update(patients).set(softDelete()).where(eq(patients.id, patientId)).run();
      if (kind === 'note') t.db.update(notes).set(softDelete()).where(eq(notes.id, intent.id)).run();
      if (kind === 'version')
        t.db.update(noteVersions).set(softDelete()).where(eq(noteVersions.id, intent.version.id)).run();
      const before = stored();
      await expect(restoreNoteVersion(intent.version, intent.basis, intent.generation)).rejects.toThrow();
      expect(stored()).toEqual(before);
    },
  );

  it('refuses an altered selected snapshot even if its timestamp and id are unchanged', async () => {
    const intent = await shown();
    t.db
      .update(noteVersions)
      .set({ body: 'Altered source snapshot' })
      .where(eq(noteVersions.id, intent.version.id))
      .run();
    const before = stored();
    await expect(restoreNoteVersion(intent.version, intent.basis, intent.generation)).rejects.toThrow();
    expect(stored()).toEqual(before);
  });

  it('refuses a version belonging to another note or patient', async () => {
    const intent = await shown();
    const otherId = await createNote({ patientId: otherPatientId, type: 'general', body: 'Foreign source' });
    const other = (await noteVersionsQuery(otherId, otherPatientId))[0]!;
    const before = stored();
    await expect(restoreNoteVersion(other, intent.basis, intent.generation)).rejects.toThrow();
    expect(stored()).toEqual(before);
  });

  it('rejects the original dataset token after replacement even with identical rows', async () => {
    const intent = await shown();
    const replacement = reserveDatasetReplacement();
    replacement.committed();
    replacement.release();
    const before = stored();
    await expect(restoreNoteVersion(intent.version, intent.basis, intent.generation)).rejects.toThrow();
    expect(stored()).toEqual(before);
  });

  it('restores a valid original snapshot while retaining all intervening history', async () => {
    const intent = await shown();
    await restoreNoteVersion(intent.version, intent.basis, intent.generation);
    expect((await noteQuery(intent.id, patientId))[0]?.body).toBe('First version');
    expect((await noteVersionsQuery(intent.id, patientId)).map((v) => v.body)).toEqual([
      'First version',
      'Current version',
      'First version',
    ]);
  });
});
