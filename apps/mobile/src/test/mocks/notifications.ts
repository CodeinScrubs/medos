import type { ChannelId } from '@/platform/notifications';

/**
 * Stand-in for `@/platform/notifications` in data-layer tests:
 *
 *   jest.mock('@/platform/notifications', () => jest.requireActual('@/test/mocks/notifications'));
 *
 * It keeps what the OS would have scheduled in `scheduled`, so tests can check
 * which reminders exist rather than which functions were called.
 */

export const CHANNELS = { followUps: 'follow-ups.v2', occasions: 'occasions.v2' } as const;

export type ScheduledReminder = {
  at: Date;
  title: string;
  body?: string;
  channelId: ChannelId;
  data?: Record<string, unknown>;
};

export const scheduled = new Map<string, ScheduledReminder>();
let nextId = 0;

/** Set to false to simulate the user refusing notification permission. */
export const permission = { granted: true };

export function resetNotifications(): void {
  scheduled.clear();
  permission.granted = true;
}

export async function setupNotifications(): Promise<void> {}

export async function ensureNotificationPermission(): Promise<boolean> {
  return permission.granted;
}

export async function scheduleReminder(reminder: ScheduledReminder): Promise<string | null> {
  if (reminder.at.getTime() <= Date.now() || !permission.granted) return null;
  nextId += 1;
  const id = `notification-${nextId}`;
  scheduled.set(id, reminder);
  return id;
}

export async function cancelReminder(id: string | null | undefined): Promise<void> {
  if (id) scheduled.delete(id);
}

export async function cancelAllReminders(): Promise<void> {
  scheduled.clear();
}
