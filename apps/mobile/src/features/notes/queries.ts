import { and, desc, eq, getTableColumns, isNotNull, isNull } from 'drizzle-orm';

import { auditInTransaction } from '@/db/audit';
import { db, type DbTransaction } from '@/db/client';
import {
  encounters,
  noteDrafts,
  noteVersions,
  notes,
  patients,
  type Note,
  type NoteType,
  type NoteVersion,
} from '@/db/schema';
import { resolveActiveEncounterId } from '@/features/encounters/queries';
import { withDatasetWrite } from '@/lib/dataset-write';
import { requireDeletedRecord } from '@/lib/deleted-record';
import { newId, softDelete, stamps, touch } from '@/lib/ids';

import { noteLifecycle, requireNoteAction, type NoteActionBasis } from './action-queries';
import { noteSearchText, sameNoteSnapshot } from './logic';
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

export function noteQuery(id: string, patientId: string) {
  return db
    .select(getTableColumns(notes))
    .from(notes)
    .innerJoin(patients, eq(patients.id, notes.patientId))
    .where(and(alive, isNull(patients.deletedAt), eq(notes.id, id), eq(notes.patientId, patientId)))
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

/** A correction never moves a note to a different patient or encounter. */
export type NotePatch = Partial<Omit<NoteInput, 'patientId' | 'encounterId'>>;
const editableFields: Record<keyof NotePatch, true> = {
  type: true,
  title: true,
  body: true,
  subjective: true,
  objective: true,
  assessment: true,
  plan: true,
  noteDate: true,
  doctorId: true,
  specialty: true,
  isPinned: true,
  isDraft: true,
};

function requireNoteParent(tx: DbTransaction, patientId: string, encounterId: string | null): void {
  if (
    !tx
      .select({ id: patients.id })
      .from(patients)
      .where(and(eq(patients.id, patientId), isNull(patients.deletedAt)))
      .get()
  )
    throw new Error('پروندهٔ بیمار در دسترس نیست؛ نوت تغییر نکرد.');
  if (
    encounterId !== null &&
    !tx
      .select({ id: encounters.id })
      .from(encounters)
      .where(and(eq(encounters.id, encounterId), eq(encounters.patientId, patientId), isNull(encounters.deletedAt)))
      .get()
  )
    throw new Error('نوبت مربوط به این نوت در دسترس نیست؛ ارتباط نوت تغییر نکرد.');
}

export async function createNote(input: NoteInput): Promise<string> {
  return db.transaction((tx) => createNoteInTransaction(tx, input));
}

/** Also used when a capture and its new note must commit together. */
export function createNoteInTransaction(tx: DbTransaction, input: NoteInput): string {
  // Undefined selects the active episode inside this transaction; explicit null
  // remains outpatient/unassociated even if another admission has since opened.
  const encounterId =
    input.encounterId !== undefined ? input.encounterId : resolveActiveEncounterId(input.patientId, tx);
  requireNoteParent(tx, input.patientId, encounterId);
  const id = newId();
  tx.insert(notes)
    .values({
      id,
      ...stamps(),
      patientId: input.patientId,
      // Undefined means "whatever admission is active"; null means explicitly none.
      encounterId,
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

export async function updateNote(id: string, input: NotePatch): Promise<void> {
  db.transaction((tx) => updateNoteInTransaction(tx, id, input));
}

export function updateNoteInTransaction(tx: DbTransaction, id: string, input: NotePatch): void {
  // Types alone cannot protect imported/plugin/runtime calls or an object spread.
  if ('patientId' in input || 'encounterId' in input)
    throw new Error('بیمار و نوبت نوت هنگام اصلاح قابل تغییر نیستند.');
  if (Object.keys(input).some((key) => !Object.prototype.hasOwnProperty.call(editableFields, key)))
    throw new Error('اطلاعات اصلاح نوت معتبر نیست؛ نوت تغییر نکرد.');
  // Drizzle skips undefined values. The search projection must skip them too;
  // explicit null still clears a field and is recorded in clinical history.
  const patch = Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined)) as NotePatch;
  const current = tx
    .select()
    .from(notes)
    .where(and(alive, eq(notes.id, id)))
    .get();
  if (!current) throw new Error('این نوت دیگر قابل تغییر نیست؛ فهرست را دوباره بخوانید.');
  requireNoteParent(tx, current.patientId, current.encounterId);

  tx.update(notes)
    .set({ ...patch, ...touch(), searchText: noteSearchText({ ...current, ...patch }) })
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
export async function restoreNoteVersion(expected: NoteVersion, basis: Note, generation: number): Promise<void> {
  await withDatasetWrite(generation, async () =>
    db.transaction((tx) => {
      const version = tx
        .select()
        .from(noteVersions)
        .where(and(isNull(noteVersions.deletedAt), eq(noteVersions.id, expected.id)))
        .get();
      if (!version || !sameNoteSnapshot(version, expected))
        throw new Error('نسخهٔ انتخاب‌شده تغییر کرده یا در دسترس نیست.');
      const current = tx
        .select()
        .from(notes)
        .where(and(alive, eq(notes.id, version.noteId)))
        .get();
      if (!current || !sameNoteSnapshot(current, basis) || version.patientId !== current.patientId)
        throw new Error('این نوت تغییر کرده یا متعلق به این پرونده نیست؛ دوباره آن را بررسی کنید.');
      requireNoteParent(tx, current.patientId, current.encounterId);

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
        .where(
          and(
            isNull(noteDrafts.deletedAt),
            eq(noteDrafts.noteId, version.noteId),
            eq(noteDrafts.patientId, current.patientId),
          ),
        )
        .run();

      const restored = tx.select().from(notes).where(eq(notes.id, version.noteId)).get()!;
      writeNoteVersion(tx, restored, 'restored', version.id);
      auditInTransaction(tx, 'note.versionRestored', { entityType: 'note', entityId: current.id }, new Date());
    }),
  );
}

export async function setNotePinned(id: string, isPinned: boolean, expected?: NoteActionBasis): Promise<void> {
  db.transaction((tx) => {
    requireNoteAction(tx, id, expected);
    updateNoteInTransaction(tx, id, { isPinned });
  });
}

export async function deleteNote(id: string, expected?: NoteActionBasis): Promise<void> {
  const now = new Date();
  db.transaction((tx) => {
    const current = tx
      .select()
      .from(notes)
      .where(and(alive, eq(notes.id, id)))
      .get();
    if (!current) throw new Error('این نوت دیگر قابل تغییر نیست؛ فهرست را دوباره بخوانید.');
    requireNoteParent(tx, current.patientId, current.encounterId);
    requireNoteAction(tx, id, expected);
    tx.update(notes)
      .set(softDelete(now))
      .where(and(alive, eq(notes.id, id)))
      .run();
    auditInTransaction(tx, 'note.deleted', { entityType: 'note', entityId: id }, now);
  });
}

/** Deleted notes, newest first, with whose record they came from — for the trash. */
export function deletedNotesQuery(limit = 50) {
  return db
    .select({
      note: notes,
      lifecycle: noteLifecycle,
      patient: { firstName: patients.firstName, lastName: patients.lastName },
    })
    .from(notes)
    .leftJoin(patients, eq(patients.id, notes.patientId))
    .where(isNotNull(notes.deletedAt))
    .orderBy(desc(notes.deletedAt), desc(notes.id))
    .limit(limit);
}

/** Put a deleted note back in its record, exactly as it was. */
export async function restoreNote(id: string, expected?: Note, expectedLifecycle?: string): Promise<void> {
  const now = new Date();
  db.transaction((tx) => {
    const current = requireDeletedRecord(tx.select().from(notes).where(eq(notes.id, id)).get(), expected);
    requireNoteParent(tx, current.patientId, current.encounterId);
    if (
      expectedLifecycle !== undefined &&
      tx
        .select({ lifecycle: noteLifecycle })
        .from(notes)
        .innerJoin(patients, eq(patients.id, notes.patientId))
        .where(eq(notes.id, id))
        .get()!.lifecycle !== expectedLifecycle
    )
      throw new Error('این نوت تغییر کرده است؛ فهرست را دوباره بخوانید و نسخهٔ جدید را بررسی کنید.');
    tx.update(notes)
      .set({ deletedAt: null, ...touch(now) })
      .where(and(eq(notes.id, id), isNotNull(notes.deletedAt)))
      .run();
    auditInTransaction(tx, 'note.restored', { entityType: 'note', entityId: id }, now);
  });
}

/** Rebuild every note's search index; see features/search/reindex.ts. */
export async function reindexNotes(): Promise<number> {
  let changed = 0;
  db.transaction((tx) => {
    const rows = tx.select().from(notes).all();
    for (const n of rows) {
      const next = noteSearchText(n);
      if (next === n.searchText) continue;
      tx.update(notes).set({ searchText: next }).where(eq(notes.id, n.id)).run();
      changed += 1;
    }
  });
  return changed;
}
