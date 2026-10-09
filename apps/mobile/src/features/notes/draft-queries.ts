import { and, desc, eq, isNull, ne, or, sql } from 'drizzle-orm';

import { auditInTransaction } from '@/db/audit';
import { db, type DbTransaction } from '@/db/client';
import {
  attachments,
  noteDrafts,
  notes,
  patients,
  recordingJobs,
  encounters,
  type Note,
  type Encounter,
  type DraftVoice,
  type NoteDraft,
  type NoteType,
} from '@/db/schema';
import { resolveActiveEncounterId } from '@/features/encounters/queries';
import { assertDatasetWrite, datasetGeneration, withDatasetWrite } from '@/lib/dataset-write';
import type { DateTimeInput } from '@/lib/date-input';
import { softDelete, stamps, touch } from '@/lib/ids';

import {
  decodeNoteOrigin,
  encodeNoteOrigin,
  initialNoteOrigin,
  NoteDraftConflict,
  type NoteDraftOrigin,
} from './draft-context';
import { sameNoteSnapshot } from './logic';

/*
 * The unsaved half of a note.
 *
 * One row per writing intent. Concurrent editors can retain distinct rows;
 * recovery cards carry the exact draft ID instead of always opening the latest.
 * The editor owns its row's id for as long
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
  rawDate?: DateTimeInput | null;
};

/** The draft for a note being edited, or for the next new note of a patient. */
export function noteDraftQuery(patientId: string, noteId: string | null, draftId?: string) {
  return db
    .select()
    .from(noteDrafts)
    .where(
      and(
        alive,
        eq(noteDrafts.patientId, patientId),
        noteId ? eq(noteDrafts.noteId, noteId) : isNull(noteDrafts.noteId),
        draftId !== undefined ? eq(noteDrafts.id, draftId) : undefined,
      ),
    )
    .orderBy(desc(noteDrafts.updatedAt))
    .limit(1);
}

/**
 * Every draft still waiting, newest first, with the patient it belongs to.
 *
 * The join is not decoration: a draft for a deleted patient would otherwise
 * sit on Today for ever, and a card with no name on it makes the owner open
 * each one to find out whose it is.
 */
export type OpenNoteDraftCursor = { at: number; id: string };

export function openNoteDraftsQuery(limit = 20, cursor?: OpenNoteDraftCursor) {
  const voiceCount = sql<number>`(SELECT count(*) FROM ${attachments}
    WHERE ${attachments.entityType} = 'note_draft' AND ${attachments.entityId} = ${noteDrafts.id}
    AND ${attachments.patientId} = ${noteDrafts.patientId} AND ${attachments.kind} = 'voice'
    AND ${attachments.deletedAt} IS NULL)`;
  // Match String.trim(): filtering after LIMIT lets empty recorder drafts hide real work.
  const whitespace =
    ' \t\n\v\f\r\u00a0\u1680\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a\u2028\u2029\u202f\u205f\u3000\ufeff';
  const meaningful = or(
    ...[
      noteDrafts.title,
      noteDrafts.body,
      noteDrafts.subjective,
      noteDrafts.objective,
      noteDrafts.assessment,
      noteDrafts.plan,
    ].map((column) => sql`length(trim(coalesce(${column}, ''), ${whitespace})) > 0`),
    sql`coalesce(json_array_length(${noteDrafts.voices}), 0) > 0`,
    sql`${voiceCount} > 0`,
  );
  return db
    .select({ draft: noteDrafts, patient: patients, voiceCount })
    .from(noteDrafts)
    .innerJoin(patients, eq(noteDrafts.patientId, patients.id))
    .where(
      and(
        alive,
        isNull(patients.deletedAt),
        meaningful,
        cursor
          ? sql`(${noteDrafts.updatedAt} < ${cursor.at} OR
              (${noteDrafts.updatedAt} = ${cursor.at} AND ${noteDrafts.id} < ${cursor.id}))`
          : undefined,
      ),
    )
    .orderBy(desc(noteDrafts.updatedAt), desc(noteDrafts.id))
    .limit(limit);
}

