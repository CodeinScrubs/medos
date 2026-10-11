import { and, asc, desc, eq, isNull } from 'drizzle-orm';

import { auditInTransaction } from '@/db/audit';
import { db, type DbTransaction } from '@/db/client';
import { withClinicalHistory } from '@/db/clinical-history';
import { diagnoses, patients, encounters, type Diagnosis } from '@/db/schema';
import { resolveActiveEncounterId } from '@/features/encounters/queries';
import { refreshPatientSearchText } from '@/features/patients/search-index';
import { newId, softDelete, stamps, touch } from '@/lib/ids';

/*
 * The problem list.
 *
 * A note says what was thought on a particular day; the problem list says what
 * is being carried. They are different questions, and answering the second by
 * reading every note in order is how something gets missed.
 *
 * Nothing here decides anything. A diagnosis becomes "resolved" or "ruled out"
 * because someone said so, never because time passed or another one was added.
 */

const alive = isNull(diagnoses.deletedAt);

export function patientDiagnosesQuery(patientId: string) {
  return db
    .select()
    .from(diagnoses)
    .where(and(alive, eq(diagnoses.patientId, patientId)))
    .orderBy(asc(diagnoses.status), asc(diagnoses.sortOrder), desc(diagnoses.createdAt));
}

export function diagnosisQuery(id: string) {
  return db
    .select()
    .from(diagnoses)
    .where(and(alive, eq(diagnoses.id, id)))
    .limit(1);
}

export type DiagnosisInput = {
  patientId: string;
  encounterId?: string | null;
  title: string;
  icdCode?: string | null;
  kind?: Diagnosis['kind'];
  status?: Diagnosis['status'];
  onsetDate?: string | null;
  notes?: string | null;
  sortOrder?: number;
};

export async function addDiagnosis(input: DiagnosisInput): Promise<string> {
  if (!input.title.trim()) throw new Error('A diagnosis needs a title');
  const id = newId();
  const now = new Date();
  return db.transaction((tx) => {
    const encounterId =
      input.encounterId !== undefined ? input.encounterId : resolveActiveEncounterId(input.patientId, tx);
    requireContext(tx, input.patientId, encounterId);
    const last = tx
      .select({ sortOrder: diagnoses.sortOrder })
      .from(diagnoses)
      .where(and(alive, eq(diagnoses.patientId, input.patientId)))
      .orderBy(desc(diagnoses.sortOrder))
      .get();

    return withClinicalHistory(tx, 'diagnosis', id, now, () => {
      tx.insert(diagnoses)
        .values({
          id,
          ...stamps(now),
          patientId: input.patientId,
          // Undefined means "whatever admission is active"; null means explicitly none.
          encounterId,
          title: input.title.trim(),
          icdCode: input.icdCode?.trim() || null,
          kind: input.kind ?? 'secondary',
          status: input.status ?? 'active',
          onsetDate: input.onsetDate ?? null,
          notes: input.notes?.trim() || null,
          sortOrder: input.sortOrder ?? (last?.sortOrder ?? 0) + 1,
        })
        .run();
      // A patient is found by their problems too ("CHF", "cellulitis").
      refreshPatientSearchText(input.patientId, tx);
      return id;
    });
  });
}

function requireContext(tx: DbTransaction, patientId: string, encounterId: string | null) {
  if (
    !tx
      .select({ id: patients.id })
      .from(patients)
      .where(and(eq(patients.id, patientId), isNull(patients.deletedAt)))
      .get()
  )
    throw new Error('پروندهٔ بیمار در دسترس نیست.');
  if (
    encounterId !== null &&
    !tx
      .select({ id: encounters.id })
      .from(encounters)
      .where(and(eq(encounters.id, encounterId), eq(encounters.patientId, patientId), isNull(encounters.deletedAt)))
      .get()
  )
    throw new Error('نوبت تشخیص به این بیمار تعلق ندارد یا حذف شده است.');
}

export async function updateDiagnosis(id: string, patch: Omit<Partial<DiagnosisInput>, 'patientId'>): Promise<void> {
  if (patch.title !== undefined && !patch.title.trim()) throw new Error('A diagnosis needs a title');
  const now = new Date();
  db.transaction((tx) => {
    const current = tx
      .select()
      .from(diagnoses)
      .where(and(alive, eq(diagnoses.id, id)))
      .get();
    if (!current) throw new Error('تشخیص در دسترس نیست.');
    requireContext(tx, current.patientId, patch.encounterId === undefined ? current.encounterId : patch.encounterId);
    withClinicalHistory(tx, 'diagnosis', id, now, () => {
      tx.update(diagnoses)
        .set({
          ...patch,
          title: patch.title === undefined ? undefined : patch.title.trim(),
          icdCode: patch.icdCode === undefined ? undefined : patch.icdCode?.trim() || null,
          notes: patch.notes === undefined ? undefined : patch.notes?.trim() || null,
          ...touch(now),
        })
        .where(and(alive, eq(diagnoses.id, id)))
        .run();
      refreshPatientSearchText(current.patientId, tx);
      auditInTransaction(tx, 'diagnosis.updated', { entityType: 'diagnosis', entityId: id }, now);
    });
  });
}

/**
 * Close a problem, or open it again.
 *
 * Kept as its own call because it is the one change made in a hurry, on a
 * round: everything else about a diagnosis is edited at a desk.
 */
export async function setDiagnosisStatus(id: string, status: Diagnosis['status']): Promise<void> {
  await updateDiagnosis(id, { status });
}

export async function deleteDiagnosis(id: string): Promise<void> {
  const now = new Date();
  db.transaction((tx) => {
    const current = tx
      .select()
      .from(diagnoses)
      .where(and(alive, eq(diagnoses.id, id)))
      .get();
    if (!current) return;
    requireContext(tx, current.patientId, current.encounterId);
    withClinicalHistory(tx, 'diagnosis', id, now, () => {
      tx.update(diagnoses)
        .set(softDelete(now))
        .where(and(alive, eq(diagnoses.id, id)))
        .run();
      refreshPatientSearchText(current.patientId, tx);
      auditInTransaction(tx, 'diagnosis.deleted', { entityType: 'diagnosis', entityId: id }, now);
    });
  });
}

/** What is being carried right now, for the summary line on a record. */
export function activeDiagnoses(rows: readonly Diagnosis[]): Diagnosis[] {
  return rows.filter((d) => d.status === 'active');
}
