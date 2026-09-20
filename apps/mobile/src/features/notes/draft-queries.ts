import { and, desc, eq, isNull } from 'drizzle-orm';

import { db } from '@/db/client';
import { noteDrafts, type DraftVoice, type NoteDraft, type NoteType } from '@/db/schema';
import { softDelete, stamps, touch } from '@/lib/ids';

/*
 * The unsaved half of a note.
 *
 * One row per thing being written: per note for an edit, and one per patient
 * for a note that does not exist yet. The editor owns its row's id for as long
 * as it is open and writes the whole shape every time — a draft is small, and
 * a partial update would mean tracking which fields changed in order to save
 * two hundred bytes.
 *
 * Nothing here touches `notes`. A draft becomes a note only when the user
 * saves, and the draft is dropped at that point: what is in the chart is the
 * record, and keeping a stale copy of it invites showing the wrong one.
 */

const alive = isNull(noteDrafts.deletedAt);

export type NoteDraftFields = {
  type: NoteType;
  title: string | null;
  body: string | null;
  subjective: string | null;
  objective: string | null;
  assessment: string | null;
  plan: string | null;
  noteDate: Date | null;
  doctorId: string | null;
  specialty: string | null;
  isPinned: boolean;
  isDraft: boolean;
  voices: DraftVoice[];
};

/** The draft for a note being edited, or for the next new note of a patient. */
export function noteDraftQuery(patientId: string, noteId: string | null) {
  return db
    .select()
    .from(noteDrafts)
    .where(
      and(
        alive,
        eq(noteDrafts.patientId, patientId),
        noteId ? eq(noteDrafts.noteId, noteId) : isNull(noteDrafts.noteId),
      ),
    )
    .orderBy(desc(noteDrafts.updatedAt))
    .limit(1);
}

/** Every draft still waiting, newest first — what the user has not finished. */
export function openNoteDraftsQuery(limit = 20) {
  return db.select().from(noteDrafts).where(alive).orderBy(desc(noteDrafts.updatedAt)).limit(limit);
}

/**
 * Write the draft. One statement, so an interrupted app finds either the
 * previous version of the row or this one, never half of it.
 */
export async function writeNoteDraft(
  id: string,
  target: { patientId: string; noteId: string | null },
  fields: NoteDraftFields,
): Promise<void> {
  const now = new Date();
  const values = { ...fields, ...target };
  await db
    .insert(noteDrafts)
    .values({ id, ...stamps(now), ...values })
    .onConflictDoUpdate({ target: noteDrafts.id, set: { ...values, ...touch(now) } });
}

/** The draft is no longer wanted: saved into a note, or thrown away. */
export async function discardNoteDraft(id: string): Promise<void> {
  await db.update(noteDrafts).set(softDelete()).where(eq(noteDrafts.id, id));
}

/** Does this draft hold anything a person would miss? */
export function draftHasContent(
  fields: Pick<NoteDraft, 'title' | 'body' | 'subjective' | 'objective' | 'assessment' | 'plan' | 'voices'>,
): boolean {
  const text = [fields.title, fields.body, fields.subjective, fields.objective, fields.assessment, fields.plan];
  return text.some((v) => (v ?? '').trim().length > 0) || (fields.voices ?? []).length > 0;
}
