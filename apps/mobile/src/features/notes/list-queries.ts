import { and, asc, desc, eq, inArray, isNull, or, sql, type SQL } from 'drizzle-orm';

import { db } from '@/db/client';
import { attachments, notes, patients } from '@/db/schema';

import { NOTE_PAGE_SIZE, NOTE_PREVIEW_SIZE, type NoteListCursor, type NoteListFilter } from './list-logic';

const alive = and(isNull(notes.deletedAt), isNull(patients.deletedAt));
const short = (value: SQL, size: number) =>
  sql<string | null>`CASE WHEN length(${value}) > ${size} THEN substr(${value}, 1, ${size}) || '…' ELSE ${value} END`;

// Shorten individual SOAP fields before joining, so a large document is not
// concatenated in SQLite just to return a card. Only the editor reads full text.
const soap = sql.join(
  [notes.subjective, notes.objective, notes.assessment, notes.plan].map(
    (field) =>
      sql`CASE WHEN coalesce(${field}, '') = '' THEN '' ELSE ' — ' || substr(${field}, 1, ${NOTE_PREVIEW_SIZE + 1}) END`,
  ),
  sql` || `,
);
const preview = short(sql`coalesce(nullif(${notes.body}, ''), substr(${soap}, 4))`, NOTE_PREVIEW_SIZE);
const card = {
  id: notes.id,
  type: notes.type,
  title: short(sql`${notes.title}`, 160),
  specialty: short(sql`${notes.specialty}`, 96),
  noteDate: notes.noteDate,
  isPinned: notes.isPinned,
  preview,
};

/** One replaceable page: pins first, then clinical time, then a stable ID tie-break. */
export function patientNotePageQuery(patientId: string, filter: NoteListFilter = 'all', cursor?: NoteListCursor) {
  const before = cursor
    ? sql`(${notes.isPinned} < ${cursor.pinned ? 1 : 0}
        OR (${notes.isPinned} = ${cursor.pinned ? 1 : 0} AND
          (${notes.noteDate} < ${cursor.at} OR (${notes.noteDate} = ${cursor.at} AND ${notes.id} > ${cursor.id}))))`
    : undefined;
  return db
    .select(card)
    .from(notes)
    .innerJoin(patients, eq(notes.patientId, patients.id))
    .where(and(alive, eq(notes.patientId, patientId), filter === 'all' ? undefined : eq(notes.type, filter), before))
    .orderBy(desc(notes.isPinned), desc(notes.noteDate), asc(notes.id))
    .limit(NOTE_PAGE_SIZE + 1);
}
export type NoteListItem = ReturnType<ReturnType<typeof patientNotePageQuery>['all']>[number];

/** Filters describe the whole record, including types past the current page. */
export function patientNoteTypesQuery(patientId: string) {
  return db
    .select({ type: notes.type })
    .from(notes)
    .innerJoin(patients, eq(notes.patientId, patients.id))
    .where(and(alive, eq(notes.patientId, patientId)))
    .groupBy(notes.type);
}

/** Read only counts for this page; a failed media read must not hide its text. */
export function noteVoiceCountsQuery(patientId: string, noteIds: readonly string[]) {
  return db
    .select({ noteId: attachments.entityId, count: sql<number>`count(*)`.mapWith(Number) })
    .from(attachments)
    .where(
      and(
        isNull(attachments.deletedAt),
        eq(attachments.patientId, patientId),
        eq(attachments.entityType, 'note'),
        eq(attachments.kind, 'voice'),
        noteIds.length ? inArray(attachments.entityId, [...noteIds]) : sql`0 = 1`,
      ),
    )
    .groupBy(attachments.entityId);
}

/** The front page has eight short highlights, never all of a patient's bodies. */
export function patientHighlightedNotesQuery(patientId: string) {
  return db
    .select(card)
    .from(notes)
    .innerJoin(patients, eq(notes.patientId, patients.id))
    .where(and(alive, eq(notes.patientId, patientId), or(eq(notes.isPinned, true), eq(notes.type, 'event'))))
    .orderBy(desc(notes.isPinned), desc(notes.noteDate), asc(notes.id))
    .limit(8);
}
