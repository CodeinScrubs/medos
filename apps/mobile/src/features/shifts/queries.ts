import { and, asc, desc, eq, isNull } from 'drizzle-orm';

import { db } from '@/db/client';
import { encounters, patients, shiftPatients, shifts, type Shift } from '@/db/schema';
import { resolveActiveEncounterId } from '@/features/encounters/queries';
import { newId, softDelete, stamps, touch } from '@/lib/ids';

/*
 * The working day.
 *
 * A shift is not a clinical fact about anybody — it is where the owner's
 * attention was for a stretch of hours, and which patients they were carrying.
 * It owns nothing: closing or deleting a shift removes the list, never the
 * people on it or anything written about them.
 *
 * Only one shift is open at a time, because "the shift I am on" has to be a
 * single answer for the Today screen to mean anything. Starting a new one
 * closes whatever was open, the way opening an admission supersedes the last.
 */

const alive = isNull(shifts.deletedAt);
const memberAlive = isNull(shiftPatients.deletedAt);

export function activeShiftQuery() {
  return db
    .select()
    .from(shifts)
    .where(and(alive, eq(shifts.isActive, true)))
    .orderBy(desc(shifts.startAt))
    .limit(1);
}

export function shiftsQuery(limit = 30) {
  return db.select().from(shifts).where(alive).orderBy(desc(shifts.startAt)).limit(limit);
}

export function shiftQuery(id: string) {
  return db
    .select()
    .from(shifts)
    .where(and(alive, eq(shifts.id, id)))
    .limit(1);
}

/** The patients carried on one shift, in round order, with where they are. */
export function shiftPatientsQuery(shiftId: string) {
  return db
    .select({ member: shiftPatients, patient: patients, encounter: encounters })
    .from(shiftPatients)
    .innerJoin(patients, eq(shiftPatients.patientId, patients.id))
    .leftJoin(
      encounters,
      and(
        eq(shiftPatients.encounterId, encounters.id),
        eq(encounters.patientId, shiftPatients.patientId),
        isNull(encounters.deletedAt),
      ),
    )
    .where(and(memberAlive, isNull(patients.deletedAt), eq(shiftPatients.shiftId, shiftId)))
    .orderBy(asc(shiftPatients.sortOrder), asc(shiftPatients.createdAt));
}

export type ShiftInput = {
  placeId?: string | null;
  ward?: string | null;
  supervisorId?: string | null;
  startAt?: Date;
  notes?: string | null;
};

/** Start a shift, closing whichever one was still open. */
export async function startShift(input: ShiftInput = {}): Promise<string> {
  const id = newId();
  const now = new Date();

  db.transaction((tx) => {
    tx.update(shifts)
      .set({ isActive: false, endAt: now, ...touch(now) })
      .where(and(alive, eq(shifts.isActive, true)))
      .run();
    tx.insert(shifts)
      .values({
        id,
        ...stamps(now),
        placeId: input.placeId ?? null,
        ward: input.ward?.trim() || null,
        supervisorId: input.supervisorId ?? null,
        startAt: input.startAt ?? now,
        endAt: null,
        isActive: true,
        notes: input.notes?.trim() || null,
      })
      .run();
  });
  return id;
}

export async function updateShift(id: string, patch: ShiftInput): Promise<void> {
  await db
    .update(shifts)
    .set({
      ...patch,
      ward: patch.ward === undefined ? undefined : patch.ward?.trim() || null,
      notes: patch.notes === undefined ? undefined : patch.notes?.trim() || null,
      ...touch(),
    })
    .where(and(alive, eq(shifts.id, id)));
}

/** Close a shift. It stays in the list; it is simply over. */
export async function endShift(id: string, endAt: Date = new Date()): Promise<void> {
  await db
    .update(shifts)
    .set({ isActive: false, endAt, ...touch() })
    .where(and(alive, eq(shifts.id, id)));
}

export async function deleteShift(id: string): Promise<void> {
  const now = new Date();
  db.transaction((tx) => {
    // The membership rows go; the patients and their records do not.
    tx.update(shiftPatients)
      .set(softDelete(now))
      .where(and(memberAlive, eq(shiftPatients.shiftId, id)))
      .run();
    tx.update(shifts)
      .set(softDelete(now))
      .where(and(alive, eq(shifts.id, id)))
      .run();
  });
}

