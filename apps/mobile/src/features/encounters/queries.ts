import { and, count, desc, eq, inArray, isNull } from 'drizzle-orm';

import { audit } from '@/db/audit';
import { db, type Database } from '@/db/client';
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
import { statusFor } from './status';

const alive = isNull(encounters.deletedAt);

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
  const id = newId();
  const now = new Date();

  db.transaction((tx) => {
    tx.update(encounters)
      .set({ isActive: false, ...touch(now) })
      .where(and(eq(encounters.patientId, input.patientId), eq(encounters.isActive, true)))
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
  });

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
  const current = (await encounterQuery(id))[0];
  if (!current) throw new Error(`Encounter ${id} not found`);
  const now = new Date();
  const kindChanged = patch.kind != null && patch.kind !== current.kind;

  db.transaction((tx) => {
    tx.update(encounters)
      .set({ ...patch, ...touch(now) })
      .where(eq(encounters.id, id))
      .run();

    if (kindChanged && current.isActive) {
      tx.update(patients)
        .set({ status: statusForEncounterKind(patch.kind!), ...touch(now) })
        .where(eq(patients.id, current.patientId))
        .run();
    }

    refreshPatientSearchText(current.patientId, tx);
  });
}

export type DischargeInput = {
  dischargedAt: Date;
  dischargeType: NonNullable<Encounter['dischargeType']>;
  outcomeNotes?: string | null;
  /** What the patient becomes afterwards: usually discharged, or still followed. */
  nextStatus: PatientStatus;
};

export async function dischargeEncounter(id: string, input: DischargeInput): Promise<void> {
  const current = (await encounterQuery(id))[0];
  if (!current) throw new Error(`Encounter ${id} not found`);
  const now = new Date();

  db.transaction((tx) => {
    tx.update(encounters)
      .set({
        isActive: false,
        dischargedAt: input.dischargedAt,
        dischargeType: input.dischargeType,
        outcomeNotes: input.outcomeNotes ?? null,
        ...touch(now),
      })
      .where(eq(encounters.id, id))
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
  });
  await audit('encounter.discharged', { entityType: 'encounter', entityId: id });
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
export function encounterRecordCount(id: string): number {
  const tables = [notes, orders, vitals, labPanels, imagingStudies, diagnoses, followUps, consultations, tasks];
  return tables.reduce(
    (sum, table) =>
      sum +
      (db
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
  const current = (
    await db
      .select()
      .from(encounters)
      .where(and(alive, eq(encounters.id, id)))
      .limit(1)
  )[0];
  if (!current) return;
  if (encounterRecordCount(id) > 0) throw new EncounterNotEmptyError();
  const now = new Date();

  db.transaction((tx) => {
    tx.update(encounters)
      .set({ ...softDelete(now), isActive: false })
      .where(and(alive, eq(encounters.id, id)))
      .run();

    if (!current.isActive) return;
    // Any other open episode decides; otherwise the patient is not admitted.
    const other = tx
      .select()
      .from(encounters)
      .where(and(alive, eq(encounters.patientId, current.patientId), eq(encounters.isActive, true)))
      .limit(1)
      .all()[0];
    tx.update(patients)
      .set({ status: statusFor(other ?? null, 'outpatient'), ...touch(now) })
      .where(eq(patients.id, current.patientId))
      .run();
    refreshPatientSearchText(current.patientId, tx);
  });
  await audit('encounter.deleted', { entityType: 'encounter', entityId: id });
}
