import { and, eq, isNull } from 'drizzle-orm';

import { audit } from '@/db/audit';
import { db } from '@/db/client';
import { doctorProfiles, doctors, occasionFormDrafts, occasions, type OccasionFormDraft } from '@/db/schema';
import { datasetGeneration, withDatasetWrite } from '@/lib/dataset-write';
import { softDelete, stamps, touch } from '@/lib/ids';
import { logError } from '@/platform/error-log';

import { occasionReminderAt } from './logic';
import {
  decodeOccasionForm,
  encodeOccasionForm,
  OccasionFormConflict,
  occasionFormBase,
  occasionFormValues,
  type OccasionFormDocument,
} from './occasion-form-draft';
import { reconcileOccasionReminder } from './occasion-reminder-queries';
import { createOccasionInTransaction, updateOccasionInTransaction } from './occasions-queries';

const openTarget = (doctorId: string, occasionId: string | null) =>
  and(
    eq(occasionFormDrafts.doctorId, doctorId),
    eq(occasionFormDrafts.formKey, occasionId ?? 'new'),
    isNull(occasionFormDrafts.deletedAt),
  );

/** Doctor, occasion, profile and raw draft belong to one SQLite snapshot. */
export function occasionFormQuery(doctorId: string, occasionId: string | null) {
  return db
    .select({ doctor: doctors, occasion: occasions, draft: occasionFormDrafts, profile: doctorProfiles })
    .from(doctors)
    .leftJoin(
      occasions,
      and(eq(occasions.id, occasionId ?? ''), eq(occasions.doctorId, doctors.id), isNull(occasions.deletedAt)),
    )
    .leftJoin(occasionFormDrafts, openTarget(doctorId, occasionId))
    .leftJoin(doctorProfiles, and(eq(doctorProfiles.doctorId, doctors.id), isNull(doctorProfiles.deletedAt)))
    .where(
      and(eq(doctors.id, doctorId), isNull(doctors.deletedAt), occasionId ? eq(occasions.id, occasionId) : undefined),
    )
    .limit(1);
}
export type OccasionFormRow = Awaited<ReturnType<typeof occasionFormQuery>>[number];
export type OccasionFormComparison = { row: OccasionFormRow; original: OccasionFormDraft | null };

export async function inspectOccasionForm(
  id: string,
  doctorId: string,
  occasionId: string | null,
  generation = datasetGeneration(),
): Promise<OccasionFormComparison> {
  return withDatasetWrite(generation, async () => {
    const row = occasionFormQuery(doctorId, occasionId).get();
    if (!row) throw new OccasionFormConflict();
    const original = db.select().from(occasionFormDrafts).where(eq(occasionFormDrafts.id, id)).get() ?? null;
    if (original && (original.doctorId !== doctorId || original.occasionId !== occasionId))
      throw new OccasionFormConflict();
    return { row, original };
  });
}

/** An explicit compared overwrite, checked again atomically before adopting its revision. */
export async function replaceOccasionFormDraft(
  id: string,
  doctorId: string,
  occasionId: string | null,
  document: OccasionFormDocument,
  comparison: OccasionFormComparison,
  generation = datasetGeneration(),
) {
  return withDatasetWrite(generation, async () =>
    db.transaction((tx) => {
      const original = tx.select().from(occasionFormDrafts).where(eq(occasionFormDrafts.id, id)).get();
      if (
        original &&
        (original.doctorId !== doctorId ||
          original.occasionId !== occasionId ||
          original.deletedAt ||
          original.committedOccasionId)
      )
        throw new OccasionFormConflict();
      const row = occasionFormQuery(doctorId, occasionId).get();
      const shown = comparison.row;
      if (
        !row ||
        shown.doctor.id !== doctorId ||
        row.draft?.id !== shown.draft?.id ||
        row.draft?.revision !== shown.draft?.revision ||
        JSON.stringify(row.occasion ? occasionFormBase(row.occasion) : null) !==
          JSON.stringify(shown.occasion ? occasionFormBase(shown.occasion) : null)
      )
        throw new OccasionFormConflict();
      const live = row.draft;
      const initial = live ? decodeOccasionForm(live.body).initial : document.initial;
      const next: OccasionFormDocument = {
        ...document,
        initial,
        base: row.occasion ? occasionFormBase(row.occasion) : null,
      };
      const body = encodeOccasionForm(next);
      if (!live) {
        if (original) throw new OccasionFormConflict();
        tx.insert(occasionFormDrafts)
          .values({ id, doctorId, occasionId, formKey: occasionId ?? 'new', body, revision: 1, ...stamps() })
          .run();
        return { id, revision: 1, document: next };
      }
      const revision = live.revision + 1;
      tx.update(occasionFormDrafts)
        .set({ body, revision, ...touch() })
        .where(eq(occasionFormDrafts.id, live.id))
        .run();
      return { id: live.id, revision, document: next };
    }),
  );
}

