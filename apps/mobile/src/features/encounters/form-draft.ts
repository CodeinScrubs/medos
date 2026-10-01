import { z } from 'zod';

import type { Encounter } from '@/db/schema';
import { dateInputText, validateDateInput } from '@/lib/date-input';
import { fromIsoDate } from '@/lib/jalali';
import { formatClock, parseClock } from '@/lib/time';

import { withAssumedHour } from './logic';

const kind = z.enum(['admission', 'outpatient', 'emergency', 'consult_only']);
const dischargeType = z.enum(['recovered', 'improved', 'referred', 'ama', 'death', 'other']);
const nullableText = z.string().nullable();
const date = z.object({ dateText: z.string(), clockText: z.string(), customOpen: z.boolean() }).strict();
const snapshot = z
  .object({
    id: z.string(),
    patientId: z.string(),
    kind,
    placeId: nullableText,
    ward: nullableText,
    bed: nullableText,
    service: nullableText,
    attendingId: nullableText,
    chiefComplaint: nullableText,
    admittedAt: z.number().finite().nullable(),
    admittedAtHasTime: z.boolean(),
    isActive: z.boolean(),
    dischargedAt: z.number().finite().nullable(),
    dischargeType: dischargeType.nullable(),
    outcomeNotes: nullableText,
  })
  .strict();
const basis = z.object({ target: snapshot.nullable(), active: z.array(snapshot) }).strict();
const encounterFields = z
  .object({
    kind,
    placeId: nullableText,
    ward: z.string(),
    bed: z.string(),
    service: z.string(),
    attendingId: nullableText,
    chiefComplaint: z.string(),
    date,
    hourKnown: z.boolean(),
  })
  .strict();
const dischargeFields = z
  .object({
    dischargeType,
    nextStatus: z.enum(['discharged', 'followup', 'outpatient']),
    date,
    outcomeNotes: z.string(),
  })
  .strict();
const documentSchema = z.discriminatedUnion('mode', [
  z
    .object({ version: z.literal(1), mode: z.literal('new'), basis, initial: encounterFields, fields: encounterFields })
    .strict(),
  z
    .object({
      version: z.literal(1),
      mode: z.literal('edit'),
      basis,
      initial: encounterFields,
      fields: encounterFields,
    })
    .strict(),
  z
    .object({
      version: z.literal(1),
      mode: z.literal('discharge'),
      basis,
      initial: dischargeFields,
      fields: dischargeFields,
    })
    .strict(),
]);
export type EncounterFormDocument = z.infer<typeof documentSchema>;
export type EncounterFormFields = z.infer<typeof encounterFields>;
export type DischargeFormFields = z.infer<typeof dischargeFields>;
export type EncounterFormMode = EncounterFormDocument['mode'];
export type EncounterFormBasis = z.infer<typeof basis>;

export class EncounterFormConflict extends Error {
  constructor(message = 'پیش‌نویس یا نوبت بیمار تغییر کرده است؛ نسخه‌ها را بررسی کنید.') {
    super(message);
    this.name = 'EncounterFormConflict';
  }
}
export function encounterFormScope(mode: EncounterFormMode, patientId: string, encounterId: string | null): string {
  if ((mode === 'new') !== (encounterId === null)) throw new EncounterFormConflict();
  return mode === 'new' ? `new:${patientId}` : `${mode}:${encounterId}`;
}
export function encounterSnapshot(row: Encounter): NonNullable<EncounterFormBasis['target']> {
  return {
    id: row.id,
    patientId: row.patientId,
    kind: row.kind,
    placeId: row.placeId,
    ward: row.ward,
    bed: row.bed,
    service: row.service,
    attendingId: row.attendingId,
    chiefComplaint: row.chiefComplaint,
    admittedAt: row.admittedAt?.getTime() ?? null,
    admittedAtHasTime: row.admittedAtHasTime,
    isActive: row.isActive,
    dischargedAt: row.dischargedAt?.getTime() ?? null,
    dischargeType: row.dischargeType,
    outcomeNotes: row.outcomeNotes,
  };
}
function rawDate(value: Date, now: Date) {
  return {
    dateText: dateInputText(value),
    clockText: formatClock(value),
    customOpen: dateInputText(value) !== dateInputText(now),
  };
}
export function initialEncounterDocument(
  mode: EncounterFormMode,
  base: EncounterFormBasis,
  now: Date,
): EncounterFormDocument {
  if (mode === 'discharge') {
    const initial: DischargeFormFields = {
      dischargeType: 'improved',
      nextStatus: 'discharged',
      date: rawDate(now, now),
      outcomeNotes: '',
    };
    return { version: 1, mode, basis: base, initial, fields: { ...initial, date: { ...initial.date } } };
  }
  const row = base.target;
  const initial: EncounterFormFields = {
    kind: row?.kind ?? 'admission',
    placeId: row?.placeId ?? null,
    ward: row?.ward ?? '',
    bed: row?.bed ?? '',
    service: row?.service ?? '',
    attendingId: row?.attendingId ?? null,
    chiefComplaint: row?.chiefComplaint ?? '',
    date: rawDate(row?.admittedAt != null ? new Date(row.admittedAt) : now, now),
    hourKnown: row?.admittedAtHasTime ?? true,
  };
  return { version: 1, mode, basis: base, initial, fields: { ...initial, date: { ...initial.date } } };
}
export function decodeEncounterForm(body: string): EncounterFormDocument {
  try {
    return documentSchema.parse(JSON.parse(body));
  } catch {
    throw new Error('پیش‌نویس نوبت قابل خواندن نیست؛ اطلاعات ذخیره‌شده تغییر نکرد.');
  }
}
export function encodeEncounterForm(document: EncounterFormDocument): string {
  return JSON.stringify(decodeEncounterForm(JSON.stringify(document)));
}
/** Raw input, including incomplete text, is the authority at publication. */
export function encounterFormDate(document: EncounterFormDocument, now: Date): Date {
  const parsed = validateDateInput(document.fields.date.dateText, { required: true, allowFuture: false, now });
  const day = parsed.valid ? fromIsoDate(parsed.iso) : null;
  if (!day) throw new Error('تاریخ معتبر نیست؛ پیش‌نویس نگه داشته شد.');
  if (document.mode !== 'discharge' && !document.fields.hourKnown) return withAssumedHour(day);
  const clock = parseClock(document.fields.date.clockText);
  if (!clock) throw new Error('ساعت معتبر نیست؛ پیش‌نویس نگه داشته شد.');
  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), clock[0], clock[1]);
}
/** Only for rendering presets; it never authorizes publication. */
export function encounterFormDisplayDate(document: EncounterFormDocument, now: Date): Date {
  try {
    return encounterFormDate(document, now);
  } catch {
    const day = validateDateInput(document.initial.date.dateText, { required: true, allowFuture: false, now });
    const value = day.valid ? fromIsoDate(day.iso) : null;
    const clock = parseClock(document.initial.date.clockText) ?? [12, 1];
    return value ? new Date(value.getFullYear(), value.getMonth(), value.getDate(), clock[0], clock[1]) : now;
  }
}
