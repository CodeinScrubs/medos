import { z } from 'zod';

import type { Patient } from '@/db/schema';
import { validateDateInput } from '@/lib/date-input';
import { fromIsoDate, parseJalaliInput, toIsoDate, toJalali } from '@/lib/jalali';
import { normalizePhone, toLatinDigits, toPersianDigits } from '@/lib/persian';

import { parseAgeYears } from './logic';

const fieldsSchema = z
  .object({
    firstName: z.string(),
    lastName: z.string(),
    sex: z.enum(['male', 'female', 'other']).nullable(),
    birthDateText: z.string(),
    ageYears: z.string(),
    status: z.enum(['admitted', 'outpatient', 'followup', 'discharged', 'archived', 'deceased']),
    summary: z.string(),
    nationalId: z.string(),
    fileNumber: z.string(),
    phone: z.string(),
    city: z.string(),
    address: z.string(),
    bloodType: z.string(),
    allergies: z.string(),
    pastMedicalHistory: z.string(),
    drugHistory: z.string(),
    habitualHistory: z.string(),
    familyHistory: z.string(),
  })
  .strict();
const documentSchema = z
  .object({ version: z.literal(1), fields: fieldsSchema, base: fieldsSchema.nullable() })
  .strict();
export type PatientFormFields = z.infer<typeof fieldsSchema>;
export type PatientFormDocument = z.infer<typeof documentSchema>;
export type PatientFormErrors = Partial<Record<keyof PatientFormFields, string>>;
export const PATIENT_FORM_LABELS: Record<keyof PatientFormFields, string> = {
  firstName: 'نام',
  lastName: 'نام خانوادگی',
  sex: 'جنسیت',
  birthDateText: 'تاریخ تولد',
  ageYears: 'سن',
  status: 'وضعیت',
  summary: 'خلاصه‌ی یک‌خطی',
  nationalId: 'کد ملی',
  fileNumber: 'شماره پرونده',
  phone: 'تلفن',
  city: 'شهر',
  address: 'آدرس',
  bloodType: 'گروه خونی',
  allergies: 'آلرژی',
  pastMedicalHistory: 'سابقه بیماری',
  drugHistory: 'سابقه دارویی',
  habitualHistory: 'عادات',
  familyHistory: 'سابقه خانوادگی',
};

export function initialPatientFields(patient?: Patient): PatientFormFields {
  const date = fromIsoDate(patient?.birthDate);
  const j = date ? toJalali(date) : null;
  return {
    firstName: patient?.firstName ?? '',
    lastName: patient?.lastName ?? '',
    sex: patient?.sex ?? null,
    birthDateText: j
      ? toPersianDigits(`${j.jy}/${String(j.jm).padStart(2, '0')}/${String(j.jd).padStart(2, '0')}`)
      : '',
    ageYears: patient?.ageYears != null ? String(patient.ageYears) : '',
    status: patient?.status ?? 'outpatient',
    summary: patient?.summary ?? '',
    nationalId: patient?.nationalId ?? '',
    fileNumber: patient?.fileNumber ?? '',
    phone: patient?.phone ?? '',
    city: patient?.city ?? '',
    address: patient?.address ?? '',
    bloodType: patient?.bloodType ?? '',
    allergies: patient?.allergies ?? '',
    pastMedicalHistory: patient?.pastMedicalHistory ?? '',
    drugHistory: patient?.drugHistory ?? '',
    habitualHistory: patient?.habitualHistory ?? '',
    familyHistory: patient?.familyHistory ?? '',
  };
}

/** Schema errors never include the raw document in an error/log. Unknown versions remain untouched. */
export function decodePatientForm(body: string): PatientFormDocument {
  try {
    return documentSchema.parse(JSON.parse(body));
  } catch {
    throw new Error('پیش‌نویس قابل خواندن نیست؛ اطلاعات ذخیره‌شده تغییر نکرد.');
  }
}
export function encodePatientForm(document: PatientFormDocument): string {
  return JSON.stringify(decodePatientForm(JSON.stringify(document)));
}
export function patientFormErrors(fields: PatientFormFields, now: Date): PatientFormErrors {
  const errors: PatientFormErrors = {};
  if (!fields.firstName.trim()) errors.firstName = 'نام لازم است';
  if (!fields.lastName.trim()) errors.lastName = 'نام خانوادگی لازم است';
  if (!parseAgeYears(fields.ageYears).valid) errors.ageYears = 'سن را به سال کامل و غیرمنفی بنویسید';
  const date = validateDateInput(fields.birthDateText, { required: false, allowFuture: false, now });
  if (!date.valid)
    errors.birthDateText = date.reason === 'future' ? 'تاریخ تولد در آینده است' : 'تاریخ تولد معتبر نیست';
  return errors;
}

/** Call only after validating current input. Base snapshots may include a historically future date. */
export function patientFormValues(fields: PatientFormFields) {
  const date = parseJalaliInput(fields.birthDateText);
  return {
    firstName: fields.firstName.trim(),
    lastName: fields.lastName.trim(),
    sex: fields.sex,
    birthDate: date ? toIsoDate(date) : null,
    ageYears: parseAgeYears(fields.ageYears).value,
    status: fields.status,
    summary: fields.summary.trim() || null,
    nationalId: toLatinDigits(fields.nationalId).replace(/\D/g, '') || null,
    fileNumber: fields.fileNumber.trim() || null,
    phone: normalizePhone(fields.phone) || null,
    city: fields.city.trim() || null,
    address: fields.address.trim() || null,
    bloodType: fields.bloodType || null,
    allergies: fields.allergies.trim() || null,
    pastMedicalHistory: fields.pastMedicalHistory.trim() || null,
    drugHistory: fields.drugHistory.trim() || null,
    habitualHistory: fields.habitualHistory.trim() || null,
    familyHistory: fields.familyHistory.trim() || null,
  };
}
export type PatientFormValues = ReturnType<typeof patientFormValues>;

/** Only local edits are published; unrelated background edits, flags and tags survive. */
export function patientFormPatch(document: PatientFormDocument, current: Patient): Partial<PatientFormValues> {
  if (!document.base) throw new Error('مبنای ویرایش پرونده پیدا نشد.');
  const base = patientFormValues(document.base);
  const desired = patientFormValues(document.fields);
  const latest = patientFormValues(initialPatientFields(current));
  const patch: Partial<PatientFormValues> = {};
  for (const key of Object.keys(desired) as (keyof PatientFormValues)[]) {
    if (desired[key] === base[key]) continue;
    if (latest[key] !== base[key] && latest[key] !== desired[key]) throw new PatientFormConflict();
    Object.assign(patch, { [key]: desired[key] });
  }
  return patch;
}
export class PatientFormConflict extends Error {
  constructor(message = 'پیش‌نویس یا پرونده تغییر کرده است؛ نسخه‌ها را بررسی کنید.') {
    super(message);
    this.name = 'PatientFormConflict';
  }
}

/** Explicitly keep local changed fields after showing the current chart to the owner. */
export function rebasePatientForm(document: PatientFormDocument, current: Patient | null): PatientFormDocument {
  if (!current) return { ...document, base: null };
  if (!document.base) throw new PatientFormConflict();
  const base = initialPatientFields(current);
  const fields = { ...base };
  for (const key of Object.keys(fields) as (keyof PatientFormFields)[]) {
    if (document.fields[key] !== document.base[key]) Object.assign(fields, { [key]: document.fields[key] });
  }
  return { version: 1, base, fields };
}
