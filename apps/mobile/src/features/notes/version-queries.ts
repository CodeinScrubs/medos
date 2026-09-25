import { and, asc, desc, eq, isNull } from 'drizzle-orm';
import { z } from 'zod';

import { audit } from '@/db/audit';
import { db, type DbTransaction } from '@/db/client';
import { noteVersions, notes, type Note, type NoteVersion } from '@/db/schema';
import { defineSetting, readSetting, writeSetting } from '@/db/settings';
import { newId, stamps } from '@/lib/ids';

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

type VersionSnapshot = Pick<NoteVersion, keyof VersionedFields>;

/** Preserve field boundaries and exact text; search normalisation loses both. */
function versionContent(fields: VersionSnapshot): string {
  return JSON.stringify({
    ...fieldsOf(fields),
    noteDate: fields.noteDate?.getTime() ?? null,
  });
}

/** A diagnostic fingerprint only. Equality is checked against the snapshot itself. */
export function contentHashOf(fields: VersionSnapshot): string {
  const source = versionContent(fields);
  let hash = 0x811c9dc5;
  for (let i = 0; i < source.length; i += 1) {
    hash ^= source.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `${hash.toString(16).padStart(8, '0')}-${source.length}`;
}

const fieldsOf = (note: VersionSnapshot): VersionSnapshot => ({
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

/**
 * Record what the note says now.
 *
 * Returns the id of the version it wrote, or null when the note already said
 * exactly this — saving a note twice without changing anything is not a new
 * version of anything.
 */
export function writeNoteVersion(
  tx: DbTransaction,
  note: { id: string; patientId: string } & VersionedFields,
  reason: NoteVersion['reason'],
  restoredFromId?: string,
): string | null {
  const fields = fieldsOf(note);
  const contentHash = contentHashOf(fields);

  const latest = tx
    .select()
    .from(noteVersions)
    .where(and(isNull(noteVersions.deletedAt), eq(noteVersions.noteId, note.id)))
    .orderBy(desc(noteVersions.createdAt))
    .get();
  // Read old snapshots too: legacy hashes used lossy search text. A hash
  // collision or an old hash must never suppress an actual clinical edit.
  if (latest && versionContent(latest) === versionContent(fields)) return null;

  const id = newId();
  // Multiple saves can share a wall-clock millisecond. Keep a strict local
  // order without changing the clinical noteDate or rewriting old history.
  const now = new Date(Math.max(Date.now(), (latest?.createdAt.getTime() ?? 0) + 1));
  tx.insert(noteVersions)
    .values({
      id,
      ...stamps(now),
      noteId: note.id,
      patientId: note.patientId,
      reason,
      restoredFromId: restoredFromId ?? null,
      ...fields,
      contentHash,
    })
    .run();
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
