import { and, eq, isNull, sql } from 'drizzle-orm';

import { audit } from '@/db/audit';
import { db, type DbTransaction } from '@/db/client';
import {
  doctorFormDrafts,
  doctorProfiles,
  doctorRatings,
  doctors,
  specialties,
  type DoctorFormDraft,
} from '@/db/schema';
import { datasetGeneration, withDatasetWrite } from '@/lib/dataset-write';
import { softDelete, stamps, touch } from '@/lib/ids';
import { logError } from '@/platform/error-log';

import { DoctorFormConflict } from './edit-basis';
import {
  decodeDoctorForm,
  directoryFormBase,
  directoryFormPatch,
  encodeDoctorForm,
  profileFormBase,
  profileFormPatch,
  ratingFormValues,
  rebaseDoctorForm,
  type DoctorFormDocument,
  type DoctorFormKind,
} from './form-draft';
import { repairOccasionReminders } from './occasion-reminder-queries';
import { createDoctorInTransaction, updateDoctorInTransaction } from './queries';
import { addDoctorRatingInTransaction, saveDoctorProfileInTransaction } from './ratings-queries';

const scope = (doctorId: string | null) => doctorId ?? 'new';
const openTarget = (kind: DoctorFormKind, doctorId: string | null) =>
  and(eq(doctorFormDrafts.kind, kind), eq(doctorFormDrafts.scope, scope(doctorId)), isNull(doctorFormDrafts.deletedAt));

