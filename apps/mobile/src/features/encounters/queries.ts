import { and, count, desc, eq, inArray, isNull } from 'drizzle-orm';

import { audit } from '@/db/audit';
import { db, type Database, type DbTransaction } from '@/db/client';
import {
  consultations,
  diagnoses,
  doctors,
  encounters,
  followUps,
  imagingStudies,
  labPanels,
  notes,
  orders,
  patients,
  places,
  tasks,
  vitals,
  type Encounter,
  type PatientStatus,
} from '@/db/schema';
import { refreshPatientSearchText } from '@/features/patients/search-index';
import { newId, softDelete, stamps, touch } from '@/lib/ids';

import { statusAfterDischarge, statusForEncounterKind } from './logic';
import { activeEncounterQuery, statusFor } from './status';

const alive = isNull(encounters.deletedAt);

/** Validation and writes share the same synchronous transaction snapshot. */
function requirePatient(reader: Pick<Database, 'select'>, patientId: string): void {
  const patient = reader
    .select({ id: patients.id })
    .from(patients)
    .where(and(eq(patients.id, patientId), isNull(patients.deletedAt)))
    .get();
  if (!patient) throw new Error('پروندهٔ بیمار در دسترس نیست.');
}

function requireEncounter(reader: Pick<Database, 'select'>, id: string): Encounter {
  const row = reader
    .select()
    .from(encounters)
    .where(and(alive, eq(encounters.id, id)))
    .get();
  if (!row) throw new Error('این نوبت در دسترس نیست.');
  requirePatient(reader, row.patientId);
  return row;
}

/** Active encounter plus the hospital and attending, for the record header. */
export function activeEncounterDetailQuery(patientId: string) {
  return db
    .select({ encounter: encounters, place: places, attending: doctors })
    .from(encounters)
    .leftJoin(places, eq(encounters.placeId, places.id))
    .leftJoin(doctors, eq(encounters.attendingId, doctors.id))
    .where(and(alive, eq(encounters.patientId, patientId), eq(encounters.isActive, true)))
    .orderBy(desc(encounters.admittedAt))
    .limit(1);
}

export function encounterHistoryQuery(patientId: string) {
  return db
    .select({ encounter: encounters, place: places, attending: doctors })
    .from(encounters)
    .leftJoin(places, eq(encounters.placeId, places.id))
    .leftJoin(doctors, eq(encounters.attendingId, doctors.id))
    .where(and(alive, eq(encounters.patientId, patientId)))
    .orderBy(desc(encounters.admittedAt));
}

/**
 * The encounter the record's current lists belong to: the active one, or the
 * most recent if the patient is not admitted. Null for a patient who has never
 * had an encounter, whose orders and notes stand on their own.
 */
export function currentEncounterQuery(patientId: string) {
  return db
    .select()
    .from(encounters)
    .where(and(alive, eq(encounters.patientId, patientId)))
    .orderBy(desc(encounters.isActive), desc(encounters.admittedAt))
    .limit(1);
}

export function encounterQuery(id: string) {
  return db
    .select()
    .from(encounters)
    .where(and(alive, eq(encounters.id, id)))
    .limit(1);
}

/**
 * The encounter new notes, orders and labs should attach to: the active one,
 * if any. Returning null is normal — an outpatient's note belongs to no
 * admission.
 */
export function resolveActiveEncounterId(patientId: string, reader: Pick<Database, 'select'> = db): string | null {
  const row = reader
    .select({ id: encounters.id })
    .from(encounters)
    .where(and(alive, eq(encounters.patientId, patientId), eq(encounters.isActive, true)))
    .orderBy(desc(encounters.admittedAt))
    .get();
  return row?.id ?? null;
}

export type EncounterInput = {
  patientId: string;
  kind: Encounter['kind'];
  placeId?: string | null;
  ward?: string | null;
  bed?: string | null;
  service?: string | null;
  attendingId?: string | null;
  chiefComplaint?: string | null;
  admittedAt?: Date | null;
  /** False when the hour was never recorded; see `admissionElapsed`. */
  admittedAtHasTime?: boolean;
};

