import type { Encounter, Patient, ShiftPatient, Task } from '@/db/schema';
import { admissionElapsed, formatAdmissionElapsed } from '@/features/encounters/logic';
import { locationLabel } from '@/features/encounters/status';
import { formatAge, formatJalali, formatJalaliDateTime } from '@/lib/jalali';
import { buildSearchText, fullName, joinLabels, searchTerms, toLatinDigits } from '@/lib/persian';

export type ShiftDeckRow = {
  member: ShiftPatient;
  patient: Patient;
  encounter: Encounter | null;
  nextTask: Task | null;
};

/** This is a filter over the already loaded shift, using the app's text-folding rules. */
export function shiftDeckSearchText(row: ShiftDeckRow): string {
  return buildSearchText(
    row.patient.searchText,
    fullName(row.patient.firstName, row.patient.lastName),
    row.encounter?.ward,
    row.encounter?.bed,
    row.member.shiftSummary,
    row.member.handoffNote,
    row.nextTask?.title,
  );
}
export function matchesShiftDeck(row: ShiftDeckRow, query: string): boolean {
  const text = shiftDeckSearchText(row);
  return searchTerms(query).every((term) => text.includes(term));
}
export function shiftPatientBrief(row: ShiftDeckRow, now: Date) {
  const { patient, encounter, member } = row;
  const age = toLatinDigits(formatAge(patient.birthDate, patient.ageYears, now));
  const sex = patient.sex === 'female' ? 'F' : patient.sex === 'male' ? 'M' : patient.sex === 'other' ? 'other' : null;
  const elapsed =
    encounter && (encounter.isActive || encounter.dischargedAt)
      ? formatAdmissionElapsed(
          admissionElapsed(encounter.admittedAt, encounter.admittedAtHasTime, encounter.dischargedAt ?? now),
        )
      : null;
  return {
    name: fullName(patient.firstName, patient.lastName),
    ageSex: [sex, age !== '—' ? age : null].filter(Boolean).join(' / '),
    location: locationLabel(encounter ?? undefined),
    admission: encounter ? joinLabels([`پذیرش ${formatJalali(encounter.admittedAt)}`, elapsed]) : null,
    summary: member.shiftSummary || patient.summary,
    task: row.nextTask
      ? joinLabels([row.nextTask.title, row.nextTask.dueAt ? formatJalaliDateTime(row.nextTask.dueAt) : null])
      : null,
  };
}
