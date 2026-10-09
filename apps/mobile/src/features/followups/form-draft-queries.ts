import { and, eq, isNull } from 'drizzle-orm';

import { audit } from '@/db/audit';
import { db, type DbTransaction } from '@/db/client';
import { encounters, followUpFormDrafts, followUps, patients, type FollowUpFormDraft } from '@/db/schema';
import { encounterRecencyOrder } from '@/features/encounters/status';
import { softDelete, stamps, touch } from '@/lib/ids';

import {
  decodeFollowUpForm,
  encodeFollowUpForm,
  FollowUpFormConflict,
  followUpFormValues,
  type FollowUpFormDocument,
} from './form-draft';
import { createFollowUpInTransaction } from './queries';
import { reconcileFollowUpReminder } from './reminder-queries';

const openPatient = (patientId: string) =>
  and(eq(followUpFormDrafts.patientId, patientId), isNull(followUpFormDrafts.deletedAt));

function requireDraftContext(tx: DbTransaction, patientId: string, encounterId: string | null): void {
  if (!tx.select({ id: patients.id }).from(patients).where(eq(patients.id, patientId)).get())
    throw new FollowUpFormConflict('پروندهٔ بیمار پیدا نشد؛ نوشته روی صفحه باقی مانده است.');
  if (
    encounterId &&
    !tx
      .select({ id: encounters.id })
      .from(encounters)
      .where(and(eq(encounters.id, encounterId), eq(encounters.patientId, patientId)))
      .get()
  )
    throw new FollowUpFormConflict();
}

/** One read snapshot for identity, existing draft and the editor's captured encounter. */
export function followUpFormQuery(patientId: string) {
  return db
    .select({ patient: patients, draft: followUpFormDrafts, encounter: encounters })
    .from(patients)
    .leftJoin(
      followUpFormDrafts,
      and(eq(followUpFormDrafts.patientId, patients.id), isNull(followUpFormDrafts.deletedAt)),
    )
    .leftJoin(
      encounters,
      and(eq(encounters.patientId, patients.id), isNull(encounters.deletedAt), eq(encounters.isActive, true)),
    )
    .where(and(eq(patients.id, patientId), isNull(patients.deletedAt)))
    .orderBy(...encounterRecencyOrder())
    .limit(1);
}
export type FollowUpFormRow = Awaited<ReturnType<typeof followUpFormQuery>>[number];
export type FollowUpFormComparison = { row: FollowUpFormRow; original: FollowUpFormDraft | null };

export async function inspectFollowUpForm(patientId: string, id: string): Promise<FollowUpFormComparison> {
  // Both synchronous reads happen without yielding to another app operation.
  const row = followUpFormQuery(patientId).get();
  if (!row) throw new FollowUpFormConflict('پروندهٔ بیمار پیدا نشد؛ پیش‌نویس نگه داشته شد.');
  const original = db.select().from(followUpFormDrafts).where(eq(followUpFormDrafts.id, id)).get() ?? null;
  if (original && original.patientId !== patientId) throw new FollowUpFormConflict();
  return { row, original };
}

export async function saveFollowUpFormDraft(
  id: string,
  patientId: string,
  encounterId: string | null,
  document: FollowUpFormDocument,
  expectedRevision: number,
): Promise<number> {
  const body = encodeFollowUpForm(document);
  return db.transaction((tx) => {
    const current = tx.select().from(followUpFormDrafts).where(eq(followUpFormDrafts.id, id)).get();
    if (!current) {
      if (expectedRevision !== 0 || tx.select().from(followUpFormDrafts).where(openPatient(patientId)).get())
        throw new FollowUpFormConflict();
      if (JSON.stringify(document.fields) === JSON.stringify(document.initial)) return 0;
      // A soft-deleted parent may still retain its final raw text. Publication
      // below requires a live patient and cannot revive either parent.
      requireDraftContext(tx, patientId, encounterId);
      tx.insert(followUpFormDrafts)
        .values({ id, ...stamps(), patientId, encounterId, body, revision: 1 })
        .run();
      return 1;
    }
    if (
      current.patientId !== patientId ||
      current.encounterId !== encounterId ||
      current.deletedAt ||
      current.committedFollowUpId ||
      current.revision !== expectedRevision
    )
      throw new FollowUpFormConflict();
    if (JSON.stringify(decodeFollowUpForm(current.body).initial) !== JSON.stringify(document.initial))
      throw new FollowUpFormConflict();
    if (current.body === body) return current.revision;
    const revision = current.revision + 1;
    tx.update(followUpFormDrafts)
      .set({ body, revision, ...touch() })
      .where(eq(followUpFormDrafts.id, id))
      .run();
    return revision;
  });
}

