import { and, desc, eq, inArray, isNotNull, isNull, or, type SQL } from 'drizzle-orm';

import { audit } from '@/db/audit';
import { db } from '@/db/client';
import {
  encounters,
  followUps,
  patientContacts,
  patients,
  type NewPatient,
  type Patient,
  type PatientStatus,
} from '@/db/schema';
import { contains, matchesSearch } from '@/db/search';
import { activeEncounter, reconcilePatientStatus, statusFor } from '@/features/encounters/status';
import { cancelPatientReminders, rescheduleReminders } from '@/features/followups/queries';
import { repairTaskReminders } from '@/features/tasks/reminder-queries';
import { newId, softDelete, stamps, touch } from '@/lib/ids';
import { buildSearchText, normalizePhone } from '@/lib/persian';

import { patientSearchText } from './logic';

/** Rows the user has deleted are excluded from every list in the app. */
const alive = isNull(patients.deletedAt);

/* -------------------------------------------------------------------------- */
/*  Reading                                                                     */
/* -------------------------------------------------------------------------- */

export type PatientFilter = {
  search?: string;
  statuses?: PatientStatus[];
  starredOnly?: boolean;
};

/**
 * Build the WHERE clause for the patient list. Search matches every term
 * independently (see `matchesSearch`), which is what makes it forgiving when
 * typing one-handed on a ward.
 */
export function patientFilterClause(filter: PatientFilter): SQL | undefined {
  const clauses: (SQL | undefined)[] = [alive];

  if (filter.statuses?.length) {
    clauses.push(inArray(patients.status, filter.statuses));
  }
  if (filter.starredOnly) {
    clauses.push(eq(patients.starred, true));
  }
  clauses.push(...matchesSearch(patients.searchText, filter.search));

  return and(...clauses);
}

/** Query object for the patient list. Pass to `useLive` to stay reactive. */
export function patientListQuery(filter: PatientFilter = {}) {
  return db
    .select()
    .from(patients)
    .where(patientFilterClause(filter))
    .orderBy(desc(patients.starred), desc(patients.updatedAt));
}

export function patientQuery(id: string) {
  return db
    .select()
    .from(patients)
    .where(and(alive, eq(patients.id, id)))
    .limit(1);
}

/** The trash: deleted patients, most recently deleted first. */
export function deletedPatientsQuery() {
  return db.select().from(patients).where(isNotNull(patients.deletedAt)).orderBy(desc(patients.deletedAt));
}

export function patientContactsQuery(patientId: string) {
  return db
    .select()
    .from(patientContacts)
    .where(and(eq(patientContacts.patientId, patientId), isNull(patientContacts.deletedAt)))
    .orderBy(desc(patientContacts.isPrimary));
}

export function activeEncounterQuery(patientId: string) {
  return db
    .select()
    .from(encounters)
    .where(and(eq(encounters.patientId, patientId), eq(encounters.isActive, true), isNull(encounters.deletedAt)))
    .orderBy(desc(encounters.admittedAt))
    .limit(1);
}

export function pendingFollowUpsQuery(patientId: string) {
  return db
    .select()
    .from(followUps)
    .where(and(eq(followUps.patientId, patientId), eq(followUps.status, 'pending'), isNull(followUps.deletedAt)))
    .orderBy(followUps.dueAt);
}

/** Used by the duplicate check when creating a patient. */
export async function findPossibleDuplicates(
  firstName: string,
  lastName: string,
  nationalId?: string | null,
): Promise<Patient[]> {
  const byName = buildSearchText(firstName, lastName);
  if (!byName && !nationalId) return [];

  const clauses: SQL[] = [];
  if (byName) clauses.push(contains(patients.searchText, byName));
  if (nationalId) clauses.push(eq(patients.nationalId, nationalId));

  return db
    .select()
    .from(patients)
    .where(and(alive, or(...clauses)))
    .limit(5);
}

/* -------------------------------------------------------------------------- */
/*  Writing                                                                     */
/* -------------------------------------------------------------------------- */

export type PatientInput = Omit<NewPatient, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt' | 'searchText'>;