export async function saveOccasionFormDraft(
  id: string,
  doctorId: string,
  occasionId: string | null,
  document: OccasionFormDocument,
  expectedRevision: number,
  generation = datasetGeneration(),
): Promise<number> {
  return withDatasetWrite(generation, async () =>
    db.transaction((tx) => {
      const body = encodeOccasionForm(document);
      const current = tx.select().from(occasionFormDrafts).where(eq(occasionFormDrafts.id, id)).get();
      if (!current) {
        if (
          expectedRevision !== 0 ||
          tx.select().from(occasionFormDrafts).where(openTarget(doctorId, occasionId)).get()
        )
          throw new OccasionFormConflict();
        // Persist an unchanged seed too: explicit Save must have a publication token.
        if (!tx.select({ id: doctors.id }).from(doctors).where(eq(doctors.id, doctorId)).get())
          throw new OccasionFormConflict();
        if (
          occasionId &&
          !tx
            .select({ id: occasions.id })
            .from(occasions)
            .where(and(eq(occasions.id, occasionId), eq(occasions.doctorId, doctorId)))
            .get()
        )
          throw new OccasionFormConflict();
        tx.insert(occasionFormDrafts)
          .values({ id, ...stamps(), doctorId, occasionId, formKey: occasionId ?? 'new', body, revision: 1 })
          .run();
        return 1;
      }
      if (
        current.doctorId !== doctorId ||
        current.occasionId !== occasionId ||
        current.deletedAt ||
        current.committedOccasionId ||
        current.revision !== expectedRevision
      )
        throw new OccasionFormConflict();
      const previous = decodeOccasionForm(current.body);
      if (
        JSON.stringify(previous.initial) !== JSON.stringify(document.initial) ||
        JSON.stringify(previous.base) !== JSON.stringify(document.base)
      )
        throw new OccasionFormConflict();
      if (current.body === body) return current.revision;
      const revision = current.revision + 1;
      tx.update(occasionFormDrafts)
        .set({ body, revision, ...touch() })
        .where(eq(occasionFormDrafts.id, id))
        .run();
      return revision;
    }),
  );
}

/** Date publication and draft retirement are atomic; scheduling remains repairable. */
export async function commitOccasionFormDraft(
  id: string,
  doctorId: string,
  occasionId: string | null,
  expectedRevision: number,
  now: Date,
  generation = datasetGeneration(),
): Promise<{ id: string; reminderPending: boolean }> {
  return withDatasetWrite(generation, async () => {
    const savedId = db.transaction((tx) => {
      const draft = tx.select().from(occasionFormDrafts).where(eq(occasionFormDrafts.id, id)).get();
      if (!draft || draft.doctorId !== doctorId || draft.occasionId !== occasionId) throw new OccasionFormConflict();
      const doctor = tx
        .select({ id: doctors.id })
        .from(doctors)
        .where(and(eq(doctors.id, doctorId), isNull(doctors.deletedAt)))
        .get();
      if (!doctor) throw new OccasionFormConflict();
      if (draft.committedOccasionId && draft.revision === expectedRevision + 1) {
        if (
          !tx
            .select({ id: occasions.id })
            .from(occasions)
            .where(
              and(
                eq(occasions.id, draft.committedOccasionId),
                eq(occasions.doctorId, doctorId),
                isNull(occasions.deletedAt),
              ),
            )
            .get()
        )
          throw new OccasionFormConflict();
        return draft.committedOccasionId;
      }
      if (draft.deletedAt || draft.revision !== expectedRevision) throw new OccasionFormConflict();
      const document = decodeOccasionForm(draft.body);
      const payload = { doctorId, ...occasionFormValues(document, now) };
      if (occasionId) {
        const current = tx
          .select()
          .from(occasions)
          .where(and(eq(occasions.id, occasionId), eq(occasions.doctorId, doctorId), isNull(occasions.deletedAt)))
          .get();
        if (!current || JSON.stringify(occasionFormBase(current)) !== JSON.stringify(document.base))
          throw new OccasionFormConflict();
        updateOccasionInTransaction(tx, occasionId, payload);
      } else if (document.base) throw new OccasionFormConflict();
      const result = occasionId ?? createOccasionInTransaction(tx, payload);
      tx.update(occasionFormDrafts)
        .set({ committedOccasionId: result, revision: draft.revision + 1, ...softDelete(now) })
        .where(eq(occasionFormDrafts.id, id))
        .run();
      return result;
    });
    await reconcileOccasionReminder(savedId, true);
    // Publication has committed. A failed native job (or status read) must
    // report a repairable reminder, never turn it into a failed Save/retry.
    let reminderPending = true;
    try {
      const saved = db.select().from(occasions).where(eq(occasions.id, savedId)).get();
      reminderPending =
        !!saved &&
        !saved.deletedAt &&
        (saved.reminderRevision !== saved.reminderAppliedRevision ||
          (!!occasionReminderAt(saved, now) && !saved.notificationId));
    } catch (error) {
      logError(error, { source: 'handled', context: 'occasion reminder status after publication' });
    }
    return { id: savedId, reminderPending };
  });
}

export async function discardOccasionFormDraft(
  id: string,
  doctorId: string,
  occasionId: string | null,
  expectedRevision: number,
  generation = datasetGeneration(),
): Promise<void> {
  await withDatasetWrite(generation, async () => {
    db.transaction((tx) => {
      const draft = tx.select().from(occasionFormDrafts).where(eq(occasionFormDrafts.id, id)).get();
      if (!draft && expectedRevision === 0) return;
      if (
        !draft ||
        draft.doctorId !== doctorId ||
        draft.occasionId !== occasionId ||
        draft.deletedAt ||
        draft.committedOccasionId ||
        draft.revision !== expectedRevision
      )
        throw new OccasionFormConflict();
      tx.update(occasionFormDrafts)
        .set({ revision: draft.revision + 1, ...softDelete() })
        .where(eq(occasionFormDrafts.id, id))
        .run();
    });
    await audit('occasion.draftDiscarded', { entityType: 'occasionFormDraft', entityId: id });
  });
}
