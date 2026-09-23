import { and, asc, desc, eq, isNull } from 'drizzle-orm';

import { audit } from '@/db/audit';
import { db } from '@/db/client';
import { diagnoses, type Diagnosis } from '@/db/schema';
import { resolveActiveEncounterId } from '@/features/encounters/queries';
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

export const DIAGNOSIS_KINDS: Diagnosis['kind'][] = ['primary', 'secondary', 'rule_out', 'past', 'complication'];

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
  const [last] = await db
    .select({ sortOrder: diagnoses.sortOrder })
    .from(diagnoses)
    .where(and(alive, eq(diagnoses.patientId, input.patientId)))
    .orderBy(desc(diagnoses.sortOrder))
    .limit(1);

  await db.insert(diagnoses).values({
    id,
    ...stamps(),
    patientId: input.patientId,
    // Undefined means "whatever admission is active"; null means explicitly none.
    encounterId: input.encounterId !== undefined ? input.encounterId : await resolveActiveEncounterId(input.patientId),
    title: input.title.trim(),
    icdCode: input.icdCode?.trim() || null,
    kind: input.kind ?? 'secondary',
    status: input.status ?? 'active',
    onsetDate: input.onsetDate ?? null,
    notes: input.notes?.trim() || null,
    sortOrder: input.sortOrder ?? (last?.sortOrder ?? 0) + 1,
  });
  return id;
}

export async function updateDiagnosis(id: string, patch: Omit<Partial<DiagnosisInput>, 'patientId'>): Promise<void> {
  if (patch.title !== undefined && !patch.title.trim()) throw new Error('A diagnosis needs a title');
  const current = (await diagnosisQuery(id))[0];
  if (!current) throw new Error(`Diagnosis ${id} not found`);
  await db
    .update(diagnoses)
    .set({
      ...patch,
      title: patch.title === undefined ? undefined : patch.title.trim(),
      icdCode: patch.icdCode === undefined ? undefined : patch.icdCode?.trim() || null,
      notes: patch.notes === undefined ? undefined : patch.notes?.trim() || null,
      ...touch(),
    })
    .where(and(alive, eq(diagnoses.id, id)));
  await audit('diagnosis.updated', { entityType: 'diagnosis', entityId: id });
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
  await db
    .update(diagnoses)
    .set(softDelete())
    .where(and(alive, eq(diagnoses.id, id)));
  await audit('diagnosis.deleted', { entityType: 'diagnosis', entityId: id });
}

/** What is being carried right now, for the summary line on a record. */
export function activeDiagnoses(rows: readonly Diagnosis[]): Diagnosis[] {
  return rows.filter((d) => d.status === 'active');
}
