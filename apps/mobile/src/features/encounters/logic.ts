import type { Encounter, PatientStatus } from '@/db/schema';
import { daysBetween } from '@/lib/jalali';

/**
 * Hospital day, counting the admission day as day 1 — the way it is said on
 * rounds ("روز پنجم بستری").
 */
export function hospitalDay(admittedAt: Date | null | undefined, until: Date = new Date()): number | null {
  if (!admittedAt) return null;
  const diff = daysBetween(until, admittedAt);
  return diff == null ? null : diff + 1;
}

const STATUS_FOR_KIND: Record<Encounter['kind'], PatientStatus> = {
  admission: 'admitted',
  emergency: 'admitted',
  outpatient: 'outpatient',
  consult_only: 'outpatient',
};

/** What opening an encounter of this kind makes the patient. */
export function statusForEncounterKind(kind: Encounter['kind']): PatientStatus {
  return STATUS_FOR_KIND[kind];
}

/** A death discharge always wins over whatever follow-up status was chosen. */
export function statusAfterDischarge(
  dischargeType: NonNullable<Encounter['dischargeType']>,
  requested: PatientStatus,
): PatientStatus {
  return dischargeType === 'death' ? 'deceased' : requested;
}

export function isInpatient(kind: Encounter['kind']): boolean {
  return kind === 'admission' || kind === 'emergency';
}
