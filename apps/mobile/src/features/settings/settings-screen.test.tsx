import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { alertError, notify } from '@/components/feedback';
import { Segmented, Toggle } from '@/components/ui';
import { writeSetting } from '@/db/settings';
import { keepOriginalsMode } from '@/features/attachments/settings';
import { lockGraceSeconds } from '@/features/lock/settings';
import { DatasetBusyError, reserveDatasetReplacement } from '@/lib/dataset-write';
import { logError } from '@/platform/error-log';

import { SettingsScreen } from './settings-screen';

type LockResult = { ok: boolean; reason?: string };
const mockEnable = jest.fn<() => Promise<LockResult>>();
const mockDisable = jest.fn<() => Promise<boolean>>();
let mockFocused = true;
let mockLockOn = true;

jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock('expo-router/react-navigation', () => ({ useNavigation: () => ({ isFocused: () => mockFocused }) }));
jest.mock('@expo/vector-icons/Ionicons', () => 'Ionicons');
jest.mock('expo-constants', () => ({ expoConfig: { version: 'test' } }));
jest.mock('@/components/ui', () => ({
  Card: 'Card',
  Column: 'Column',
  DataRow: 'DataRow',
  Divider: 'Divider',
  Row: 'Row',
  Screen: 'Screen',
  SectionHeader: 'SectionHeader',
  Segmented: 'Segmented',
  Text: 'Text',
  Toggle: 'Toggle',
}));
jest.mock('@/components/feedback', () => ({ alertError: jest.fn(), notify: jest.fn() }));
jest.mock('@/db/files', () => ({ databaseSizeBytes: () => 0 }));
jest.mock('@/db/settings', () => ({ writeSetting: jest.fn<() => Promise<void>>() }));
jest.mock('@/db/use-setting', () => ({
  useSetting: (setting: { key: string }) => ({
    value: setting.key === 'lock.enabled' ? mockLockOn : setting.key === 'lock.graceSeconds' ? 60 : 'always',
  }),
}));
jest.mock('@/features/attachments/settings', () => ({ keepOriginalsMode: { key: 'media.keepOriginals' } }));
jest.mock('@/features/lock/settings', () => ({
  lockEnabled: { key: 'lock.enabled' },
  lockGraceSeconds: { key: 'lock.graceSeconds' },
}));
jest.mock('@/features/lock/lock-gate', () => ({
  enableAppLock: () => mockEnable(),
  disableAppLock: () => mockDisable(),
}));
jest.mock('@/features/settings/permissions-card', () => ({ PermissionsCard: 'PermissionsCard' }));
jest.mock('@/platform/media', () => ({ mediaFolderSize: () => 0 }));
jest.mock('@/platform/error-log', () => ({ logError: jest.fn() }));
jest.mock('@/theme', () => ({ useTheme: () => ({ colors: {}, spacing: { xs: 1, md: 2 } }) }));

let tree: ReactTestRenderer | undefined;
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
    tree = create(<SettingsScreen />);
  });
}
async function unmount() {
  await act(async () => {
    tree?.unmount();
  });
  tree = undefined;
}
const lock = () => tree!.root.findByType(Toggle);
const preference = (label: string) => tree!.root.findAllByType(Segmented).find((node) => node.props.label === label)!;
function replacement() {
  const lease = reserveDatasetReplacement();
  lease.committed();
  lease.release();
}

beforeEach(() => {
  jest.clearAllMocks();
  mockFocused = true;
  mockLockOn = true;
  mockEnable.mockReset().mockResolvedValue({ ok: true });
  mockDisable.mockReset().mockResolvedValue(true);
  jest.mocked(writeSetting).mockReset().mockResolvedValue();
});
afterEach(unmount);

