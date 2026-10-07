import { and, desc, eq, inArray, isNull, ne } from 'drizzle-orm';

import { audit } from '@/db/audit';
import { db, type DbTransaction } from '@/db/client';
import {
  attachments,
  captureInbox,
  credentials,
  doctors,
  encounters,
  followUps,
  ideas,
  imagingStudies,
  labPanels,
  notes,
  noteDrafts,
  patients,
  places,
  prescriptionTemplates,
  topics,
  type Attachment,
  type AttachmentEntity,
  type AttachmentKind,
} from '@/db/schema';
import { newId, softDelete, stamps, touch } from '@/lib/ids';

const alive = isNull(attachments.deletedAt);

export function attachmentQuery(id: string) {
  return db
    .select()
    .from(attachments)
    .where(and(alive, eq(attachments.id, id)))
    .limit(1);
}

export function entityAttachmentsQuery(entityType: AttachmentEntity, entityId: string) {
  return db
    .select()
    .from(attachments)
    .where(and(alive, eq(attachments.entityType, entityType), eq(attachments.entityId, entityId)))
    .orderBy(desc(attachments.capturedAt));
}

/** Everything attached anywhere in one patient's record, newest first. */
export function patientMediaQuery(patientId: string, kinds?: AttachmentKind[]) {
  return db
    .select()
    .from(attachments)
    .where(
      and(
        alive,
        eq(attachments.patientId, patientId),
        ne(attachments.entityType, 'note_draft'),
        kinds?.length ? inArray(attachments.kind, kinds) : undefined,
      ),
    )
    .orderBy(desc(attachments.capturedAt));
}

export type AttachmentInput = {
  entityType: AttachmentEntity;
  entityId: string;
  patientId?: string | null;
  kind: AttachmentKind;
  relativePath: string;
  thumbnailPath?: string | null;
  /** The untouched file, when it was kept; see `attachments.originalPath`. */
  originalPath?: string | null;
  mimeType?: string | null;
  sizeBytes?: number | null;
  width?: number | null;
  height?: number | null;
  durationMs?: number | null;
  caption?: string | null;
  bodySite?: string | null;
  capturedAt?: Date;
};

export type AttachmentTarget = Pick<AttachmentInput, 'entityType' | 'entityId' | 'patientId'>;

/** The polymorphic target and gallery owner are checked in the same write snapshot. */
export function attachmentPatientInTransaction(tx: DbTransaction, target: AttachmentTarget): string | null {
  const clinical = {
    encounter: encounters,
    note: notes,
    lab_panel: labPanels,
    imaging_study: imagingStudies,
    follow_up: followUps,
    capture: captureInbox,
  };
  const general = {
    doctor: doctors,
    topic: topics,
    idea: ideas,
    prescription_template: prescriptionTemplates,
    place: places,
    credential: credentials,
  };
  let patientId: string | null;
  if (target.entityType === 'patient') {
    patientId = target.entityId;
  } else if (target.entityType === 'note_draft') {
    // A new note's draft is its own target, never an alias for a published note.
    const draft = tx
      .select({ patientId: noteDrafts.patientId })
      .from(noteDrafts)
      .where(and(eq(noteDrafts.id, target.entityId), isNull(noteDrafts.deletedAt), isNull(noteDrafts.noteId)))
      .get();
    if (!draft) throw new Error('پیش‌نویس مقصد در دسترس نیست؛ وویس ثبت نشد.');
    patientId = draft.patientId;
  } else if (target.entityType in clinical) {
    const table = clinical[target.entityType as keyof typeof clinical];
    const row = tx
      .select({ patientId: table.patientId })
      .from(table)
      .where(and(eq(table.id, target.entityId), isNull(table.deletedAt)))
      .get();
    if (!row) throw new Error('رکورد مقصد در دسترس نیست؛ فایل ثبت نشد.');
    patientId = row.patientId;
  } else {
    const table = general[target.entityType as keyof typeof general];
    if (
      !table ||
      !tx
        .select({ id: table.id })
        .from(table)
        .where(and(eq(table.id, target.entityId), isNull(table.deletedAt)))
        .get()
    )
      throw new Error('رکورد مقصد در دسترس نیست؛ فایل ثبت نشد.');
    patientId = null;
  }
  if (
    patientId !== null &&
    !tx
      .select({ id: patients.id })
      .from(patients)
      .where(and(eq(patients.id, patientId), isNull(patients.deletedAt)))
      .get()
  )
    throw new Error('پروندهٔ بیمار در دسترس نیست؛ فایل ثبت نشد.');
  if (target.patientId != null && target.patientId !== patientId)
    throw new Error('بیمار فایل با رکورد مقصد یکسان نیست؛ فایل ثبت نشد.');
  return patientId;
}

