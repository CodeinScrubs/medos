import { and, asc, desc, eq, isNotNull, isNull } from 'drizzle-orm';

import { db, type DbTransaction } from '@/db/client';
import {
  attachments,
  captureInbox,
  notes,
  patients,
  shifts,
  tasks,
  type Capture,
  type CaptureKind,
  type NoteType,
} from '@/db/schema';
import { createNoteInTransaction } from '@/features/notes/queries';
import { createTaskInTransaction } from '@/features/tasks/queries';
import { newId, softDelete, stamps, touch } from '@/lib/ids';
import { buildSearchText } from '@/lib/persian';

/*
 * The inbox: things caught before there was time to file them.
 *
 * Everywhere else in MedOS the app asks a question first — which patient,
 * which episode, note or task. Standing in a corridor those questions cost
 * more than the thing being remembered, and the usual result is that nothing
 * gets written at all. So a capture asks nothing, and filing is a separate
 * act, done sitting down.
 *
 * Filing never destroys the capture. The note or the task is a new row that
 * points back, and the capture keeps its recording and its photo, because the
 * audio of what a family actually said is not reproducible from a summary of
 * it.
 */

const alive = isNull(captureInbox.deletedAt);

export function captureSearchText(capture: Pick<Capture, 'text'>): string {
  return buildSearchText(capture.text);
}

/** A patient is only shown if they are still in the record. */
const livePatient = and(eq(captureInbox.patientId, patients.id), isNull(patients.deletedAt));

/** Still unfiled: the actual inbox, oldest first so nothing rots at the bottom. */
export function inboxQuery(limit = 50) {
  return db
    .select({ capture: captureInbox, patient: patients })
    .from(captureInbox)
    .leftJoin(patients, livePatient)
    .where(and(alive, isNull(captureInbox.filedAt)))
    .orderBy(asc(captureInbox.capturedAt))
    .limit(limit);
}

/** Already filed, newest first — where a voice capture's audio still lives. */
export function filedCapturesQuery(limit = 20) {
  return db
    .select({ capture: captureInbox, patient: patients })
    .from(captureInbox)
    .leftJoin(patients, livePatient)
    .where(and(alive, isNotNull(captureInbox.filedAt)))
    .orderBy(desc(captureInbox.filedAt))
    .limit(limit);
}

export function captureQuery(id: string) {
  return db
    .select()
    .from(captureInbox)
    .where(and(alive, eq(captureInbox.id, id)))
    .limit(1);
}

export type CaptureInput = {
  kind?: CaptureKind;
  text?: string | null;
  /** Undefined means "the shift that is open"; null means explicitly none. */
  shiftId?: string | null;
  patientId?: string | null;
  capturedAt?: Date;
};

async function activeShiftId(): Promise<string | null> {
  const [row] = await db
    .select({ id: shifts.id })
    .from(shifts)
    .where(and(isNull(shifts.deletedAt), eq(shifts.isActive, true)))
    .orderBy(desc(shifts.startAt))
    .limit(1);
  return row?.id ?? null;
}

/**
 * Write a capture.
 *
 * The shift is resolved once, here, rather than read at display time: "what
 * did I catch on Thursday night" has to keep meaning the same thing after
 * Thursday night is over.
 */
export async function createCapture(input: CaptureInput = {}): Promise<string> {
  const id = newId();
  const text = input.text?.trim() || null;
  await db.insert(captureInbox).values({
    id,
    ...stamps(),
    kind: input.kind ?? 'text',
    text,
    patientId: input.patientId ?? null,
    shiftId: input.shiftId !== undefined ? input.shiftId : await activeShiftId(),
    capturedAt: input.capturedAt ?? new Date(),
    filedAs: null,
    filedId: null,
    filedAt: null,
    searchText: captureSearchText({ text }),
  });
  return id;
}

export async function updateCapture(
  id: string,
  patch: { text?: string | null; patientId?: string | null; kind?: CaptureKind },
): Promise<void> {
  const current = (await captureQuery(id))[0];
  if (!current) throw new Error(`Capture ${id} not found`);
  const text = patch.text === undefined ? current.text : patch.text?.trim() || null;
  await db
    .update(captureInbox)
    .set({ ...patch, text, searchText: captureSearchText({ text }), ...touch() })
    .where(and(alive, eq(captureInbox.id, id)));
}

/**
 * Hand a capture's photos and recordings to whatever it became.
 *
 * One file, one home: the note's own media list is where someone will look for
 * the recording, so the rows move rather than being copied. Nothing touches
 * the disk — an attachment is a path plus a parent, and only the parent
 * changes.
 */
function moveAttachmentsToNote(tx: DbTransaction, captureId: string, to: { noteId: string; patientId: string }): void {
  tx.update(attachments)
    .set({ entityType: 'note', entityId: to.noteId, patientId: to.patientId, ...touch() })
    .where(
      and(isNull(attachments.deletedAt), eq(attachments.entityType, 'capture'), eq(attachments.entityId, captureId)),
    )
    .run();
}

function markFiled(tx: DbTransaction, id: string, filedAs: 'note' | 'task', filedId: string, patientId: string | null) {
  const now = new Date();
  tx.update(captureInbox)
    .set({ filedAs, filedId, patientId, filedAt: now, ...touch(now) })
    .where(and(alive, eq(captureInbox.id, id)))
    .run();
}

