import { and, eq, gt, isNotNull, isNull, ne, or } from 'drizzle-orm';

import { db } from '@/db/client';
import { followUps, patients } from '@/db/schema';
import { logError } from '@/platform/error-log';
import { cancelReminderRequired, CHANNELS, scheduleReminder } from '@/platform/notifications';

import { FOLLOWUP_CHANNEL_LABELS } from './labels';
import type { ReminderPayload } from './logic';

const jobs = new Map<string, Promise<boolean>>();
export const followUpReminderId = (id: string) => `medos.follow-up.${id}`;

function read(id: string) {
  return db
    .select({ row: followUps, patient: patients })
    .from(followUps)
    .leftJoin(patients, eq(followUps.patientId, patients.id))
    .where(eq(followUps.id, id))
    .get();
}

function intent(snapshot: NonNullable<ReturnType<typeof read>>): string {
  const { row, patient } = snapshot;
  // Restore can replace a row without increasing its revision. Compare the
  // actual request as well before acknowledging work started on an older row.
  return JSON.stringify([
    row.reminderRevision,
    row.patientId,
    row.dueAt.getTime(),
    row.reason,
    row.channel,
    row.status,
    !!row.deletedAt,
    patient?.firstName,
    patient?.lastName,
    !!patient?.deletedAt,
  ]);
}

/** The clinical write has already committed. A native failure leaves a durable retry marker. */
export function reconcileFollowUpReminder(id: string, askPermission = false): Promise<boolean> {
  const previous = jobs.get(id) ?? Promise.resolve(false);
  const next = previous
    .catch(() => false)
    .then(async () => {
      try {
        // A later request may change the row while Android is handling an earlier one.
        for (let attempt = 0; attempt < 8; attempt++) {
          const snapshot = read(id);
          const stableId = followUpReminderId(id);
          if (!snapshot) {
            await cancelReminderRequired(stableId);
            return false;
          }
          const { row, patient } = snapshot;
          const eligible = !row.deletedAt && row.status === 'pending' && !!patient && !patient.deletedAt;
          // Even a forced repair of a previously applied generation must show failure.
          db.update(followUps).set({ reminderAppliedRevision: -1 }).where(eq(followUps.id, id)).run();
          if (row.notificationId && row.notificationId !== stableId) await cancelReminderRequired(row.notificationId);
          const notificationId = eligible
            ? await scheduleReminder({
                identifier: stableId,
                askPermission,
                at: row.dueAt,
                title: `پیگیری: ${patient!.firstName} ${patient!.lastName}`,
                body: `${FOLLOWUP_CHANNEL_LABELS[row.channel]} — ${row.reason}`,
                channelId: CHANNELS.followUps,
                data: { kind: 'follow-up', patientId: row.patientId, followUpId: id } satisfies ReminderPayload,
              })
            : null;
          // Denied permission or a now-past deadline must remove an older scheduled request.
          if (!notificationId) await cancelReminderRequired(stableId);
          const latest = read(id);
          if (!latest || intent(latest) !== intent(snapshot)) continue;
          db.update(followUps)
            .set({ notificationId, reminderAppliedRevision: row.reminderRevision })
            .where(and(eq(followUps.id, id), eq(followUps.reminderRevision, row.reminderRevision)))
            .run();
          return notificationId !== null;
        }
      } catch (error) {
        logError(error, { source: 'handled', context: 'follow-up reminder reconciliation' });
      }
      return false;
    });
  jobs.set(id, next);
  void next.finally(() => {
    if (jobs.get(id) === next) jobs.delete(id);
  });
  return next;
}

/** Repairs interrupted work and re-arms future reminders after restart/restore. */
export async function repairFollowUpReminders(
  filter: { patientId?: string; reportFailures?: boolean } = {},
  now = new Date(),
): Promise<number> {
  const rows = db
    .select({ id: followUps.id })
    .from(followUps)
    .leftJoin(patients, eq(followUps.patientId, patients.id))
    .where(
      and(
        filter.patientId ? eq(followUps.patientId, filter.patientId) : undefined,
        or(
          ne(followUps.reminderRevision, followUps.reminderAppliedRevision),
          isNotNull(followUps.notificationId),
          and(
            isNull(followUps.deletedAt),
            isNotNull(patients.id),
            isNull(patients.deletedAt),
            eq(followUps.status, 'pending'),
            gt(followUps.dueAt, now),
          ),
        ),
      ),
    )
    .all();
  let scheduled = 0;
  let failed = false;
  for (const row of rows) {
    if (await reconcileFollowUpReminder(row.id)) scheduled++;
    const current = read(row.id)?.row;
    if (current && current.reminderRevision !== current.reminderAppliedRevision) failed = true;
  }
  // Restore already committed. Its caller turns this into a housekeeping warning,
  // without claiming the restored clinical data failed or silently hiding repair errors.
  if (failed && filter.reportFailures) throw new Error('هماهنگی بعضی اعلان‌های پیگیری کامل نشد.');
  return scheduled;
}
