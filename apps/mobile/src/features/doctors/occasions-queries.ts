import { and, eq, isNull, sql } from 'drizzle-orm';

import { audit } from '@/db/audit';
import { db } from '@/db/client';
import { doctors, occasions, type Occasion } from '@/db/schema';
import { newId, softDelete, stamps, touch } from '@/lib/ids';
import { fromIsoDate, isValidJalali } from '@/lib/jalali';

import { OCCASION_KIND_LABELS } from './labels';
import { reconcileOccasionReminder } from './occasion-reminder-queries';

/*
 * Birthdays and other dates worth a message.
 *
 * The reminder is the point of the feature: MedOS raises a notification a few
 * days ahead, prefills the text, and the user sends it from their own
 * messenger. Nothing is ever sent by the app itself.
 */

const alive = isNull(occasions.deletedAt);

export function doctorOccasionsQuery(doctorId: string) {
  return db
    .select()
    .from(occasions)
    .where(and(alive, eq(occasions.doctorId, doctorId)));
}

/**
 * Every enabled occasion with the person it belongs to, for the upcoming list.
 *
 * Sorting by "how soon" happens in JavaScript: the next date is a Jalali
 * calculation, and SQLite cannot do that.
 */
export function upcomingOccasionsQuery() {
  return db
    .select({ occasion: occasions, doctor: doctors })
    .from(occasions)
    .innerJoin(doctors, eq(occasions.doctorId, doctors.id))
    .where(and(alive, isNull(doctors.deletedAt), eq(occasions.isEnabled, true)));
}

export function occasionQuery(id: string) {
  return db
    .select()
    .from(occasions)
    .where(and(alive, eq(occasions.id, id)))
    .limit(1);
}

export type OccasionInput = {
  doctorId: string;
  kind: Occasion['kind'];
  title: string;
  jalaliMonth?: number | null;
  jalaliDay?: number | null;
  onDate?: string | null;
  isRecurring?: boolean;
  messageTemplate?: string | null;
  remindDaysBefore?: number;
  isEnabled?: boolean;
};

function values(input: OccasionInput) {
  const next = {
    doctorId: input.doctorId,
    kind: input.kind,
    title: input.title.trim(),
    jalaliMonth: input.jalaliMonth ?? null,
    jalaliDay: input.jalaliDay ?? null,
    onDate: input.onDate ?? null,
    isRecurring: input.isRecurring ?? true,
    messageTemplate: input.messageTemplate?.trim() || null,
    remindDaysBefore: input.remindDaysBefore ?? 1,
    isEnabled: input.isEnabled ?? true,
  };
  if (!next.title || !Object.hasOwn(OCCASION_KIND_LABELS, next.kind)) throw new Error('عنوان و نوع مناسبت معتبر نیست.');
  if (!Number.isInteger(next.remindDaysBefore) || next.remindDaysBefore < 0 || next.remindDaysBefore > 365)
    throw new Error('فاصلهٔ یادآوری معتبر نیست.');
  // 1403 is a leap year: a recurring Esfand 30 remains a valid birthday.
  if (
    next.isRecurring
      ? !Number.isInteger(next.jalaliMonth) ||
        !Number.isInteger(next.jalaliDay) ||
        !isValidJalali(1403, next.jalaliMonth!, next.jalaliDay!)
      : !fromIsoDate(next.onDate)
  )
    throw new Error('تاریخ مناسبت معتبر نیست.');
  return next;
}

export async function createOccasion(input: OccasionInput): Promise<string> {
  const id = newId();
  const row = values(input);
  db.transaction((tx) => {
    if (
      !tx
        .select({ id: doctors.id })
        .from(doctors)
        .where(and(eq(doctors.id, row.doctorId), isNull(doctors.deletedAt)))
        .get()
    )
      throw new Error('پزشک پیدا نشد یا حذف شده است.');
    tx.insert(occasions)
      .values({ id, ...stamps(), ...row })
      .run();
  });
  await reconcileOccasionReminder(id, true);
  return id;
}

export async function updateOccasion(id: string, patch: Partial<OccasionInput>): Promise<void> {
  db.transaction((tx) => {
    const current = tx
      .select()
      .from(occasions)
      .where(and(alive, eq(occasions.id, id)))
      .get();
    if (!current) throw new Error('مناسبت پیدا نشد یا حذف شده است.');
    const next = values({ ...current, ...patch } as OccasionInput);
    if (
      !tx
        .select({ id: doctors.id })
        .from(doctors)
        .where(and(eq(doctors.id, next.doctorId), isNull(doctors.deletedAt)))
        .get()
    )
      throw new Error('پزشک پیدا نشد یا حذف شده است.');
    tx.update(occasions)
      .set({ ...next, ...touch(), reminderRevision: current.reminderRevision + 1 })
      .where(eq(occasions.id, id))
      .run();
  });
  await reconcileOccasionReminder(id, true);
}

export async function deleteOccasion(id: string): Promise<void> {
  db.update(occasions)
    .set({ ...softDelete(), reminderRevision: sql`${occasions.reminderRevision} + 1` })
    .where(and(alive, eq(occasions.id, id)))
    .run();
  await audit('occasion.deleted', { entityType: 'occasion', entityId: id });
  await reconcileOccasionReminder(id);
}
