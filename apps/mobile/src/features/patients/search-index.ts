import { and, desc, eq, isNull } from 'drizzle-orm';

import { db, type Database } from '@/db/client';
import { diagnoses, encounters, patients } from '@/db/schema';

import { patientSearchText, type PatientSearchContext } from './logic';

/** The database or an open transaction; both answer synchronously. */
type Handle = Pick<Database, 'select' | 'update'>;

/**
 * The problems and the current bed of one patient, as their search index
 * wants them. Every live diagnosis counts, closed ones too — "the one we ruled
 * PE out in" is still a way to remember someone. Only the open episode gives
 * a place: a bed they left last month would find the wrong person.
 */
export function patientSearchContext(patientId: string, handle: Handle = db): PatientSearchContext {
  const problems = handle
    .select({ title: diagnoses.title })
    .from(diagnoses)
    .where(and(isNull(diagnoses.deletedAt), eq(diagnoses.patientId, patientId)))
    .all();
  const current = handle
    .select({ ward: encounters.ward, bed: encounters.bed, service: encounters.service })
    .from(encounters)
    .where(and(isNull(encounters.deletedAt), eq(encounters.patientId, patientId), eq(encounters.isActive, true)))
    .orderBy(desc(encounters.admittedAt))
    .get();
  return {
    diagnoses: problems.map((d) => d.title),
    // "تخت 12" rather than a bare "12", which would also match every national id with a 12 in it.
    location: current ? [current.ward, current.service, current.bed?.trim() ? `تخت ${current.bed.trim()}` : null] : [],
  };
}

/**
 * Rebuild one patient's search index after something it is built from
 * changed outside the patient row — a diagnosis, an admission, a discharge.
 * Pass the transaction when there is one, so the index moves with the change.
 * It does not touch `updatedAt`: re-indexing is not an edit to the patient.
 */
export function refreshPatientSearchText(patientId: string, handle: Handle = db): void {
  const row = handle.select().from(patients).where(eq(patients.id, patientId)).get();
  if (!row) return;
  const next = patientSearchText(row, patientSearchContext(patientId, handle));
  if (next === row.searchText) return;
  handle.update(patients).set({ searchText: next }).where(eq(patients.id, patientId)).run();
}
