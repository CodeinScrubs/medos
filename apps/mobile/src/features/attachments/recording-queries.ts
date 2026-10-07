import { and, asc, eq, isNull, ne, or } from 'drizzle-orm';

import type { Recording } from '@/components/voice-recorder';
import { audit } from '@/db/audit';
import { db, type DbTransaction } from '@/db/client';
import { attachments, captureInbox, noteDrafts, patients, recordingJobs, type RecordingJob } from '@/db/schema';
import { assertFileWorkAvailable, withFileJob } from '@/lib/file-work';
import { newId, softDelete, stamps, touch } from '@/lib/ids';
import {
  copyImportFile,
  fingerprintImportFile,
  fingerprintRecordingSource,
  type FileFingerprint,
} from '@/platform/import-file';
import { mediaFile } from '@/platform/media';

import { addAttachmentInTransaction, attachmentPatientInTransaction, type AttachmentTarget } from './queries';

const ids = new WeakMap<Recording, string>();
const running = new Map<string, Promise<string>>();
const discarding = new Map<string, Promise<void>>();

function conflict(): never {
  throw new Error('وضعیت این وویس تغییر کرده است؛ دوباره ثبت نشد.');
}

function jobPath(id: string): string {
  if (!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id)) conflict();
  return `media/imports/voice-${id}.m4a`;
}

function requirePath(row: RecordingJob): void {
  if (row.relativePath !== jobPath(row.id)) conflict();
  if (
    !row.sourceUri.startsWith('file://') ||
    !Number.isSafeInteger(row.durationMs) ||
    row.durationMs < 500 ||
    !Number.isFinite(row.capturedAt.getTime()) ||
    (row.checksum == null) !== (row.sizeBytes == null)
  )
    conflict();
  if (row.checksum != null) requireFingerprint({ checksum: row.checksum, sizeBytes: row.sizeBytes! });
  else if (row.state === 'ready' || row.state === 'saved') conflict();
}

/** Both live and deleted references protect bytes; draft trash is recoverable too. */
function referenced(tx: DbTransaction, path: string): boolean {
  return (
    !!tx
      .select({ id: attachments.id })
      .from(attachments)
      .where(
        or(eq(attachments.relativePath, path), eq(attachments.originalPath, path), eq(attachments.thumbnailPath, path)),
      )
      .get() ||
    tx
      .select({ voices: noteDrafts.voices })
      .from(noteDrafts)
      .all()
      .some((row) => row.voices?.some((v) => v.relativePath === path))
  );
}

/** Compare the complete captured intent across every async boundary. */
function sameSnapshot(row: RecordingJob, expected: RecordingJob): boolean {
  const fields = [
    'id',
    'entityType',
    'entityId',
    'patientId',
    'sourceUri',
    'durationMs',
    'relativePath',
    'state',
    'revision',
    'checksum',
    'sizeBytes',
    'attachmentId',
  ] as const;
  return (
    fields.every((key) => row[key] === expected[key]) &&
    row.capturedAt.getTime() === expected.capturedAt.getTime() &&
    row.createdAt.getTime() === expected.createdAt.getTime() &&
    row.updatedAt.getTime() === expected.updatedAt.getTime() &&
    row.deletedAt?.getTime() === expected.deletedAt?.getTime()
  );
}

function current(tx: DbTransaction, expected: RecordingJob): RecordingJob {
  const row = tx.select().from(recordingJobs).where(eq(recordingJobs.id, expected.id)).get();
  if (!row || row.deletedAt || !sameSnapshot(row, expected)) conflict();
  requirePath(row);
  return row;
}

/** Null is a captured owner too; it must not become an implicit new patient. */
function requireOwner(tx: DbTransaction, row: RecordingJob): void {
  requireUnfiledCapture(tx, row);
  if (attachmentPatientInTransaction(tx, row) !== row.patientId) conflict();
}

