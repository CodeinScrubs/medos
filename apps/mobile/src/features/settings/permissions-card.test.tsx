import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { StrictMode } from 'react';
import { AppState, type AppStateStatus, Linking } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { ErrorNotice } from '@/components/error-notice';
import { alertError } from '@/components/feedback';
import { Badge, Button } from '@/components/ui';

import { PermissionsCard } from './permissions-card';

type Grant = { granted: boolean; canAskAgain: boolean };
const allowed: Grant = { granted: true, canAskAgain: true };
const refused: Grant = { granted: false, canAskAgain: true };
const mockNotificationRead = jest.fn<() => Promise<Grant>>();
const mockCameraRead = jest.fn<() => Promise<Grant>>();
const mockMicrophoneRead = jest.fn<() => Promise<Grant>>();
const mockNotificationRequest = jest.fn<() => Promise<Grant>>();
const mockCameraRequest = jest.fn<() => Promise<Grant>>();
const mockMicrophoneRequest = jest.fn<() => Promise<Grant>>();
const mockFolder = { value: null as string | null };
let mockFocused = true;

jest.mock('expo-notifications', () => ({
  getPermissionsAsync: () => mockNotificationRead(),
  requestPermissionsAsync: () => mockNotificationRequest(),
}));
jest.mock('expo-image-picker', () => ({
  getCameraPermissionsAsync: () => mockCameraRead(),
  requestCameraPermissionsAsync: () => mockCameraRequest(),
}));
jest.mock('expo-audio', () => ({
  getRecordingPermissionsAsync: () => mockMicrophoneRead(),
  requestRecordingPermissionsAsync: () => mockMicrophoneRequest(),
}));
jest.mock('expo-router/react-navigation', () => ({ useNavigation: () => ({ isFocused: () => mockFocused }) }));
jest.mock('@/components/ui', () => ({
  Badge: 'Badge',
  Button: 'Button',
  Card: 'Card',
  Column: 'Column',
  Divider: 'Divider',
  Row: 'Row',
  Text: 'Text',
}));
jest.mock('@/components/error-notice', () => ({ ErrorNotice: 'ErrorNotice' }));
jest.mock('@/components/feedback', () => ({ alertError: jest.fn() }));
jest.mock('@/db/use-setting', () => ({ useSetting: () => mockFolder }));
jest.mock('@/features/backup/settings', () => ({ backupFolderUri: {} }));
jest.mock('@/theme', () => ({ useTheme: () => ({ colors: {}, spacing: { xxs: 1 } }) }));

let tree: ReactTestRenderer | undefined;
const listeners = new Set<(status: AppStateStatus) => void>();
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
async function settle() {
  for (let i = 0; i < 30; i++) await Promise.resolve();
}
async function render() {
  await act(async () => {
    tree = create(<PermissionsCard />);
    await settle();
  });
}
async function unmount() {
  await act(async () => {
    tree?.unmount();
  });
  tree = undefined;
}
async function resume(status: AppStateStatus = 'active') {
  await act(async () => {
    for (const listener of listeners) listener(status);
    await settle();
  });
}
const buttons = (label: string) => tree!.root.findAllByType(Button).filter((node) => node.props.label === label);
const badges = (label: string) => tree!.root.findAllByType(Badge).filter((node) => node.props.label === label);
const notice = () => tree!.root.findByType(ErrorNotice);

beforeEach(() => {
  listeners.clear();
  mockFocused = true;
  mockFolder.value = null;
  for (const read of [mockNotificationRead, mockCameraRead, mockMicrophoneRead])
    read.mockReset().mockResolvedValue(allowed);
  for (const request of [mockNotificationRequest, mockCameraRequest, mockMicrophoneRequest])
    request.mockReset().mockResolvedValue(allowed);
  jest.clearAllMocks();
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, listener) => {
    const change = listener as (status: AppStateStatus) => void;
    listeners.add(change);
    return { remove: () => listeners.delete(change) };
  });
  jest.spyOn(Linking, 'openSettings').mockResolvedValue();
  jest.spyOn(Linking, 'sendIntent').mockResolvedValue();
});
afterEach(async () => {
  await unmount();
  jest.restoreAllMocks();
});

