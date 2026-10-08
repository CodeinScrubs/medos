import { z } from 'zod';

import type { LabPanel, LabValue } from '@/db/schema';
import { dateInputText, validateDateInput } from '@/lib/date-input';
import { newId } from '@/lib/ids';
import { fromIsoDate } from '@/lib/jalali';
import { formatClock, parseClock } from '@/lib/time';

import { isUnreadableNumber } from './logic';
import { analyteDef } from './presets';

const rowSchema = z
  .object({
    key: z.string().min(1),
    analyte: z.string(),
    value: z.string(),
    unit: z.string().nullable(),
    refLow: z.number().nullable(),
    refHigh: z.number().nullable(),
    notes: z.string().nullable(),
    qualitative: z.boolean(),
    custom: z.boolean(),
  })
  .strict();
const fieldsSchema = z
  .object({
    date: z.object({ dateText: z.string(), clockText: z.string(), customOpen: z.boolean() }).strict(),
    rows: z.array(rowSchema),
    presetKeys: z.array(z.string()),
    name: z.string(),
    nameTouched: z.boolean(),
    labName: z.string(),
    notes: z.string(),
    rangeEditor: z
      .object({ id: z.string().min(1), rowKey: z.string(), text: z.string() })
      .strict()
      .nullable(),
  })
  .strict()
  .refine(
    (f) =>
      new Set(f.rows.map((r) => r.key)).size === f.rows.length &&
      (!f.rangeEditor || f.rows.some((r) => r.key === f.rangeEditor?.rowKey)),
  );
const baseSchema = z
  .object({
    id: z.string(),
    patientId: z.string(),
    encounterId: z.string().nullable(),
    collectedAt: z.number(),
    name: z.string().nullable(),
    labName: z.string().nullable(),
    notes: z.string().nullable(),
    source: z.enum(['manual', 'excel', 'photo', 'draft']),
    values: z.array(
      z
        .object({
          id: z.string(),
          analyte: z.string(),
          value: z.string().nullable(),
          unit: z.string().nullable(),
          refLow: z.number().nullable(),
          refHigh: z.number().nullable(),
          notes: z.string().nullable(),
          sortOrder: z.number().int(),
        })
        .strict(),
    ),
  })
  .strict();
const schema = z
  .object({
    version: z.literal(1),
    fields: fieldsSchema,
    initial: fieldsSchema,
    encounterId: z.string().nullable(),
    base: baseSchema.nullable(),
  })
  .strict();
export type LabEntryRow = z.infer<typeof rowSchema>;
export type LabFormFields = z.infer<typeof fieldsSchema>;
export type LabFormDocument = z.infer<typeof schema>;

