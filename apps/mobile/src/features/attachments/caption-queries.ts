import { and, eq, isNull } from 'drizzle-orm';

import { audit } from '@/db/audit';
import { db, type DbTransaction } from '@/db/client';
import { attachmentCaptionDrafts, attachments, type AttachmentCaptionDraft } from '@/db/schema';
import { datasetGeneration, withDatasetWrite } from '@/lib/dataset-write';
import { softDelete, stamps, touch } from '@/lib/ids';

import { CaptionConflict, decodeCaption, encodeCaption, type CaptionDocument } from './caption-draft';
import { attachmentPatientInTransaction } from './queries';

const open = (id: string) =>
  and(eq(attachmentCaptionDrafts.attachmentId, id), isNull(attachmentCaptionDrafts.deletedAt));
export function captionFormQuery(id: string, reader: Pick<typeof db, 'select'> = db) {
  return reader
    .select({ attachment: attachments, draft: attachmentCaptionDrafts })
    .from(attachments)
    .leftJoin(attachmentCaptionDrafts, open(id))
    .where(eq(attachments.id, id))
    .limit(1);
}
export type CaptionFormRow = Awaited<ReturnType<typeof captionFormQuery>>[number];
export type CaptionComparison = { row: CaptionFormRow; original: AttachmentCaptionDraft | null };
function context(row: AttachmentCaptionDraft, attachmentId: string) {
  if (row.attachmentId !== attachmentId) throw new CaptionConflict();
}
function exists(tx: DbTransaction, id: string) {
  if (!tx.select({ id: attachments.id }).from(attachments).where(eq(attachments.id, id)).get())
    throw new CaptionConflict();
}
export async function saveCaptionDraft(
  id: string,
  attachmentId: string,
  document: CaptionDocument,
  revision: number,
  generation = datasetGeneration(),
) {
  return withDatasetWrite(generation, async () =>
    db.transaction((tx) => {
      exists(tx, attachmentId);
      const body = encodeCaption(document);
      const row = tx.select().from(attachmentCaptionDrafts).where(eq(attachmentCaptionDrafts.id, id)).get();
      if (!row) {
        if (revision !== 0 || tx.select().from(attachmentCaptionDrafts).where(open(attachmentId)).get())
          throw new CaptionConflict();
        if (document.text === (document.baseCaption ?? '')) return 0;
        tx.insert(attachmentCaptionDrafts)
          .values({ id, attachmentId, body, revision: 1, ...stamps() })
          .run();
        return 1;
      }
      context(row, attachmentId);
      if (row.deletedAt || row.committedAttachmentId || row.revision !== revision) throw new CaptionConflict();
      if (decodeCaption(row.body).baseCaption !== document.baseCaption) throw new CaptionConflict();
      if (row.body === body) return revision;
      tx.update(attachmentCaptionDrafts)
        .set({ body, revision: revision + 1, ...touch() })
        .where(eq(attachmentCaptionDrafts.id, id))
        .run();
      return revision + 1;
    }),
  );
}
export async function commitCaptionDraft(
  id: string,
  attachmentId: string,
  revision: number,
  generation = datasetGeneration(),
) {
  return withDatasetWrite(generation, async () =>
    db.transaction((tx) => {
      const row = tx.select().from(attachmentCaptionDrafts).where(eq(attachmentCaptionDrafts.id, id)).get();
      const attachment = tx.select().from(attachments).where(eq(attachments.id, attachmentId)).get();
      if (!attachment || attachment.deletedAt) throw new CaptionConflict();
      attachmentPatientInTransaction(tx, attachment);
      if (!row && revision === 0) return attachmentId;
      if (!row) throw new CaptionConflict();
      context(row, attachmentId);
      if (row.committedAttachmentId === attachmentId && row.revision === revision + 1) return attachmentId;
      if (row.deletedAt || row.committedAttachmentId || row.revision !== revision) throw new CaptionConflict();
      const document = decodeCaption(row.body);
      const value = document.text.trim() || null;
      if (attachment.caption !== document.baseCaption && attachment.caption !== value) throw new CaptionConflict();
      if (attachment.caption !== value)
        tx.update(attachments)
          .set({ caption: value, ...touch() })
          .where(eq(attachments.id, attachmentId))
          .run();
      tx.update(attachmentCaptionDrafts)
        .set({ committedAttachmentId: attachmentId, revision: revision + 1, ...softDelete() })
        .where(eq(attachmentCaptionDrafts.id, id))
        .run();
      return attachmentId;
    }),
  );
}
export async function inspectCaption(
  id: string,
  attachmentId: string,
  generation = datasetGeneration(),
): Promise<CaptionComparison> {
  return withDatasetWrite(generation, async () =>
    db.transaction((tx) => {
      const row = captionFormQuery(attachmentId, tx).get();
      if (!row) throw new CaptionConflict();
      const original =
        tx.select().from(attachmentCaptionDrafts).where(eq(attachmentCaptionDrafts.id, id)).get() ?? null;
      if (original) context(original, attachmentId);
      return { row, original };
    }),
  );
}
export async function replaceCaptionDraft(
  id: string,
  attachmentId: string,
  document: CaptionDocument,
  shown: CaptionComparison,
  generation = datasetGeneration(),
) {
  return withDatasetWrite(generation, async () =>
    db.transaction((tx) => {
      const current = captionFormQuery(attachmentId, tx).get();
      if (
        !current ||
        current.attachment.caption !== shown.row.attachment.caption ||
        current.draft?.id !== shown.row.draft?.id ||
        current.draft?.revision !== shown.row.draft?.revision
      )
        throw new CaptionConflict();
      const original = tx.select().from(attachmentCaptionDrafts).where(eq(attachmentCaptionDrafts.id, id)).get();
      if (original && (original.attachmentId !== attachmentId || original.deletedAt || original.committedAttachmentId))
        throw new CaptionConflict();
      if (current.draft) decodeCaption(current.draft.body);
      const next = { ...document, baseCaption: current.attachment.caption };
      const nextId = current.draft?.id ?? id;
      const revision = (current.draft?.revision ?? 0) + 1;
      if (current.draft)
        tx.update(attachmentCaptionDrafts)
          .set({ body: encodeCaption(next), revision, ...touch() })
          .where(eq(attachmentCaptionDrafts.id, nextId))
          .run();
      else {
        if (original) throw new CaptionConflict();
        tx.insert(attachmentCaptionDrafts)
          .values({ id: nextId, attachmentId, body: encodeCaption(next), revision, ...stamps() })
          .run();
      }
      return { id: nextId, revision, document: next };
    }),
  );
}
export async function discardCaptionDraft(
  id: string,
  attachmentId: string,
  revision: number,
  generation = datasetGeneration(),
) {
  return withDatasetWrite(generation, async () => {
    db.transaction((tx) => {
      const row = tx.select().from(attachmentCaptionDrafts).where(eq(attachmentCaptionDrafts.id, id)).get();
      if (!row) {
        if (revision !== 0 || tx.select().from(attachmentCaptionDrafts).where(open(attachmentId)).get())
          throw new CaptionConflict();
        return;
      }
      context(row, attachmentId);
      if (row.deletedAt && !row.committedAttachmentId && row.revision === revision + 1) return;
      if (row.deletedAt || row.committedAttachmentId || row.revision !== revision) throw new CaptionConflict();
      tx.update(attachmentCaptionDrafts)
        .set({ revision: revision + 1, ...softDelete() })
        .where(eq(attachmentCaptionDrafts.id, id))
        .run();
    });
    await audit('attachment.captionDraftDiscarded', { entityType: 'attachment', entityId: attachmentId });
  });
}
