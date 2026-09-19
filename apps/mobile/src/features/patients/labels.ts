import type { BadgeTone } from '@/components/ui';
import type { Patient, PatientStatus } from '@/db/schema';

/** Persian labels and display tone for every patient status. */
export const PATIENT_STATUS: Record<PatientStatus, { label: string; tone: BadgeTone; short: string }> = {
  admitted: { label: 'بستری', tone: 'primary', short: 'بستری' },
  outpatient: { label: 'سرپایی', tone: 'info', short: 'سرپایی' },
  followup: { label: 'در حال پیگیری', tone: 'warning', short: 'پیگیری' },
  discharged: { label: 'ترخیص‌شده', tone: 'success', short: 'ترخیص' },
  archived: { label: 'بایگانی', tone: 'neutral', short: 'بایگانی' },
  deceased: { label: 'فوت‌شده', tone: 'danger', short: 'فوت' },
};

/** The order status chips appear in, most-used first. */
export const PATIENT_STATUS_ORDER: PatientStatus[] = [
  'admitted',
  'outpatient',
  'followup',
  'discharged',
  'archived',
  'deceased',
];

export const SEX_LABELS: Record<NonNullable<Patient['sex']>, string> = {
  male: 'مرد',
  female: 'زن',
  other: 'سایر',
};

export const BLOOD_TYPES = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'] as const;