/**
 * Point a draft at the note it became.
 *
 * Called the moment the note is created, before its voice notes are attached.
 * If that attaching fails and the editor is left, the draft must not still
 * look like "a new note for this patient" — coming back and saving it would
 * write the note a second time.
 */
export async function retargetNoteDraft(id: string, noteId: string): Promise<void> {
  db.transaction((tx) => {
    const draft = tx
      .select()
      .from(noteDrafts)
      .where(and(eq(noteDrafts.id, id), alive))
      .get();
    if (!draft) throw new Error('پیش‌نویس در دسترس نیست؛ مقصد تغییر نکرد.');
    if (draft.noteId !== noteId) {
      requireNoPendingDraftRecording(tx, id);
      if (draftVoiceRowsInTransaction(tx, id).length)
        throw new Error('این پیش‌نویس وویس دارد؛ ابتدا آن را به‌طور کامل در پرونده ثبت کنید.');
    }
    if (
      !tx
        .select({ id: notes.id })
        .from(notes)
        .where(and(eq(notes.id, noteId), eq(notes.patientId, draft.patientId), isNull(notes.deletedAt)))
        .get()
    )
      throw new Error('نوت مقصد در دسترس نیست؛ پیش‌نویس تغییر نکرد.');
    tx.update(noteDrafts)
      .set({
        noteId,
        origin: encodeNoteOrigin(
          initialNoteOrigin(draft.patientId, tx.select().from(notes).where(eq(notes.id, noteId)).get()!, null),
        ),
        revision: draft.revision + 1,
        ...touch(),
      })
      .where(eq(noteDrafts.id, id))
      .run();
  });
}

/** Text autosave never owns this metadata: recovery cannot be overwritten by a voices: [] patch. */
export function draftVoiceRowsInTransaction(tx: DbTransaction, id: string) {
  return tx
    .select()
    .from(attachments)
    .where(and(eq(attachments.entityType, 'note_draft'), eq(attachments.entityId, id), isNull(attachments.deletedAt)))
    .all();
}

/** Imperative capture/publication checks include acknowledged media, not just legacy JSON voices. */
export function draftHasSavedVoice(id: string): boolean {
  return !!db
    .select({ id: attachments.id })
    .from(attachments)
    .where(
      and(
        eq(attachments.entityType, 'note_draft'),
        eq(attachments.entityId, id),
        eq(attachments.kind, 'voice'),
        isNull(attachments.deletedAt),
      ),
    )
    .get();
}

/** Publication, retirement and retargeting share the same synchronous pending-state gate. */
export function requireNoPendingDraftRecording(tx: DbTransaction, id: string): void {
  if (
    tx
      .select({ id: recordingJobs.id })
      .from(recordingJobs)
      .where(
        and(
          eq(recordingJobs.entityType, 'note_draft'),
          eq(recordingJobs.entityId, id),
          or(
            and(isNull(recordingJobs.deletedAt), ne(recordingJobs.state, 'saved')),
            eq(recordingJobs.state, 'discarding'),
          ),
        ),
      )
      .get()
  )
    throw new Error('وویس این پیش‌نویس هنوز ذخیره نشده است؛ ابتدا ذخیره یا لغو وویس را کامل کنید.');
}

/**
 * Write the draft in one transaction, so an interrupted app finds either the
 * previous version of the row or this one, never half of it.
 */
