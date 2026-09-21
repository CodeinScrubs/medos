import { and, desc, eq, isNull } from 'drizzle-orm';

import { db } from '@/db/client';
import { notes, type NoteType } from '@/db/schema';
import { resolveActiveEncounterId } from '@/features/encounters/queries';
import { newId, softDelete, stamps, touch } from '@/lib/ids';

import { discardNoteDraftFor } from './draft-queries';
import { noteSearchText } from './logic';
import { noteVersionQuery, writeNoteVersion } from './version-queries';

const alive = isNull(notes.deletedAt);

export function patientNotesQuery(patientId: string) {
  return db
    .select()
    .from(notes)
    .where(and(alive, eq(notes.patientId, patientId)))
    .orderBy(desc(notes.isPinned), desc(notes.noteDate));
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
  const id = newId();
  await db.insert(notes).values({
    id,
    ...stamps(),
    patientId: input.patientId,
    // Undefined means "whatever admission is active"; null means explicitly none.
    encounterId: input.encounterId !== undefined ? input.encounterId : await resolveActiveEncounterId(input.patientId),
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
  });
  // The first version is what the note said when it entered the chart.
  const [written] = await noteQuery(id);
  if (written) await writeNoteVersion(written, 'created');
  return id;
}

export async function updateNote(id: string, input: Partial<NoteInput>): Promise<void> {
  const current = (
    await db
      .select()
      .from(notes)
      .where(and(alive, eq(notes.id, id)))
      .limit(1)
  )[0];
  if (!current) throw new Error(`Note ${id} not found`);

  await db
    .update(notes)
    .set({ ...input, ...touch(), searchText: noteSearchText({ ...current, ...input }) })
    .where(and(alive, eq(notes.id, id)));

  // After the write, from the row itself: a version has to say what the note
  // says, not what this call meant to change.
  const [updated] = await noteQuery(id);
  if (updated) await writeNoteVersion(updated, 'edited');
}

/**
 * Put an older version back.
 *
 * The current text is not thrown away — it is already a version, and the
 * restore adds another one on top saying where it came from. Nothing in this
 * table is ever removed, so "undo the restore" is just another restore.
 */
export async function restoreNoteVersion(versionId: string): Promise<void> {
  const [version] = await noteVersionQuery(versionId);
  if (!version) throw new Error(`Note version ${versionId} not found`);
  const [current] = await noteQuery(version.noteId);
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

  await db
    .update(notes)
    .set({ ...fields, ...touch(), searchText: noteSearchText(fields) })
    .where(and(alive, eq(notes.id, version.noteId)));

  /*
   * Any unsaved edit of this note is now older than what the note says, and
   * the editor reads the draft first — reopening it would show the text the
   * restore was meant to replace, and saving would put it back. The restored
   * text is in the history either way, but showing someone the opposite of
   * what they just asked for is its own kind of wrong.
   */
  await discardNoteDraftFor(version.noteId);

  const [restored] = await noteQuery(version.noteId);
  if (restored) await writeNoteVersion(restored, 'restored', versionId);
}

export async function setNotePinned(id: string, isPinned: boolean): Promise<void> {
  await db
    .update(notes)
    .set({ isPinned, ...touch() })
    .where(and(alive, eq(notes.id, id)));
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