/** A singleton also reads the new-directory draft before mounting any blank form. */
export function doctorFormQuery(kind: DoctorFormKind, doctorId: string | null, reader: Pick<typeof db, 'select'> = db) {
  return reader
    .select({ doctor: doctors, profile: doctorProfiles, draft: doctorFormDrafts })
    .from(sql`(SELECT 1) AS doctor_form_seed`)
    .leftJoin(doctors, eq(doctors.id, doctorId ?? ''))
    .leftJoin(doctorProfiles, and(eq(doctorProfiles.doctorId, doctors.id), isNull(doctorProfiles.deletedAt)))
    .leftJoin(doctorFormDrafts, openTarget(kind, doctorId))
    .where(doctorId ? eq(doctors.id, doctorId) : undefined)
    .limit(1);
}
export type DoctorFormRow = Awaited<ReturnType<typeof doctorFormQuery>>[number];
export type DoctorFormComparison = { row: DoctorFormRow; original: DoctorFormDraft | null };
function context(row: DoctorFormDraft, kind: DoctorFormKind, doctorId: string | null) {
  if (row.kind !== kind || row.doctorId !== doctorId || row.scope !== scope(doctorId)) throw new DoctorFormConflict();
}
export function doctorFormDocumentContext(document: DoctorFormDocument, kind: DoctorFormKind, doctorId: string | null) {
  if (document.kind !== kind || (kind !== 'directory' && !doctorId)) throw new DoctorFormConflict();
  if (document.kind === 'directory' && (doctorId ? document.base?.id !== doctorId : document.base !== null))
    throw new DoctorFormConflict();
}
function exists(tx: DbTransaction, doctorId: string | null, document?: DoctorFormDocument) {
  // A deleted parent can keep raw input; publication below requires a live parent.
  if (doctorId && !tx.select({ id: doctors.id }).from(doctors).where(eq(doctors.id, doctorId)).get())
    throw new DoctorFormConflict();
  if (
    document?.kind === 'profile' &&
    document.base &&
    !tx
      .select({ id: doctorProfiles.id })
      .from(doctorProfiles)
      .where(and(eq(doctorProfiles.id, document.base.id), eq(doctorProfiles.doctorId, doctorId!)))
      .get()
  )
    throw new DoctorFormConflict();
}
export async function saveDoctorFormDraft(
  id: string,
  kind: DoctorFormKind,
  doctorId: string | null,
  document: DoctorFormDocument,
  expectedRevision: number,
  generation = datasetGeneration(),
): Promise<number> {
  return withDatasetWrite(generation, async () =>
    db.transaction((tx) => {
      const body = encodeDoctorForm(document);
      doctorFormDocumentContext(document, kind, doctorId);
      exists(tx, doctorId, document);
      const current = tx.select().from(doctorFormDrafts).where(eq(doctorFormDrafts.id, id)).get();
      if (!current) {
        if (expectedRevision !== 0 || tx.select().from(doctorFormDrafts).where(openTarget(kind, doctorId)).get())
          throw new DoctorFormConflict();
        tx.insert(doctorFormDrafts)
          .values({ id, kind, scope: scope(doctorId), doctorId, body, revision: 1, ...stamps() })
          .run();
        return 1;
      }
      context(current, kind, doctorId);
      if (current.deletedAt || current.committedEntityId || current.revision !== expectedRevision)
        throw new DoctorFormConflict();
      if (JSON.stringify(decodeDoctorForm(current.body).base) !== JSON.stringify(document.base))
        throw new DoctorFormConflict();
      if (current.body === body) return current.revision;
      const revision = current.revision + 1;
      tx.update(doctorFormDrafts)
        .set({ body, revision, ...touch() })
        .where(eq(doctorFormDrafts.id, id))
        .run();
      return revision;
    }),
  );
}
function clinicalBasis(kind: DoctorFormKind, row: DoctorFormRow) {
  return kind === 'directory'
    ? row.doctor
      ? directoryFormBase(row.doctor)
      : null
    : kind === 'profile'
      ? row.profile
        ? profileFormBase(row.profile)
        : null
      : null;
}
export function doctorFormMatchesComparison(kind: DoctorFormKind, row: DoctorFormRow, shown: DoctorFormRow) {
  return (
    row.doctor?.id === shown.doctor?.id &&
    row.doctor?.deletedAt?.getTime() === shown.doctor?.deletedAt?.getTime() &&
    row.draft?.id === shown.draft?.id &&
    row.draft?.revision === shown.draft?.revision &&
    row.draft?.body === shown.draft?.body &&
    JSON.stringify(clinicalBasis(kind, row)) === JSON.stringify(clinicalBasis(kind, shown))
  );
}
export async function inspectDoctorForm(
  id: string,
  kind: DoctorFormKind,
  doctorId: string | null,
  generation = datasetGeneration(),
): Promise<DoctorFormComparison> {
  return withDatasetWrite(generation, async () =>
    db.transaction((tx) => {
      const row = doctorFormQuery(kind, doctorId, tx).get();
      if (!row) throw new DoctorFormConflict();
      const original = tx.select().from(doctorFormDrafts).where(eq(doctorFormDrafts.id, id)).get() ?? null;
      if (original) context(original, kind, doctorId);
      return { row, original };
    }),
  );
}
/** Review both raw revision and editable published values before an explicit field-preserving rebase. */
export async function replaceDoctorFormDraft(
  id: string,
  kind: DoctorFormKind,
  doctorId: string | null,
  document: DoctorFormDocument,
  shown: DoctorFormComparison,
  generation = datasetGeneration(),
) {
  return withDatasetWrite(generation, async () =>
    db.transaction((tx) => {
      doctorFormDocumentContext(document, kind, doctorId);
      exists(tx, doctorId, document);
      const original = tx.select().from(doctorFormDrafts).where(eq(doctorFormDrafts.id, id)).get();
      if (original) {
        context(original, kind, doctorId);
        if (original.deletedAt || original.committedEntityId) throw new DoctorFormConflict();
      }
      const row = doctorFormQuery(kind, doctorId, tx).get();
      if (!row || !doctorFormMatchesComparison(kind, row, shown.row)) throw new DoctorFormConflict();
      if (row.draft) decodeDoctorForm(row.draft.body);
      const next = doctorId ? rebaseDoctorForm(document, row.doctor, row.profile) : document;
      const body = encodeDoctorForm(next);
      if (!row.draft) {
        if (original) throw new DoctorFormConflict();
        tx.insert(doctorFormDrafts)
          .values({ id, kind, scope: scope(doctorId), doctorId, body, revision: 1, ...stamps() })
          .run();
        return { id, revision: 1, document: next };
      }
      context(row.draft, kind, doctorId);
      const revision = row.draft.revision + 1;
      tx.update(doctorFormDrafts)
        .set({ body, revision, ...touch() })
        .where(eq(doctorFormDrafts.id, row.draft.id))
        .run();
      return { id: row.draft.id, revision, document: next };
    }),
  );
}
/** Atomic publication keeps the original basis across cold recovery and is replay-safe. */
export async function commitDoctorFormDraft(
  id: string,
  kind: DoctorFormKind,
  doctorId: string | null,
  expectedRevision: number,
  now: Date,
  generation = datasetGeneration(),
): Promise<string> {
  return withDatasetWrite(generation, async () => {
    const result = db.transaction((tx) => {
      const row = tx.select().from(doctorFormDrafts).where(eq(doctorFormDrafts.id, id)).get();
      if (!row) throw new DoctorFormConflict();
      context(row, kind, doctorId);
      const doctor = doctorId
        ? tx
            .select()
            .from(doctors)
            .where(and(eq(doctors.id, doctorId), isNull(doctors.deletedAt)))
            .get()
        : null;
      if (doctorId && !doctor) throw new Error('پزشک پیدا نشد یا حذف شده است؛ پیش‌نویس نگه داشته شد.');
      if (row.committedEntityId && row.revision === expectedRevision + 1) {
        const alive =
          kind === 'directory'
            ? tx
                .select({ id: doctors.id })
                .from(doctors)
                .where(and(eq(doctors.id, row.committedEntityId), isNull(doctors.deletedAt)))
                .get()
            : kind === 'profile'
              ? tx
                  .select({ id: doctorProfiles.id })
                  .from(doctorProfiles)
                  .where(
                    and(
                      eq(doctorProfiles.id, row.committedEntityId),
                      eq(doctorProfiles.doctorId, doctorId!),
                      isNull(doctorProfiles.deletedAt),
                    ),
                  )
                  .get()
              : tx
                  .select({ id: doctorRatings.id })
                  .from(doctorRatings)
                  .where(
                    and(
                      eq(doctorRatings.id, row.committedEntityId),
                      eq(doctorRatings.doctorId, doctorId!),
                      isNull(doctorRatings.deletedAt),
                    ),
                  )
                  .get();
        if (!alive) throw new DoctorFormConflict();
        return { id: row.committedEntityId, renamed: false };
      }
      if (row.deletedAt || row.committedEntityId || row.revision !== expectedRevision) throw new DoctorFormConflict();
      const document = decodeDoctorForm(row.body);
      doctorFormDocumentContext(document, kind, doctorId);
      let committed: string;
      let renamed = false;
      if (document.kind === 'directory') {
        const ids = [document.fields.specialtyId, document.fields.subspecialtyId];
        const described = ids
          .map((id) =>
            id
              ? tx.select({ name: specialties.nameFa }).from(specialties).where(eq(specialties.id, id)).get()?.name
              : null,
          )
          .filter(Boolean)
          .join(' — ');
        const patch = directoryFormPatch(document, described);
        if (doctorId) {
          renamed = updateDoctorInTransaction(tx, doctorId, patch, { id: doctorId, ...document.base!.values });
          committed = doctorId;
        } else
          committed = createDoctorInTransaction(
            tx,
            patch as ReturnType<typeof directoryFormPatch> & { firstName: string; lastName: string },
          );
      } else if (document.kind === 'profile') {
        committed = saveDoctorProfileInTransaction(
          tx,
          doctorId!,
          profileFormPatch(document, now),
          document.base ? { id: document.base.id, ...document.base.values } : null,
        );
      } else committed = addDoctorRatingInTransaction(tx, doctorId!, { ...ratingFormValues(document), ratedAt: now });
      tx.update(doctorFormDrafts)
        .set({ committedEntityId: committed, revision: row.revision + 1, ...softDelete(now) })
        .where(eq(doctorFormDrafts.id, id))
        .run();
      return { id: committed, renamed };
    });
    if (result.renamed) {
      // Publication is already durable; reminder failures belong to normal upkeep, not a duplicate retry.
      try {
        await repairOccasionReminders({ doctorId: result.id });
      } catch (error) {
        logError(error, { source: 'handled', context: 'doctor form reminder repair' });
      }
    }
    return result.id;
  });
}
export async function discardDoctorFormDraft(
  id: string,
  kind: DoctorFormKind,
  doctorId: string | null,
  expectedRevision: number,
  generation = datasetGeneration(),
): Promise<void> {
  return withDatasetWrite(generation, async () => {
    db.transaction((tx) => {
      const row = tx.select().from(doctorFormDrafts).where(eq(doctorFormDrafts.id, id)).get();
      if (!row) {
        if (expectedRevision !== 0 || tx.select().from(doctorFormDrafts).where(openTarget(kind, doctorId)).get())
          throw new DoctorFormConflict();
        return;
      }
      context(row, kind, doctorId);
      if (row.deletedAt && !row.committedEntityId && row.revision === expectedRevision + 1) return;
      if (row.deletedAt || row.committedEntityId || row.revision !== expectedRevision) throw new DoctorFormConflict();
      tx.update(doctorFormDrafts)
        .set({ revision: row.revision + 1, ...softDelete() })
        .where(eq(doctorFormDrafts.id, id))
        .run();
    });
    await audit('doctor.draftDiscarded', { entityType: 'doctor_form_draft', entityId: id });
  });
}