function requireUnfiledCapture(tx: DbTransaction, target: AttachmentTarget): void {
  if (target.entityType !== 'capture') return;
  const row = tx
    .select({ filedAt: captureInbox.filedAt })
    .from(captureInbox)
    .where(and(eq(captureInbox.id, target.entityId), isNull(captureInbox.deletedAt)))
    .get();
  if (!row || row.filedAt) conflict();
}

function requireFingerprint(file: FileFingerprint): void {
  if (!/^[0-9a-f]{64}$/.test(file.checksum) || !Number.isSafeInteger(file.sizeBytes) || file.sizeBytes <= 0)
    throw new Error('فایل وویس کامل خوانده نشد؛ دوباره تلاش کنید.');
}

function matches(row: RecordingJob, file: FileFingerprint): boolean {
  requireFingerprint(file);
  return row.checksum === file.checksum && row.sizeBytes === file.sizeBytes;
}

export function recordingJobQuery(id: string) {
  return db.select().from(recordingJobs).where(eq(recordingJobs.id, id)).limit(1);
}

export function pendingRecordingsQuery(target?: AttachmentTarget, excludeId?: string) {
  return db
    .select({ job: recordingJobs, firstName: patients.firstName, lastName: patients.lastName })
    .from(recordingJobs)
    .leftJoin(patients, eq(patients.id, recordingJobs.patientId))
    .where(
      and(
        or(
          and(isNull(recordingJobs.deletedAt), ne(recordingJobs.state, 'saved')),
          eq(recordingJobs.state, 'discarding'),
        ),
        target ? eq(recordingJobs.entityType, target.entityType) : undefined,
        target ? eq(recordingJobs.entityId, target.entityId) : undefined,
        excludeId ? ne(recordingJobs.id, excludeId) : undefined,
      ),
    )
    .orderBy(asc(recordingJobs.createdAt), asc(recordingJobs.id));
}

/** Reserve identity, destination and path before the first native await. */
export function beginRecordingJob(recording: Recording, target: AttachmentTarget, now: Date): RecordingJob {
  assertFileWorkAvailable();
  if (!recording.uri.startsWith('file://') || !Number.isSafeInteger(recording.durationMs) || recording.durationMs < 500)
    throw new Error('اطلاعات وویس معتبر نیست؛ فایل ثبت نشد.');
  const id = recordingOperationId(recording);
  const path = jobPath(id);
  return db.transaction((tx) => {
    requireUnfiledCapture(tx, target);
    const patientId = attachmentPatientInTransaction(tx, target);
    const previous = tx.select().from(recordingJobs).where(eq(recordingJobs.id, id)).get();
    const capturedAt = recording.capturedAt ?? previous?.capturedAt ?? now;
    if (!Number.isFinite(capturedAt.getTime())) throw new Error('زمان ضبط معتبر نیست؛ فایل ثبت نشد.');
    if (previous) {
      requirePath(previous);
      if (
        previous.deletedAt ||
        previous.sourceUri !== recording.uri ||
        previous.durationMs !== recording.durationMs ||
        previous.capturedAt.getTime() !== capturedAt.getTime() ||
        previous.relativePath !== path ||
        previous.entityType !== target.entityType ||
        previous.entityId !== target.entityId ||
        previous.patientId !== patientId
      )
        conflict();
      return previous;
    }
    if (referenced(tx, path)) conflict();
    tx.insert(recordingJobs)
      .values({
        id,
        ...stamps(now),
        entityType: target.entityType,
        entityId: target.entityId,
        patientId,
        sourceUri: recording.uri,
        durationMs: recording.durationMs,
        capturedAt,
        relativePath: path,
      })
      .run();
    return tx.select().from(recordingJobs).where(eq(recordingJobs.id, id)).get()!;
  });
}

export function recordingOperationId(recording: Recording): string {
  const id = recording.operationId ?? ids.get(recording) ?? newId();
  if (ids.has(recording) && ids.get(recording) !== id) conflict();
  jobPath(id);
  ids.set(recording, id);
  return id;
}

