import { rescheduleReminders } from '@/features/followups/queries';
import { cancelAllReminders } from '@/platform/notifications';

/**
 * Rebuild every reminder the OS holds from the rows in the database.
 *
 * Used after a restore: the reminders on the phone describe the data that was
 * just replaced, and the notification ids inside the backup belong to the
 * phone that made it, so everything is cancelled and scheduled again.
 *
 * **Any feature that schedules a reminder must be rescheduled here.** Today
 * that is follow-ups; when occasions (birthdays) start scheduling, add them,
 * or a restore will silently leave the phone with no birthday reminders.
 */
export async function rescheduleAllReminders(): Promise<{ followUps: number }> {
  await cancelAllReminders();
  return { followUps: await rescheduleReminders() };
}
