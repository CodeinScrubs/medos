import { and, desc, eq, isNull, sql } from 'drizzle-orm';

import { auditInTransaction } from '@/db/audit';
import { db, type DbTransaction } from '@/db/client';
import { withClinicalHistory } from '@/db/clinical-history';
import { encounters, imagingStudies, patients, type ImagingStudy } from '@/db/schema';
import { resolveActiveEncounterId } from '@/features/encounters/queries';
import { newId, softDelete, stamps, touch } from '@/lib/ids';

const alive = isNull(imagingStudies.deletedAt);

export function patientImagingQuery(patientId: string) {
  return db
    .select()
    .from(imagingStudies)
    .where(and(alive, eq(imagingStudies.patientId, patientId)))
    .orderBy(desc(imagingStudies.studyDate));
}

export function imagingStudyQuery(id: string) {
  return db
    .select()
    .from(imagingStudies)
    .where(and(alive, eq(imagingStudies.id, id)))
    .limit(1);
}

/**
 * Places and platforms typed before, most used first — so "PACS بیمارستان مرکزی" is one
 * tap the second time instead of retyped for every study.
 */
export async function recentStorageLocations(limit = 6): Promise<{ locations: string[]; platforms: string[] }> {
  const locations = await db
    .select({ v: imagingStudies.storageLocation })
    .from(imagingStudies)
    .where(and(alive, sql`${imagingStudies.storageLocation} is not null and ${imagingStudies.storageLocation} != ''`))
    .groupBy(imagingStudies.storageLocation)
    .orderBy(desc(sql`count(*)`))
    .limit(limit);
  const platforms = await db
    .select({ v: imagingStudies.storagePlatform })
    .from(imagingStudies)
    .where(and(alive, sql`${imagingStudies.storagePlatform} is not null and ${imagingStudies.storagePlatform} != ''`))
    .groupBy(imagingStudies.storagePlatform)
    .orderBy(desc(sql`count(*)`))
    .limit(limit);
  return {
    locations: locations.map((r) => r.v!).filter(Boolean),
    platforms: platforms.map((r) => r.v!).filter(Boolean),
  };
}

export type ImagingInput = {
  patientId: string;
  modality: ImagingStudy['modality'];
  region?: string | null;
  studyDate?: Date | null;
  status: ImagingStudy['status'];
  storageLocation?: string | null;
  storagePlatform?: string | null;
  accessionNumber?: string | null;
  accessUrl?: string | null;
  accessNotes?: string | null;
  reportText?: string | null;
  impression?: string | null;
  notes?: string | null;
};

export async function createImagingStudy(input: ImagingInput): Promise<string> {
  return db.transaction((tx) => createImagingInTransaction(tx, input));
}
export function createImagingInTransaction(
  tx: DbTransaction,
  input: ImagingInput,
  encounterId?: string | null,
): string {
  requirePatient(tx, input.patientId);
  const capturedEncounter = encounterId === undefined ? resolveActiveEncounterId(input.patientId, tx) : encounterId;
  if (capturedEncounter !== null) {
    const encounter = tx
      .select()
      .from(encounters)
      .where(
        and(
          eq(encounters.id, capturedEncounter),
          eq(encounters.patientId, input.patientId),
          isNull(encounters.deletedAt),
        ),
      )
      .get();
    if (!encounter) throw new Error('نوبت تصویربرداری در دسترس نیست.');
  }
  if (input.studyDate && !Number.isFinite(input.studyDate.getTime())) throw new Error('تاریخ تصویربرداری معتبر نیست.');
  const id = newId();
  const now = new Date();
  return withClinicalHistory(tx, 'imaging', id, now, () => {
    tx.insert(imagingStudies)
      .values({
        ...input,
        id,
        ...stamps(now),
        encounterId: capturedEncounter,
      })
      .run();
    return id;
  });
}

export async function updateImagingStudy(id: string, patch: Partial<Omit<ImagingInput, 'patientId'>>): Promise<void> {
  db.transaction((tx) => updateImagingInTransaction(tx, id, patch));
}
export function updateImagingInTransaction(
  tx: DbTransaction,
  id: string,
  patch: Partial<Omit<ImagingInput, 'patientId'>>,
): void {
  const row = tx
    .select()
    .from(imagingStudies)
    .where(and(alive, eq(imagingStudies.id, id)))
    .get();
  if (!row) throw new Error('تصویربرداری در دسترس نیست.');
  requirePatient(tx, row.patientId);
  if (patch.studyDate && !Number.isFinite(patch.studyDate.getTime())) throw new Error('تاریخ تصویربرداری معتبر نیست.');
  if (!Object.keys(patch).length) return;
  const now = new Date();
  withClinicalHistory(tx, 'imaging', id, now, () =>
    tx
      .update(imagingStudies)
      .set({ ...patch, ...touch(now) })
      .where(eq(imagingStudies.id, id))
      .run(),
  );
}

export async function deleteImagingStudy(id: string): Promise<void> {
  const now = new Date();
  db.transaction((tx) => {
    const row = tx
      .select()
      .from(imagingStudies)
      .where(and(alive, eq(imagingStudies.id, id)))
      .get();
    if (!row) return;
    requirePatient(tx, row.patientId);
    withClinicalHistory(tx, 'imaging', id, now, () => {
      tx.update(imagingStudies).set(softDelete(now)).where(eq(imagingStudies.id, id)).run();
      auditInTransaction(tx, 'imaging.deleted', { entityType: 'imaging_study', entityId: id }, now);
    });
  });
}
function requirePatient(tx: DbTransaction, patientId: string) {
  if (
    !tx
      .select({ id: patients.id })
      .from(patients)
      .where(and(eq(patients.id, patientId), isNull(patients.deletedAt)))
      .get()
  )
    throw new Error('بیمار در دسترس نیست.');
}
