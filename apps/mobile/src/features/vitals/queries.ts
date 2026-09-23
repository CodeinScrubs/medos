import { and, desc, eq, isNull } from 'drizzle-orm';

import { audit } from '@/db/audit';
import { db } from '@/db/client';
import { vitals, type Vital } from '@/db/schema';
import { resolveActiveEncounterId } from '@/features/encounters/queries';
import { newId, softDelete, stamps, touch } from '@/lib/ids';

import { hasAnyVital, validateVitalNumbers } from './logic';

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

/** The most recent set, for the summary at the top of a record. */
export function latestVitalQuery(patientId: string) {
  return db
    .select()
    .from(vitals)
    .where(and(alive, eq(vitals.patientId, patientId)))
    .orderBy(desc(vitals.measuredAt))
    .limit(1);
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
  weightKg?: number | null;
  heightCm?: number | null;
  painScore?: number | null;
  urineOutput?: string | null;
  notes?: string | null;
};

export async function recordVital(input: VitalInput): Promise<string> {
  validateVitalNumbers(input);
  if (!hasAnyVital(input)) throw new Error('At least one observation is required');
  if (input.measuredAt && !Number.isFinite(input.measuredAt.getTime())) throw new Error('Invalid observation time');
  const id = newId();
  await db.insert(vitals).values({
    id,
    ...stamps(),
    patientId: input.patientId,
    // Undefined means "whatever admission is active"; null means explicitly none.
    encounterId: input.encounterId !== undefined ? input.encounterId : await resolveActiveEncounterId(input.patientId),
    measuredAt: input.measuredAt ?? new Date(),
    systolic: input.systolic ?? null,
    diastolic: input.diastolic ?? null,
    heartRate: input.heartRate ?? null,
    respRate: input.respRate ?? null,
    temperature: input.temperature ?? null,
    spo2: input.spo2 ?? null,
    bloodSugar: input.bloodSugar ?? null,
    weightKg: input.weightKg ?? null,
    heightCm: input.heightCm ?? null,
    painScore: input.painScore ?? null,
    urineOutput: input.urineOutput?.trim() || null,
    notes: input.notes?.trim() || null,
  });
  return id;
}

/**
 * Correct a reading.
 *
 * `null` clears a value and `undefined` leaves it alone, so correcting the
 * blood pressure on a set does not silently drop the temperature that was
 * taken with it.
 */
export async function updateVital(id: string, patch: Omit<Partial<VitalInput>, 'patientId'>): Promise<void> {
  const current = (await vitalQuery(id))[0];
  if (!current) throw new Error(`Vital ${id} not found`);
  validateVitalNumbers(patch);
  const definedPatch = Object.fromEntries(Object.entries(patch).filter(([, value]) => value !== undefined));
  if (!hasAnyVital({ ...current, ...definedPatch })) throw new Error('At least one observation is required');
  if (patch.measuredAt && !Number.isFinite(patch.measuredAt.getTime())) throw new Error('Invalid observation time');
  await db
    .update(vitals)
    .set({
      ...patch,
      urineOutput: patch.urineOutput === undefined ? undefined : patch.urineOutput?.trim() || null,
      notes: patch.notes === undefined ? undefined : patch.notes?.trim() || null,
      ...touch(),
    })
    .where(and(alive, eq(vitals.id, id)));
  await audit('vital.updated', { entityType: 'vital', entityId: id });
}

export async function deleteVital(id: string): Promise<void> {
  await db
    .update(vitals)
    .set(softDelete())
    .where(and(alive, eq(vitals.id, id)));
  await audit('vital.deleted', { entityType: 'vital', entityId: id });
}

/** A measurement that can be plotted over time. */
export type VitalSeriesKey =
  'systolic' | 'diastolic' | 'heartRate' | 'respRate' | 'temperature' | 'spo2' | 'bloodSugar';

export type VitalPoint = { at: Date; value: number };

/** One measurement's history, skipping the readings where it was not taken. */
export function vitalSeries(rows: readonly Vital[], key: VitalSeriesKey): VitalPoint[] {
  const points: VitalPoint[] = [];
  for (const row of rows) {
    const value = row[key];
    if (value == null) continue;
    points.push({ at: row.measuredAt, value });
  }
  return points.sort((a, b) => a.at.getTime() - b.at.getTime());
}
