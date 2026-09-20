import type { Encounter, PatientStatus } from '@/db/schema';
import { toPersianDigits } from '@/lib/persian';

/** When the hour of admission was not recorded, this is the hour assumed. */
export const ASSUMED_ADMISSION_HOUR = 12;
export const ASSUMED_ADMISSION_MINUTE = 1;

export type AdmissionElapsed = { days: number; hours: number; approximate: boolean };

/**
 * How long this admission has actually lasted, in elapsed time.
 *
 * Not the calendar-day count this used to return. "Day 2" on a chart can mean
 * anything from one hour to two days: a patient admitted at 23:30 was on day 2
 * half an hour later. Elapsed days and hours say the same thing for a patient
 * admitted a week ago and something honest for one admitted overnight.
 *
 * This is the admission's own clock. A drug's day count (`kardex/logic.ts`)
 * deliberately stays a calendar count starting at day 1 — "D5 of ceftriaxone"
 * is how a course is written and counted, and the two must not be merged.
 *
 * When the hour was not recorded, the stored time is an assumption and hours
 * are not reported at all; `approximate` says so.
 */
export function admissionElapsed(
  admittedAt: Date | null | undefined,
  hasTime: boolean,
  until: Date = new Date(),
): AdmissionElapsed | null {
  if (!admittedAt) return null;
  const ms = until.getTime() - admittedAt.getTime();
  if (Number.isNaN(ms)) return null;
  const whole = Math.max(0, ms);
  return {
    days: Math.floor(whole / 86_400_000),
    hours: Math.floor((whole % 86_400_000) / 3_600_000),
    approximate: !hasTime,
  };
}

/** "۳ روز و ۴ ساعت", "۷ ساعت", "حدود ۳ روز" — Persian digits, it is a duration. */
export function formatAdmissionElapsed(elapsed: AdmissionElapsed | null): string | null {
  if (!elapsed) return null;
  const { days, hours, approximate } = elapsed;
  if (approximate) {
    // An assumed midday cannot carry an hour count; only the days survive it.
    return days === 0 ? 'امروز' : `حدود ${toPersianDigits(days)} روز`;
  }
  if (days === 0) return hours === 0 ? 'همین حالا' : `${toPersianDigits(hours)} ساعت`;
  if (hours === 0) return `${toPersianDigits(days)} روز`;
  return `${toPersianDigits(days)} روز و ${toPersianDigits(hours)} ساعت`;
}

/** The time to store when the hour of admission is unknown: noon plus one minute. */
export function withAssumedHour(date: Date): Date {
  const out = new Date(date);
  out.setHours(ASSUMED_ADMISSION_HOUR, ASSUMED_ADMISSION_MINUTE, 0, 0);
  return out;
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
