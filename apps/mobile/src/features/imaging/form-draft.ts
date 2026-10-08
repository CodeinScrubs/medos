import { z } from 'zod';

import type { ImagingStudy } from '@/db/schema';
import { dateInputText, validateDateInput } from '@/lib/date-input';
import { fromIsoDate } from '@/lib/jalali';
import { formatClock, parseClock } from '@/lib/time';

export const MODALITIES = ['xray', 'ct', 'mri', 'us', 'echo', 'endoscopy', 'nuclear', 'angio', 'other'] as const;
const fields = z
  .object({
    modality: z.enum(MODALITIES),
    region: z.string(),
    date: z.object({ dateText: z.string(), clockText: z.string(), customOpen: z.boolean() }).strict(),
    status: z.enum(['ordered', 'done', 'reported', 'reviewed']),
    storageLocation: z.string(),
    storagePlatform: z.string(),
    accessionNumber: z.string(),
    accessUrl: z.string(),
    accessNotes: z.string(),
    impression: z.string(),
    reportText: z.string(),
  })
  .strict();
const textValue = z.string().nullable();
const base = z
  .object({
    id: z.string(),
    patientId: z.string(),
    encounterId: textValue,
    modality: z.enum(MODALITIES),
    region: textValue,
    studyDate: z.number().finite().nullable(),
    status: z.enum(['ordered', 'done', 'reported', 'reviewed']),
    storageLocation: textValue,
    storagePlatform: textValue,
    accessionNumber: textValue,
    accessUrl: textValue,
    accessNotes: textValue,
    impression: textValue,
    reportText: textValue,
  })
  .strict();
const schema = z
  .object({
    version: z.literal(1),
    fields,
    initial: fields,
    base: base.nullable(),
    initialDate: z.number().finite(),
    encounterId: textValue,
  })
  .strict();
export type ImagingFormFields = z.infer<typeof fields>;
export type ImagingFormDocument = z.infer<typeof schema>;
export class ImagingFormConflict extends Error {
  constructor() {
    super('تصویربرداری یا پیش‌نویس در صفحهٔ دیگری تغییر کرده است؛ نوشته نگه داشته شد.');
    this.name = 'ImagingFormConflict';
  }
}
export function imagingBase(study: ImagingStudy): NonNullable<ImagingFormDocument['base']> {
  const {
    id,
    patientId,
    encounterId,
    modality,
    region,
    status,
    storageLocation,
    storagePlatform,
    accessionNumber,
    accessUrl,
    accessNotes,
    impression,
    reportText,
  } = study;
  return {
    id,
    patientId,
    encounterId,
    modality,
    region,
    status,
    storageLocation,
    storagePlatform,
    accessionNumber,
    accessUrl,
    accessNotes,
    impression,
    reportText,
    studyDate: study.studyDate?.getTime() ?? null,
  };
}
export function initialImagingForm(
  study: ImagingStudy | null,
  encounterId: string | null,
  now: Date,
): ImagingFormDocument {
  const date = study?.studyDate ?? now;
  const value: ImagingFormFields = {
    modality: study?.modality ?? 'ct',
    region: study?.region ?? '',
    date: { dateText: dateInputText(date), clockText: formatClock(date), customOpen: false },
    status: study?.status ?? 'done',
    storageLocation: study?.storageLocation ?? '',
    storagePlatform: study?.storagePlatform ?? '',
    accessionNumber: study?.accessionNumber ?? '',
    accessUrl: study?.accessUrl ?? '',
    accessNotes: study?.accessNotes ?? '',
    impression: study?.impression ?? '',
    reportText: study?.reportText ?? '',
  };
  return {
    version: 1,
    fields: value,
    initial: { ...value, date: { ...value.date } },
    initialDate: date.getTime(),
    base: study ? imagingBase(study) : null,
    encounterId: study ? study.encounterId : encounterId,
  };
}
export function decodeImagingForm(body: string): ImagingFormDocument {
  try {
    return schema.parse(JSON.parse(body));
  } catch {
    throw new Error('پیش‌نویس تصویربرداری قابل خواندن نیست؛ داده تغییر نکرد.');
  }
}
export const encodeImagingForm = (document: ImagingFormDocument) => JSON.stringify(schema.parse(document));
export function imagingFormValues(document: ImagingFormDocument, now: Date) {
  const d = schema.parse(document);
  const f = d.fields;
  const day = validateDateInput(f.date.dateText, { required: true, allowFuture: false, now });
  const clock = parseClock(f.date.clockText);
  if (!day.valid || !day.iso || !clock) throw new Error('تاریخ تصویربرداری معتبر نیست؛ پیش‌نویس نگه داشته شد.');
  const changedDate = f.date.dateText !== d.initial.date.dateText || f.date.clockText !== d.initial.date.clockText;
  const parsed = fromIsoDate(day.iso)!;
  parsed.setHours(clock[0], clock[1]);
  const date = changedDate
    ? parsed
    : d.base
      ? d.base.studyDate === null
        ? null
        : new Date(d.base.studyDate)
      : new Date(d.initialDate);
  return {
    modality: f.modality,
    region: f.region.trim() || null,
    studyDate: date,
    status: f.status,
    storageLocation: f.storageLocation.trim() || null,
    storagePlatform: f.storagePlatform.trim() || null,
    accessionNumber: f.accessionNumber.trim() || null,
    accessUrl: f.accessUrl.trim() || null,
    accessNotes: f.accessNotes.trim() || null,
    impression: f.impression.trim() || null,
    reportText: f.reportText.trim() || null,
  };
}
/** Three-way field comparison: unchanged raw text never rewrites exact stored whitespace. */
export function imagingFormPatch(document: ImagingFormDocument, current: ImagingStudy, now: Date) {
  if (
    !document.base ||
    document.base.id !== current.id ||
    document.base.patientId !== current.patientId ||
    document.base.encounterId !== current.encounterId
  )
    throw new ImagingFormConflict();
  const live = imagingBase(current);
  const values = imagingFormValues(document, now);
  const patch: Partial<typeof values> = {};
  for (const key of Object.keys(values) as (keyof typeof values)[]) {
    const changed =
      key === 'studyDate'
        ? document.fields.date.dateText !== document.initial.date.dateText ||
          document.fields.date.clockText !== document.initial.date.clockText
        : document.fields[key] !== document.initial[key];
    if (!changed) continue;
    const value = key === 'studyDate' ? (values.studyDate?.getTime() ?? null) : values[key];
    if (live[key] !== document.base[key] && live[key] !== value) throw new ImagingFormConflict();
    Object.assign(patch, { [key]: values[key] });
  }
  return patch;
}
