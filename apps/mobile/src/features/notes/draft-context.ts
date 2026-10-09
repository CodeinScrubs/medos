import { z } from 'zod';

import type { Note } from '@/db/schema';
import { dateInputText, validateDateInput, type DateTimeInput } from '@/lib/date-input';
import { fromIsoDate } from '@/lib/jalali';
import { formatClock, parseClock } from '@/lib/time';

const originSchema = z
  .object({
    version: z.literal(1),
    patientId: z.string().min(1),
    noteId: z.string().min(1).nullable(),
    encounterId: z.string().min(1).nullable(),
    basis: z.string().nullable(),
  })
  .strict();
const rawDateSchema = z.object({ dateText: z.string(), clockText: z.string(), customOpen: z.boolean() }).strict();
export type NoteDraftOrigin = z.infer<typeof originSchema>;

export class NoteDraftConflict extends Error {
  constructor() {
    super('مبنای نوت یا پیش‌نویس تغییر کرده است؛ نوشتهٔ شما باقی مانده. ابتدا نسخهٔ فعلی را بررسی کنید.');
    this.name = 'NoteDraftConflict';
  }
}

/** All fields, with sorted keys and exact timestamp milliseconds; hashes are not authority. */
export function noteBasis(note: Note): string {
  return JSON.stringify(
    Object.fromEntries(
      Object.entries(note)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([key, value]) => [key, value instanceof Date ? value.getTime() : value]),
    ),
  );
}

export function initialNoteOrigin(patientId: string, note: Note | null, encounterId: string | null): NoteDraftOrigin {
  if (note && (note.patientId !== patientId || note.deletedAt)) throw new NoteDraftConflict();
  return {
    version: 1,
    patientId,
    noteId: note?.id ?? null,
    encounterId: note ? note.encounterId : encounterId,
    basis: note ? noteBasis(note) : null,
  };
}

export function decodeNoteOrigin(text: string): NoteDraftOrigin {
  try {
    const origin = originSchema.parse(JSON.parse(text));
    if (origin.noteId) {
      if (!origin.basis) throw new NoteDraftConflict();
      const basis = JSON.parse(origin.basis) as Record<string, unknown>;
      if (
        basis.id !== origin.noteId ||
        basis.patientId !== origin.patientId ||
        basis.encounterId !== origin.encounterId ||
        basis.deletedAt !== null
      )
        throw new NoteDraftConflict();
    } else if (origin.basis !== null) throw new NoteDraftConflict();
    return origin;
  } catch {
    // Never expose serialized note contents in errors or logs.
    throw new NoteDraftConflict();
  }
}

export function encodeNoteOrigin(origin: NoteDraftOrigin): string {
  const text = JSON.stringify(origin);
  return JSON.stringify(decodeNoteOrigin(text));
}

export function matchesNoteOrigin(origin: NoteDraftOrigin | null, note: Note | null): boolean {
  return Boolean(
    origin &&
    (origin.noteId
      ? note &&
        origin.patientId === note.patientId &&
        origin.noteId === note.id &&
        origin.encounterId === note.encounterId &&
        origin.basis === noteBasis(note)
      : !note),
  );
}

/** Invalid visible text can be stored as a draft, but never as a clinical date. */
export function noteDateInput(raw: unknown, fallback: Date): DateTimeInput {
  if (raw == null) return { dateText: dateInputText(fallback), clockText: formatClock(fallback), customOpen: false };
  const parsed = rawDateSchema.safeParse(raw);
  if (parsed.success) return parsed.data;
  // A corrupt imported shape must stay visible and invalid, rather than crash
  // the date widget or silently become the previous parsed date.
  return { dateText: JSON.stringify(raw) ?? '—', clockText: '—', customOpen: true };
}

export function noteDraftDate(raw: DateTimeInput | null | undefined, fallback: Date, now: Date): Date {
  if (raw == null) {
    if (!Number.isFinite(fallback.getTime())) throw new Error('زمان نوت معتبر نیست.');
    return fallback;
  }
  const shape = rawDateSchema.safeParse(raw);
  if (!shape.success) throw new Error('تاریخ و ساعت پیش‌نویس معتبر نیست؛ نوشته باقی مانده است.');
  const day = validateDateInput(raw.dateText, { required: true, allowFuture: false, now });
  const clock = parseClock(raw.clockText);
  const parsed = day.valid && day.iso ? fromIsoDate(day.iso) : null;
  if (!parsed || !clock) throw new Error('تاریخ و ساعت نوت را کامل و درست وارد کنید؛ پیش‌نویس باقی مانده است.');
  if (
    fallback.getFullYear() === parsed.getFullYear() &&
    fallback.getMonth() === parsed.getMonth() &&
    fallback.getDate() === parsed.getDate() &&
    fallback.getHours() === clock[0] &&
    fallback.getMinutes() === clock[1]
  )
    return fallback;
  return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate(), clock[0], clock[1]);
}
