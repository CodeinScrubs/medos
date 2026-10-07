import { z } from 'zod';

import type { Occasion } from '@/db/schema';
import { dateInputText, validateDateInput } from '@/lib/date-input';
import { fromIsoDate, toJalali } from '@/lib/jalali';
import { parseDecimal } from '@/lib/persian';

import { OCCASION_KIND_LABELS } from './labels';
import { occasionEditorDate } from './logic';

const kind = z.enum(['birthday', 'anniversary', 'graduation', 'holiday', 'religious', 'custom']);
const fields = z
  .object({
    kind,
    title: z.string(),
    dateText: z.string(),
    isRecurring: z.boolean(),
    isEnabled: z.boolean(),
    leadText: z.string(),
    messageTemplate: z.string(),
  })
  .strict();
const base = z
  .object({
    kind,
    title: z.string(),
    jalaliMonth: z.number().nullable(),
    jalaliDay: z.number().nullable(),
    onDate: z.string().nullable(),
    isRecurring: z.boolean(),
    isEnabled: z.boolean(),
    remindDaysBefore: z.number(),
    messageTemplate: z.string().nullable(),
  })
  .strict();
const schema = z.object({ version: z.literal(1), fields, initial: fields, base: base.nullable() }).strict();
export type OccasionFormFields = z.infer<typeof fields>;
export type OccasionFormDocument = z.infer<typeof schema>;

export class OccasionFormConflict extends Error {
  constructor() {
    super('پیش‌نویس یا مناسبت در صفحهٔ دیگری تغییر کرده است؛ نوشتهٔ این صفحه نگه داشته شد.');
    this.name = 'OccasionFormConflict';
  }
}
export function occasionFormBase(occasion: Occasion): NonNullable<OccasionFormDocument['base']> {
  const { kind, title, jalaliMonth, jalaliDay, onDate, isRecurring, isEnabled, remindDaysBefore, messageTemplate } =
    occasion;
  return { kind, title, jalaliMonth, jalaliDay, onDate, isRecurring, isEnabled, remindDaysBefore, messageTemplate };
}
export function initialOccasionForm(
  occasion: Occasion | null,
  birthDate: string | null,
  now: Date,
): OccasionFormDocument {
  const day = fromIsoDate(occasion ? occasionEditorDate(occasion, now) : birthDate);
  const input: OccasionFormFields = {
    kind: occasion?.kind ?? 'birthday',
    title: occasion?.title ?? '',
    dateText: day ? dateInputText(day) : '',
    isRecurring: occasion?.isRecurring ?? true,
    isEnabled: occasion?.isEnabled ?? true,
    leadText: String(occasion?.remindDaysBefore ?? 1),
    messageTemplate: occasion?.messageTemplate ?? '',
  };
  return { version: 1, fields: { ...input }, initial: input, base: occasion ? occasionFormBase(occasion) : null };
}
export function decodeOccasionForm(body: string): OccasionFormDocument {
  try {
    return schema.parse(JSON.parse(body));
  } catch {
    throw new Error('پیش‌نویس مناسبت قابل خواندن نیست؛ اطلاعات ذخیره‌شده تغییر نکرد.');
  }
}
export function encodeOccasionForm(document: OccasionFormDocument): string {
  return JSON.stringify(schema.parse(document));
}

/** No previously parsed day may stand in for the currently visible raw date. */
export function occasionFormValues(document: OccasionFormDocument, now: Date) {
  const f = schema.parse(document).fields;
  const date = validateDateInput(f.dateText, { required: true, allowFuture: true, now });
  if (!date.valid || !date.iso) throw new Error('تاریخ مناسبت معتبر نیست؛ پیش‌نویس نگه داشته شد.');
  const day = fromIsoDate(date.iso);
  if (!day) throw new Error('تاریخ مناسبت معتبر نیست؛ پیش‌نویس نگه داشته شد.');
  const lead = parseDecimal(f.leadText);
  if (lead == null || !Number.isInteger(lead) || lead < 0 || lead > 365) throw new Error('فاصلهٔ یادآوری معتبر نیست.');
  const { jm, jd } = toJalali(day);
  return {
    kind: f.kind,
    title: f.title.trim() || OCCASION_KIND_LABELS[f.kind],
    jalaliMonth: f.isRecurring ? jm : null,
    jalaliDay: f.isRecurring ? jd : null,
    onDate: f.isRecurring ? null : date.iso,
    isRecurring: f.isRecurring,
    isEnabled: f.isEnabled,
    remindDaysBefore: lead,
    messageTemplate: f.messageTemplate.trim() || null,
  };
}
