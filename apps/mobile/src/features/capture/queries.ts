import { and, asc, count, desc, eq, inArray, isNotNull, isNull } from 'drizzle-orm';

import { audit } from '@/db/audit';
import { db, type DbTransaction } from '@/db/client';
import {
  attachments,
  captureInbox,
  notes,
  patients,
  photoImportBatches,
  recordingJobs,
  shifts,
  tasks,
  type Capture,
  type CaptureKind,
  type NoteType,
} from '@/db/schema';
import { matchesSearch } from '@/db/search';
import { addAttachmentInTransaction, type AttachmentInput } from '@/features/attachments/queries';
import { createNoteInTransaction } from '@/features/notes/queries';
import { createTaskInTransaction } from '@/features/tasks/queries';
import { requireDeletedRecord } from '@/lib/deleted-record';
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
export function inboxQuery(limit = 50, search = '') {
  return db
    .select({ capture: captureInbox, patient: patients })
    .from(captureInbox)
    .leftJoin(patients, livePatient)
    .where(and(alive, isNull(captureInbox.filedAt), ...matchesSearch(captureInbox.searchText, search)))
    .orderBy(asc(captureInbox.capturedAt), asc(captureInbox.id))
    .limit(limit);
}

/** Already filed, newest first — where a voice capture's audio still lives. */
export function filedCapturesQuery(limit = 20, search = '') {
  return db
    .select({ capture: captureInbox, patient: patients })
    .from(captureInbox)
    .leftJoin(patients, livePatient)
    .where(and(alive, isNotNull(captureInbox.filedAt), ...matchesSearch(captureInbox.searchText, search)))
    .orderBy(desc(captureInbox.filedAt), desc(captureInbox.id))
    .limit(limit);
}

export function captureCountQuery(filed: boolean, search = '') {
  return db
    .select({ total: count() })
    .from(captureInbox)
    .where(
      and(
        alive,
        filed ? isNotNull(captureInbox.filedAt) : isNull(captureInbox.filedAt),
        ...matchesSearch(captureInbox.searchText, search),
      ),
    );
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
  db.transaction((tx) => {
    if (
      input.patientId &&
      !tx
        .select({ id: patients.id })
        .from(patients)
        .where(and(eq(patients.id, input.patientId), isNull(patients.deletedAt)))
        .get()
    )
      throw new Error('پروندهٔ بیمار در دسترس نیست؛ ثبت سریع ذخیره نشد.');
    const shiftId =
      input.shiftId !== undefined
        ? input.shiftId
        : (tx
            .select({ id: shifts.id })
            .from(shifts)
            .where(and(isNull(shifts.deletedAt), eq(shifts.isActive, true)))
            .orderBy(desc(shifts.startAt))
            .get()?.id ?? null);
    tx.insert(captureInbox)
      .values({
        id,
        ...stamps(),
        kind: input.kind ?? 'text',
        text,
        patientId: input.patientId ?? null,
        shiftId,
        capturedAt: input.capturedAt ?? new Date(),
        filedAs: null,
        filedId: null,
        filedAt: null,
        searchText: captureSearchText({ text }),
      })
      .run();
  });
  return id;
}

export async function updateCapture(
  id: string,
  patch: { text?: string | null; patientId?: string | null; kind?: CaptureKind },
): Promise<void> {
  db.transaction((tx) => {
    const current = tx
      .select()
      .from(captureInbox)
      .where(and(alive, eq(captureInbox.id, id)))
      .get();
    if (!current) throw new Error('ثبت سریع در دسترس نیست؛ تغییر ذخیره نشد.');
    const patientId = patch.patientId === undefined ? current.patientId : patch.patientId;
    // Recovery compares pending media's original owner. Moving its
    // parent before acknowledgment would strand that verified copy.
    if (patientId !== current.patientId && hasPendingMedia(tx, id))
      throw new Error('عکس یا وویس این ثبت هنوز ذخیره نشده است؛ ابتدا ذخیره یا لغو آن را کامل کنید.');
    if (current.filedAt && (patientId !== current.patientId || patch.kind !== undefined))
      throw new Error('این ثبت سریع قبلاً مرتب شده است؛ مقصد آن تغییر نکرد.');
    if (
      patch.patientId &&
      !tx
        .select({ id: patients.id })
        .from(patients)
        .where(and(eq(patients.id, patch.patientId), isNull(patients.deletedAt)))
        .get()
    )
      throw new Error('پروندهٔ بیمار در دسترس نیست؛ تغییر ذخیره نشد.');
    const text = patch.text === undefined ? current.text : patch.text?.trim() || null;
    tx.update(captureInbox)
      .set({ ...patch, text, searchText: captureSearchText({ text }), ...touch() })
      .where(eq(captureInbox.id, id))
      .run();
    if (patientId !== current.patientId) {
      tx.update(attachments)
        .set({ patientId, ...touch() })
        .where(and(eq(attachments.entityType, 'capture'), eq(attachments.entityId, id)))
        .run();
    }
  });
}

