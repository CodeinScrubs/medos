import { and, eq, isNotNull, isNull, ne, or } from 'drizzle-orm';

import { db } from '@/db/client';
import { doctors, occasions } from '@/db/schema';
import { formatJalali } from '@/lib/jalali';
import { addDays } from '@/lib/time';
import { logError } from '@/platform/error-log';
import { cancelReminderRequired, CHANNELS, scheduleReminder } from '@/platform/notifications';

import { OCCASION_KIND_LABELS } from './labels';
import { doctorDisplayName, occasionReminderAt, type OccasionReminderPayload } from './logic';

const jobs = new Map<string, Promise<boolean>>();
export const occasionReminderId = (id: string) => `medos.occasion.${id}`;

function read(id: string) {
  return db
    .select({ row: occasions, doctor: doctors })
    .from(occasions)
    .leftJoin(doctors, eq(occasions.doctorId, doctors.id))
    .where(eq(occasions.id, id))
    .get();
}

function intent({ row, doctor }: NonNullable<ReturnType<typeof read>>): string {
  // A restore can replace the same id/revision with different content.
  return JSON.stringify([
    row.reminderRevision,
    row.doctorId,
    row.kind,
    row.title,
    row.jalaliMonth,
    row.jalaliDay,
    row.onDate,
    row.isRecurring,
    row.remindDaysBefore,
    row.isEnabled,
    !!row.deletedAt,
    doctor?.id,
    doctor?.title,
    doctor?.firstName,
    doctor?.lastName,
    !!doctor?.deletedAt,
  ]);
}

/** Native errors never undo a committed occasion. The pending marker survives restart. */
export function reconcileOccasionReminder(id: string, askPermission = false): Promise<boolean> {
  const previous = jobs.get(id) ?? Promise.resolve(false);
  const next = previous
    .catch(() => false)
    .then(async () => {
      try {
        for (let attempt = 0; attempt < 8; attempt++) {
          const snapshot = read(id);
          const stableId = occasionReminderId(id);
          if (!snapshot) {
            await cancelReminderRequired(stableId);
            return false;
          }
          const { row, doctor } = snapshot;
          const at = !row.deletedAt && doctor && !doctor.deletedAt ? occasionReminderAt(row) : null;
          db.update(occasions).set({ reminderAppliedRevision: -1 }).where(eq(occasions.id, id)).run();
          if (row.notificationId && row.notificationId !== stableId) await cancelReminderRequired(row.notificationId);
          const notificationId = at
            ? await scheduleReminder({
                identifier: stableId,
                askPermission,
                at,
                title: `${OCCASION_KIND_LABELS[row.kind]}: ${doctorDisplayName(doctor!)}`,
                // Lead time may have moved the reminder to next year. Use THAT occurrence.
                body: `${row.title} — ${formatJalali(addDays(at, row.remindDaysBefore))}`,
                channelId: CHANNELS.occasions,
                data: { kind: 'occasion', doctorId: doctor!.id, occasionId: id } satisfies OccasionReminderPayload,
              })
            : null;
          if (!notificationId) await cancelReminderRequired(stableId);
          const latest = read(id);
          if (!latest || intent(latest) !== intent(snapshot)) continue;
          db.update(occasions)
            .set({ notificationId, reminderAppliedRevision: row.reminderRevision })
            .where(and(eq(occasions.id, id), eq(occasions.reminderRevision, row.reminderRevision)))
            .run();
          return notificationId !== null;
        }
      } catch (error) {
        logError(error, { source: 'handled', context: 'occasion reminder reconciliation' });
      }
      return false;
    });
  jobs.set(id, next);
  void next.finally(() => {
    if (jobs.get(id) === next) jobs.delete(id);
  });
  return next;
}

/** Includes deleted/disabled rows with pending cancellation, not only visible occasions. */
export async function repairOccasionReminders(
  filter: { doctorId?: string; reportFailures?: boolean } = {},
): Promise<number> {
  try {
    const rows = db
      .select({ id: occasions.id })
      .from(occasions)
      .leftJoin(doctors, eq(occasions.doctorId, doctors.id))
      .where(
        and(
          filter.doctorId ? eq(occasions.doctorId, filter.doctorId) : undefined,
          or(
            ne(occasions.reminderRevision, occasions.reminderAppliedRevision),
            isNotNull(occasions.notificationId),
            and(
              isNull(occasions.deletedAt),
              isNotNull(doctors.id),
              isNull(doctors.deletedAt),
              eq(occasions.isEnabled, true),
            ),
          ),
        ),
      )
      .all();
    let scheduled = 0;
    let failed = false;
    for (const { id } of rows) {
      if (await reconcileOccasionReminder(id)) scheduled++;
      const current = read(id);
      if (!current) continue;
      const { row, doctor } = current;
      if (
        row.reminderRevision !== row.reminderAppliedRevision ||
        (!row.deletedAt && doctor && !doctor.deletedAt && occasionReminderAt(row) && !row.notificationId)
      )
        failed = true;
    }
    if (failed && filter.reportFailures) throw new Error('هماهنگی بعضی اعلان‌های مناسبت کامل نشد.');
    return scheduled;
  } catch (error) {
    logError(error, { source: 'handled', context: 'occasion reminder repair' });
    // Directory writes have already committed; restore explicitly requests a warning.
    if (filter.reportFailures) throw error;
    return 0;
  }
}