/** Preflight before expensive native work; publication checks again inside its transaction. */
export function checkAttachmentTarget(target: AttachmentTarget): void {
  db.transaction((tx) => attachmentPatientInTransaction(tx, target));
}

export async function addAttachment(input: AttachmentInput, options: { reuseVoice?: boolean } = {}): Promise<string> {
  return db.transaction((tx) => addAttachmentInTransaction(tx, input, options));
}

/** Metadata only; file copying must finish before entering a transaction. */
export function addAttachmentInTransaction(
  tx: DbTransaction,
  input: AttachmentInput,
  { reuseVoice = false }: { reuseVoice?: boolean } = {},
): string {
  if (input.entityType === 'note_draft' && input.kind !== 'voice')
    throw new Error('این مقصد فقط برای وویس پیش‌نویس است؛ فایل ثبت نشد.');
  const patientId = attachmentPatientInTransaction(tx, input);
  // One staged recording can be retried after an acknowledged commit/navigation
  // failure. A retired or differently bound file is never silently revived/moved.
  if (reuseVoice) {
    if (input.kind !== 'voice') throw new Error('نوع فایل برای تلاش دوباره معتبر نیست.');
    const previous = tx.select().from(attachments).where(eq(attachments.relativePath, input.relativePath)).get();
    if (previous) {
      if (
        previous.deletedAt ||
        previous.entityType !== input.entityType ||
        previous.entityId !== input.entityId ||
        previous.patientId !== patientId ||
        previous.kind !== 'voice' ||
        previous.durationMs !== (input.durationMs ?? null) ||
        previous.sizeBytes !== (input.sizeBytes ?? null) ||
        previous.mimeType !== (input.mimeType ?? null) ||
        (input.capturedAt !== undefined && previous.capturedAt?.getTime() !== input.capturedAt.getTime())
      )
        throw new Error('وضعیت این وویس تغییر کرده است؛ دوباره ثبت نشد.');
      return previous.id;
    }
  }
  const id = newId();
  tx.insert(attachments)
    .values({
      id,
      ...stamps(),
      entityType: input.entityType,
      entityId: input.entityId,
      patientId,
      kind: input.kind,
      relativePath: input.relativePath,
      thumbnailPath: input.thumbnailPath ?? null,
      originalPath: input.originalPath ?? null,
      mimeType: input.mimeType ?? null,
      sizeBytes: input.sizeBytes ?? null,
      width: input.width ?? null,
      height: input.height ?? null,
      durationMs: input.durationMs ?? null,
      caption: input.caption ?? null,
      bodySite: input.bodySite ?? null,
      capturedAt: input.capturedAt ?? new Date(),
    })
    .run();
  return id;
}

export async function updateAttachment(
  id: string,
  patch: Partial<Pick<Attachment, 'caption' | 'bodySite' | 'kind' | 'transcript'>>,
): Promise<void> {
  db.transaction((tx) => {
    const row = tx
      .select()
      .from(attachments)
      .where(and(alive, eq(attachments.id, id)))
      .get();
    if (!row) throw new Error('این فایل در دسترس نیست؛ تغییر ذخیره نشد.');
    attachmentPatientInTransaction(tx, row);
    tx.update(attachments)
      .set({ ...patch, ...touch() })
      .where(eq(attachments.id, id))
      .run();
  });
}

/**
 * Soft delete. The file stays on disk so the record can be restored; reclaiming
 * space from deleted attachments is a separate, explicit "empty trash" action.
 */
export async function deleteAttachment(id: string): Promise<void> {
  await db.update(attachments).set(softDelete()).where(eq(attachments.id, id));
  await audit('attachment.deleted', { entityType: 'attachment', entityId: id });
}
