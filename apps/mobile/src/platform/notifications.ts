import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

/**
 * Local notifications only. Nothing here talks to a push server: reminders are
 * scheduled on the phone by the OS alarm system, which is what keeps them
 * working with no network inside a hospital.
 *
 * Channels are marked PRIVATE: a reminder names a patient and a reason, and on
 * a locked phone Android shows only "contents hidden" for private channels.
 * Android freezes a channel's settings when it is first created, so changing
 * them means a new channel id — which is why these ids carry a version.
 */
export const CHANNELS = {
  followUps: 'follow-ups.v2',
  occasions: 'occasions.v2',
  tasks: 'tasks.v1',
} as const;

/** Channels from earlier builds, removed so they stop appearing in system settings. */
const RETIRED_CHANNELS = ['follow-ups', 'occasions'];

export type ChannelId = (typeof CHANNELS)[keyof typeof CHANNELS];

let setup: Promise<void> | null = null;

/** Idempotent: every scheduling call awaits this, so order of startup never matters. */
export function setupNotifications(): Promise<void> {
  setup ??= (async () => {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
      }),
    });

    if (Platform.OS !== 'android') return;

    await Notifications.setNotificationChannelAsync(CHANNELS.followUps, {
      name: 'پیگیری بیماران',
      description: 'یادآور تماس و پیگیری بیماران',
      importance: Notifications.AndroidImportance.HIGH,
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PRIVATE,
      vibrationPattern: [0, 250, 150, 250],
      enableVibrate: true,
    });
    await Notifications.setNotificationChannelAsync(CHANNELS.occasions, {
      name: 'مناسبت‌ها',
      description: 'یادآور تولد و مناسبت همکاران',
      importance: Notifications.AndroidImportance.DEFAULT,
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PRIVATE,
    });
    await Notifications.setNotificationChannelAsync(CHANNELS.tasks, {
      name: 'کارها',
      importance: Notifications.AndroidImportance.HIGH,
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PRIVATE,
    });
    for (const id of RETIRED_CHANNELS) {
      await Notifications.deleteNotificationChannelAsync(id).catch(() => undefined);
    }
  })().catch((error: unknown) => {
    setup = null;
    throw error;
  });
  return setup;
}

/** Ask for permission if needed. Returns whether reminders can be shown. */
export async function ensureNotificationPermission(ask = true): Promise<boolean> {
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  if (!ask || !current.canAskAgain) return false;
  const next = await Notifications.requestPermissionsAsync();
  return next.granted;
}

/**
 * Schedule a one-off reminder. Returns the notification id to store on the
 * row, or null when the time has passed or permission was refused — in which
 * case the item still shows in the app's own lists, it just won't buzz.
 */
export async function scheduleReminder({
  at,
  title,
  body,
  channelId,
  data,
  identifier,
  askPermission = true,
}: {
  at: Date;
  title: string;
  body?: string;
  channelId: ChannelId;
  data?: Record<string, unknown>;
  /** A stable id makes retry after interruption replace the same Android request. */
  identifier?: string;
  /** Background repair must not unexpectedly open a permission prompt. */
  askPermission?: boolean;
}): Promise<string | null> {
  if (!Number.isFinite(at.getTime())) throw new Error('Invalid reminder date');
  if (at.getTime() <= Date.now()) return null;
  await setupNotifications();
  if (!(await ensureNotificationPermission(askPermission))) return null;

  return Notifications.scheduleNotificationAsync({
    identifier,
    content: { title, body: body ?? null, data: data ?? {} },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: at,
      channelId,
    },
  });
}

/**
 * Cancel every reminder this app has scheduled with the OS. For a restore:
 * the reminders on the phone describe the data being replaced, and each
 * feature reschedules its own from the restored rows afterwards.
 */
export async function cancelAllReminders(): Promise<void> {
  await Notifications.cancelAllScheduledNotificationsAsync();
}

export async function cancelReminder(id: string | null | undefined): Promise<void> {
  if (!id) return;
  try {
    await cancelReminderRequired(id);
  } catch {
    // Best effort for legacy callers. A rejected native call is NOT evidence
    // that cancellation succeeded; durable reconciliation uses the strict API.
  }
}

/** Reconciliation must observe cancellation failure rather than claiming success. */
export async function cancelReminderRequired(id: string | null | undefined): Promise<void> {
  if (id) await Notifications.cancelScheduledNotificationAsync(id);
}
