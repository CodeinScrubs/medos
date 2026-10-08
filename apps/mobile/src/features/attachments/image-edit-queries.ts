import { and, desc, eq, isNotNull, isNull } from 'drizzle-orm';
import { z } from 'zod';

import { audit } from '@/db/audit';
import { db, type DbTransaction } from '@/db/client';
import { attachments, imageEditDrafts, imageEditVersions, type Attachment } from '@/db/schema';
import { newId, softDelete, stamps, touch } from '@/lib/ids';
import {
  decodeImageDocument,
  decodeImageDraft,
  encodeImageDocument,
  encodeImageDraft,
  ImageEditConflict,
  initialImageDocument,
  type ImageDocument,
  type ImageDraftDocument,
} from '@/lib/image-edit';

import { attachmentPatientInTransaction } from './queries';

const basisSchema = z
  .object({
    attachmentId: z.string(),
    entityType: z.string(),
    entityId: z.string(),
    patientId: z.string().nullable(),
    sourcePath: z.string(),
    width: z.number().finite().positive(),
    height: z.number().finite().positive(),
    revision: z.number().int().nonnegative(),
    imageBody: z.string(),
  })
  .strict();
export type ImageEditBasis = z.infer<typeof basisSchema>;
const openDraft = (id: string) => and(eq(imageEditDrafts.attachmentId, id), isNull(imageEditDrafts.deletedAt));

export function imageEditQuery(id: string) {
  return db
    .select({ attachment: attachments, draft: imageEditDrafts })
    .from(attachments)
    .leftJoin(imageEditDrafts, and(eq(imageEditDrafts.attachmentId, attachments.id), isNull(imageEditDrafts.deletedAt)))
    .where(and(eq(attachments.id, id), isNull(attachments.deletedAt)))
    .limit(1);
}
export type ImageEditRow = Awaited<ReturnType<typeof imageEditQuery>>[number];
export function imageVersionsQuery(id: string) {
  return db
    .select()
    .from(imageEditVersions)
    .where(and(eq(imageEditVersions.attachmentId, id), isNull(imageEditVersions.deletedAt)))
    .orderBy(desc(imageEditVersions.revision));
}
export function imageShelvedDraftsQuery(id: string) {
  return db
    .select()
    .from(imageEditDrafts)
    .where(
      and(
        eq(imageEditDrafts.attachmentId, id),
        isNotNull(imageEditDrafts.deletedAt),
        isNull(imageEditDrafts.committedVersionId),
      ),
    )
    .orderBy(desc(imageEditDrafts.updatedAt));
}
export function attachmentImageDocument(row: Attachment): ImageDocument {
  if (!row.width || !row.height || row.kind === 'voice' || row.kind === 'video')
    throw new Error('ابعاد این فایل برای ویرایش عکس در دسترس نیست.');
  const doc = row.imageEditBody
    ? decodeImageDocument(row.imageEditBody)
    : initialImageDocument(row.relativePath, row.width, row.height);
  if (doc.sourcePath !== row.relativePath || doc.width !== row.width || doc.height !== row.height)
    throw new ImageEditConflict('سند ویرایش با فایل عکس مطابقت ندارد.');
  return doc;
}
export function imageEditSeed(row: ImageEditRow) {
  const a = row.attachment;
  const basis: ImageEditBasis = row.draft
    ? basisSchema.parse(JSON.parse(row.draft.basis))
    : {
        attachmentId: a.id,
        entityType: a.entityType,
        entityId: a.entityId,
        patientId: a.patientId,
        sourcePath: a.relativePath,
        width: a.width ?? 0,
        height: a.height ?? 0,
        revision: a.imageEditRevision,
        imageBody: encodeImageDocument(attachmentImageDocument(a)),
      };
  const document: ImageDraftDocument = row.draft
    ? decodeImageDraft(row.draft.body)
    : { version: 1, image: decodeImageDocument(basis.imageBody), pendingText: null };
  if (basis.attachmentId !== a.id || row.draft?.committedVersionId || !sameSource(document.image, basis))
    throw new ImageEditConflict();
  return { row, basis, document };
}
export type ImageEditSeed = ReturnType<typeof imageEditSeed>;
export type ImageEditComparison = { row: ImageEditRow; basis: ImageEditBasis; document: ImageDraftDocument };

