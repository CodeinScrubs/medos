import { and, asc, eq, isNull, ne, or } from 'drizzle-orm';

import { audit } from '@/db/audit';
import { db, type DbTransaction } from '@/db/client';
import { attachments, callImports, notes, patients, settings, type CallImport } from '@/db/schema';
import { parseSetting } from '@/db/settings';
import { addAttachmentInTransaction } from '@/features/attachments/queries';
import { createNoteInTransaction } from '@/features/notes/queries';
import { assertFileWorkAvailable, withFileJob } from '@/lib/file-work';
import { newId, softDelete, stamps, touch } from '@/lib/ids';
import { copyImportFile, fingerprintImportFile, type FileFingerprint } from '@/platform/import-file';
import { extensionOf, mediaFile } from '@/platform/media';

import {
  assertImportMediaPath,
  decodeCallSource,
  encodeCallSource,
  importMediaPath,
  type CallRecording,
} from './import-logic';
import { recordingMimeType } from './logic';
import { callsFiled, CALLS_FILED_LIMIT } from './settings';

export type { CallRecording } from './import-logic';

function conflict(): never {
  throw new Error('وضعیت ورود فایل تغییر کرده است؛ دوباره آن را بررسی کنید.');
}

export function pendingCallImportsQuery() {
  return db
    .select({ import: callImports, firstName: patients.firstName, lastName: patients.lastName })
    .from(callImports)
    .leftJoin(patients, and(eq(patients.id, callImports.patientId), isNull(patients.deletedAt)))
    .where(or(and(isNull(callImports.deletedAt), ne(callImports.state, 'filed')), eq(callImports.state, 'discarding')))
    .orderBy(asc(callImports.createdAt), asc(callImports.id));
}

export function callImportQuery(id: string) {
  return db.select().from(callImports).where(eq(callImports.id, id)).limit(1);
}

/** Persist the request AND its reserved path before any native operation. */
export function beginCallImport(patientId: string, source: CallRecording, now: Date, id: string): CallImport {
  assertFileWorkAvailable();
  const path = importMediaPath(id, extensionOf(source.name, 'm4a'));
  const body = encodeCallSource(source);
  return db.transaction((tx) => {
    requirePatient(tx, patientId);
    const previous = tx.select().from(callImports).where(eq(callImports.id, id)).get();
    if (previous) {
      if (previous.deletedAt || previous.patientId !== patientId || previous.relativePath !== path) conflict();
      const saved = decodeCallSource(previous.sourceBody);
      // A transient grant may no longer expose size. Retain captured metadata.
      const comparable = { ...source, sizeBytes: saved.sizeBytes };
      if (
        encodeCallSource(comparable) !== previous.sourceBody ||
        (saved.sizeBytes != null && source.sizeBytes != null && saved.sizeBytes !== source.sizeBytes)
      )
        conflict();
      return previous;
    }
    tx.insert(callImports)
      .values({ id, ...stamps(now), patientId, sourceBody: body, relativePath: path })
      .run();
    return tx.select().from(callImports).where(eq(callImports.id, id)).get()!;
  });
}

function currentImport(tx: DbTransaction, expected: CallImport): CallImport {
  const row = tx.select().from(callImports).where(eq(callImports.id, expected.id)).get();
  if (
    !row ||
    row.deletedAt ||
    row.revision !== expected.revision ||
    row.state !== expected.state ||
    row.patientId !== expected.patientId ||
    row.sourceBody !== expected.sourceBody ||
    row.createdAt.getTime() !== expected.createdAt.getTime() ||
    row.relativePath !== expected.relativePath ||
    row.checksum !== expected.checksum ||
    row.sizeBytes !== expected.sizeBytes ||
    row.noteId !== expected.noteId ||
    row.attachmentId !== expected.attachmentId
  )
    conflict();
  assertImportMediaPath(row.id, row.relativePath);
  return row;
}

function requirePatient(tx: DbTransaction, id: string) {
  if (
    !tx
      .select({ id: patients.id })
      .from(patients)
      .where(and(eq(patients.id, id), isNull(patients.deletedAt)))
      .get()
  )
    throw new Error('بیمار در دسترس نیست؛ فایل وارد نشد.');
}

function pathIsReferenced(tx: DbTransaction, path: string): boolean {
  // Include deleted attachments: their clinical records remain recoverable.
  return !!tx
    .select({ id: attachments.id })
    .from(attachments)
    .where(
      or(eq(attachments.relativePath, path), eq(attachments.originalPath, path), eq(attachments.thumbnailPath, path)),
    )
    .get();
}

