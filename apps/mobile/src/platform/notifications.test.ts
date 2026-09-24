import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import * as Native from 'expo-notifications';

jest.mock('react-native', () => {
  const native = jest.requireActual<typeof import('react-native')>('react-native');
  Object.defineProperty(native, 'Platform', { value: { ...native.Platform, OS: 'android' } });
  return native;
});

jest.mock('expo-notifications', () => ({
  setNotificationHandler: jest.fn(),
  setNotificationChannelAsync: jest.fn(async () => null),
  deleteNotificationChannelAsync: jest.fn(async () => undefined),
  getPermissionsAsync: jest.fn(),
  requestPermissionsAsync: jest.fn(),
  scheduleNotificationAsync: jest.fn(async (request: { identifier?: string }) => request.identifier ?? 'random'),
  cancelScheduledNotificationAsync: jest.fn(async () => undefined),
  AndroidImportance: { HIGH: 4, DEFAULT: 3 },
  AndroidNotificationVisibility: { PRIVATE: 0 },
  SchedulableTriggerInputTypes: { DATE: 'date' },
}));

let api: typeof import('./notifications');
const permissions = (granted: boolean) => ({ granted, canAskAgain: true }) as Native.NotificationPermissionsStatus;
beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(Native.getPermissionsAsync).mockResolvedValue(permissions(true));
  jest.mocked(Native.requestPermissionsAsync).mockResolvedValue(permissions(true));
  jest.isolateModules(() => {
    api = jest.requireActual<typeof api>('./notifications');
  });
});
const request = () => ({ at: new Date(Date.now() + 3_600_000), title: 'Reminder', channelId: api.CHANNELS.followUps });

describe('native notification boundary', () => {
  it('forwards stable identifiers and date triggers to Expo', async () => {
    const input = { ...request(), identifier: 'stable', askPermission: false };
    expect(await api.scheduleReminder(input)).toBe('stable');
    expect(Native.scheduleNotificationAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        identifier: 'stable',
        trigger: { type: 'date', date: input.at, channelId: input.channelId },
      }),
    );
  });

  it('does not open permission prompts during automatic repair', async () => {
    jest.mocked(Native.getPermissionsAsync).mockResolvedValue(permissions(false));
    expect(await api.scheduleReminder({ ...request(), askPermission: false })).toBeNull();
    expect(Native.requestPermissionsAsync).not.toHaveBeenCalled();
    expect(Native.scheduleNotificationAsync).not.toHaveBeenCalled();
    expect(await api.scheduleReminder({ ...request(), askPermission: true })).toBe('random');
    expect(Native.requestPermissionsAsync).toHaveBeenCalledTimes(1);
  });

  it('rejects invalid dates and skips past dates before touching native scheduling', async () => {
    await expect(api.scheduleReminder({ ...request(), at: new Date(NaN) })).rejects.toThrow('Invalid reminder date');
    expect(await api.scheduleReminder({ ...request(), at: new Date(0) })).toBeNull();
    expect(Native.getPermissionsAsync).not.toHaveBeenCalled();
    expect(Native.scheduleNotificationAsync).not.toHaveBeenCalled();
  });

  it('retries channel setup after a transient failure', async () => {
    jest.mocked(Native.setNotificationChannelAsync).mockRejectedValueOnce(new Error('temporary failure'));
    await expect(api.scheduleReminder(request())).rejects.toThrow('temporary failure');
    expect(await api.scheduleReminder(request())).toBe('random');
    expect(Native.setNotificationChannelAsync).toHaveBeenCalledTimes(4);
  });

  it('does not swallow strict cancellation errors', async () => {
    jest.mocked(Native.cancelScheduledNotificationAsync).mockRejectedValueOnce(new Error('native failure'));
    await expect(api.cancelReminderRequired('stable')).rejects.toThrow('native failure');
    await api.cancelReminderRequired(null);
    expect(Native.cancelScheduledNotificationAsync).toHaveBeenCalledTimes(1);
  });
});