/** A recorder that still owns failed acknowledgement clears its own pending capture. */
export async function discardStoppedRecording(
  recording: Recording,
  target: AttachmentTarget,
  now: Date,
): Promise<void> {
  const id = recordingOperationId(recording);
  const row = recordingJobQuery(id).get();
  if (!row) return; // Reservation itself failed: no durable destination to discard.
  if (
    row.sourceUri !== recording.uri ||
    row.durationMs !== recording.durationMs ||
    row.entityType !== target.entityType ||
    row.entityId !== target.entityId ||
    (recording.capturedAt && recording.capturedAt.getTime() !== row.capturedAt.getTime())
  )
    conflict();
  await discardRecording(id, now);
}

function transition(expected: RecordingJob, patch: Partial<RecordingJob>, now: Date): RecordingJob {
  assertFileWorkAvailable();
  return db.transaction((tx) => {
    const row = current(tx, expected);
    requireOwner(tx, row);
    if (row.state !== 'copying' || row.attachmentId || referenced(tx, row.relativePath)) conflict();
    tx.update(recordingJobs)
      .set({ ...patch, revision: row.revision + 1, ...touch(now) })
      .where(eq(recordingJobs.id, row.id))
      .run();
    return tx.select().from(recordingJobs).where(eq(recordingJobs.id, row.id)).get()!;
  });
}

function savedAttachment(tx: DbTransaction, row: RecordingJob): string {
  const audio = row.attachmentId && tx.select().from(attachments).where(eq(attachments.id, row.attachmentId)).get();
  if (
    !audio ||
    audio.deletedAt ||
    audio.entityType !== row.entityType ||
    audio.entityId !== row.entityId ||
    audio.patientId !== row.patientId ||
    audio.kind !== 'voice' ||
    audio.relativePath !== row.relativePath ||
    audio.sizeBytes !== row.sizeBytes ||
    audio.checksum !== row.checksum ||
    audio.durationMs !== row.durationMs ||
    audio.capturedAt?.getTime() !== row.capturedAt.getTime()
  )
    conflict();
  return audio.id;
}

/** Attachment, checksum and operation acknowledgement share one synchronous transaction. */
function commit(expected: RecordingJob, file: FileFingerprint, now: Date): string {
  assertFileWorkAvailable();
  return db.transaction((tx) => {
    const row = current(tx, expected);
    requireOwner(tx, row);
    if (!matches(row, file)) throw new Error('محتوای فایل وویس تغییر کرده است؛ دوباره ثبت نشد.');
    if (row.state === 'saved') return savedAttachment(tx, row);
    if (row.state !== 'ready' || row.attachmentId || referenced(tx, row.relativePath)) conflict();
    const id = addAttachmentInTransaction(tx, {
      entityType: row.entityType,
      entityId: row.entityId,
      patientId: row.patientId,
      kind: 'voice',
      relativePath: row.relativePath,
      sizeBytes: row.sizeBytes,
      durationMs: row.durationMs,
      capturedAt: row.capturedAt,
      mimeType: 'audio/mp4',
    });
    tx.update(attachments).set({ checksum: row.checksum }).where(eq(attachments.id, id)).run();
    if (row.entityType === 'capture') {
      tx.update(captureInbox)
        .set({ kind: 'voice', ...touch(now) })
        .where(eq(captureInbox.id, row.entityId))
        .run();
    }
    tx.update(recordingJobs)
      .set({ state: 'saved', attachmentId: id, revision: row.revision + 1, ...touch(now) })
      .where(eq(recordingJobs.id, row.id))
      .run();
    return id;
  });
}