export async function createPatient(input: PatientInput): Promise<string> {
  const id = newId();
  await db.insert(patients).values({
    ...input,
    id,
    ...stamps(),
    // A patient being created has no episode yet, so nothing can make them
    // admitted. Coerced rather than refused: the value can also arrive from an
    // import or an older backup, and losing the patient over it would be worse.
    status: input.status === 'admitted' ? 'outpatient' : input.status,
    phone: input.phone ? normalizePhone(input.phone) : null,
    searchText: patientSearchText(input),
  });
  return id;
}

export async function updatePatient(id: string, input: Partial<PatientInput>): Promise<void> {
  // `searchText` is derived, so it has to be rebuilt from the merged row rather
  // than from the patch alone — otherwise editing only the phone would wipe the
  // name out of the search index.
  const current = (
    await db
      .select()
      .from(patients)
      .where(and(alive, eq(patients.id, id)))
      .limit(1)
  )[0];
  if (!current) throw new Error(`Patient ${id} not found`);

  const merged = { ...current, ...input };
  // Whether they are on a ward is the episode's answer, not this form's.
  const status = input.status === undefined ? undefined : statusFor(await activeEncounter(id), input.status);
  await db
    .update(patients)
    .set({
      ...input,
      status,
      ...touch(),
      phone: input.phone !== undefined ? normalizePhone(input.phone ?? '') || null : current.phone,
      searchText: patientSearchText(merged),
    })
    .where(and(alive, eq(patients.id, id)));
}

export async function setPatientStarred(id: string, starred: boolean): Promise<void> {
  await db
    .update(patients)
    .set({ starred, ...touch() })
    .where(and(alive, eq(patients.id, id)));
}

/**
 * Soft delete. The row and everything hanging off it stay in the database;
 * only the `deletedAt` stamp changes, so a mistaken delete during a busy shift
 * is recoverable. Pending reminders are silenced — a deleted patient must not
 * keep buzzing — and come back if the patient is restored.
 */
export async function deletePatient(id: string): Promise<void> {
  await db.update(patients).set(softDelete()).where(eq(patients.id, id));
  await cancelPatientReminders(id);
  await repairTaskReminders({ patientId: id });
  await audit('patient.deleted', { entityType: 'patient', entityId: id });
}

export async function restorePatient(id: string): Promise<void> {
  await db
    .update(patients)
    .set({ deletedAt: null, ...touch() })
    .where(eq(patients.id, id));
  // Back from the trash with whatever status it had when it went in, which may
  // no longer match its episodes — and only the episodes can say.
  await reconcilePatientStatus(id);
  await rescheduleReminders({ patientId: id });
  await repairTaskReminders({ patientId: id });
  await audit('patient.restored', { entityType: 'patient', entityId: id });
}

/* -------------------------------------------------------------------------- */
/*  Contacts                                                                    */
/* -------------------------------------------------------------------------- */

export async function addPatientContact(
  patientId: string,
  contact: { name?: string; relation?: string; phone: string; isPrimary?: boolean; notes?: string },
): Promise<string> {
  const id = newId();
  await db.insert(patientContacts).values({
    id,
    ...stamps(),
    patientId,
    name: contact.name ?? null,
    relation: contact.relation ?? null,
    phone: normalizePhone(contact.phone),
    isPrimary: contact.isPrimary ?? false,
    notes: contact.notes ?? null,
  });
  return id;
}

export async function deletePatientContact(id: string): Promise<void> {
  await db.update(patientContacts).set(softDelete()).where(eq(patientContacts.id, id));
}

/** Rebuild every patient's search index; see features/search/reindex.ts. */
export async function reindexPatients(): Promise<number> {
  const rows = await db.select().from(patients);
  let changed = 0;
  db.transaction((tx) => {
    for (const p of rows) {
      const next = patientSearchText(p);
      if (next === p.searchText) continue;
      tx.update(patients).set({ searchText: next }).where(eq(patients.id, p.id)).run();
      changed += 1;
    }
  });
  return changed;
}