export async function inspectImageEdit(basis: ImageEditBasis): Promise<ImageEditComparison> {
  return db.transaction((tx) => {
    requireOrigin(tx, basis, true);
    const row = imageEditQuery(basis.attachmentId).get();
    if (!row) throw new ImageEditConflict();
    const current = imageEditSeed({ attachment: row.attachment, draft: null });
    return { row, basis: current.basis, document: row.draft ? decodeImageDraft(row.draft.body) : current.document };
  });
}

/** Explicit conflict choice, after displaying the compared version. Keep both raw branches. */
export async function resolveImageEdit(
  origin: ImageEditBasis,
  local: ImageDraftDocument,
  shown: ImageEditComparison,
  choice: 'local' | 'stored',
): Promise<{ id: string; revision: number; basis: ImageEditBasis; document: ImageDraftDocument }> {
  const localBody = encodeImageDraft(local);
  const resolved = db.transaction((tx) => {
    requireOrigin(tx, origin, true);
    requirePublishedBasis(tx, shown.basis);
    if (shown.basis.attachmentId !== origin.attachmentId || !sameSource(local.image, shown.basis))
      throw new ImageEditConflict();
    const current = tx.select().from(imageEditDrafts).where(openDraft(origin.attachmentId)).get();
    if (
      current?.id !== shown.row.draft?.id ||
      current?.revision !== shown.row.draft?.revision ||
      current?.body !== shown.row.draft?.body
    )
      throw new ImageEditConflict();
    // Even a value which never passed autosave gets a recoverable shelf before adoption.
    tx.insert(imageEditDrafts)
      .values({
        id: newId(),
        ...softDelete(),
        createdAt: new Date(),
        attachmentId: origin.attachmentId,
        basis: JSON.stringify(origin),
        body: localBody,
        revision: 1,
      })
      .run();
    if (current)
      tx.update(imageEditDrafts)
        .set({ revision: current.revision + 1, ...softDelete() })
        .where(eq(imageEditDrafts.id, current.id))
        .run();
    const document = choice === 'local' ? local : shown.document;
    if (!sameSource(document.image, shown.basis)) throw new ImageEditConflict();
    const id = newId();
    tx.insert(imageEditDrafts)
      .values({
        id,
        ...stamps(),
        attachmentId: origin.attachmentId,
        basis: JSON.stringify(shown.basis),
        body: encodeImageDraft(document),
        revision: 1,
      })
      .run();
    return { id, revision: 1, basis: shown.basis, document };
  });
  await audit('image.draftResolved', { entityType: 'attachment', entityId: origin.attachmentId });
  return resolved;
}
function sameSource(doc: ImageDocument, b: ImageEditBasis) {
  return doc.sourcePath === b.sourcePath && doc.width === b.width && doc.height === b.height;
}
function requireOrigin(tx: DbTransaction, basis: ImageEditBasis, live = false): Attachment {
  const a = tx.select().from(attachments).where(eq(attachments.id, basis.attachmentId)).get();
  if (
    !a ||
    a.entityType !== basis.entityType ||
    a.entityId !== basis.entityId ||
    a.patientId !== basis.patientId ||
    a.relativePath !== basis.sourcePath ||
    a.width !== basis.width ||
    a.height !== basis.height ||
    (live && a.deletedAt)
  )
    throw new ImageEditConflict();
  if (live && attachmentPatientInTransaction(tx, a) !== basis.patientId) throw new ImageEditConflict();
  return a;
}
function requirePublishedBasis(tx: DbTransaction, basis: ImageEditBasis) {
  const a = requireOrigin(tx, basis, true);
  if (a.imageEditRevision !== basis.revision || encodeImageDocument(attachmentImageDocument(a)) !== basis.imageBody)
    throw new ImageEditConflict();
  return a;
}

