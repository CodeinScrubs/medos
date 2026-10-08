import { z } from 'zod';

import type { Vital } from '@/db/schema';
import { dateInputText, validateDateInput } from '@/lib/date-input';
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
const fields = textFields.extend({ date }).strict();
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
const schema = z
  .object({
    version: z.literal(1),
    fields,
    initial: fields,
    base: base.nullable(),
    initialDate: z.number().finite(),
    encounterId: z.string().nullable(),
  })
  .strict();
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
    version: 1,
    fields: value,
    initial: { ...value, date: { ...value.date } },
    base: row ? vitalBase(row) : null,
    initialDate: at.getTime(),
    encounterId: row ? row.encounterId : encounterId,
  };
}
export function decodeVitalForm(body: string): VitalFormDocument {
  try {
    return schema.parse(JSON.parse(body));
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
  const parsed = parseVitalForm(d.fields);
  if (!parsed.ok) throw new Error('عدد اندازه‌گیری معتبر نیست؛ موارد مشخص‌شده را بررسی کنید.');
  return { ...parsed.values, measuredAt: vitalFormTime(d, now) };
}
const changedDate = (d: VitalFormDocument) =>
  d.fields.date.dateText !== d.initial.date.dateText || d.fields.date.clockText !== d.initial.date.clockText;
/** BP is one observation. Never merge one locally changed half with a different writer's half. */
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
  for (const key of Object.keys(document.initial) as (keyof VitalFormFields)[]) {
    if (key === 'bp' || key === 'date' || document.fields[key] === document.initial[key]) continue;
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
  for (const key of Object.keys(document.fields) as (keyof VitalFormFields)[]) {
    if (key === 'date') {
      if (changedDate(document)) fresh.fields.date = { ...document.fields.date };
      else fresh.fields.date.customOpen = document.fields.date.customOpen;
      continue;
    }
    const changed = document.fields[key] !== document.initial[key];
    if (changed) Object.assign(fresh.fields, { [key]: document.fields[key] });
  }
  return fresh;
}