/**
 * Open a new encounter. A patient has at most one active encounter, so any
 * other active one is closed first — without a discharge type, because it was
 * superseded rather than discharged.
 */
export async function openEncounter(input: EncounterInput): Promise<string> {
  return db.transaction((tx) => openEncounterInTransaction(tx, input, new Date()));
}

/** Synchronous so draft retirement and clinical effects can share one commit. */
export function openEncounterInTransaction(tx: DbTransaction, input: EncounterInput, now: Date): string {
  if (input.admittedAt && !Number.isFinite(input.admittedAt.getTime())) throw new Error('تاریخ بستری معتبر نیست.');
  const id = newId();
  requirePatient(tx, input.patientId);
  tx.update(encounters)
    .set({ isActive: false, ...touch(now) })
    .where(and(alive, eq(encounters.patientId, input.patientId), eq(encounters.isActive, true)))
    .run();

  tx.insert(encounters)
    .values({
      id,
      ...stamps(now),
      patientId: input.patientId,
      kind: input.kind,
      placeId: input.placeId ?? null,
      ward: input.ward ?? null,
      bed: input.bed ?? null,
      service: input.service ?? null,
      attendingId: input.attendingId ?? null,
      chiefComplaint: input.chiefComplaint ?? null,
      admittedAt: input.admittedAt ?? now,
      admittedAtHasTime: input.admittedAtHasTime ?? true,
      isActive: true,
    })
    .run();

  tx.update(patients)
    .set({ status: statusForEncounterKind(input.kind), ...touch(now) })
    .where(eq(patients.id, input.patientId))
    .run();

  // Ward and bed are searchable while the patient is in them.
  refreshPatientSearchText(input.patientId, tx);
  return id;
}

/**
 * Edit an encounter.
 *
 * Changing the kind of the **active** episode changes what the patient is:
 * correcting an admission that was really an ER visit must move the patient
 * out of the admitted list too, or the list keeps a bed that does not exist.
 * A closed episode is history and moves nothing.
 */
export async function updateEncounter(id: string, patch: Partial<Omit<EncounterInput, 'patientId'>>): Promise<void> {
  db.transaction((tx) => updateEncounterInTransaction(tx, id, patch, new Date()));
}

export function updateEncounterInTransaction(
  tx: DbTransaction,
  id: string,
  patch: Partial<Omit<EncounterInput, 'patientId'>>,
  now: Date,
): void {
  if (patch.admittedAt && !Number.isFinite(patch.admittedAt.getTime())) throw new Error('تاریخ بستری معتبر نیست.');
  const current = requireEncounter(tx, id);
  tx.update(encounters)
    .set({ ...patch, ...touch(now) })
    .where(and(alive, eq(encounters.id, id)))
    .run();

  if (current.isActive) {
    // Older/imported datasets can contain multiple active episodes. A
    // correction to one must follow the same newest episode as the header.
    const active = activeEncounterQuery(current.patientId, tx).get();
    tx.update(patients)
      .set({ status: statusFor(active ?? null, 'outpatient'), ...touch(now) })
      .where(eq(patients.id, current.patientId))
      .run();
  }

  refreshPatientSearchText(current.patientId, tx);
}

export type DischargeInput = {
  dischargedAt: Date;
  dischargeType: NonNullable<Encounter['dischargeType']>;
  outcomeNotes?: string | null;
  /** What the patient becomes afterwards: usually discharged, or still followed. */
  nextStatus: PatientStatus;
};

export async function dischargeEncounter(id: string, input: DischargeInput): Promise<void> {
  db.transaction((tx) => dischargeEncounterInTransaction(tx, id, input, new Date()));
  await audit('encounter.discharged', { entityType: 'encounter', entityId: id });
}