function assertCopyAllowed(expected: CallImport): void {
  db.transaction((tx) => {
    const row = currentImport(tx, expected);
    requirePatient(tx, row.patientId);
    if (row.state !== 'copying' || row.noteId || row.attachmentId || pathIsReferenced(tx, row.relativePath)) conflict();
  });
}

export function markCallImportReady(expected: CallImport, file: FileFingerprint, now: Date): CallImport {
  assertFileWorkAvailable();
  if (!/^[0-9a-f]{64}$/.test(file.checksum) || !Number.isSafeInteger(file.sizeBytes) || file.sizeBytes <= 0)
    throw new Error('فایل کامل خوانده نشد.');
  return db.transaction((tx) => {
    const row = currentImport(tx, expected);
    if (row.state !== 'copying' || row.noteId || row.attachmentId || pathIsReferenced(tx, row.relativePath)) conflict();
    tx.update(callImports)
      .set({ ...file, state: 'ready', revision: row.revision + 1, ...touch(now) })
      .where(eq(callImports.id, row.id))
      .run();
    return tx.select().from(callImports).where(eq(callImports.id, row.id)).get()!;
  });
}

function filedNote(tx: DbTransaction, row: CallImport): string {
  const note = row.noteId && tx.select().from(notes).where(eq(notes.id, row.noteId)).get();
  const audio = row.attachmentId && tx.select().from(attachments).where(eq(attachments.id, row.attachmentId)).get();
  if (
    !note ||
    note.deletedAt ||
    note.patientId !== row.patientId ||
    !audio ||
    audio.deletedAt ||
    audio.patientId !== row.patientId ||
    audio.entityType !== 'note' ||
    audio.entityId !== note.id ||
    audio.relativePath !== row.relativePath
  )
    throw new Error('نوت این ورود در دسترس نیست؛ دوباره ثبت نشد.');
  return note.id;
}

/** All clinical metadata and the retry link commit together; never await here. */
export function commitCallImport(expected: CallImport, file: FileFingerprint, now: Date): string {
  assertFileWorkAvailable();
  return db.transaction((tx) => {
    const row = currentImport(tx, expected);
    requirePatient(tx, row.patientId);
    if (row.state === 'filed') return filedNote(tx, row);
    if (
      row.state !== 'ready' ||
      row.noteId ||
      row.attachmentId ||
      row.checksum !== file.checksum ||
      row.sizeBytes !== file.sizeBytes
    )
      conflict();
    const source = decodeCallSource(row.sourceBody);
    const hasTime = source.recordedAt != null && source.timeSource !== 'unknown';
    const noteDate = hasTime ? source.recordedAt! : row.createdAt;
    const body = !hasTime
      ? 'زمان تماس مشخص نیست؛ تاریخ نوت، زمان ورود فایل است.'
      : source.timeSource === 'file'
        ? 'تاریخ نوت از زمان فایل گرفته شده؛ زمان تماس تأیید نشده است.'
        : null;
    const noteId = createNoteInTransaction(tx, {
      patientId: row.patientId,
      encounterId: null,
      type: 'phone_followup',
      title: source.who ? `تماس — ${source.who}` : 'تماس',
      noteDate,
      body,
    });
    const attachmentId = addAttachmentInTransaction(tx, {
      entityType: 'note',
      entityId: noteId,
      patientId: row.patientId,
      kind: 'voice',
      relativePath: row.relativePath,
      sizeBytes: file.sizeBytes,
      mimeType: recordingMimeType(source.name),
      caption: !hasTime
        ? 'ضبط تماس؛ زمان ورود فایل'
        : source.timeSource === 'file'
          ? 'ضبط تماس؛ زمان فایل'
          : 'ضبط تماس؛ زمان از نام فایل',
      capturedAt: noteDate,
    });
    tx.update(attachments).set({ checksum: file.checksum }).where(eq(attachments.id, attachmentId)).run();
    markFiled(tx, source.key, now);
    tx.update(callImports)
      .set({ state: 'filed', noteId, attachmentId, revision: row.revision + 1, ...touch(now) })
      .where(eq(callImports.id, row.id))
      .run();
    return noteId;
  });
}

const running = new Map<string, Promise<string>>();

/** Retry one operation with its captured id; a new id is an intentional reimport. */
export async function fileCallRecording(
  patientId: string,
  recording: CallRecording,
  now: Date = new Date(),
  importId: string = recording.importId ?? newId(),
): Promise<string> {
  return withFileJob(() => fileRecording(patientId, recording, now, importId));
}

