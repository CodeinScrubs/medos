import { z } from 'zod';

import type { Vital } from '@/db/schema';
import { dateInputText, validateDateInput } from '@/lib/date-input';
import { BLOOD_SUGAR_UNITS } from '@/lib/glucose-unit';
import { fromIsoDate } from '@/lib/jalali';
import { formatClock, parseClock } from '@/lib/time';

import { parseVitalForm, vitalFormOf, type VitalEditValues, type VitalForm } from './logic';

const textFields = z
  .object({
    bp: z.string(),
    heartRate: z.string(),
    respRate: z.string(),
    temperature: z.string(),
    spo2: z.string(),
    bloodSugar: z.string(),
    weightKg: z.string(),
    heightCm: z.string(),
    painScore: z.string(),
    urineOutput: z.string(),
    notes: z.string(),
  })
  .strict();
const date = z.object({ dateText: z.string(), clockText: z.string(), customOpen: z.boolean() }).strict();
const legacyFields = textFields.extend({ date }).strict();
const fields = legacyFields.extend({ bloodSugarUnit: z.enum([...BLOOD_SUGAR_UNITS, '']) }).strict();
const number = z.number().finite().nullable();
const base = z
  .object({
    id: z.string(),
    patientId: z.string(),
    encounterId: z.string().nullable(),
    measuredAt: z.number().finite(),
    systolic: number,
    diastolic: number,
    heartRate: number,
    respRate: number,
    temperature: number,
    spo2: number,
    bloodSugar: number,
    weightKg: number,
    heightCm: number,
    painScore: number,
    urineOutput: z.string().nullable(),
    notes: z.string().nullable(),
  })
  .strict();
const legacySchema = z
  .object({
    version: z.literal(1),
    fields: legacyFields,
    initial: legacyFields,
    base: base.nullable(),
    initialDate: z.number().finite(),
    encounterId: z.string().nullable(),
  })
  .strict();
const schema = legacySchema.extend({
  version: z.literal(2),
  fields,
  initial: fields,
  base: base
    .extend({ bloodSugarUnit: z.enum(BLOOD_SUGAR_UNITS).nullable() })
    .strict()
    .nullable(),
});
export type VitalFormFields = z.infer<typeof fields>;
export type VitalFormDocument = z.infer<typeof schema>;
export class VitalFormConflict extends Error {
  constructor() {
    super('اندازه‌گیری یا پیش‌نویس در صفحهٔ دیگری تغییر کرده است؛ نوشته نگه داشته شد.');
    this.name = 'VitalFormConflict';
  }
}
export const EMPTY_VITAL_FORM: VitalForm = {
  bp: '',
  heartRate: '',
  respRate: '',
  temperature: '',
  spo2: '',
  bloodSugar: '',
  bloodSugarUnit: '',
  weightKg: '',
  heightCm: '',
  painScore: '',
  urineOutput: '',
  notes: '',
};
export function vitalBase(row: Vital): NonNullable<VitalFormDocument['base']> {
  const {
    id,
    patientId,
    encounterId,
    systolic,
    diastolic,
    heartRate,
    respRate,
    temperature,
    spo2,
    bloodSugar,
    bloodSugarUnit,
    weightKg,
    heightCm,
    painScore,
    urineOutput,
    notes,
  } = row;
  return {
    id,
    patientId,
    encounterId,
    measuredAt: row.measuredAt.getTime(),
    systolic,
    diastolic,
    heartRate,
    respRate,
    temperature,
    spo2,
    bloodSugar,
    bloodSugarUnit,
    weightKg,
    heightCm,
    painScore,
    urineOutput,
    notes,
  };
}
export function initialVitalForm(row: Vital | null, encounterId: string | null, now: Date): VitalFormDocument {
  const at = row?.measuredAt ?? now;
  const value: VitalFormFields = {
    ...(row ? vitalFormOf(row) : EMPTY_VITAL_FORM),
    date: { dateText: dateInputText(at), clockText: formatClock(at), customOpen: false },
  };
  return {
    version: 2,
    fields: value,
    initial: { ...value, date: { ...value.date } },
    base: row ? vitalBase(row) : null,
    initialDate: at.getTime(),
    encounterId: row ? row.encounterId : encounterId,
  };
}
export function decodeVitalForm(body: string): VitalFormDocument {
  try {
    const raw: unknown = JSON.parse(body);
    if (raw && typeof raw === 'object' && 'version' in raw && raw.version === 1) {
      const old = legacySchema.parse(raw);
      return schema.parse({
        ...old,
        version: 2,
        fields: { ...old.fields, bloodSugarUnit: '' },
        initial: { ...old.initial, bloodSugarUnit: '' },
        base: old.base ? { ...old.base, bloodSugarUnit: null } : null,
      });
    }
    return schema.parse(raw);
  } catch {
    throw new Error('پیش‌نویس اندازه‌گیری قابل خواندن نیست؛ داده تغییر نکرد.');
  }
}
export const encodeVitalForm = (document: VitalFormDocument) => JSON.stringify(schema.parse(document));
export function vitalFormTime(document: VitalFormDocument, now: Date): Date {
  const f = document.fields;
  const day = validateDateInput(f.date.dateText, { required: true, allowFuture: false, now });
  const clock = parseClock(f.date.clockText);
  if (!day.valid || !day.iso || !clock) throw new Error('تاریخ یا ساعت اندازه‌گیری معتبر نیست؛ پیش‌نویس نگه داشته شد.');
  if (f.date.dateText === document.initial.date.dateText && f.date.clockText === document.initial.date.clockText)
    return new Date(document.initialDate);
  const at = fromIsoDate(day.iso)!;
  at.setHours(clock[0], clock[1]);
  return at;
}
export function vitalFormValues(document: VitalFormDocument, now: Date): VitalEditValues {
  const d = schema.parse(document);
  const parsed = parseVitalDocument(d);
  if (!parsed.ok) throw new Error('عدد اندازه‌گیری معتبر نیست؛ موارد مشخص‌شده را بررسی کنید.');
  return { ...parsed.values, measuredAt: vitalFormTime(d, now) };
}
/** A legacy value may stay unknown only while its exact input and unit remain untouched. */
export function parseVitalDocument(document: VitalFormDocument) {
  return parseVitalForm(document.fields, {
    allowUnknownBloodSugar:
      document.base?.bloodSugar != null &&
      document.base.bloodSugarUnit === null &&
      document.fields.bloodSugar === document.initial.bloodSugar &&
      document.fields.bloodSugarUnit === '' &&
      document.initial.bloodSugarUnit === '',
  });
}
const changedDate = (d: VitalFormDocument) =>
  d.fields.date.dateText !== d.initial.date.dateText || d.fields.date.clockText !== d.initial.date.clockText;
