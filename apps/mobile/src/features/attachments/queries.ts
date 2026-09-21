import { and, desc, eq, inArray, isNull } from 'drizzle-orm';

import { audit } from '@/db/audit';
import { db } from '@/db/client';
import { attachments, type Attachment, type AttachmentEntity, type AttachmentKind } from '@/db/schema';
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
      and(alive, eq(attachments.patientId, patientId), kinds?.length ? inArray(attachments.kind, kinds) : undefined),
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

export async function addAttachment(input: AttachmentInput): Promise<string> {
  const id = newId();
  await db.insert(attachments).values({
    id,
    ...stamps(),
    entityType: input.entityType,
    entityId: input.entityId,
    patientId: input.patientId ?? null,
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
  });
  return id;
}

export async function updateAttachment(
  id: string,
  patch: Partial<Pick<Attachment, 'caption' | 'bodySite' | 'kind' | 'transcript'>>,
): Promise<void> {
  await db
    .update(attachments)
    .set({ ...patch, ...touch() })
    .where(and(alive, eq(attachments.id, id)));
}

/**
 * Soft delete. The file stays on disk so the record can be restored; reclaiming
 * space from deleted attachments is a separate, explicit "empty trash" action.
 */
export async function deleteAttachment(id: string): Promise<void> {
  await db.update(attachments).set(softDelete()).where(eq(attachments.id, id));
  await audit('attachment.deleted', { entityType: 'attachment', entityId: id });
}