export async function writeNoteDraft(
  id: string,
  target: { patientId: string; noteId: string | null; origin?: NoteDraftOrigin | null; revision?: number },
  fields: NoteDraftFields,
  generation = datasetGeneration(),
): Promise<number> {
  assertDatasetWrite(generation);
  const now = new Date();
  return db.transaction((tx) => {
    const current = tx.select().from(noteDrafts).where(eq(noteDrafts.id, id)).get();
    if (
      current &&
      (current.deletedAt ||
        current.patientId !== target.patientId ||
        (current.noteId && target.noteId && current.noteId !== target.noteId))
    )
      throw new Error('این پیش‌نویس تغییر کرده یا بسته شده است؛ نوشته روی صفحه باقی مانده است.');
    if (
      !tx
        .select({ id: patients.id })
        .from(patients)
        .where(and(eq(patients.id, target.patientId), isNull(patients.deletedAt)))
        .get()
    )
      throw new Error('پروندهٔ بیمار در دسترس نیست؛ پیش‌نویس ذخیره نشد.');
    const noteId = current?.noteId ?? target.noteId;
    if (
      current &&
      (!Number.isSafeInteger(current.revision) || current.revision < 0 || current.revision >= Number.MAX_SAFE_INTEGER)
    )
      throw new NoteDraftConflict();
    if (target.revision !== undefined && target.revision !== (current?.revision ?? 0)) throw new NoteDraftConflict();
    const note = noteId ? (tx.select().from(notes).where(eq(notes.id, noteId)).get() ?? null) : null;
    if (current && current.noteId !== noteId) {
      requireNoPendingDraftRecording(tx, id);
      if (draftVoiceRowsInTransaction(tx, id).length) throw new Error('این پیش‌نویس وویس دارد؛ مقصد آن تغییر نکرد.');
    }
    if (
      noteId &&
      !tx
        .select({ id: notes.id })
        .from(notes)
        .where(and(eq(notes.id, noteId), eq(notes.patientId, target.patientId), isNull(notes.deletedAt)))
        .get()
    )
      throw new Error('نوت مقصد در دسترس نیست؛ پیش‌نویس ذخیره نشد.');
    let origin = current?.origin ?? null;
    if (!current)
      origin = encodeNoteOrigin(
        target.origin ?? initialNoteOrigin(target.patientId, note, resolveActiveEncounterId(target.patientId, tx)),
      );
    else if (current.noteId !== noteId) origin = encodeNoteOrigin(initialNoteOrigin(target.patientId, note, null));
    else if (
      target.origin &&
      (!origin || encodeNoteOrigin(target.origin) !== encodeNoteOrigin(decodeNoteOrigin(origin)))
    )
      throw new NoteDraftConflict();
    if (origin) {
      const context = decodeNoteOrigin(origin);
      if (context.patientId !== target.patientId || context.noteId !== noteId) throw new NoteDraftConflict();
    }
    const revision = (current?.revision ?? 0) + 1;
    const values = { ...fields, patientId: target.patientId, noteId, origin, revision };
    tx.insert(noteDrafts)
      .values({ id, ...stamps(now), ...values })
      .onConflictDoUpdate({ target: noteDrafts.id, set: { ...values, ...touch(now) } })
      .run();
    return revision;
  });
}

