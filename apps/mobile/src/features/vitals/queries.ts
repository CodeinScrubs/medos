import { and, desc, eq, isNull } from 'drizzle-orm';

import { audit } from '@/db/audit';
import { db, type DbTransaction } from '@/db/client';
import { encounters, patients, vitals, type Vital } from '@/db/schema';
import { resolveActiveEncounterId } from '@/features/encounters/queries';
import { isBloodSugarUnit, type BloodSugarUnit } from '@/lib/glucose-unit';
import { newId, softDelete, stamps, touch } from '@/lib/ids';

import { hasAnyVital, validateBloodSugar, validateVitalNumbers, VITAL_NUMBER_KEYS } from './logic';

/*
 * Observations, as they were taken.
 *
 * One row is one moment at a bedside, with whatever was actually measured in
 * it. Nothing is required beyond the time: a nurse who took a blood pressure
 * and a temperature did not take a respiratory rate, and filling the gap with
 * a zero or the last value would be inventing a measurement.
 */

const alive = isNull(vitals.deletedAt);

export function patientVitalsQuery(patientId: string, limit = 100) {
  return db
    .select()
    .from(vitals)
    .where(and(alive, eq(vitals.patientId, patientId)))
    .orderBy(desc(vitals.measuredAt))
    .limit(limit);
}

export function vitalQuery(id: string) {
  return db
    .select()
    .from(vitals)
    .where(and(alive, eq(vitals.id, id)))
    .limit(1);
}

export type VitalInput = {
  patientId: string;
  encounterId?: string | null;
  measuredAt?: Date;
  systolic?: number | null;
  diastolic?: number | null;
  heartRate?: number | null;
  respRate?: number | null;
  temperature?: number | null;
  spo2?: number | null;
  bloodSugar?: number | null;
  bloodSugarUnit?: BloodSugarUnit | null;
  weightKg?: number | null;
  heightCm?: number | null;
  painScore?: number | null;
  urineOutput?: string | null;
  notes?: string | null;
};

/** Liveness and ownership are checked inside the transaction that writes the reading. */
function requireContext(tx: DbTransaction, patientId: string, encounterId: string | null): void {
  if (
    !tx
      .select({ id: patients.id })
      .from(patients)
      .where(and(eq(patients.id, patientId), isNull(patients.deletedAt)))
      .get()
  )
    throw new Error('بیمار در دسترس نیست؛ اندازه‌گیری تغییر نکرد.');
  if (
    encounterId !== null &&
    !tx
      .select({ id: encounters.id })
      .from(encounters)
      .where(and(eq(encounters.id, encounterId), eq(encounters.patientId, patientId), isNull(encounters.deletedAt)))
      .get()
  )
    throw new Error('نوبت این اندازه‌گیری در دسترس نیست؛ پرونده را بررسی کنید.');
}

export async function recordVital(input: VitalInput, now = new Date()): Promise<string> {
  return db.transaction((tx) => recordVitalInTransaction(tx, input, now));
}

/** Synchronous clinical write; another write may be composed within this transaction. */
export function recordVitalInTransaction(tx: DbTransaction, input: VitalInput, now: Date): string {
  validateVitalNumbers(input);
  validateBloodSugar(input.bloodSugar, input.bloodSugarUnit);
  if (!hasAnyVital(input)) throw new Error('At least one observation is required');
  if (input.measuredAt && !Number.isFinite(input.measuredAt.getTime())) throw new Error('Invalid observation time');
  // Undefined selects the active encounter in this same snapshot; null stays unattached.
  const encounterId =
    input.encounterId !== undefined ? input.encounterId : resolveActiveEncounterId(input.patientId, tx);
  requireContext(tx, input.patientId, encounterId);
  const id = newId();
  tx.insert(vitals)
    .values({
      id,
      ...stamps(now),
      patientId: input.patientId,
      encounterId,
      measuredAt: input.measuredAt ?? now,
      systolic: input.systolic ?? null,
      diastolic: input.diastolic ?? null,
      heartRate: input.heartRate ?? null,
      respRate: input.respRate ?? null,
      temperature: input.temperature ?? null,
      spo2: input.spo2 ?? null,
      bloodSugar: input.bloodSugar ?? null,
      bloodSugarUnit: input.bloodSugarUnit ?? null,
      weightKg: input.weightKg ?? null,
      heightCm: input.heightCm ?? null,
      painScore: input.painScore ?? null,
      urineOutput: input.urineOutput?.trim() || null,
      notes: input.notes?.trim() || null,
    })
    .run();
  return id;
}

/**
 * Correct a reading.
 *
 * `null` clears a value and `undefined` leaves it alone, so correcting the
 * blood pressure on a set does not silently drop the temperature that was
 * taken with it.
 */
export async function updateVital(
  id: string,
  patch: Omit<Partial<VitalInput>, 'patientId'>,
  now = new Date(),
  expected?: Vital,
): Promise<void> {
  const changed = db.transaction((tx) => updateVitalInTransaction(tx, id, patch, now, expected));
  if (changed) await audit('vital.updated', { entityType: 'vital', entityId: id });
}

