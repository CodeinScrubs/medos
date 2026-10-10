import { z } from 'zod';

import type { Order } from '@/db/schema';
import { dateInputText, validateDateInput } from '@/lib/date-input';
import { formCodec, UnsupportedFormDraft } from '@/lib/form-document';
import { fromIsoDate, toJalali } from '@/lib/jalali';
import { formatClock, sameDay, withClock } from '@/lib/time';

import type { OrderCreationContext } from './queries';

const contextSchema = z.tuple([z.string().min(1), z.string().nullable()]);

/** Null, an imported empty episode and a literal "new" key are distinct contexts. */
export function orderFormParent(context: OrderCreationContext): string {
  const parsed = contextSchema.safeParse([context.patientId, context.encounterId]);
  if (!parsed.success) throw new UnsupportedFormDraft();
  return JSON.stringify(parsed.data);
}
export function orderFormContext(parentId: string | null): OrderCreationContext {
  try {
    const value = contextSchema.parse(JSON.parse(parentId ?? ''));
    if (JSON.stringify(value) !== parentId) throw new UnsupportedFormDraft();
    return { patientId: value[0], encounterId: value[1] };
  } catch {
    throw new UnsupportedFormDraft();
  }
}

const fieldsSchema = z
  .object({
    kind: z.enum(['drug', 'fluid', 'diet', 'nursing', 'lab', 'imaging', 'consult', 'other']),
    name: z.string(),
    dose: z.string(),
    route: z.string().nullable(),
    frequency: z.string().nullable(),
    rate: z.string(),
    isPrn: z.boolean(),
    prnCondition: z.string(),
    indication: z.string(),
    notes: z.string(),
    hasStart: z.boolean(),
    dateValue: z
      .number()
      .finite()
      .refine((value) => {
        try {
          toJalali(new Date(value));
          return true;
        } catch {
          return false;
        }
      }),
    date: z.object({ dateText: z.string(), clockText: z.string(), customOpen: z.boolean() }).strict(),
  })
  .strict();
export type OrderFormFields = z.infer<typeof fieldsSchema>;
export const orderFormCodec = formCodec('order', fieldsSchema);

export function initialOrderFields(row: Order | null, now: Date): OrderFormFields {
  const date = row?.startAt ?? now;
  return {
    kind: row?.kind ?? 'drug',
    name: row?.name ?? '',
    dose: row?.dose ?? '',
    route: row?.route ?? null,
    frequency: row?.frequency ?? null,
    rate: row?.rate ?? '',
    isPrn: row?.isPrn ?? false,
    prnCondition: row?.prnCondition ?? '',
    indication: row?.indication ?? '',
    notes: row?.notes ?? '',
    hasStart: row === null || row.startAt !== null,
    dateValue: date.getTime(),
    date: { dateText: dateInputText(date), clockText: formatClock(date), customOpen: false },
  };
}
export function orderFormStart(fields: OrderFormFields, now: Date): Date | null {
  if (!fields.hasStart) return null;
  const parsed = validateDateInput(fields.date.dateText, { required: true, allowFuture: false, now });
  if (!parsed.valid || !parsed.iso) throw new Error('تاریخ شروع را کامل و معتبر وارد کنید.');
  const day = fromIsoDate(parsed.iso);
  if (!day) throw new Error('تاریخ شروع معتبر نیست.');
  const previous = new Date(fields.dateValue);
  // The existing editor changes the date, not the clock or timestamp precision.
  return sameDay(day, previous) ? previous : withClock(day, previous);
}
export function orderFormInput(fields: OrderFormFields, now: Date) {
  if (!fields.name.trim()) throw new Error('نام دستور لازم است.');
  const medication = fields.kind === 'drug' || fields.kind === 'fluid';
  return {
    kind: fields.kind,
    name: fields.name.trim(),
    dose: medication ? fields.dose.trim() || null : null,
    route: medication ? fields.route : null,
    frequency: fields.kind === 'drug' ? fields.frequency : null,
    rate: fields.kind === 'fluid' ? fields.rate.trim() || null : null,
    isPrn: fields.kind === 'drug' ? fields.isPrn : false,
    prnCondition: fields.kind === 'drug' && fields.isPrn ? fields.prnCondition.trim() || null : null,
    startAt: orderFormStart(fields, now),
    indication: fields.indication.trim() || null,
    notes: fields.notes.trim() || null,
  };
}