describe('settings native actions and original dataset ownership', () => {
  it.each([true, false])('handles native rejection and allows a deliberate retry (enable=%s)', async (next) => {
    const failure = new Error('Native authentication unavailable');
    mockEnable.mockRejectedValueOnce(failure);
    mockDisable.mockRejectedValueOnce(failure);
    await render();
    await act(async () => {
      await expect(lock().props.onChange(next)).resolves.toBeUndefined();
    });
    expect(alertError).toHaveBeenCalledWith('تنظیم قفل کامل نشد', failure);
    expect(lock().props.disabled).toBe(false);
    await act(async () => {
      await lock().props.onChange(next);
    });
    expect(next ? mockEnable : mockDisable).toHaveBeenCalledTimes(2);
  });

  it('treats authentication cancellation as a quiet unsuccessful action', async () => {
    mockEnable.mockResolvedValue({ ok: false });
    mockDisable.mockResolvedValue(false);
    await render();
    await act(async () => {
      await lock().props.onChange(true);
      await lock().props.onChange(false);
    });
    expect(alertError).not.toHaveBeenCalled();
    expect(notify).not.toHaveBeenCalled();
  });

  it('explains missing device enrollment without inventing a successful change', async () => {
    mockEnable.mockResolvedValue({ ok: false, reason: 'Device lock is not configured' });
    await render();
    await act(async () => {
      await lock().props.onChange(true);
    });
    expect(notify).toHaveBeenCalledWith('فعال نشد', 'Device lock is not configured');
    expect(alertError).not.toHaveBeenCalled();
  });

  it('admits one lock action even before React publishes the disabled state', async () => {
    const pending = deferred<LockResult>();
    mockEnable.mockReturnValue(pending.promise);
    await render();
    const change = lock().props.onChange;
    let work!: Promise<void>;
    await act(async () => {
      work = change(true);
      await change(false);
      await settle();
    });
    expect(lock().props.disabled).toBe(true);
    expect(mockEnable).toHaveBeenCalledTimes(1);
    expect(mockDisable).not.toHaveBeenCalled();
    await act(async () => {
      pending.resolve({ ok: true });
      await work;
    });
    expect(lock().props.disabled).toBe(false);
  });

  it('logs a late native error without placing an alert over a different route', async () => {
    const pending = deferred<LockResult>();
    mockEnable.mockReturnValueOnce(pending.promise);
    await render();
    let work!: Promise<void>;
    await act(async () => {
      work = lock().props.onChange(true);
      await settle();
    });
    mockFocused = false;
    const failure = new Error('Late native failure');
    await act(async () => {
      pending.reject(failure);
      await work;
    });
    expect(alertError).not.toHaveBeenCalled();
    expect(notify).not.toHaveBeenCalled();
    expect(logError).toHaveBeenCalledWith(failure, { source: 'handled', context: 'تنظیم قفل کامل نشد' });
  });

  it('ignores a late enrollment explanation after navigation changes', async () => {
    const pending = deferred<LockResult>();
    mockEnable.mockReturnValue(pending.promise);
    await render();
    let work!: Promise<void>;
    await act(async () => {
      work = lock().props.onChange(true);
      await settle();
    });
    mockFocused = false;
    await act(async () => {
      pending.resolve({ ok: false, reason: 'No enrollment' });
      await work;
    });
    expect(notify).not.toHaveBeenCalled();
  });

  it('retains admission across native awaits and unmount, then releases it on failure', async () => {
    const pending = deferred<LockResult>();
    mockEnable.mockReturnValue(pending.promise);
    await render();
    const oldChange = lock().props.onChange;
    let work!: Promise<void>;
    await act(async () => {
      work = oldChange(true);
      await settle();
    });
    expect(() => reserveDatasetReplacement()).toThrow(DatasetBusyError);
    await unmount();
    expect(() => reserveDatasetReplacement()).toThrow(DatasetBusyError);
    await act(async () => {
      pending.reject(new Error('Unmounted native failure'));
      await work;
    });
    await oldChange(false);
    expect(mockDisable).not.toHaveBeenCalled();
    expect(alertError).not.toHaveBeenCalled();
    expect(logError).toHaveBeenCalledTimes(1);
    const lease = reserveDatasetReplacement();
    lease.release();
  });

  it.each(['lock', 'grace', 'images'])('refuses an old %s handler after actual dataset replacement', async (kind) => {
    await render();
    const change =
      kind === 'lock'
        ? lock().props.onChange
        : preference(kind === 'grace' ? 'قفل دوباره بعد از' : 'نگه داشتن اصل عکس‌ها').props.onChange;
    await act(async () => {
      replacement();
      await settle();
    });
    await act(async () => {
      await change(kind === 'lock' ? true : kind === 'grace' ? '300' : 'never');
      await settle();
    });
    expect(mockEnable).not.toHaveBeenCalled();
    expect(writeSetting).not.toHaveBeenCalled();
    expect(notify).toHaveBeenCalledWith(
      expect.any(String),
      'اطلاعات برنامه تغییر کرده؛ صفحهٔ تنظیمات را دوباره باز کنید.',
    );
    expect(alertError).not.toHaveBeenCalled();
  });

  it('allows a newly opened settings screen to act on the current dataset', async () => {
    await render();
    await act(async () => {
      replacement();
    });
    await unmount();
    await render();
    await act(async () => {
      await lock().props.onChange(true);
    });
    expect(mockEnable).toHaveBeenCalledTimes(1);
    expect(notify).not.toHaveBeenCalled();
  });

  it('refuses native authentication while restore holds replacement admission', async () => {
    await render();
    const lease = reserveDatasetReplacement();
    try {
      await act(async () => {
        await lock().props.onChange(true);
      });
      expect(mockEnable).not.toHaveBeenCalled();
      expect(alertError).toHaveBeenCalledWith('تنظیم قفل کامل نشد', expect.any(DatasetBusyError));
    } finally {
      lease.release();
    }
    await act(async () => {
      await lock().props.onChange(true);
    });
    expect(mockEnable).toHaveBeenCalledTimes(1);
  });

  it.each(['grace', 'images'])('handles %s preference failure without losing the retry', async (kind) => {
    const failure = new Error('Setting write unavailable');
    jest.mocked(writeSetting).mockRejectedValueOnce(failure);
    await render();
    const change = preference(kind === 'grace' ? 'قفل دوباره بعد از' : 'نگه داشتن اصل عکس‌ها').props.onChange;
    const value = kind === 'grace' ? '300' : 'never';
    await act(async () => {
      change(value);
      await settle();
    });
    expect(alertError).toHaveBeenCalledWith('تنظیم ثبت نشد', failure);
    await act(async () => {
      change(value);
      await settle();
    });
    expect(writeSetting).toHaveBeenLastCalledWith(
      kind === 'grace' ? lockGraceSeconds : keepOriginalsMode,
      kind === 'grace' ? 300 : 'never',
    );
  });

  it('rejects retained unfocused actions before entering native code or storage', async () => {
    await render();
    const changeLock = lock().props.onChange;
    const changeImage = preference('نگه داشتن اصل عکس‌ها').props.onChange;
    mockFocused = false;
    await act(async () => {
      await changeLock(true);
      changeImage('never');
      await settle();
    });
    expect(mockEnable).not.toHaveBeenCalled();
    expect(writeSetting).not.toHaveBeenCalled();
    expect(alertError).not.toHaveBeenCalled();
  });
});