function captureForFiling(tx: DbTransaction, id: string, patientId: string | null | undefined): Capture {
  const capture = tx
    .select()
    .from(captureInbox)
    .where(and(alive, eq(captureInbox.id, id)))
    .get();
  if (!capture) throw new Error('Capture not found');
  const target = patientId !== undefined ? patientId : capture.patientId;
  if (
    target &&
    !tx
      .select({ id: patients.id })
      .from(patients)
      .where(and(isNull(patients.deletedAt), eq(patients.id, target)))
      .get()
  ) {
    throw new Error('Patient not found; choose an active patient before filing');
  }
  if (capture.filedAt && patientId !== undefined && patientId !== capture.patientId) {
    throw new Error('This capture was already filed under a different patient');
  }
  return capture;
}

/** A retry returns its original destination; a conflicting conversion is refused. */
function filedDestination(tx: DbTransaction, capture: Capture, kind: 'note' | 'task'): string | null {
  if (!capture.filedAt) return null;
  if (capture.filedAs !== kind || !capture.filedId) throw new Error('This capture has already been filed');
  const table = kind === 'note' ? notes : tasks;
  const target = tx
    .select({ id: table.id })
    .from(table)
    .where(and(eq(table.id, capture.filedId), isNull(table.deletedAt)))
    .get();
  if (!target) throw new Error('The filed destination is unavailable; restore it instead of filing again');
  return target.id;
}

/**
 * Turn a capture into a task.
 *
 * The recording and the photo stay on the capture: a task is a title and a
 * state, with nowhere to play audio. The capture stays reachable in the
 * inbox's filed list, which is why nothing is deleted here.
 */
export async function fileCaptureAsTask(
  id: string,
  options: { patientId?: string | null; title?: string; dueAt?: Date | null } = {},
): Promise<string> {
  return db.transaction((tx) => {
    const capture = captureForFiling(tx, id, options.patientId);
    const existing = filedDestination(tx, capture, 'task');
    if (existing) return existing;

    const title = (options.title ?? capture.text ?? '').trim();
    if (!title) throw new Error('A task needs a title; this capture has no text');

    const patientId = options.patientId !== undefined ? options.patientId : capture.patientId;
    const taskId = createTaskInTransaction(tx, {
      title,
      patientId,
      shiftId: capture.shiftId,
      dueAt: options.dueAt ?? null,
      source: 'capture',
    });
    markFiled(tx, id, 'task', taskId, patientId);
    return taskId;
  });
}

/**
 * Turn a capture into a note on somebody's record.
 *
 * A note cannot exist without a patient, so this refuses rather than guessing:
 * a capture filed under the wrong person is worse than one still sitting in
 * the inbox.
 */
export async function fileCaptureAsNote(
  id: string,
  options: { patientId?: string | null; type?: NoteType; title?: string | null } = {},
): Promise<string> {
  return db.transaction((tx) => {
    const capture = captureForFiling(tx, id, options.patientId);
    const existing = filedDestination(tx, capture, 'note');
    if (existing) return existing;

    const patientId = options.patientId !== undefined ? options.patientId : capture.patientId;
    if (!patientId) throw new Error('A note needs a patient');

    const noteId = createNoteInTransaction(tx, {
      patientId,
      type: options.type ?? 'general',
      title: options.title ?? null,
      body: capture.text,
      noteDate: capture.capturedAt,
    });
    moveAttachmentsToNote(tx, id, { noteId, patientId });
    markFiled(tx, id, 'note', noteId, patientId);
    return noteId;
  });
}

/** Throw a capture away. It goes to the trash like everything else. */
export async function discardCapture(id: string): Promise<void> {
  await db
    .update(captureInbox)
    .set(softDelete())
    .where(and(alive, eq(captureInbox.id, id)));
}

/** Thrown away but not gone: what the trash screen offers to put back. */
export function deletedCapturesQuery(limit = 50) {
  return db
    .select()
    .from(captureInbox)
    .where(isNotNull(captureInbox.deletedAt))
    .orderBy(desc(captureInbox.deletedAt))
    .limit(limit);
}

/** Put a discarded capture back where it was: the inbox, if it was never filed. */
export async function restoreCapture(id: string): Promise<void> {
  await db
    .update(captureInbox)
    .set({ deletedAt: null, ...touch() })
    .where(eq(captureInbox.id, id));
}

/**
 * Drop a capture that never got anything in it.
 *
 * The capture screen writes its row as soon as there is something to lose, so
 * opening it and changing your mind — or typing a word and deleting it —
 * would otherwise leave a blank line in the inbox. Anything with text, a file
 * or a filing survives this.
 */
export async function discardCaptureIfEmpty(id: string): Promise<boolean> {
  const capture = (await captureQuery(id))[0];
  if (!capture || capture.filedAt) return false;
  if ((capture.text ?? '').trim()) return false;
  if ((await captureAttachments(id)).length > 0) return false;
  await discardCapture(id);
  return true;
}

function captureAttachments(captureId: string) {
  return db
    .select({ id: attachments.id })
    .from(attachments)
    .where(
      and(isNull(attachments.deletedAt), eq(attachments.entityType, 'capture'), eq(attachments.entityId, captureId)),
    )
    .limit(1);
}

/**
 * Every file attached to any capture, in one query.
 *
 * The inbox draws a player or a thumbnail per row; asking per row would be a
 * query per row. Grouping happens in the screen.
 */
export function captureMediaQuery() {
  return db
    .select()
    .from(attachments)
    .where(and(isNull(attachments.deletedAt), eq(attachments.entityType, 'capture')))
    .orderBy(asc(attachments.createdAt));
}

export async function reindexCaptures(): Promise<number> {
  const rows = await db.select().from(captureInbox);
  let changed = 0;
  db.transaction((tx) => {
    for (const row of rows) {
      const next = captureSearchText(row);
      if (next === row.searchText) continue;
      tx.update(captureInbox).set({ searchText: next }).where(eq(captureInbox.id, row.id)).run();
      changed += 1;
    }
  });
  return changed;
}