async function fileRecording(
  patientId: string,
  recording: CallRecording,
  now: Date,
  importId: string,
): Promise<string> {
  const row = beginCallImport(patientId, recording, now, importId);
  if (row.state === 'filed') return db.transaction((tx) => filedNote(tx, row));
  const previous = running.get(row.id);
  if (previous) return previous;
  const operation = (async () => {
    let ready = row;
    let actual: FileFingerprint;
    if (ready.state === 'copying') {
      assertCopyAllowed(ready);
      actual = await copyImportFile(recording.uri, ready.relativePath, decodeCallSource(ready.sourceBody).sizeBytes);
      ready = markCallImportReady(ready, actual, now);
    } else {
      actual = await fingerprintImportFile(ready.relativePath);
    }
    return commitCallImport(ready, actual, now);
  })();
  running.set(row.id, operation);
  try {
    return await operation;
  } finally {
    if (running.get(row.id) === operation) running.delete(row.id);
  }
}

export async function resumeCallImport(id: string, now: Date = new Date()): Promise<string> {
  const row = callImportQuery(id).get();
  if (!row || row.deletedAt) conflict();
  return fileCallRecording(row.patientId, decodeCallSource(row.sourceBody), now, row.id);
}

/** Confirmed cancellation, then remove only its unreferenced unpublished copy. */
export async function discardCallImport(id: string, now: Date = new Date()): Promise<void> {
  return withFileJob(() => discardImport(id, now));
}

async function discardImport(id: string, now: Date): Promise<void> {
  const retired = db.transaction((tx) => {
    const row = tx.select().from(callImports).where(eq(callImports.id, id)).get();
    if (!row || row.state === 'filed' || row.noteId || row.attachmentId) conflict();
    assertImportMediaPath(row.id, row.relativePath);
    if (pathIsReferenced(tx, row.relativePath)) conflict();
    if (!row.deletedAt)
      tx.update(callImports)
        .set({ ...softDelete(now), state: 'discarding', revision: row.revision + 1 })
        .where(eq(callImports.id, id))
        .run();
    return tx.select().from(callImports).where(eq(callImports.id, id)).get()!;
  });
  if (retired.state === 'discarded') return;
  await audit('call.importDiscarded', { entityType: 'call_import', entityId: id });
  await running.get(id)?.catch(() => {});
  const mayDelete = db.transaction((tx) => {
    const current = tx.select().from(callImports).where(eq(callImports.id, id)).get();
    return (
      current?.deletedAt?.getTime() === retired.deletedAt?.getTime() &&
      current?.revision === retired.revision &&
      current?.state === 'discarding' &&
      current?.sourceBody === retired.sourceBody &&
      current?.patientId === retired.patientId &&
      current?.createdAt.getTime() === retired.createdAt.getTime() &&
      current?.relativePath === retired.relativePath &&
      !current?.noteId &&
      !current?.attachmentId &&
      !pathIsReferenced(tx, retired.relativePath)
    );
  });
  if (!mayDelete) conflict();
  try {
    const file = mediaFile(retired.relativePath);
    if (file.exists) file.delete();
  } catch {
    throw new Error('ورود لغو شد؛ پاک‌کردن کپی ناتمام انجام نشد.');
  }
  // A crash before this write leaves a visible, safely retryable cleanup.
  db.transaction((tx) => {
    const row = tx.select().from(callImports).where(eq(callImports.id, id)).get();
    if (
      !row ||
      row.revision !== retired.revision ||
      row.state !== 'discarding' ||
      row.deletedAt?.getTime() !== retired.deletedAt?.getTime() ||
      row.sourceBody !== retired.sourceBody ||
      row.relativePath !== retired.relativePath
    )
      conflict();
    tx.update(callImports)
      .set({ state: 'discarded', revision: row.revision + 1, ...touch(now) })
      .where(eq(callImports.id, id))
      .run();
  });
}

function markFiled(tx: DbTransaction, key: string, updatedAt: Date): void {
  const filed = parseSetting(callsFiled, tx.select().from(settings).where(eq(settings.key, callsFiled.key)).get());
  if (filed.includes(key)) return;
  const value = JSON.stringify(callsFiled.schema.parse([...filed, key].slice(-CALLS_FILED_LIMIT)));
  tx.insert(settings)
    .values({ key: callsFiled.key, value, updatedAt })
    .onConflictDoUpdate({ target: settings.key, set: { value, updatedAt } })
    .run();
}
