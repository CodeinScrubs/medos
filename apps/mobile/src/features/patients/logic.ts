import type { Patient } from '@/db/schema';
import { buildSearchText, normalizePhone } from '@/lib/persian';

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