const PATCH_KEYS = [
  'encounterId',
  'measuredAt',
  'systolic',
  'diastolic',
  ...VITAL_NUMBER_KEYS,
  'bloodSugarUnit',
  'urineOutput',
  'notes',
] as const;
function sameField(a: unknown, b: unknown): boolean {
  return a instanceof Date && b instanceof Date ? a.getTime() === b.getTime() : a === b;
}

export function updateVitalInTransaction(
  tx: DbTransaction,
  id: string,
  patch: Omit<Partial<VitalInput>, 'patientId'>,
  now: Date,
  expected?: Vital,
): boolean {
  const current = tx
    .select()
    .from(vitals)
    .where(and(alive, eq(vitals.id, id)))
    .get();
  if (!current) throw new Error('این اندازه‌گیری در دسترس نیست؛ تغییر ثبت نشد.');
  if (Object.keys(patch).some((key) => !PATCH_KEYS.some((allowed) => allowed === key)))
    throw new Error('اطلاعات اصلاح اندازه‌گیری معتبر نیست.');
  validateVitalNumbers(patch);
  const definedPatch: typeof patch = Object.fromEntries(
    Object.entries(patch).filter(([, value]) => value !== undefined),
  );
  if (patch.bloodSugar === null && patch.bloodSugarUnit === undefined) definedPatch.bloodSugarUnit = null;
  const merged = { ...current, ...definedPatch };
  validateBloodSugar(
    merged.bloodSugar,
    merged.bloodSugarUnit,
    merged.bloodSugar === current.bloodSugar && current.bloodSugarUnit === null && merged.bloodSugarUnit === null,
  );
  if (!hasAnyVital({ ...current, ...definedPatch })) throw new Error('At least one observation is required');
  if (patch.measuredAt && !Number.isFinite(patch.measuredAt.getTime())) throw new Error('Invalid observation time');
  requireContext(tx, current.patientId, patch.encounterId === undefined ? current.encounterId : patch.encounterId);
  if (
    expected &&
    (expected.id !== id ||
      expected.patientId !== current.patientId ||
      expected.deletedAt !== null ||
      expected.encounterId !== current.encounterId ||
      !sameField(expected.measuredAt, current.measuredAt) ||
      ((patch.systolic !== undefined || patch.diastolic !== undefined) &&
        (current.systolic !== expected.systolic || current.diastolic !== expected.diastolic)) ||
      ((definedPatch.bloodSugar !== undefined || definedPatch.bloodSugarUnit !== undefined) &&
        (current.bloodSugar !== expected.bloodSugar || current.bloodSugarUnit !== expected.bloodSugarUnit)) ||
      PATCH_KEYS.some((key) => patch[key] !== undefined && !sameField(current[key], expected[key])))
  )
    throw new Error('این اندازه‌گیری تغییر کرده است؛ نسخهٔ جدید را بررسی کنید. نوشتهٔ شما روی صفحه باقی مانده است.');
  if (Object.keys(definedPatch).length === 0) return false;
  tx.update(vitals)
    .set({
      ...definedPatch,
      urineOutput: patch.urineOutput === undefined ? undefined : patch.urineOutput?.trim() || null,
      notes: patch.notes === undefined ? undefined : patch.notes?.trim() || null,
      ...touch(now),
    })
    .where(and(alive, eq(vitals.id, id)))
    .run();
  return true;
}

export async function deleteVital(id: string, now = new Date()): Promise<void> {
  const deleted = db.transaction((tx) => {
    const current = tx
      .select()
      .from(vitals)
      .where(and(alive, eq(vitals.id, id)))
      .get();
    if (!current) return false;
    requireContext(tx, current.patientId, current.encounterId);
    tx.update(vitals)
      .set(softDelete(now))
      .where(and(alive, eq(vitals.id, id)))
      .run();
    return true;
  });
  if (deleted) await audit('vital.deleted', { entityType: 'vital', entityId: id });
}

/** A measurement that can be plotted over time. */
export type VitalSeriesKey =
  'systolic' | 'diastolic' | 'heartRate' | 'respRate' | 'temperature' | 'spo2' | 'bloodSugar';

export type VitalPoint = { at: Date; value: number };

/** One measurement's history, skipping the readings where it was not taken. */
export function vitalSeries(
  rows: readonly Vital[],
  key: VitalSeriesKey,
  bloodSugarUnit?: BloodSugarUnit,
): VitalPoint[] {
  const points: VitalPoint[] = [];
  if (key === 'bloodSugar' && !isBloodSugarUnit(bloodSugarUnit)) return points;
  for (const row of rows) {
    if (key === 'bloodSugar' && row.bloodSugarUnit !== bloodSugarUnit) continue;
    const value = row[key];
    if (value == null) continue;
    points.push({ at: row.measuredAt, value });
  }
  return points.sort((a, b) => a.at.getTime() - b.at.getTime());
}