export class LabFormConflict extends Error {
  constructor() {
    super('پیش‌نویس یا آزمایش در صفحهٔ دیگری تغییر کرده است؛ نوشتهٔ این صفحه نگه داشته شد.');
    this.name = 'LabFormConflict';
  }
}
export function labFormBase(panel: LabPanel, values: LabValue[]): NonNullable<LabFormDocument['base']> {
  return {
    id: panel.id,
    patientId: panel.patientId,
    encounterId: panel.encounterId,
    collectedAt: panel.collectedAt.getTime(),
    name: panel.name,
    labName: panel.labName,
    notes: panel.notes,
    source: panel.source,
    // Derived flags/numeric copies are deliberately excluded: reflag may repair them.
    values: [...values]
      .sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id))
      .map((v) => ({
        id: v.id,
        analyte: v.analyte,
        value: v.value,
        unit: v.unit,
        refLow: v.refLow,
        refHigh: v.refHigh,
        notes: v.notes,
        sortOrder: v.sortOrder,
      })),
  };
}
export function initialLabForm(
  panel: LabPanel | null,
  values: LabValue[],
  encounterId: string | null,
  now: Date,
): LabFormDocument {
  const date = panel?.collectedAt ?? now;
  const fields: LabFormFields = {
    date: { dateText: dateInputText(date), clockText: formatClock(date), customOpen: false },
    rows: values.map((v) => ({
      key: newId(),
      analyte: v.analyte,
      value: v.value ?? '',
      unit: v.unit,
      refLow: v.refLow,
      refHigh: v.refHigh,
      notes: v.notes,
      qualitative: Boolean(analyteDef(v.analyte)?.qualitative),
      custom: !analyteDef(v.analyte),
    })),
    presetKeys: [],
    name: panel?.name ?? '',
    nameTouched: Boolean(panel?.name),
    labName: panel?.labName ?? '',
    notes: panel?.notes ?? '',
    rangeEditor: null,
  };
  return {
    version: 1,
    fields,
    initial: fieldsSchema.parse(fields),
    base: panel ? labFormBase(panel, values) : null,
    encounterId: panel ? panel.encounterId : encounterId,
  };
}
export function decodeLabForm(body: string): LabFormDocument {
  try {
    return schema.parse(JSON.parse(body));
  } catch {
    throw new Error('پیش‌نویس آزمایش قابل خواندن نیست؛ اطلاعات ذخیره‌شده تغییر نکرد.');
  }
}
export function encodeLabForm(document: LabFormDocument): string {
  // Do not expose a Zod error containing the original clinical input.
  return JSON.stringify(decodeLabForm(JSON.stringify(document)));
}
/** Publication validates the persisted raw fields, never an earlier valid Date. */
export function labFormValues(document: LabFormDocument, now: Date, hasPhoto: boolean) {
  const f = decodeLabForm(encodeLabForm(document)).fields;
  const dayText = validateDateInput(f.date.dateText, { required: true, allowFuture: false, now });
  const day = fromIsoDate(dayText.valid ? dayText.iso : null);
  const clock = parseClock(f.date.clockText);
  if (!day || !clock) throw new Error('تاریخ و ساعت نمونه‌گیری معتبر نیست؛ پیش‌نویس نگه داشته شد.');
  if (f.rangeEditor) throw new Error('محدودهٔ باز را ثبت یا لغو کنید؛ پیش‌نویس نگه داشته شد.');
  if (!hasPhoto && !f.rows.some((r) => r.analyte.trim() && r.value.trim())) throw new Error('هیچ مقداری وارد نشده.');
  if (f.rows.some((r) => r.value.trim() && !r.analyte.trim())) throw new Error('نام آزمایشِ مقدار واردشده را بنویسید.');
  if (
    f.rows.some(
      (r) => !analyteDef(r.analyte)?.qualitative && isUnreadableNumber(r.value, Boolean(analyteDef(r.analyte))),
    )
  )
    throw new Error('مقدار عددی خوانا نیست؛ اعشار را با نقطه بنویسید، مثلاً 5.8.');
  if (f.rows.some((r) => r.refLow != null && r.refHigh != null && r.refLow > r.refHigh))
    throw new Error('محدودهٔ مرجع معتبر نیست.');
  let collectedAt = new Date(day.getFullYear(), day.getMonth(), day.getDate(), clock[0], clock[1]);
  if (document.base) {
    const base = new Date(document.base.collectedAt);
    if (
      base.getFullYear() === day.getFullYear() &&
      base.getMonth() === day.getMonth() &&
      base.getDate() === day.getDate() &&
      base.getHours() === clock[0] &&
      base.getMinutes() === clock[1]
    )
      collectedAt = base;
  }
  return {
    collectedAt,
    name: f.name.trim() || null,
    labName: f.labName.trim() || null,
    notes: f.notes.trim() || null,
    source: document.base?.source ?? ('manual' as const),
    values: f.rows.map(({ analyte, value, unit, refLow, refHigh, notes }) => ({
      analyte,
      value,
      unit,
      refLow,
      refHigh,
      notes,
    })),
  };
}
/** Fallback is for rendering only; publication above always rejects invalid text. */
export function labDisplayDate(document: LabFormDocument, now: Date): Date {
  const date = (text: string) => {
    const result = validateDateInput(text, { required: true, allowFuture: false, now });
    return fromIsoDate(result.valid ? result.iso : null);
  };
  const day = date(document.fields.date.dateText) ?? date(document.initial.date.dateText) ?? now;
  const clock = parseClock(document.fields.date.clockText) ?? parseClock(document.initial.date.clockText) ?? [12, 1];
  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), clock[0], clock[1]);
}
