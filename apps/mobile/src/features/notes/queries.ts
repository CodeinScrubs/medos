import { and, desc, eq, isNull } from 'drizzle-orm';

import { db, type DbTransaction } from '@/db/client';
import { noteDrafts, noteVersions, notes, type NoteType } from '@/db/schema';
import { resolveActiveEncounterId } from '@/features/encounters/queries';
import { newId, softDelete, stamps, touch } from '@/lib/ids';

import { noteSearchText } from './logic';
import { writeNoteVersion } from './version-queries';

const alive = isNull(notes.deletedAt);

export function patientNotesQuery(patientId: string) {
  return db
    .select()
    .from(notes)
    .where(and(alive, eq(notes.patientId, patientId)))
    .orderBy(desc(notes.isPinned), desc(notes.noteDate));
}

/** Bedside recency is clinical time, independent of pins in the full notes list. */
export function latestPatientNoteQuery(patientId: string) {
  return db
    .select()
    .from(notes)
    .where(and(alive, eq(notes.patientId, patientId), eq(notes.isDraft, false)))
    .orderBy(desc(notes.noteDate), desc(notes.createdAt), desc(notes.id))
    .limit(1);
}

export function noteQuery(id: string) {
  return db
    .select()
    .from(notes)
    .where(and(isNull(notes.deletedAt), eq(notes.id, id)))
    .limit(1);
}

export type NoteInput = {
  patientId: string;
  encounterId?: string | null;
  type: NoteType;
  title?: string | null;
  body?: string | null;
  subjective?: string | null;
  objective?: string | null;
  assessment?: string | null;
  plan?: string | null;
  noteDate?: Date;
  doctorId?: string | null;
  specialty?: string | null;
  isPinned?: boolean;
  isDraft?: boolean;
};

export async function createNote(input: NoteInput): Promise<string> {
  return db.transaction((tx) => createNoteInTransaction(tx, input));
}

/** Also used when a capture and its new note must commit together. */
export function createNoteInTransaction(tx: DbTransaction, input: NoteInput): string {
  const id = newId();
  tx.insert(notes)
    .values({
      id,
      ...stamps(),
      patientId: input.patientId,
      // Undefined means "whatever admission is active"; null means explicitly none.
      encounterId: input.encounterId !== undefined ? input.encounterId : resolveActiveEncounterId(input.patientId, tx),
      type: input.type,
      title: input.title ?? null,
      body: input.body ?? null,
      subjective: input.subjective ?? null,
      objective: input.objective ?? null,
      assessment: input.assessment ?? null,
      plan: input.plan ?? null,
      noteDate: input.noteDate ?? new Date(),
      doctorId: input.doctorId ?? null,
      specialty: input.specialty ?? null,
      isPinned: input.isPinned ?? false,
      isDraft: input.isDraft ?? false,
      searchText: noteSearchText(input),
    })
    .run();
  // The first version is what the note said when it entered the chart.
  const written = tx.select().from(notes).where(eq(notes.id, id)).get()!;
  writeNoteVersion(tx, written, 'created');
  return id;
}

export async function updateNote(id: string, input: Partial<NoteInput>): Promise<void> {
  db.transaction((tx) => updateNoteInTransaction(tx, id, input));
}

export function updateNoteInTransaction(tx: DbTransaction, id: string, input: Partial<NoteInput>): void {
  const current = tx
    .select()
    .from(notes)
    .where(and(alive, eq(notes.id, id)))
    .get();
  if (!current) throw new Error(`Note ${id} not found`);

  tx.update(notes)
    .set({ ...input, ...touch(), searchText: noteSearchText({ ...current, ...input }) })
    .where(and(alive, eq(notes.id, id)))
    .run();

  // After the write, from the row itself: a version has to say what the note
  // says, not what this call meant to change.
  const updated = tx.select().from(notes).where(eq(notes.id, id)).get()!;
  writeNoteVersion(tx, updated, 'edited');
}

/**
 * Put an older version back.
 *
 * The current text is not thrown away — it is already a version, and the
 * restore adds another one on top saying where it came from. Nothing in this
 * table is ever removed, so "undo the restore" is just another restore.
 */
export async function restoreNoteVersion(versionId: string): Promise<void> {
  db.transaction((tx) => {
    const version = tx
      .select()
      .from(noteVersions)
      .where(and(isNull(noteVersions.deletedAt), eq(noteVersions.id, versionId)))
      .get();
    if (!version) throw new Error(`Note version ${versionId} not found`);
    const current = tx
      .select()
      .from(notes)
      .where(and(alive, eq(notes.id, version.noteId)))
      .get();
    if (!current) throw new Error(`Note ${version.noteId} not found`);

    const fields = {
      type: version.type,
      title: version.title,
      body: version.body,
      subjective: version.subjective,
      objective: version.objective,
      assessment: version.assessment,
      plan: version.plan,
      noteDate: version.noteDate ?? current.noteDate,
      doctorId: version.doctorId,
      specialty: version.specialty,
      isPinned: version.isPinned ?? current.isPinned,
      isDraft: version.isDraft ?? current.isDraft,
    };

    tx.update(notes)
      .set({ ...fields, ...touch(), searchText: noteSearchText(fields) })
      .where(and(alive, eq(notes.id, version.noteId)))
      .run();

    /*
     * Any unsaved edit of this note is now older than what the note says, and
     * the editor reads the draft first — reopening it would show the text the
     * restore was meant to replace, and saving would put it back. The restored
     * text is in the history either way, but showing someone the opposite of
     * what they just asked for is its own kind of wrong.
     */
    tx.update(noteDrafts)
      .set(softDelete())
      .where(and(isNull(noteDrafts.deletedAt), eq(noteDrafts.noteId, version.noteId)))
      .run();

    const restored = tx.select().from(notes).where(eq(notes.id, version.noteId)).get()!;
    writeNoteVersion(tx, restored, 'restored', versionId);
  });
}

export async function setNotePinned(id: string, isPinned: boolean): Promise<void> {
  await updateNote(id, { isPinned });
}

export async function deleteNote(id: string): Promise<void> {
  await db.update(notes).set(softDelete()).where(eq(notes.id, id));
}

/** Rebuild every note's search index; see features/search/reindex.ts. */
export async function reindexNotes(): Promise<number> {
  const rows = await db.select().from(notes);
  let changed = 0;
  db.transaction((tx) => {
    for (const n of rows) {
      const next = noteSearchText(n);
      if (next === n.searchText) continue;
      tx.update(notes).set({ searchText: next }).where(eq(notes.id, n.id)).run();
      changed += 1;
    }
  });
  return changed;
}
