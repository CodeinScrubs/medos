import { and, eq, gt, isNotNull, isNull, ne, or } from 'drizzle-orm';

import { db } from '@/db/client';
import { patients, tasks } from '@/db/schema';
import { logError } from '@/platform/error-log';
import { cancelReminderRequired, CHANNELS, scheduleReminder } from '@/platform/notifications';

const jobs = new Map<string, Promise<boolean>>();
export const taskReminderId = (id: string) => `medos.task.${id}`;
function read(id: string) {
  return db
    .select({ task: tasks, patient: patients })
    .from(tasks)
    .leftJoin(patients, eq(tasks.patientId, patients.id))
    .where(eq(tasks.id, id))
    .get();
}
function intent(snapshot: NonNullable<ReturnType<typeof read>>): string {
  const { task, patient } = snapshot;
  return JSON.stringify([
    task.reminderRevision,
    task.title,
    task.dueAt?.getTime(),
    task.reminderEnabled,
    task.status,
    !!task.deletedAt,
    task.patientId,
    patient?.firstName,
    patient?.lastName,
    !!patient?.deletedAt,
  ]);
}

/** Clinical writes commit first. Native failures leave a durable pending generation. */
export function reconcileTaskReminder(id: string, askPermission = false): Promise<boolean> {
  const previous = jobs.get(id) ?? Promise.resolve(false);
  const next = previous
    .catch(() => false)
    .then(async () => {
      try {
        for (let attempt = 0; attempt < 8; attempt++) {
          const snapshot = read(id);
          const identifier = taskReminderId(id);
          if (!snapshot) {
            await cancelReminderRequired(identifier);
            return false;
          }
          const { task, patient } = snapshot;
          const eligible =
            !task.deletedAt &&
            task.status === 'open' &&
            task.reminderEnabled &&
            task.dueAt &&
            (!task.patientId || (!!patient && !patient.deletedAt));
          db.update(tasks).set({ reminderAppliedRevision: -1 }).where(eq(tasks.id, id)).run();
          if (task.notificationId && task.notificationId !== identifier)
            await cancelReminderRequired(task.notificationId);
          const notificationId = eligible
            ? await scheduleReminder({
                identifier,
                askPermission,
                at: task.dueAt!,
                title: task.title,
                body: patient ? `${patient.firstName} ${patient.lastName}` : undefined,
                channelId: CHANNELS.tasks,
                data: { kind: 'task', taskId: id },
              })
            : null;
          if (!notificationId) await cancelReminderRequired(identifier);
          const latest = read(id);
          if (!latest || intent(latest) !== intent(snapshot)) continue;
          db.update(tasks)
            .set({ notificationId, reminderAppliedRevision: task.reminderRevision })
            .where(and(eq(tasks.id, id), eq(tasks.reminderRevision, task.reminderRevision)))
            .run();
          return notificationId !== null;
        }
      } catch (error) {
        logError(error, { source: 'handled', context: 'task reminder reconciliation' });
      }
      return false;
    });
  jobs.set(id, next);
  void next.finally(() => {
    if (jobs.get(id) === next) jobs.delete(id);
  });
  return next;
}

export async function repairTaskReminders(
  filter: { patientId?: string; reportFailures?: boolean } = {},
  now = new Date(),
): Promise<number> {
  const rows = db
    .select({ id: tasks.id })
    .from(tasks)
    .leftJoin(patients, eq(tasks.patientId, patients.id))
    .where(
      and(
        filter.patientId ? eq(tasks.patientId, filter.patientId) : undefined,
        or(
          ne(tasks.reminderRevision, tasks.reminderAppliedRevision),
          isNotNull(tasks.notificationId),
          and(
            isNull(tasks.deletedAt),
            eq(tasks.status, 'open'),
            eq(tasks.reminderEnabled, true),
            gt(tasks.dueAt, now),
            or(isNull(tasks.patientId), and(isNotNull(patients.id), isNull(patients.deletedAt))),
          ),
        ),
      ),
    )
    .all();
  let scheduled = 0;
  let failed = false;
  for (const row of rows) {
    if (await reconcileTaskReminder(row.id)) scheduled++;
    const current = read(row.id)?.task;
    if (current && current.reminderRevision !== current.reminderAppliedRevision) failed = true;
  }
  if (failed && filter.reportFailures) throw new Error('هماهنگی بعضی اعلان‌های کارها کامل نشد.');
  return scheduled;
}
