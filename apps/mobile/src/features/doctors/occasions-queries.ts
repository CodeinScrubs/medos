import { and, eq, isNull } from 'drizzle-orm';

import { db } from '@/db/client';
import { doctors, occasions, type Occasion } from '@/db/schema';
import { newId, softDelete, stamps, touch } from '@/lib/ids';
import { formatJalali } from '@/lib/jalali';
import { CHANNELS, cancelReminder, scheduleReminder } from '@/platform/notifications';

import { OCCASION_KIND_LABELS } from './labels';
import {
  doctorDisplayName,
  occasionNextDate,
  occasionReminderAt,
  type OccasionReminderPayload,
  type OccasionTiming,
} from './logic';

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

async function doctorName(doctorId: string | null): Promise<string> {
  if (!doctorId) return '';
  const row = (
    await db
      .select({ title: doctors.title, firstName: doctors.firstName, lastName: doctors.lastName })
      .from(doctors)
      .where(eq(doctors.id, doctorId))
      .limit(1)
  )[0];
  return row ? doctorDisplayName(row) : '';
}

/** Schedule the notification for one occasion, or nothing if it has no future date. */
async function scheduleFor(o: Occasion | (OccasionTiming & Pick<Occasion, 'id' | 'doctorId' | 'kind' | 'title'>)) {
  const at = occasionReminderAt(o);
  if (!at) return null;
  const name = await doctorName(o.doctorId);
  const on = occasionNextDate(o);
  return scheduleReminder({
    at,
    title: name ? `${OCCASION_KIND_LABELS[o.kind]}: ${name}` : o.title,
    body: `${o.title}${on ? ` — ${formatJalali(on)}` : ''}`,
    channelId: CHANNELS.occasions,
    data: {
      kind: 'occasion',
      doctorId: o.doctorId ?? '',
      occasionId: o.id,
    } satisfies OccasionReminderPayload,
  });
}

function values(input: OccasionInput) {
  return {
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
}

export async function createOccasion(input: OccasionInput): Promise<string> {
  const id = newId();
  const row = values(input);
  const notificationId = await scheduleFor({ id, ...row });
  try {
    await db.insert(occasions).values({ id, ...stamps(), ...row, notificationId });
  } catch (e) {
    // No row, no reminder: one that fires for nothing is worse than none.
    await cancelReminder(notificationId);
    throw e;
  }
  return id;
}

export async function updateOccasion(id: string, patch: Partial<OccasionInput>): Promise<void> {
  const current = (await occasionQuery(id))[0];
  if (!current) throw new Error(`Occasion ${id} not found`);

  // Only the editable columns are rewritten: spreading the whole row back
  // would also write `id`, `createdAt` and `deletedAt` for no reason.
  const next = values({ ...current, ...patch } as OccasionInput);
  // Any change to the date, the lead time or the switch makes the old reminder
  // wrong; replace it rather than trying to work out whether it still holds.
  await cancelReminder(current.notificationId);
  const notificationId = await scheduleFor({ ...next, id });

  await db
    .update(occasions)
    .set({ ...next, notificationId, ...touch() })
    .where(eq(occasions.id, id));
}

export async function deleteOccasion(id: string): Promise<void> {
  const current = (await occasionQuery(id))[0];
  await cancelReminder(current?.notificationId);
  await db
    .update(occasions)
    .set({ ...softDelete(), notificationId: null })
    .where(eq(occasions.id, id));
}

/**
 * Re-create the OS reminder for every enabled occasion of a living doctor.
 *
 * Called after a restore (the ids in a backup belong to another phone) and on
 * every app start — a recurring reminder that has already fired leaves a stale
 * id behind, and without this the birthday would be announced once and then
 * never again. Returns how many reminders were scheduled.
 */
export async function rescheduleOccasionReminders(): Promise<number> {
  const rows = await db
    .select({ occasion: occasions })
    .from(occasions)
    .innerJoin(doctors, eq(occasions.doctorId, doctors.id))
    .where(and(alive, isNull(doctors.deletedAt), eq(occasions.isEnabled, true)));

  let scheduled = 0;
  for (const { occasion } of rows) {
    await cancelReminder(occasion.notificationId);
    const notificationId = await scheduleFor(occasion);
    if (notificationId) scheduled += 1;
    await db.update(occasions).set({ notificationId }).where(eq(occasions.id, occasion.id));
  }
  return scheduled;
}

/** Silence a doctor's reminders without forgetting the occasions themselves. */
/**
 * Everything that belongs to a doctor being deleted: the alarms Android is
 * holding, and the occasions themselves.
 *
 * This lives next to the occasions rather than in the delete screen, because a
 * reminder cancelled by a button is a reminder that rings whenever the doctor
 * is deleted from anywhere else — and a birthday greeting for someone removed
 * from the directory is the kind of thing that is noticed at 8 a.m.
 */
export async function removeDoctorOccasions(doctorId: string): Promise<void> {
  await cancelDoctorOccasionReminders(doctorId);
  await db
    .update(occasions)
    .set(softDelete())
    .where(and(alive, eq(occasions.doctorId, doctorId)));
}

export async function cancelDoctorOccasionReminders(doctorId: string): Promise<void> {
  const rows = await db
    .select()
    .from(occasions)
    .where(and(alive, eq(occasions.doctorId, doctorId)));
  for (const o of rows) {
    await cancelReminder(o.notificationId);
    await db.update(occasions).set({ notificationId: null }).where(eq(occasions.id, o.id));
  }
}
