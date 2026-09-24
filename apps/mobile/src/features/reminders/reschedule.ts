import { rescheduleOccasionReminders } from '@/features/doctors/occasions-queries';
import { repairFollowUpReminders } from '@/features/followups/reminder-queries';
import { repairTaskReminders } from '@/features/tasks/reminder-queries';
import { cancelAllReminders } from '@/platform/notifications';

/**
 * Rebuild every reminder the OS holds from the rows in the database.
 *
 * Used after a restore: the reminders on the phone describe the data that was
 * just replaced, and the notification ids inside the backup belong to the
 * phone that made it, so everything is cancelled and scheduled again.
 *
 * **Any feature that schedules a reminder must be rescheduled here.** Today
 * that is tasks, follow-ups and the occasions (birthdays) of the doctors directory.
 * Miss one and a restore leaves the phone quietly without those reminders.
 */
export async function rescheduleAllReminders(): Promise<{ followUps: number; occasions: number; tasks: number }> {
  await cancelAllReminders();
  // Try every kind even when one fails; restore reports a housekeeping warning.
  const results = await Promise.allSettled([
    repairFollowUpReminders({ reportFailures: true }),
    rescheduleOccasionReminders(),
    repairTaskReminders({ reportFailures: true }),
  ]);
  const [followUps, occasions, tasks] = results;
  if (followUps.status === 'rejected') throw followUps.reason;
  if (occasions.status === 'rejected') throw occasions.reason;
  if (tasks.status === 'rejected') throw tasks.reason;
  return { followUps: followUps.value, occasions: occasions.value, tasks: tasks.value };
}