const changedGlucose = (d: VitalFormDocument) =>
  d.fields.bloodSugar !== d.initial.bloodSugar || d.fields.bloodSugarUnit !== d.initial.bloodSugarUnit;
/** BP and glucose/unit are pairs; never combine locally changed and remotely changed halves. */
export function vitalFormPatch(document: VitalFormDocument, current: Vital, now: Date): Partial<VitalEditValues> {
  const original = document.base;
  if (
    !original ||
    original.id !== current.id ||
    original.patientId !== current.patientId ||
    original.encounterId !== current.encounterId ||
    original.measuredAt !== current.measuredAt.getTime()
  )
    throw new VitalFormConflict();
  const values = vitalFormValues(document, now);
  const patch: Partial<VitalEditValues> = {};
  if (document.fields.bp !== document.initial.bp) {
    if (
      (current.systolic !== original.systolic || current.diastolic !== original.diastolic) &&
      (current.systolic !== values.systolic || current.diastolic !== values.diastolic)
    )
      throw new VitalFormConflict();
    patch.systolic = values.systolic;
    patch.diastolic = values.diastolic;
  }
  if (changedGlucose(document)) {
    if (
      (current.bloodSugar !== original.bloodSugar || current.bloodSugarUnit !== original.bloodSugarUnit) &&
      (current.bloodSugar !== values.bloodSugar || current.bloodSugarUnit !== values.bloodSugarUnit)
    )
      throw new VitalFormConflict();
    patch.bloodSugar = values.bloodSugar;
    patch.bloodSugarUnit = values.bloodSugarUnit;
  }
  for (const key of Object.keys(document.initial) as (keyof VitalFormFields)[]) {
    if (
      key === 'bp' ||
      key === 'date' ||
      key === 'bloodSugar' ||
      key === 'bloodSugarUnit' ||
      document.fields[key] === document.initial[key]
    )
      continue;
    if (current[key] !== original[key] && current[key] !== values[key]) throw new VitalFormConflict();
    Object.assign(patch, { [key]: values[key] });
  }
  if (changedDate(document)) patch.measuredAt = values.measuredAt;
  return patch;
}
/** Explicit Keep mine rebases only changed fields after the compared snapshot is rechecked. */
export function rebaseVitalForm(document: VitalFormDocument, current: Vital, now: Date): VitalFormDocument {
  if (
    !document.base ||
    document.base.id !== current.id ||
    document.base.patientId !== current.patientId ||
    current.encounterId !== document.encounterId
  )
    throw new VitalFormConflict();
  const fresh = initialVitalForm(current, document.encounterId, now);
  if (changedGlucose(document)) {
    // An explicit Keep mine keeps the whole observation, never another writer's number.
    fresh.fields.bloodSugar = document.fields.bloodSugar;
    fresh.fields.bloodSugarUnit = document.fields.bloodSugarUnit;
  }
  for (const key of Object.keys(document.fields) as (keyof VitalFormFields)[]) {
    if (key === 'date') {
      if (changedDate(document)) fresh.fields.date = { ...document.fields.date };
      else fresh.fields.date.customOpen = document.fields.date.customOpen;
      continue;
    }
    if (key === 'bloodSugar' || key === 'bloodSugarUnit') continue;
    const changed = document.fields[key] !== document.initial[key];
    if (changed) Object.assign(fresh.fields, { [key]: document.fields[key] });
  }
  return fresh;
}