export function dischargeEncounterInTransaction(tx: DbTransaction, id: string, input: DischargeInput, now: Date): void {
  if (!Number.isFinite(input.dischargedAt.getTime())) throw new Error('تاریخ ترخیص معتبر نیست.');
  const current = requireEncounter(tx, id);
  if (!current.isActive) throw new Error('این نوبت دیگر فعال نیست؛ پروندهٔ فعلی را بررسی کنید.');
  const activeCount = tx
    .select({ n: count() })
    .from(encounters)
    .where(and(alive, eq(encounters.patientId, current.patientId), eq(encounters.isActive, true)))
    .get()?.n;
  if (activeCount !== 1) throw new Error('بیش از یک نوبت فعال وجود دارد؛ ابتدا نوبت‌های پرونده را بررسی کنید.');
  tx.update(encounters)
    .set({
      isActive: false,
      dischargedAt: input.dischargedAt,
      dischargeType: input.dischargeType,
      outcomeNotes: input.outcomeNotes ?? null,
      ...touch(now),
    })
    .where(and(alive, eq(encounters.id, id)))
    .run();

  // Inpatient orders end with the admission. Without this they stay
  // "active" for ever and reappear on the next admission's kardex, day
  // count and all — a drug the patient stopped months ago.
  tx.update(orders)
    .set({ status: 'completed', endAt: input.dischargedAt, ...touch(now) })
    .where(and(eq(orders.encounterId, id), isNull(orders.deletedAt), inArray(orders.status, ['active', 'held'])))
    .run();

  tx.update(patients)
    .set({ status: statusAfterDischarge(input.dischargeType, input.nextStatus), ...touch(now) })
    .where(eq(patients.id, current.patientId))
    .run();

  // The bed they left no longer finds them.
  refreshPatientSearchText(current.patientId, tx);
}

/** The encounter has notes, orders or results filed under it; see `deleteEncounter`. */
export class EncounterNotEmptyError extends Error {
  constructor() {
    super('This episode has records filed under it and cannot be deleted');
    this.name = 'EncounterNotEmptyError';
  }
}

/**
 * How many live records are filed under an encounter.
 *
 * Deleting an episode is for one entered by mistake. One with notes, orders,
 * results or tasks under it is real, and deleting it would take them out of
 * the kardex and the episode's lists — so it is closed with a discharge, or
 * corrected with an edit, instead.
 */
export function encounterRecordCount(id: string, reader: Pick<Database, 'select'> = db): number {
  const tables = [notes, orders, vitals, labPanels, imagingStudies, diagnoses, followUps, consultations, tasks];
  return tables.reduce(
    (sum, table) =>
      sum +
      (reader
        .select({ n: count() })
        .from(table)
        .where(and(eq(table.encounterId, id), isNull(table.deletedAt)))
        .get()?.n ?? 0),
    0,
  );
}

/**
 * Delete an episode that should not be in the record.
 *
 * Only a live episode can be deleted — deleting one twice must not run the
 * status logic a second time on a patient who has moved on since. If the
 * deleted episode was the active one, the patient's status is worked out again
 * from whatever episodes remain (`statusFor`), which is the same rule the rest
 * of the app uses: no open episode means they are not on a ward.
 */
export async function deleteEncounter(id: string): Promise<void> {
  const now = new Date();

  const changed = db.transaction((tx) => {
    const current = tx
      .select()
      .from(encounters)
      .where(and(alive, eq(encounters.id, id)))
      .get();
    if (!current) return false;
    requirePatient(tx, current.patientId);
    if (encounterRecordCount(id, tx) > 0) throw new EncounterNotEmptyError();
    tx.update(encounters)
      .set({ ...softDelete(now), isActive: false })
      .where(and(alive, eq(encounters.id, id)))
      .run();

    if (!current.isActive) return true;
    // Any other open episode decides; otherwise the patient is not admitted.
    const other = activeEncounterQuery(current.patientId, tx).get();
    tx.update(patients)
      .set({ status: statusFor(other ?? null, 'outpatient'), ...touch(now) })
      .where(eq(patients.id, current.patientId))
      .run();
    refreshPatientSearchText(current.patientId, tx);
    return true;
  });
  if (changed) await audit('encounter.deleted', { entityType: 'encounter', entityId: id });
}