/** Voice metadata and its capture kind acknowledge together; retries reuse one file. */
export async function addCaptureVoice(
  id: string,
  voice: Pick<AttachmentInput, 'relativePath' | 'sizeBytes' | 'durationMs' | 'capturedAt'>,
): Promise<string> {
  return db.transaction((tx) => {
    const capture = tx
      .select()
      .from(captureInbox)
      .where(and(alive, eq(captureInbox.id, id)))
      .get();
    if (!capture || capture.filedAt) throw new Error('ثبت سریع در دسترس نیست؛ وویس ثبت نشد.');
    const attachmentId = addAttachmentInTransaction(
      tx,
      {
        ...voice,
        entityType: 'capture',
        entityId: id,
        kind: 'voice',
        mimeType: 'audio/mp4',
      },
      { reuseVoice: true },
    );
    tx.update(captureInbox)
      .set({ kind: 'voice', ...touch() })
      .where(eq(captureInbox.id, id))
      .run();
    return attachmentId;
  });
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
  if (hasPendingMedia(tx, id))
    throw new Error('عکس یا وویس این ثبت هنوز ذخیره نشده است؛ ابتدا از ورودی‌ها ذخیره را کامل کنید.');
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
    .orderBy(desc(captureInbox.deletedAt), desc(captureInbox.id))
    .limit(limit);
}

/** Put a discarded capture back where it was: the inbox, if it was never filed. */
export async function restoreCapture(id: string, expected?: Capture): Promise<void> {
  const now = new Date();
  db.transaction((tx) => {
    const current = requireDeletedRecord(tx.select().from(captureInbox).where(eq(captureInbox.id, id)).get(), expected);
    if (
      current.patientId &&
      !tx
        .select({ id: patients.id })
        .from(patients)
        .where(and(eq(patients.id, current.patientId), isNull(patients.deletedAt)))
        .get()
    )
      throw new Error('ابتدا پروندهٔ بیمار این ثبت را برگردانید.');
    if (current.filedAt) {
      const table = current.filedAs === 'note' ? notes : current.filedAs === 'task' ? tasks : null;
      const target =
        table && current.filedId
          ? tx
              .select({ patientId: table.patientId })
              .from(table)
              .where(and(eq(table.id, current.filedId), isNull(table.deletedAt)))
              .get()
          : undefined;
      if (!target || target.patientId !== current.patientId)
        throw new Error('مقصد مرتب‌شدهٔ این ثبت در دسترس نیست؛ ابتدا مقصد را برگردانید.');
    }
    tx.update(captureInbox)
      .set({ deletedAt: null, ...touch(now) })
      .where(and(eq(captureInbox.id, id), isNotNull(captureInbox.deletedAt)))
      .run();
  });
  await audit('capture.restored', { entityType: 'capture', entityId: id });
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
  return db.transaction((tx) => {
    const capture = tx
      .select()
      .from(captureInbox)
      .where(and(alive, eq(captureInbox.id, id)))
      .get();
    if (!capture || capture.filedAt || (capture.text ?? '').trim() || hasPendingMedia(tx, id)) return false;
    if (
      tx
        .select({ id: attachments.id })
        .from(attachments)
        .where(and(isNull(attachments.deletedAt), eq(attachments.entityType, 'capture'), eq(attachments.entityId, id)))
        .get()
    )
      return false;
    tx.update(captureInbox)
      .set(softDelete())
      .where(and(alive, eq(captureInbox.id, id)))
      .run();
    return true;
  });
}

function hasPendingMedia(tx: DbTransaction, captureId: string): boolean {
  return (
    !!tx
      .select({ id: photoImportBatches.id })
      .from(photoImportBatches)
      .where(
        and(
          eq(photoImportBatches.entityType, 'capture'),
          eq(photoImportBatches.entityId, captureId),
          isNull(photoImportBatches.deletedAt),
          inArray(photoImportBatches.state, ['copying', 'ready']),
        ),
      )
      .get() ||
    !!tx
      .select({ id: recordingJobs.id })
      .from(recordingJobs)
      .where(
        and(
          eq(recordingJobs.entityType, 'capture'),
          eq(recordingJobs.entityId, captureId),
          inArray(recordingJobs.state, ['copying', 'ready', 'discarding']),
        ),
      )
      .get()
  );
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
  let changed = 0;
  db.transaction((tx) => {
    const rows = tx.select().from(captureInbox).all();
    for (const row of rows) {
      const next = captureSearchText(row);
      if (next === row.searchText) continue;
      tx.update(captureInbox).set({ searchText: next }).where(eq(captureInbox.id, row.id)).run();
      changed += 1;
    }
  });
  return changed;
}