export async function saveImageEditDraft(
  id: string,
  basis: ImageEditBasis,
  document: ImageDraftDocument,
  expectedRevision: number,
): Promise<number> {
  const body = encodeImageDraft(document),
    basisBody = JSON.stringify(basisSchema.parse(basis));
  if (!sameSource(document.image, basis)) throw new ImageEditConflict();
  return db.transaction((tx) => {
    requireOrigin(tx, basis);
    const current = tx.select().from(imageEditDrafts).where(eq(imageEditDrafts.id, id)).get();
    if (!current) {
      if (expectedRevision !== 0 || tx.select().from(imageEditDrafts).where(openDraft(basis.attachmentId)).get())
        throw new ImageEditConflict();
      if (encodeImageDocument(document.image) === basis.imageBody && !document.pendingText) return 0;
      tx.insert(imageEditDrafts)
        .values({ id, ...stamps(), attachmentId: basis.attachmentId, basis: basisBody, body, revision: 1 })
        .run();
      return 1;
    }
    if (
      current.basis !== basisBody ||
      current.attachmentId !== basis.attachmentId ||
      current.deletedAt ||
      current.committedVersionId ||
      current.revision !== expectedRevision
    )
      throw new ImageEditConflict();
    if (current.body === body) return current.revision;
    tx.update(imageEditDrafts)
      .set({ body, revision: current.revision + 1, ...touch() })
      .where(eq(imageEditDrafts.id, id))
      .run();
    return current.revision + 1;
  });
}

/** Version insert, attachment document and draft retirement succeed or roll back together. */
export async function publishImageEditDraft(
  id: string,
  basis: ImageEditBasis,
  expectedRevision: number,
): Promise<string> {
  const versionId = db.transaction((tx) => {
    const row = tx.select().from(imageEditDrafts).where(eq(imageEditDrafts.id, id)).get();
    if (!row || row.attachmentId !== basis.attachmentId || row.basis !== JSON.stringify(basis))
      throw new ImageEditConflict();
    if (row.committedVersionId && row.revision === expectedRevision + 1) {
      const a = requireOrigin(tx, basis, true);
      const saved = tx.select().from(imageEditVersions).where(eq(imageEditVersions.id, row.committedVersionId)).get();
      if (!saved || saved.deletedAt || saved.attachmentId !== a.id) throw new ImageEditConflict();
      return saved.id;
    }
    if (row.deletedAt || row.revision !== expectedRevision) throw new ImageEditConflict();
    const draft = decodeImageDraft(row.body);
    if (draft.pendingText) throw new Error('نوشتهٔ روی عکس هنوز تأیید نشده است.');
    requirePublishedBasis(tx, basis);
    if (!sameSource(draft.image, basis)) throw new ImageEditConflict();
    const base = tx
      .select()
      .from(imageEditVersions)
      .where(
        and(eq(imageEditVersions.attachmentId, basis.attachmentId), eq(imageEditVersions.revision, basis.revision)),
      )
      .get();
    if (!base)
      tx.insert(imageEditVersions)
        .values({
          id: newId(),
          ...stamps(),
          attachmentId: basis.attachmentId,
          revision: basis.revision,
          body: basis.imageBody,
        })
        .run();
    const version = {
      id: newId(),
      ...stamps(),
      attachmentId: basis.attachmentId,
      revision: basis.revision + 1,
      body: encodeImageDocument(draft.image),
    };
    tx.insert(imageEditVersions).values(version).run();
    tx.update(attachments)
      .set({ imageEditBody: version.body, imageEditRevision: version.revision, ...touch() })
      .where(eq(attachments.id, basis.attachmentId))
      .run();
    tx.update(imageEditDrafts)
      .set({ committedVersionId: version.id, revision: row.revision + 1, ...softDelete() })
      .where(eq(imageEditDrafts.id, id))
      .run();
    return version.id;
  });
  await audit('image.editPublished', { entityType: 'attachment', entityId: basis.attachmentId });
  return versionId;
}

export async function discardImageEditDraft(
  id: string,
  basis: ImageEditBasis,
  expectedRevision: number,
): Promise<void> {
  db.transaction((tx) => {
    requireOrigin(tx, basis);
    const row = tx.select().from(imageEditDrafts).where(eq(imageEditDrafts.id, id)).get();
    if (!row && expectedRevision === 0) return;
    if (
      !row ||
      row.basis !== JSON.stringify(basis) ||
      row.deletedAt ||
      row.committedVersionId ||
      row.revision !== expectedRevision
    )
      throw new ImageEditConflict();
    tx.update(imageEditDrafts)
      .set({ revision: row.revision + 1, ...softDelete() })
      .where(eq(imageEditDrafts.id, id))
      .run();
  });
  await audit('image.draftDiscarded', { entityType: 'attachment', entityId: basis.attachmentId });
}