/**
 * Put a patient on a shift.
 *
 * Idempotent: adding someone who is already on it returns the row they are
 * already on rather than listing them twice. The episode is resolved once, at
 * the moment they are added, so a later admission does not rewrite tonight.
 */
export async function addPatientToShift(
  shiftId: string,
  patientId: string,
  options: { encounterId?: string | null; shiftSummary?: string | null } = {},
): Promise<string> {
  return db.transaction((tx) => {
    const shift = tx
      .select({ id: shifts.id })
      .from(shifts)
      .where(and(alive, eq(shifts.id, shiftId)))
      .get();
    const patient = tx
      .select({ id: patients.id })
      .from(patients)
      .where(and(isNull(patients.deletedAt), eq(patients.id, patientId)))
      .get();
    if (!shift || !patient) throw new Error('بیمار یا شیفت در دسترس نیست.');

    const existing = tx
      .select()
      .from(shiftPatients)
      .where(and(memberAlive, eq(shiftPatients.shiftId, shiftId), eq(shiftPatients.patientId, patientId)))
      .orderBy(asc(shiftPatients.createdAt), asc(shiftPatients.id))
      .get();
    if (existing) return existing.id;

    const last = tx
      .select({ sortOrder: shiftPatients.sortOrder })
      .from(shiftPatients)
      .where(and(memberAlive, eq(shiftPatients.shiftId, shiftId)))
      .orderBy(desc(shiftPatients.sortOrder))
      .get();

    const encounterId =
      options.encounterId !== undefined ? options.encounterId : resolveActiveEncounterId(patientId, tx);
    if (encounterId != null) {
      const encounter = tx
        .select({ id: encounters.id })
        .from(encounters)
        .where(and(eq(encounters.id, encounterId), eq(encounters.patientId, patientId), isNull(encounters.deletedAt)))
        .get();
      if (!encounter) throw new Error('این نوبت مراجعه متعلق به بیمار نیست یا حذف شده است.');
    }

    const id = newId();
    tx.insert(shiftPatients)
      .values({
        id,
        ...stamps(),
        shiftId,
        patientId,
        encounterId,
        sortOrder: (last?.sortOrder ?? 0) + 1,
        shiftSummary: options.shiftSummary?.trim() || null,
        handoffNote: null,
        reviewedAt: null,
      })
      .run();
    return id;
  });
}

export async function removePatientFromShift(memberId: string): Promise<void> {
  await db
    .update(shiftPatients)
    .set(softDelete())
    .where(and(memberAlive, eq(shiftPatients.id, memberId)));
}

/** Mark a patient seen on this shift, or un-mark them. */
export async function setShiftPatientReviewed(memberId: string, reviewed: boolean): Promise<void> {
  await db
    .update(shiftPatients)
    .set({ reviewedAt: reviewed ? new Date() : null, ...touch() })
    .where(and(memberAlive, eq(shiftPatients.id, memberId)));
}

export async function updateShiftPatient(
  memberId: string,
  patch: { shiftSummary?: string | null; handoffNote?: string | null; sortOrder?: number },
): Promise<void> {
  const result = await db
    .update(shiftPatients)
    .set({
      ...patch,
      shiftSummary: patch.shiftSummary === undefined ? undefined : patch.shiftSummary?.trim() || null,
      handoffNote: patch.handoffNote === undefined ? undefined : patch.handoffNote?.trim() || null,
      ...touch(),
    })
    .where(and(memberAlive, eq(shiftPatients.id, memberId)))
    .returning({ id: shiftPatients.id });
  if (result.length === 0) throw new Error('این بیمار دیگر روی شیفت نیست؛ نوشته ذخیره نشد.');
}

/** How far through the round this shift is. */
export function shiftProgress(members: { member: { reviewedAt: Date | null } }[]): { seen: number; total: number } {
  return { seen: members.filter((m) => m.member.reviewedAt != null).length, total: members.length };
}

export type ShiftWithProgress = { shift: Shift; seen: number; total: number };
