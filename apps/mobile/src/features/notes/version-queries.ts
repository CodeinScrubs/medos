import { and, asc, desc, eq, isNull } from 'drizzle-orm';
import { z } from 'zod';

import { audit } from '@/db/audit';
import { db } from '@/db/client';
import { noteVersions, notes, type Note, type NoteVersion } from '@/db/schema';
import { defineSetting, readSetting, writeSetting } from '@/db/settings';
import { newId, stamps } from '@/lib/ids';

import { noteSearchText } from './logic';

/*
 * What a note said, every time it said something different.
 *
 * The owner asked for all of it kept, with nothing pruned — so there is no
 * retention rule here, and there is deliberately no function that deletes a
 * version. Deleting a note soft-deletes the note; what it said stays.
 *
 * Versions are written by `createNote` and `updateNote`, which is to say on
 * save. Autosave writes to `note_drafts` and does not make versions: a version
 * per keystroke would bury the three that matter under four hundred that do
 * not.
 */

/** The fields a version copies. Everything else about a note is bookkeeping. */
export type VersionedFields = Pick<
  Note,
  | 'type'
  | 'title'
  | 'body'
  | 'subjective'
  | 'objective'
  | 'assessment'
  | 'plan'
  | 'noteDate'
  | 'doctorId'
  | 'specialty'
  | 'isPinned'
  | 'isDraft'
>;

/**
 * A stable fingerprint of what the note says.
 *
 * Not a cryptographic hash: nothing here defends against a forged note, it
 * only answers "is this the same text as last time". Built from the same
 * normalisation the search index uses, so a note that differs only in Arabic
 * versus Persian ی does not count as a new version.
 */
export function contentHashOf(fields: VersionedFields): string {
  const text = noteSearchText(fields);
  const stamp = `${fields.type}|${fields.noteDate?.getTime() ?? 0}|${fields.isPinned ? 1 : 0}|${fields.isDraft ? 1 : 0}`;
  const source = `${stamp}|${text}`;
  // FNV-1a, 32 bits, written out as hex with the length beside it. Two texts
  // that collide on the hash are unlikely to also share a length.
  let hash = 0x811c9dc5;
  for (let i = 0; i < source.length; i += 1) {
    hash ^= source.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `${hash.toString(16).padStart(8, '0')}-${source.length}`;
}

const fieldsOf = (note: VersionedFields): VersionedFields => ({
  type: note.type,
  title: note.title,
  body: note.body,
  subjective: note.subjective,
  objective: note.objective,
  assessment: note.assessment,
  plan: note.plan,
  noteDate: note.noteDate,
  doctorId: note.doctorId,
  specialty: note.specialty,
  isPinned: note.isPinned,
  isDraft: note.isDraft,
});

/** Every version of one note, newest first. */
export function noteVersionsQuery(noteId: string) {
  return db
    .select()
    .from(noteVersions)
    .where(and(isNull(noteVersions.deletedAt), eq(noteVersions.noteId, noteId)))
    .orderBy(desc(noteVersions.createdAt));
}

export function noteVersionQuery(id: string) {
  return db
    .select()
    .from(noteVersions)
    .where(and(isNull(noteVersions.deletedAt), eq(noteVersions.id, id)))
    .limit(1);
}

/**
 * Record what the note says now.
 *
 * Returns the id of the version it wrote, or null when the note already said
 * exactly this — saving a note twice without changing anything is not a new
 * version of anything.
 */
export async function writeNoteVersion(
  note: { id: string; patientId: string } & VersionedFields,
  reason: NoteVersion['reason'],
  restoredFromId?: string,
): Promise<string | null> {
  const fields = fieldsOf(note);
  const contentHash = contentHashOf(fields);

  const [latest] = await db
    .select({ contentHash: noteVersions.contentHash })
    .from(noteVersions)
    .where(and(isNull(noteVersions.deletedAt), eq(noteVersions.noteId, note.id)))
    .orderBy(desc(noteVersions.createdAt))
    .limit(1);
  if (latest?.contentHash === contentHash) return null;

  const id = newId();
  await db.insert(noteVersions).values({
    id,
    ...stamps(),
    noteId: note.id,
    patientId: note.patientId,
    reason,
    restoredFromId: restoredFromId ?? null,
    ...fields,
    contentHash,
  });
  return id;
}

/**
 * Give notes written before this table existed a first version.
 *
 * Without it their history would start at the next edit, and the version list
 * would imply the note appeared out of nowhere in its current shape. Marked
 * `baseline` so it is not mistaken for a save anybody made: the time on it is
 * the note's own creation time, not today.
 */
export async function backfillNoteVersions(): Promise<number> {
  const rows = await db.select().from(notes).where(isNull(notes.deletedAt)).orderBy(asc(notes.createdAt));

  let written = 0;
  for (const note of rows) {
    const [existing] = await db
      .select({ id: noteVersions.id })
      .from(noteVersions)
      .where(eq(noteVersions.noteId, note.id))
      .limit(1);
    if (existing) continue;

    await db.insert(noteVersions).values({
      id: newId(),
      createdAt: note.createdAt,
      updatedAt: note.createdAt,
      deletedAt: null,
      noteId: note.id,
      patientId: note.patientId,
      reason: 'baseline',
      restoredFromId: null,
      ...fieldsOf(note),
      contentHash: contentHashOf(note),
    });
    written += 1;
  }
  return written;
}

/*
 * Run once, on the same pattern as the search index and the lab flags: a
 * number in `settings` that says which backfill this database has had.
 */
export const NOTE_VERSION_BASELINE = 1;

const baselineVersion = defineSetting('notes.versionBaseline', z.number().int().min(0), 0);

export async function backfillNoteVersionsIfNeeded(): Promise<void> {
  if ((await readSetting(baselineVersion)) === NOTE_VERSION_BASELINE) return;
  const written = await backfillNoteVersions();
  await writeSetting(baselineVersion, NOTE_VERSION_BASELINE);
  if (written > 0) await audit('note.versionsBackfilled', { detail: { written } });
}
