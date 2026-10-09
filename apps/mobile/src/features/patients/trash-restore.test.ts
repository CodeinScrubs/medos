import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { eq } from 'drizzle-orm';

import { auditLog, captureInbox, encounters, notes, patients } from '@/db/schema';
import { createCapture, discardCapture, fileCaptureAsNote, restoreCapture } from '@/features/capture/queries';
import { openEncounter } from '@/features/encounters/queries';
import { createNote, deleteNote, restoreNote } from '@/features/notes/queries';
import { databaseRows } from '@/test/dataset-snapshot';
import { useTestDatabase } from '@/test/db-client';
import { createTestDatabase, type TestDatabase } from '@/test/sqljs';

import { createPatient, deletePatient, restorePatient } from './queries';

jest.mock('@/db/client', () => jest.requireActual('@/test/db-client'));
jest.mock('@/platform/notifications', () => jest.requireActual('@/test/mocks/notifications'));
let t: TestDatabase, patientId: string;
beforeEach(async () => {
  t = useTestDatabase(await createTestDatabase());
  patientId = await createPatient({ firstName: 'Synthetic', lastName: 'Restore context' });
});

describe('trash restore transactions', () => {
  it.each([restorePatient, restoreNote, restoreCapture])(
    'refuses a missing tombstone without an audit or mutation (%p)',
    async (restore) => {
      const before = databaseRows(t);
      await expect(restore('missing')).rejects.toThrow();
      expect(databaseRows(t)).toEqual(before);
    },
  );
  it('refuses alive rows and already-restored retries without touching them or duplicating audits', async () => {
    const noteId = await createNote({ patientId, type: 'general', body: 'Synthetic note' });
    const captureId = await createCapture({ patientId, text: 'Synthetic capture' });
    for (const [restore, id] of [
      [restorePatient, patientId],
      [restoreNote, noteId],
      [restoreCapture, captureId],
    ] as const) {
      const before = databaseRows(t);
      await expect(restore(id)).rejects.toThrow();
      expect(databaseRows(t)).toEqual(before);
    }
    await deleteNote(noteId);
    await discardCapture(captureId);
    await restoreNote(noteId);
    await restoreCapture(captureId);
    await deletePatient(patientId);
    await restorePatient(patientId);
    const before = databaseRows(t);
    for (const [restore, id] of [
      [restorePatient, patientId],
      [restoreNote, noteId],
      [restoreCapture, captureId],
    ] as const)
      await expect(restore(id)).rejects.toThrow();
    expect(databaseRows(t)).toEqual(before);
    expect(
      t.db
        .select()
        .from(auditLog)
        .all()
        .filter((r) => r.action.endsWith('.restored')),
    ).toHaveLength(3);
  });
  it('compares the full shown tombstone even when an edit keeps its timestamp', async () => {
    const noteId = await createNote({ patientId, type: 'general', body: 'Synthetic shown note' });
    const captureId = await createCapture({ text: 'Synthetic shown capture' });
    await deleteNote(noteId);
    await discardCapture(captureId);
    await deletePatient(patientId);
    const patient = t.db.select().from(patients).where(eq(patients.id, patientId)).get()!;
    const note = t.db.select().from(notes).where(eq(notes.id, noteId)).get()!;
    const capture = t.db.select().from(captureInbox).where(eq(captureInbox.id, captureId)).get()!;
    t.db.update(patients).set({ summary: 'Synthetic newer context' }).where(eq(patients.id, patientId)).run();
    t.db.update(notes).set({ body: 'Synthetic newer note' }).where(eq(notes.id, noteId)).run();
    t.db.update(captureInbox).set({ text: 'Synthetic newer capture' }).where(eq(captureInbox.id, captureId)).run();
    const before = databaseRows(t);
    await expect(restorePatient(patientId, patient)).rejects.toThrow('تغییر کرده');
    await expect(restoreNote(noteId, note)).rejects.toThrow('تغییر کرده');
    await expect(restoreCapture(captureId, capture)).rejects.toThrow('تغییر کرده');
    expect(databaseRows(t)).toEqual(before);
  });
  it('keeps a note and capture deleted until their original patient is restored', async () => {
    const noteId = await createNote({ patientId, type: 'general', body: 'Synthetic note' });
    const captureId = await createCapture({ patientId, text: 'Synthetic capture' });
    await deleteNote(noteId);
    await discardCapture(captureId);
    await deletePatient(patientId);
    const before = databaseRows(t);
    await expect(restoreNote(noteId)).rejects.toThrow();
    await expect(restoreCapture(captureId)).rejects.toThrow();
    expect(databaseRows(t)).toEqual(before);
    await restorePatient(patientId);
    await restoreNote(noteId);
    await restoreCapture(captureId);
    expect(t.db.select().from(notes).where(eq(notes.id, noteId)).get()?.patientId).toBe(patientId);
    expect(t.db.select().from(captureInbox).where(eq(captureInbox.id, captureId)).get()?.patientId).toBe(patientId);
  });
  it('refuses a cross-patient encounter and preserves the note association', async () => {
    const other = await createPatient({ firstName: 'Synthetic', lastName: 'Other context' });
    const episode = await openEncounter({ patientId: other, kind: 'admission' });
    const id = await createNote({
      patientId,
      encounterId: episode,
      type: 'general',
      body: 'Synthetic invalid association',
    });
    await deleteNote(id);
    const before = databaseRows(t);
    await expect(restoreNote(id)).rejects.toThrow();
    expect(databaseRows(t)).toEqual(before);
  });
  it('does not detach a note from a separately deleted encounter', async () => {
    const episode = await openEncounter({ patientId, kind: 'admission' });
    const id = await createNote({ patientId, encounterId: episode, type: 'general', body: 'Synthetic episode note' });
    await deleteNote(id);
    t.db.update(encounters).set({ deletedAt: new Date() }).where(eq(encounters.id, episode)).run();
    const before = databaseRows(t);
    await expect(restoreNote(id)).rejects.toThrow();
    expect(databaseRows(t)).toEqual(before);
  });
  it('never reopens or duplicates a deleted filing destination when restoring its capture', async () => {
    const id = await createCapture({ patientId, text: 'Synthetic filed capture' });
    const noteId = await fileCaptureAsNote(id);
    await discardCapture(id);
    await deleteNote(noteId);
    const before = databaseRows(t);
    await expect(restoreCapture(id)).rejects.toThrow();
    expect(databaseRows(t)).toEqual(before);
    await restoreNote(noteId);
    await restoreCapture(id);
    expect(t.db.select().from(captureInbox).where(eq(captureInbox.id, id)).get()).toMatchObject({
      filedAs: 'note',
      filedId: noteId,
      deletedAt: null,
    });
    expect(t.db.select().from(notes).all()).toHaveLength(1);
  });
  it('refuses a filed destination whose patient changed while its capture was deleted', async () => {
    const id = await createCapture({ patientId, text: 'Synthetic filed capture' });
    const noteId = await fileCaptureAsNote(id);
    await discardCapture(id);
    const other = await createPatient({ firstName: 'Synthetic', lastName: 'Other owner' });
    t.db.update(notes).set({ patientId: other }).where(eq(notes.id, noteId)).run();
    const before = databaseRows(t);
    await expect(restoreCapture(id)).rejects.toThrow();
    expect(databaseRows(t)).toEqual(before);
  });
  it('rolls back the patient revival if authoritative status publication fails', async () => {
    const episode = await openEncounter({ patientId, kind: 'admission' });
    await deletePatient(patientId);
    t.db.update(encounters).set({ isActive: false }).where(eq(encounters.id, episode)).run();
    t.sqlite.exec(
      "CREATE TRIGGER fail_status_restore BEFORE UPDATE OF status ON patients BEGIN SELECT RAISE(ABORT,'Synthetic status restore'); END;",
    );
    const before = databaseRows(t);
    await expect(restorePatient(patientId)).rejects.toThrow();
    expect(databaseRows(t)).toEqual(before);
    t.sqlite.exec('DROP TRIGGER fail_status_restore');
    await restorePatient(patientId);
    expect(t.db.select().from(patients).where(eq(patients.id, patientId)).get()).toMatchObject({
      deletedAt: null,
      status: 'outpatient',
    });
  });
});