describe('current permission state and native action ownership', () => {
  it('refreshes actual notification access after external settings change and resume', async () => {
    await render();
    expect(buttons('اجازه بده')).toHaveLength(0);
    mockNotificationRead.mockResolvedValue(refused);
    await resume();
    expect(buttons('اجازه بده')).toHaveLength(1);
  });

  it('keeps the latest permission state when React replays setup and cleanup', async () => {
    const older = deferred<Grant>();
    mockNotificationRead.mockReturnValueOnce(older.promise).mockResolvedValueOnce(refused);
    await act(async () => {
      tree = create(
        <StrictMode>
          <PermissionsCard />
        </StrictMode>,
      );
      await settle();
    });
    expect(mockNotificationRead).toHaveBeenCalledTimes(2);
    expect(buttons('اجازه بده')).toHaveLength(1);
    await act(async () => {
      older.resolve(allowed);
      await settle();
    });
    expect(buttons('اجازه بده')).toHaveLength(1);
    expect(notice().props.error).toBeUndefined();
  });

  it('does not read for inactive events and reads all native grants on return', async () => {
    await render();
    await resume('inactive');
    expect(mockNotificationRead).toHaveBeenCalledTimes(1);
    mockCameraRead.mockResolvedValue(refused);
    mockMicrophoneRead.mockResolvedValue(refused);
    await resume();
    expect(buttons('اجازه بده')).toHaveLength(2);
  });

  it('exposes a read failure and retries without claiming a grant', async () => {
    const failure = new Error('Native grant read unavailable');
    mockNotificationRead.mockRejectedValueOnce(failure);
    await render();
    expect(notice().props.error).toBe(failure);
    expect(badges('داده شده')).toHaveLength(0);
    await act(async () => {
      notice().props.onRetry();
      await settle();
    });
    expect(notice().props.error).toBeUndefined();
    expect(badges('داده شده')).toHaveLength(3);
  });

  it('withholds earlier grant badges when a resumed read fails', async () => {
    await render();
    expect(badges('داده شده')).toHaveLength(3);
    mockCameraRead.mockRejectedValueOnce(new Error('Camera permission read unavailable'));
    await resume();
    expect(notice().props.error).toBeInstanceOf(Error);
    expect(badges('داده شده')).toHaveLength(0);
  });

  it('does not let an older permission result overwrite a newer resumed read', async () => {
    const older = deferred<Grant>();
    mockNotificationRead.mockReturnValueOnce(older.promise).mockResolvedValueOnce(refused);
    await render();
    await resume();
    expect(buttons('اجازه بده')).toHaveLength(1);
    await act(async () => {
      older.resolve(allowed);
      await settle();
    });
    expect(buttons('اجازه بده')).toHaveLength(1);
    expect(notice().props.error).toBeUndefined();
  });

  it('does not let an older rejection hide a newer valid read', async () => {
    const older = deferred<Grant>();
    mockNotificationRead.mockReturnValueOnce(older.promise).mockResolvedValueOnce(refused);
    await render();
    await resume();
    await act(async () => {
      older.reject(new Error('Old read failed'));
      await settle();
    });
    expect(notice().props.error).toBeUndefined();
    expect(buttons('اجازه بده')).toHaveLength(1);
  });

  it('consumes simultaneous native permission choices once and catches refusal', async () => {
    mockNotificationRead.mockResolvedValue(refused);
    const pending = deferred<Grant>();
    mockNotificationRequest.mockReturnValue(pending.promise);
    await render();
    const press = buttons('اجازه بده')[0]!.props.onPress;
    await act(async () => {
      press();
      press();
      await settle();
    });
    expect(mockNotificationRequest).toHaveBeenCalledTimes(1);
    const failure = new Error('Permission request unavailable');
    await act(async () => {
      pending.reject(failure);
      await settle();
    });
    expect(alertError).toHaveBeenCalledWith('تنظیم دسترسی کامل نشد', failure);
    expect(buttons('اجازه بده')[0]!.props.disabled).toBe(false);
  });

  it('does not report a delayed native action error over another route', async () => {
    mockNotificationRead.mockResolvedValue(refused);
    const pending = deferred<Grant>();
    mockNotificationRequest.mockReturnValue(pending.promise);
    await render();
    await act(async () => {
      buttons('اجازه بده')[0]!.props.onPress();
      await settle();
    });
    mockFocused = false;
    await act(async () => {
      pending.reject(new Error('Late permission failure'));
      await settle();
    });
    expect(alertError).not.toHaveBeenCalled();
  });

  it('does not reread or report after a pending action loses its mounted origin', async () => {
    mockNotificationRead.mockResolvedValue(refused);
    const pending = deferred<Grant>();
    mockNotificationRequest.mockReturnValue(pending.promise);
    await render();
    await act(async () => {
      buttons('اجازه بده')[0]!.props.onPress();
      await settle();
    });
    await unmount();
    await act(async () => {
      pending.reject(new Error('Late unmounted failure'));
      await settle();
    });
    expect(alertError).not.toHaveBeenCalled();
    expect(mockNotificationRead).toHaveBeenCalledTimes(1);
  });

  it('refuses a retained permission handler after unmount', async () => {
    mockNotificationRead.mockResolvedValue(refused);
    await render();
    const press = buttons('اجازه بده')[0]!.props.onPress;
    await unmount();
    await act(async () => {
      press();
      await settle();
    });
    expect(mockNotificationRequest).not.toHaveBeenCalled();
  });

  it('refuses a retained permission handler after navigation focus is lost', async () => {
    mockNotificationRead.mockResolvedValue(refused);
    await render();
    const press = buttons('اجازه بده')[0]!.props.onPress;
    mockFocused = false;
    await act(async () => {
      press();
      await settle();
    });
    expect(mockNotificationRequest).not.toHaveBeenCalled();
  });

  it('catches both the exact-alarm intent failure and its settings fallback failure', async () => {
    const failure = new Error('Settings unavailable');
    jest.mocked(Linking.sendIntent).mockRejectedValueOnce(new Error('No matching intent'));
    jest.mocked(Linking.openSettings).mockRejectedValueOnce(failure);
    await render();
    await act(async () => {
      buttons('تنظیم یادآور دقیق')[0]!.props.onPress();
      await settle();
    });
    expect(Linking.sendIntent).toHaveBeenCalledTimes(1);
    expect(Linking.openSettings).toHaveBeenCalledTimes(1);
    expect(alertError).toHaveBeenCalledWith('تنظیم دسترسی کامل نشد', failure);
  });

  it('shows a stored backup folder as selected, independently of native permission grants', async () => {
    mockFolder.value = 'content://synthetic/backup';
    await render();
    expect(badges('انتخاب شده')).toHaveLength(1);
    expect(badges('انتخاب شده')[0]!.props.tone).toBeUndefined();
    expect(badges('داده شده')).toHaveLength(3);
  });

  it('removes the AppState listener and refuses its already-queued callback after unmount', async () => {
    await render();
    const listener = [...listeners][0]!;
    await unmount();
    expect(listeners.size).toBe(0);
    await act(async () => {
      listener('active');
      await settle();
    });
    expect(mockNotificationRead).toHaveBeenCalledTimes(1);
  });
});
