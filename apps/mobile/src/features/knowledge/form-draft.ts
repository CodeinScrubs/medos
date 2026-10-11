import { z } from 'zod';

import type { Idea, PrescriptionItem, PrescriptionTemplate, SpecialtyProfile, Topic } from '@/db/schema';
import { dateInputText, validateDateInput } from '@/lib/date-input';
import { formCodec } from '@/lib/form-document';
import { newId } from '@/lib/ids';
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

const specialtyProfileFields = z
  .object({
    specialtyId: z.string().nullable(),
    nameText: z.string(),
    overview: z.string(),
    dailyWork: z.string(),
    residencyYears: z.string(),
    entranceDifficulty: z.string(),
    lifestyle: z.string(),
    incomeNotes: z.string(),
    jobMarket: z.string(),
    subspecialtyPaths: z.string(),
    prosText: z.string(),
    consText: z.string(),
    // An imported invalid rating remains raw/editable until explicitly corrected.
    personalFit: z.number().finite().nullable(),
    myThoughts: z.string(),
    sourcesText: z.string(),
    tags: z.string(),
  })
  .strict();
export type SpecialtyProfileFormFields = z.infer<typeof specialtyProfileFields>;
export const specialtyProfileFormCodec = formCodec('specialty-profile', specialtyProfileFields);
export function initialSpecialtyProfileFields(row: SpecialtyProfile | null): SpecialtyProfileFormFields {
  return {
    specialtyId: row?.specialtyId ?? null,
    nameText: row?.nameText ?? '',
    overview: row?.overview ?? '',
    dailyWork: row?.dailyWork ?? '',
    residencyYears: row?.residencyYears ?? '',
    entranceDifficulty: row?.entranceDifficulty ?? '',
    lifestyle: row?.lifestyle ?? '',
    incomeNotes: row?.incomeNotes ?? '',
    jobMarket: row?.jobMarket ?? '',
    subspecialtyPaths: row?.subspecialtyPaths ?? '',
    prosText: row?.prosText ?? '',
    consText: row?.consText ?? '',
    personalFit: row?.personalFit ?? null,
    myThoughts: row?.myThoughts ?? '',
    sourcesText: row?.sourcesText ?? '',
    tags: (row?.tags ?? []).join('، '),
  };
}
const tagList = (text: string) =>
  text
    .split(/[,،]/)
    .map((value) => value.trim())
    .filter(Boolean);
export function specialtyProfileFormInput(fields: SpecialtyProfileFormFields) {
  if (fields.specialtyId === null && !fields.nameText.trim())
    throw new Error('رشته را انتخاب کنید یا نامش را بنویسید.');
  if (
    fields.personalFit !== null &&
    (!Number.isInteger(fields.personalFit) || fields.personalFit < 1 || fields.personalFit > 5)
  )
    throw new Error('امتیاز تناسب را از ۱ تا ۵ انتخاب کنید یا آن را پاک کنید.');
  const { tags, specialtyId, personalFit, ...text } = fields;
  return {
    ...Object.fromEntries(Object.entries(text).map(([key, value]) => [key, value.trim() || null])),
    specialtyId,
    personalFit,
    tags: tagList(tags),
  };
}

const prescriptionLineFields = z
  .object({
    key: z.string().min(1),
    drug: z.string(),
    form: z.string(),
    dose: z.string(),
    route: z.string(),
    frequency: z.string(),
    duration: z.string(),
    quantity: z.string(),
    sig: z.string(),
    notes: z.string(),
  })
  .strict();
export type PrescriptionFormLine = z.infer<typeof prescriptionLineFields>;
const prescriptionFields = z
  .object({
    title: z.string(),
    condition: z.string(),
    specialtyId: z.string().nullable(),
    ageGroup: z.enum(['adult', 'pediatric', 'geriatric', 'any']),
    items: z
      .array(prescriptionLineFields)
      .refine((items) => new Set(items.map((item) => item.key)).size === items.length),
    adviceText: z.string(),
    cautionsText: z.string(),
    followUpText: z.string(),
    tags: z.string(),
    starred: z.boolean(),
  })
  .strict();
export type PrescriptionFormFields = z.infer<typeof prescriptionFields>;
export const prescriptionFormCodec = formCodec('prescription', prescriptionFields);
/** Keys belong to raw editor lines, never to the published prescription format. */
export function prescriptionFormLine(item?: PrescriptionItem, key = newId()): PrescriptionFormLine {
  return {
    key,
    drug: item?.drug ?? '',
    form: item?.form ?? '',
    dose: item?.dose ?? '',
    route: item?.route ?? '',
    frequency: item?.frequency ?? '',
    duration: item?.duration ?? '',
    quantity: item?.quantity ?? '',
    sig: item?.sig ?? '',
    notes: item?.notes ?? '',
  };
}
export function initialPrescriptionFields(row: PrescriptionTemplate | null): PrescriptionFormFields {
  const items = Array.isArray(row?.items) ? row.items : [];
  return {
    title: row?.title ?? '',
    condition: row?.condition ?? '',
    specialtyId: row?.specialtyId ?? null,
    ageGroup: row?.ageGroup ?? 'any',
    items: items.length
      ? items.map((item, index) => prescriptionFormLine(item, `stored-${index}`))
      : [prescriptionFormLine()],
    adviceText: row?.adviceText ?? '',
    cautionsText: row?.cautionsText ?? '',
    followUpText: row?.followUpText ?? '',
    tags: (row?.tags ?? []).join('، '),
    starred: row?.starred ?? false,
  };
}
/** A partially entered line must be completed or explicitly removed, never silently discarded. */
export function prescriptionFormInput(fields: PrescriptionFormFields) {
  if (!fields.title.trim()) throw new Error('عنوان لازم است.');
  if (!fields.items.some((item) => item.drug.trim())) throw new Error('حداقل یک دارو بنویسید.');
  const items = fields.items.map(({ key: _key, ...item }) => item);
  if (items.some((item) => !item.drug.trim() && Object.values(item).some((value) => value.trim())))
    throw new Error('نام داروی قلم ناقص را بنویسید یا آن قلم را حذف کنید.');
  return { ...fields, items, tags: tagList(fields.tags) };
}
