import { z } from 'zod';

import { dateInputText, validateDateInput } from '@/lib/date-input';
import { fromIsoDate } from '@/lib/jalali';
import { formatClock, parseClock } from '@/lib/time';

import { defaultDueDate } from './logic';

const fieldsSchema = z
  .object({
    reason: z.string(),
    channel: z.enum(['call', 'sms', 'visit', 'message', 'lab', 'other']),
    priority: z.enum(['low', 'normal', 'high']),
    date: z.object({ dateText: z.string(), clockText: z.string(), customOpen: z.boolean() }).strict(),
  })
  .strict();
const documentSchema = z
  .object({
    version: z.literal(1),
    fields: fieldsSchema,
    initial: fieldsSchema,
  })
  .strict();
export type FollowUpFormFields = z.infer<typeof fieldsSchema>;
export type FollowUpFormDocument = z.infer<typeof documentSchema>;

export class FollowUpFormConflict extends Error {
  constructor(message = 'پیش‌نویس تغییر کرده است؛ نسخه‌ها را بررسی کنید.') {
    super(message);
    this.name = 'FollowUpFormConflict';
  }
}
export function initialFollowUpFields(now: Date): FollowUpFormFields {
  const due = defaultDueDate(now);
  return {
    reason: '',
    channel: 'call',
    priority: 'normal',
    date: { dateText: dateInputText(due), clockText: formatClock(due), customOpen: false },
  };
}
export function decodeFollowUpForm(body: string): FollowUpFormDocument {
  try {
    return documentSchema.parse(JSON.parse(body));
  } catch {
    throw new Error('پیش‌نویس پیگیری قابل خواندن نیست؛ اطلاعات ذخیره‌شده تغییر نکرد.');
  }
}
export function encodeFollowUpForm(document: FollowUpFormDocument): string {
  return JSON.stringify(decodeFollowUpForm(JSON.stringify(document)));
}

/** Validate the persisted raw text, not the UI's last parsed Date. */
export function followUpFormValues(fields: FollowUpFormFields, now: Date) {
  if (!fields.reason.trim()) throw new Error('دلیل پیگیری را بنویسید.');
  const date = validateDateInput(fields.date.dateText, { required: true, allowFuture: true, now });
  const day = date.valid ? fromIsoDate(date.iso) : null;
  const clock = parseClock(fields.date.clockText);
  if (!day) throw new Error('تاریخ پیگیری معتبر نیست؛ پیش‌نویس نگه داشته شد.');
  if (!clock) throw new Error('ساعت پیگیری معتبر نیست؛ پیش‌نویس نگه داشته شد.');
  return {
    reason: fields.reason.trim(),
    channel: fields.channel,
    priority: fields.priority,
    dueAt: new Date(day.getFullYear(), day.getMonth(), day.getDate(), clock[0], clock[1]),
  };
}

/** Presentation fallback only; publication always validates all raw fields above. */
export function followUpDisplayDate(document: FollowUpFormDocument, now: Date): Date {
  const text = validateDateInput(document.fields.date.dateText, { required: true, allowFuture: true, now });
  const initial = validateDateInput(document.initial.date.dateText, { required: true, allowFuture: true, now });
  const day = fromIsoDate(text.valid ? text.iso : initial.valid ? initial.iso : null) ?? defaultDueDate(now);
  const clock = parseClock(document.fields.date.clockText) ?? parseClock(document.initial.date.clockText) ?? [10, 0];
  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), clock[0], clock[1]);
}
