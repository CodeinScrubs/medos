import { and, desc, eq, isNull } from 'drizzle-orm';

import { db } from '@/db/client';
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

/** The live episode a patient is in, if any. */
export async function activeEncounter(patientId: string) {
  const rows = await db
    .select()
    .from(encounters)
    .where(and(isNull(encounters.deletedAt), eq(encounters.patientId, patientId), eq(encounters.isActive, true)))
    .orderBy(desc(encounters.admittedAt))
    .limit(1);
  return rows[0] ?? null;
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
  const patient = (
    await db
      .select({ status: patients.status })
      .from(patients)
      .where(and(isNull(patients.deletedAt), eq(patients.id, patientId)))
      .limit(1)
  )[0];
  if (!patient) return null;

  const next = statusFor(await activeEncounter(patientId), patient.status);
  if (next !== patient.status) {
    await db
      .update(patients)
      .set({ status: next, ...touch() })
      .where(eq(patients.id, patientId));
  }
  return next;
}

/**
 * The same, for every patient, at startup.
 *
 * A disagreement between the two tables can only come from a build that let
 * them disagree, or from a restore of one. Rather than trusting that no such
 * row exists, the app checks — it is one query over a personal-sized table —
 * and reports how many it had to correct.
 */
export async function reconcileAllPatientStatuses(): Promise<number> {
  const rows = await db
    .select({ id: patients.id, status: patients.status, kind: encounters.kind })
    .from(patients)
    .leftJoin(
      encounters,
      and(eq(encounters.patientId, patients.id), eq(encounters.isActive, true), isNull(encounters.deletedAt)),
    )
    .where(isNull(patients.deletedAt));

  let fixed = 0;
  for (const row of rows) {
    const next = statusFor(row.kind ? { kind: row.kind } : null, row.status);
    if (next === row.status) continue;
    await db
      .update(patients)
      .set({ status: next, ...touch() })
      .where(eq(patients.id, row.id));
    fixed += 1;
  }
  return fixed;
}

/**
 * Where every admitted patient is, in one query.
 *
 * The patient list is read on a round with twenty-odd inpatients, and "which
 * bed" is the question that decides where to walk next. Fetching it per card
 * would be one query per row; this is one for the screen.
 */
export function activeLocationsQuery() {
  return db
    .select({
      patientId: encounters.patientId,
      ward: encounters.ward,
      bed: encounters.bed,
      kind: encounters.kind,
    })
    .from(encounters)
    .where(and(isNull(encounters.deletedAt), eq(encounters.isActive, true)));
}

export type ActiveLocation = { ward: string | null; bed: string | null };

/** "داخلی ۲، تخت ۴", or nothing when neither is recorded. */
export function locationLabel(location: ActiveLocation | undefined): string | null {
  if (!location) return null;
  const parts = [location.ward?.trim(), location.bed?.trim() ? `تخت ${toPersianDigits(location.bed.trim())}` : null];
  return joinLabels(parts) || null;
}
