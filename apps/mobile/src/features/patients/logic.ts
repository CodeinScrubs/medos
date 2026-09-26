import type { Patient } from '@/db/schema';
import { formatAge } from '@/lib/jalali';
import { buildSearchText, normalizePhone } from '@/lib/persian';

import { SEX_LABELS } from './labels';

/**
 * The `searchText` index for a patient: every field someone might type to find
 * them. Rebuilt from the full merged row on every write — never from a partial
 * patch, or editing one field would drop the others from the index. The phone
 * is indexed in its normalised form, so "0912 000 0001", "+98912…" and
 * "۰۹۱۲۰۰۰" all find the same patient.
 */
export function patientSearchText(
  p: Partial<
    Pick<Patient, 'firstName' | 'lastName' | 'nationalId' | 'fileNumber' | 'phone' | 'summary' | 'city' | 'tags'>
  >,
): string {
  return buildSearchText(
    p.firstName,
    p.lastName,
    p.nationalId,
    p.fileNumber,
    normalizePhone(p.phone),
    p.summary,
    p.city,
    p.tags ?? undefined,
  );
}

/** Statuses shown in the default "current" patient list. */
export const CURRENT_STATUSES = ['admitted', 'outpatient', 'followup'] as const;

/**
 * What tells this patient apart from another with the same name: age, sex and
 * file number. Shown next to the name wherever a patient is chosen or
 * confirmed — two "Ahmad Karimi"s, 35 and 62, looked identical in the capture
 * picker, the shift picker and the duplicate warning.
 */
export function patientIdentity(
  p: Pick<Patient, 'birthDate' | 'ageYears' | 'sex' | 'fileNumber'>,
  now: Date = new Date(),
): string {
  const age = formatAge(p.birthDate, p.ageYears, now);
  return [age !== '—' ? age : null, p.sex ? SEX_LABELS[p.sex] : null, p.fileNumber ? `پرونده ${p.fileNumber}` : null]
    .filter(Boolean)
    .join(' • ');
}

/** The picker line under a patient's name: identity first, then their one-line summary. */
export function patientPickerSublabel(
  p: Pick<Patient, 'birthDate' | 'ageYears' | 'sex' | 'fileNumber' | 'summary'>,
): string | null {
  return [patientIdentity(p), p.summary].filter(Boolean).join(' — ') || null;
}