export type NoteDraftComparison = {
  draft: NoteDraft;
  note: Note | null;
  encounterId: string | null;
  encounter: Encounter | null;
};
function inspectDraft(tx: DbTransaction, id: string, patientId: string, noteId: string | null): NoteDraftComparison {
  const draft = tx
    .select()
    .from(noteDrafts)
    .where(and(eq(noteDrafts.id, id), alive))
    .get();
  if (
    !draft ||
    !Number.isSafeInteger(draft.revision) ||
    draft.revision < 0 ||
    draft.revision >= Number.MAX_SAFE_INTEGER ||
    draft.patientId !== patientId ||
    draft.noteId !== noteId ||
    !tx
      .select({ id: patients.id })
      .from(patients)
      .where(and(eq(patients.id, patientId), isNull(patients.deletedAt)))
      .get()
  )
    throw new NoteDraftConflict();
  const note = noteId
    ? (tx
        .select()
        .from(notes)
        .where(and(eq(notes.id, noteId), isNull(notes.deletedAt)))
        .get() ?? null)
    : null;
  if (noteId && (!note || note.patientId !== patientId)) throw new NoteDraftConflict();
  // Known original context is retained. Only an explicitly reviewed legacy new draft uses the shown active encounter.
  const origin = draft.origin ? decodeNoteOrigin(draft.origin) : null;
  if (origin && (origin.patientId !== patientId || origin.noteId !== noteId)) throw new NoteDraftConflict();
  const encounterId = note ? note.encounterId : origin ? origin.encounterId : resolveActiveEncounterId(patientId, tx);
  const encounter = encounterId
    ? (tx
        .select()
        .from(encounters)
        .where(and(eq(encounters.id, encounterId), eq(encounters.patientId, patientId), isNull(encounters.deletedAt)))
        .get() ?? null)
    : null;
  if (encounterId && !encounter) throw new NoteDraftConflict();
  return { draft, note, encounterId, encounter };
}
export async function inspectNoteDraft(id: string, patientId: string, noteId: string | null, generation: number) {
  return withDatasetWrite(generation, async () => db.transaction((tx) => inspectDraft(tx, id, patientId, noteId)));
}
/** Rebase only the raw draft after review of these exact persisted rows; never publish clinical fields. */
export async function adoptNoteDraftOrigin(
  shown: NoteDraftComparison,
  generation: number,
  fields?: NoteDraftFields,
): Promise<NoteDraft> {
  return withDatasetWrite(generation, async () =>
    db.transaction((tx) => {
      const current = inspectDraft(tx, shown.draft.id, shown.draft.patientId, shown.draft.noteId);
      if (
        current.encounterId !== shown.encounterId ||
        JSON.stringify(current.encounter) !== JSON.stringify(shown.encounter) ||
        JSON.stringify(current.draft) !== JSON.stringify(shown.draft) ||
        (current.note && shown.note ? !sameNoteSnapshot(current.note, shown.note) : current.note !== shown.note)
      )
        throw new NoteDraftConflict();
      const origin = encodeNoteOrigin(initialNoteOrigin(current.draft.patientId, current.note, current.encounterId));
      tx.update(noteDrafts)
        .set({ ...fields, origin, revision: current.draft.revision + 1, ...touch() })
        .where(eq(noteDrafts.id, current.draft.id))
        .run();
      auditInTransaction(tx, 'note.draftRebased', { entityType: 'note_draft', entityId: current.draft.id }, new Date());
      return tx.select().from(noteDrafts).where(eq(noteDrafts.id, current.draft.id)).get()!;
    }),
  );
}

/** The draft is no longer wanted: saved into a note, or thrown away. */
export async function discardNoteDraft(
  id: string,
  generation = datasetGeneration(),
  expectedRevision?: number,
): Promise<void> {
  await withDatasetWrite(generation, async () => {
    db.transaction((tx) => {
      const current = tx
        .select()
        .from(noteDrafts)
        .where(and(eq(noteDrafts.id, id), alive))
        .get();
      if (!current) return;
      if (
        !Number.isSafeInteger(current.revision) ||
        current.revision < 0 ||
        current.revision >= Number.MAX_SAFE_INTEGER ||
        (expectedRevision !== undefined && current.revision !== expectedRevision)
      )
        throw new NoteDraftConflict();
      requireNoPendingDraftRecording(tx, id);
      const now = new Date();
      tx.update(noteDrafts)
        .set({ ...softDelete(now), revision: current.revision + 1 })
        .where(eq(noteDrafts.id, id))
        .run();
      auditInTransaction(tx, 'note.draftDiscarded', { entityType: 'note_draft', entityId: id }, now);
    });
  });
}

/** Does this draft hold anything a person would miss? */
export function draftHasContent(
  fields: Pick<NoteDraft, 'title' | 'body' | 'subjective' | 'objective' | 'assessment' | 'plan' | 'voices'>,
): boolean {
  const text = [fields.title, fields.body, fields.subjective, fields.objective, fields.assessment, fields.plan];
  return text.some((v) => (v ?? '').trim().length > 0) || (fields.voices ?? []).length > 0;
}
