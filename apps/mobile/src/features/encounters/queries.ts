import { and, desc, eq, inArray, isNull } from 'drizzle-orm';

import { db } from '@/db/client';
import { doctors, encounters, orders, patients, places, type Encounter, type PatientStatus } from '@/db/schema';
import { newId, softDelete, stamps, touch } from '@/lib/ids';

import { statusAfterDischarge, statusForEncounterKind } from './logic';

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
export async function resolveActiveEncounterId(patientId: string): Promise<string | null> {
  const rows = await db
    .select({ id: encounters.id })
    .from(encounters)
    .where(and(alive, eq(encounters.patientId, patientId), eq(encounters.isActive, true)))
    .orderBy(desc(encounters.admittedAt))
    .limit(1);
  return rows[0]?.id ?? null;
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
  });
}

/**
 * Delete an episode that should not be in the record.
 *
 * If it was the active one, the patient is not on a ward any more — leaving
 * the status at "admitted" would keep a bed on the admitted list that nothing
 * points at. There is no history of what they were before, so they become
 * outpatient: a patient with a file and no admission, which is the one thing
 * that is certainly true afterwards and is a single tap to correct.
 */
export async function deleteEncounter(id: string): Promise<void> {
  const current = (await db.select().from(encounters).where(eq(encounters.id, id)).limit(1))[0];
  if (!current) return;
  const now = new Date();

  db.transaction((tx) => {
    tx.update(encounters)
      .set({ ...softDelete(now), isActive: false })
      .where(eq(encounters.id, id))
      .run();
    if (current.isActive) {
      tx.update(patients)
        .set({ status: 'outpatient', ...touch(now) })
        .where(eq(patients.id, current.patientId))
        .run();
    }
  });
}
