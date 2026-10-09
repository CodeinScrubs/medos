import { and, asc, desc, eq, isNull, sql } from 'drizzle-orm';

import { db, type Database } from '@/db/client';
import { encounters, patients, type PatientStatus } from '@/db/schema';
import { touch } from '@/lib/ids';
import { joinLabels, toPersianDigits } from '@/lib/persian';

import { statusForEncounterKind } from './logic';

/*
 * Who decides whether a patient is on a ward.
 *
 * The status used to be written from two places: the episode — admit,
 * discharge, correct the kind — and the patient form, which offered
 * "بستری" as a chip like any other field. So a patient could be admitted with
 * no admission behind them: on the ward list, with no bed, no ward, no
 * admission time and no kardex to hang orders on. Nothing was wrong in either
 * table; they simply disagreed.
 *
 * The episode wins. `admitted` is what an open admission or emergency episode
 * means, and it is not something a form can assert on its own. Everything else
 * — outpatient, follow-up, discharged, archived, deceased — belongs to the
 * patient and is set directly, because no episode implies them.
 */

/** Statuses a person can choose for a patient; `admitted` is not one of them. */
export const CHOOSABLE_STATUSES: readonly PatientStatus[] = [
  'outpatient',
  'followup',
  'discharged',
  'archived',
  'deceased',
];

export function isChoosableStatus(status: PatientStatus): boolean {
  return CHOOSABLE_STATUSES.includes(status);
}

/** Equal/unknown admission times use one stable fallback; ids do not decide clinical truth. */
export function encounterRecencyOrder() {
  return [desc(encounters.admittedAt), asc(encounters.id)];
}

/** The same single-column context is used by publication and new raw forms. */
export function activeEncounterIdQuery(patientId: string, handle: Pick<Database, 'select'> = db) {
  return handle
    .select({ id: encounters.id })
    .from(encounters)
    .where(and(isNull(encounters.deletedAt), eq(encounters.patientId, patientId), eq(encounters.isActive, true)))
    .orderBy(...encounterRecencyOrder())
    .limit(1);
}

/** The live episode a patient is in, if any. */
export function activeEncounterQuery(patientId: string, handle: Pick<Database, 'select'> = db) {
  return handle
    .select()
    .from(encounters)
    .where(and(isNull(encounters.deletedAt), eq(encounters.patientId, patientId), eq(encounters.isActive, true)))
    .orderBy(...encounterRecencyOrder())
    .limit(1);
}

export async function activeEncounter(patientId: string) {
  return (await activeEncounterQuery(patientId))[0] ?? null;
}

/**
 * What the patient's status should be, given their episodes.
 *
 * `fallback` is what to use when no episode implies anything — the status the
 * patient already has, unless that status was `admitted`, which only an
 * episode can justify.
 */
export function statusFor(
  active: { kind: (typeof encounters.$inferSelect)['kind'] } | null,
  fallback: PatientStatus,
): PatientStatus {
  if (active) return statusForEncounterKind(active.kind);
  return fallback === 'admitted' ? 'outpatient' : fallback;
}

/**
 * Put one patient's status back in step with their episodes.
 *
 * Returns the status it settled on, or null when the patient is gone. Safe to
 * run repeatedly: it writes only when the stored status is actually wrong.
 */
export async function reconcilePatientStatus(patientId: string): Promise<PatientStatus | null> {
  const now = new Date();
  return db.transaction((tx) => {
    const patient = tx
      .select({ id: patients.id, status: patients.status })
      .from(patients)
      .where(and(isNull(patients.deletedAt), eq(patients.id, patientId)))
      .get();
    return patient ? reconcileStoredStatus(tx, patient, now) : null;
  });
}

/** Repair is an inference from current rows, never an awaited stale snapshot. */
function reconcileStoredStatus(
  handle: Pick<Database, 'select' | 'update'>,
  patient: { id: string; status: PatientStatus },
  now: Date,
): PatientStatus {
  const next = statusFor(activeEncounterQuery(patient.id, handle).get() ?? null, patient.status);
  if (next !== patient.status)
    handle
      .update(patients)
      .set({ status: next, ...touch(now) })
      .where(eq(patients.id, patient.id))
      .run();
  return next;
}

/**
 * The same, for every patient, at startup.
 *
 * A disagreement between the two tables can only come from a build that let
 * them disagree, or from a restore of one. Rather than trusting that no such
 * row exists, the app checks in one startup transaction and reports how many
 * it had to correct. Each patient's active episode uses the same ordered query
 * as individual repair; imported duplicate episodes
 * are retained, not silently closed or applied repeatedly in join order.
 */
export async function reconcileAllPatientStatuses(): Promise<number> {
  const now = new Date();
  return db.transaction((tx) => {
    const rows = tx
      .select({ id: patients.id, status: patients.status })
      .from(patients)
      .where(isNull(patients.deletedAt))
      .all();
    let fixed = 0;
    for (const row of rows) if (reconcileStoredStatus(tx, row, now) !== row.status) fixed += 1;
    return fixed;
  });
}

/**
 * Where every admitted patient is, in one query.
 *
 * The patient list is read on a round with twenty-odd inpatients, and "which
 * bed" is the question that decides where to walk next. Fetching it per card
 * would be one query per row; this is one for the screen.
 */
export function activeLocationsQuery() {
  // Rank only live active episodes, rather than looking up every archived patient
  // or leaving a Map's last duplicate to decide which bed is shown.
  const selected = db
    .select({
      patientId: encounters.patientId,
      ward: encounters.ward,
      bed: encounters.bed,
      kind: encounters.kind,
      rank: sql<number>`row_number() over (partition by ${encounters.patientId} order by ${sql.join(encounterRecencyOrder(), sql`, `)})`.as(
        'location_rank',
      ),
    })
    .from(encounters)
    .where(and(isNull(encounters.deletedAt), eq(encounters.isActive, true)))
    .as('selected_active_locations');
  return db
    .select({
      patientId: selected.patientId,
      ward: selected.ward,
      bed: selected.bed,
      kind: selected.kind,
    })
    .from(selected)
    .where(eq(selected.rank, 1));
}

export type ActiveLocation = { ward: string | null; bed: string | null };

/** "داخلی ۲، تخت ۴", or nothing when neither is recorded. */
export function locationLabel(location: ActiveLocation | undefined): string | null {
  if (!location) return null;
  const parts = [location.ward?.trim(), location.bed?.trim() ? `تخت ${toPersianDigits(location.bed.trim())}` : null];
  return joinLabels(parts) || null;
}
