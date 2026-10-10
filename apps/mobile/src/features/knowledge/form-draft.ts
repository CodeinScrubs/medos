import { z } from 'zod';

import type { Idea, Topic } from '@/db/schema';
import { dateInputText, validateDateInput } from '@/lib/date-input';
import { formCodec } from '@/lib/form-document';
import { fromIsoDate, toJalali } from '@/lib/jalali';
import { formatClock, sameDay, withClock } from '@/lib/time';

const ideaFields = z
  .object({
    title: z.string(),
    body: z.string(),
    area: z.string(),
    tags: z.array(z.string()),
    kind: z.enum(['feature', 'bug', 'workflow', 'research', 'personal', 'other']),
    status: z.enum(['inbox', 'planned', 'doing', 'done', 'dropped']),
    priority: z.enum(['low', 'normal', 'high']),
  })
  .strict();
export type IdeaFormFields = z.infer<typeof ideaFields>;
export const ideaFormCodec = formCodec('idea', ideaFields);
export function initialIdeaFields(row: Idea | null): IdeaFormFields {
  return {
    title: row?.title ?? '',
    body: row?.body ?? '',
    area: row?.area ?? '',
    tags: row?.tags ?? [],
    kind: row?.kind ?? 'feature',
    status: row?.status ?? 'inbox',
    priority: row?.priority ?? 'normal',
  };
}
const topicFields = z
  .object({
    title: z.string(),
    summary: z.string(),
    body: z.string(),
    professorNotes: z.string(),
    pearls: z.string(),
    source: z.string(),
    context: z.string(),
    tags: z.string(),
    specialtyId: z.string().min(1).nullable(),
    taughtById: z.string().min(1).nullable(),
    starred: z.boolean(),
    needsReview: z.boolean(),
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
export type TopicFormFields = z.infer<typeof topicFields>;
export const topicFormCodec = formCodec('topic', topicFields);
export function initialTopicFields(row: Topic | null, now: Date): TopicFormFields {
  const date = row?.taughtAt ?? now;
  return {
    title: row?.title ?? '',
    summary: row?.summary ?? '',
    body: row?.body ?? '',
    professorNotes: row?.professorNotes ?? '',
    pearls: row?.pearls ?? '',
    source: row?.source ?? '',
    context: row?.context ?? '',
    tags: (row?.tags ?? []).join('، '),
    specialtyId: row?.specialtyId ?? null,
    taughtById: row?.taughtById ?? null,
    starred: row?.starred ?? false,
    needsReview: row?.needsReview ?? false,
    dateValue: date.getTime(),
    date: { dateText: dateInputText(date), clockText: formatClock(date), customOpen: false },
  };
}
/** Invalid visible text never publishes the last valid parsed date. */
export function topicFormDate(fields: TopicFormFields, now: Date): Date {
  const parsed = validateDateInput(fields.date.dateText, { required: true, allowFuture: false, now });
  if (!parsed.valid || !parsed.iso) throw new Error('تاریخ را کامل و معتبر وارد کنید.');
  const previous = new Date(fields.dateValue);
  // Merely opening/editing text must not round a stored timestamp to a minute.
  const day = fromIsoDate(parsed.iso);
  if (!day) throw new Error('تاریخ معتبر نیست.');
  if (sameDay(day, previous)) return previous;
  return withClock(day, previous);
}
export function topicFormInput(fields: TopicFormFields, now: Date) {
  const { date: _date, dateValue: _dateValue, tags, ...text } = fields;
  return {
    ...text,
    taughtAt: topicFormDate(fields, now),
    tags: tags
      .split(/[,،]/)
      .map((s) => s.trim())
      .filter(Boolean),
  };
}