async function run(expected: RecordingJob, now: Date): Promise<string> {
  const previous = running.get(expected.id);
  if (previous) return previous;
  const work = (async () => {
    let row = expected;
    let actual: FileFingerprint;
    if (row.state === 'copying') {
      if (row.checksum == null) {
        const source = await fingerprintRecordingSource(row.sourceUri);
        requireFingerprint(source);
        row = transition(row, source, now);
      }
      // A crash after copy but before ready can recover from the journal's source hash.
      let complete: FileFingerprint | null = null;
      try {
        complete = await fingerprintImportFile(row.relativePath);
      } catch {
        /* Unpublished partial/missing copy. */
      }
      if (complete && matches(row, complete)) actual = complete;
      else {
        const source = await fingerprintRecordingSource(row.sourceUri);
        if (!matches(row, source)) throw new Error('فایل اولیهٔ وویس تغییر کرده است؛ کپی جایگزین نشد.');
        db.transaction((tx) => {
          const checked = current(tx, row);
          requireOwner(tx, checked);
          if (referenced(tx, checked.relativePath)) conflict();
        });
        actual = await copyImportFile(row.sourceUri, row.relativePath, row.sizeBytes);
        if (!matches(row, actual)) throw new Error('کپی وویس با فایل اولیه یکسان نیست؛ ثبت نشد.');
      }
      row = transition(row, { state: 'ready' }, now);
    } else actual = await fingerprintImportFile(row.relativePath);
    return commit(row, actual, now);
  })();
  running.set(expected.id, work);
  try {
    return await work;
  } finally {
    if (running.get(expected.id) === work) running.delete(expected.id);
  }
}

export async function persistRecording(recording: Recording, target: AttachmentTarget, now: Date): Promise<string> {
  return withFileJob(() => run(beginRecordingJob(recording, target, now), now));
}

export async function resumeRecording(id: string, now: Date): Promise<string> {
  return withFileJob(() => {
    const row = recordingJobQuery(id).get();
    if (!row || row.deletedAt || row.state === 'discarding' || row.state === 'discarded') conflict();
    requirePath(row);
    return run(row, now);
  });
}

/** Confirmed discard only; never delete original cache or any clinical/draft reference. */
export async function discardRecording(id: string, now: Date): Promise<void> {
  return withFileJob(() => {
    const previous = discarding.get(id);
    if (previous) return previous;
    const work = discardJob(id, now);
    discarding.set(id, work);
    return work.finally(() => {
      if (discarding.get(id) === work) discarding.delete(id);
    });
  });
}

async function discardJob(id: string, now: Date): Promise<void> {
  const row = db.transaction((tx) => {
    const saved = tx.select().from(recordingJobs).where(eq(recordingJobs.id, id)).get();
    if (!saved || saved.state === 'saved' || saved.attachmentId) conflict();
    requirePath(saved);
    if (referenced(tx, saved.relativePath)) conflict();
    if (!saved.deletedAt)
      tx.update(recordingJobs)
        .set({ ...softDelete(now), state: 'discarding', revision: saved.revision + 1 })
        .where(eq(recordingJobs.id, id))
        .run();
    return tx.select().from(recordingJobs).where(eq(recordingJobs.id, id)).get()!;
  });
  if (row.state === 'discarded') return;
  await audit('recording.discarded', { entityType: 'recording_job', entityId: id });
  await running.get(id)?.catch(() => undefined);
  db.transaction((tx) => {
    const checked = tx.select().from(recordingJobs).where(eq(recordingJobs.id, id)).get();
    if (
      !checked ||
      checked.state !== 'discarding' ||
      !checked.deletedAt ||
      !sameSnapshot(checked, row) ||
      checked.attachmentId ||
      referenced(tx, row.relativePath)
    )
      conflict();
    const file = mediaFile(row.relativePath);
    if (file.exists) {
      try {
        file.delete();
      } catch {
        throw new Error('لغو ثبت شد؛ پاک‌کردن کپی ناتمام انجام نشد.');
      }
    }
    tx.update(recordingJobs)
      .set({ state: 'discarded', ...touch(now) })
      .where(eq(recordingJobs.id, id))
      .run();
  });
}