/** Clinical insert and draft retirement share a transaction; Android is touched afterward. */
export async function commitFollowUpFormDraft(
  id: string,
  patientId: string,
  expectedRevision: number,
  now: Date,
): Promise<string> {
  const followUpId = db.transaction((tx) => {
    const row = tx.select().from(followUpFormDrafts).where(eq(followUpFormDrafts.id, id)).get();
    if (!row || row.patientId !== patientId) throw new FollowUpFormConflict();
    if (row.committedFollowUpId && row.revision === expectedRevision + 1) {
      const saved = tx
        .select()
        .from(followUps)
        .where(
          and(
            eq(followUps.id, row.committedFollowUpId),
            eq(followUps.patientId, patientId),
            isNull(followUps.deletedAt),
          ),
        )
        .get();
      const patient = tx
        .select({ id: patients.id })
        .from(patients)
        .where(and(eq(patients.id, patientId), isNull(patients.deletedAt)))
        .get();
      if (!saved || !patient) throw new FollowUpFormConflict('پیگیری ثبت‌شده در دسترس نیست؛ دوباره ساخته نشد.');
      return saved.id;
    }
    if (row.deletedAt || row.revision !== expectedRevision) throw new FollowUpFormConflict();
    const input = followUpFormValues(decodeFollowUpForm(row.body).fields, now);
    const result = createFollowUpInTransaction(tx, { patientId, ...input }, now, { encounterId: row.encounterId });
    tx.update(followUpFormDrafts)
      .set({ committedFollowUpId: result, revision: row.revision + 1, ...softDelete(now) })
      .where(eq(followUpFormDrafts.id, id))
      .run();
    return result;
  });
  await reconcileFollowUpReminder(followUpId, true);
  return followUpId;
}

/** Replace only the version the owner actually compared, retaining captured provenance. */
export async function replaceFollowUpFormDraft(
  id: string,
  patientId: string,
  encounterId: string | null,
  document: FollowUpFormDocument,
  comparison: FollowUpFormComparison,
): Promise<{ id: string; revision: number; document: FollowUpFormDocument }> {
  return db.transaction((tx) => {
    const original = tx.select().from(followUpFormDrafts).where(eq(followUpFormDrafts.id, id)).get();
    if (original && (original.patientId !== patientId || original.deletedAt || original.committedFollowUpId))
      throw new FollowUpFormConflict('این پیش‌نویس بسته شده است؛ نسخهٔ ذخیره‌شده را بارگذاری کنید.');
    const live = tx.select().from(followUpFormDrafts).where(openPatient(patientId)).get();
    const shown = comparison.row.draft;
    if (
      comparison.row.patient.id !== patientId ||
      live?.id !== shown?.id ||
      live?.revision !== shown?.revision ||
      (live && live.encounterId !== encounterId)
    )
      throw new FollowUpFormConflict();
    if (!live) {
      if (original) throw new FollowUpFormConflict();
      // No other draft was displayed. This insert enforces the same origin as autosave.
      requireDraftContext(tx, patientId, encounterId);
      const body = encodeFollowUpForm(document);
      tx.insert(followUpFormDrafts)
        .values({ id, ...stamps(), patientId, encounterId, body, revision: 1 })
        .run();
      return { id, revision: 1, document };
    }
    const next = { ...document, initial: decodeFollowUpForm(live.body).initial };
    const body = encodeFollowUpForm(next);
    const revision = live.revision + 1;
    tx.update(followUpFormDrafts)
      .set({ body, revision, ...touch() })
      .where(eq(followUpFormDrafts.id, live.id))
      .run();
    return { id: live.id, revision, document: next };
  });
}

export async function discardFollowUpFormDraft(id: string, patientId: string, expectedRevision: number): Promise<void> {
  db.transaction((tx) => {
    const row = tx.select().from(followUpFormDrafts).where(eq(followUpFormDrafts.id, id)).get();
    if (!row && expectedRevision === 0) return;
    if (
      !row ||
      row.patientId !== patientId ||
      row.deletedAt ||
      row.committedFollowUpId ||
      row.revision !== expectedRevision
    )
      throw new FollowUpFormConflict();
    tx.update(followUpFormDrafts)
      .set({ revision: row.revision + 1, ...softDelete() })
      .where(eq(followUpFormDrafts.id, id))
      .run();
  });
  await audit('followup.draftDiscarded', { entityType: 'followUpFormDraft', entityId: id });
}
