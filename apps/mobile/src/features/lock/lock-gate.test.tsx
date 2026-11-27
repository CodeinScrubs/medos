import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { ErrorNotice } from '@/components/error-notice';
import { alertError, notify } from '@/components/feedback';
import { Button } from '@/components/ui';
import { audit } from '@/db/audit';
import { writeSetting } from '@/db/settings';
import { logError } from '@/platform/error-log';

import { disableAppLock, LockGate } from './lock-gate';
import { lockEnabled } from './settings';

const mockLevel = jest.fn<() => Promise<number>>();
const mockAuthenticate = jest.fn<() => Promise<{ success: boolean }>>();
const mockRetry = jest.fn();
let mockLoaded = true;
let mockReadError: Error | undefined;
jest.mock('expo-local-authentication', () => ({
  SecurityLevel: { NONE: 0 },
  getEnrolledLevelAsync: () => mockLevel(),
  authenticateAsync: () => mockAuthenticate(),
}));
jest.mock('@expo/vector-icons/Ionicons', () => 'Ionicons');
jest.mock('@/components/ui', () => ({ Button: 'Button', Column: 'Column', Text: 'Text' }));
jest.mock('@/components/feedback', () => ({ alertError: jest.fn(), notify: jest.fn() }));
jest.mock('@/components/error-notice', () => ({ ErrorNotice: 'ErrorNotice' }));
jest.mock('@/db/audit', () => ({ audit: jest.fn() }));
jest.mock('@/db/settings', () => ({ writeSetting: jest.fn() }));
jest.mock('@/db/use-setting', () => ({
  useSetting: (setting: { key: string }) => ({
    value: setting.key === 'lock.enabled' ? true : 60,
    loaded: mockLoaded,
    error: mockReadError,
    retry: mockRetry,
  }),
}));
jest.mock('@/features/lock/settings', () => ({
  lockEnabled: { key: 'lock.enabled' },
  lockGraceSeconds: { key: 'lock.graceSeconds' },
}));
jest.mock('@/platform/error-log', () => ({ logError: jest.fn() }));
jest.mock('@/theme', () => ({ useTheme: () => ({ colors: {}, spacing: { xxl: 1 } }) }));

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
    tree = create(
      <LockGate>
        <Button label="Content" />
      </LockGate>,
    );
    await settle();
  });
}
const unlockButtons = () => tree!.root.findAllByType(Button).filter((node) => node.props.label === 'باز کردن');
async function unmount() {
  await act(async () => {
    tree?.unmount();
  });
  tree = undefined;
}
beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(writeSetting).mockReset().mockResolvedValue(undefined);
  jest.mocked(audit).mockReset().mockResolvedValue(undefined);
  mockLoaded = true;
  mockReadError = undefined;
  mockLevel.mockReset().mockResolvedValue(1);
  mockAuthenticate.mockReset().mockResolvedValue({ success: true });
});
afterEach(unmount);

describe('optional app lock native failure recovery', () => {
  it.each([false, true])(
    'shows retry instead of a blank or stale lock cover after a read failure (loaded=%s)',
    async (loaded) => {
      mockLoaded = loaded;
      mockReadError = new Error('Lock setting read failed');
      await render();
      const notice = tree!.root.findByType(ErrorNotice);
      expect(notice.props.error).toBe(mockReadError);
      expect(unlockButtons()).toHaveLength(0);
      expect(mockAuthenticate).not.toHaveBeenCalled();
      await act(async () => {
        notice.props.onRetry();
      });
      expect(mockRetry).toHaveBeenCalledTimes(1);
      mockReadError = undefined;
      mockLoaded = true;
      await act(async () => {
        tree!.update(
          <LockGate>
            <Button label="Content" />
          </LockGate>,
        );
        await settle();
      });
      expect(mockAuthenticate).toHaveBeenCalledTimes(1);
      expect(unlockButtons()).toHaveLength(0);
    },
  );

  it('handles a native binding throwing before it returns a promise', async () => {
    const failure = new Error('Native binding is unavailable');
    mockLevel.mockImplementationOnce(() => {
      throw failure;
    });
    await render();
    expect(alertError).toHaveBeenCalledWith('باز کردن قفل کامل نشد', failure);
    expect(unlockButtons()).toHaveLength(1);
    expect(unlockButtons()[0]!.props.loading).toBe(false);
  });

  it.each(['enrollment', 'authentication'])('keeps the cover and permits retry after %s rejection', async (stage) => {
    const failure = new Error('Native lock unavailable');
    if (stage === 'enrollment') mockLevel.mockRejectedValueOnce(failure);
    else mockAuthenticate.mockRejectedValueOnce(failure);
    await render();
    expect(alertError).toHaveBeenCalledWith('باز کردن قفل کامل نشد', failure);
    expect(unlockButtons()).toHaveLength(1);
    expect(unlockButtons()[0]!.props.loading).toBe(false);
    await act(async () => {
      unlockButtons()[0]!.props.onPress();
      await settle();
    });
    expect(unlockButtons()).toHaveLength(0);
    expect(tree!.root.findAllByType(Button).some((node) => node.props.label === 'Content')).toBe(true);
  });

  it('keeps cancelled authentication covered without treating it as a native error', async () => {
    mockAuthenticate.mockResolvedValue({ success: false });
    await render();
    expect(unlockButtons()).toHaveLength(1);
    expect(alertError).not.toHaveBeenCalled();
  });

  it('admits only one prompt while automatic authentication is pending', async () => {
    const pending = deferred<{ success: boolean }>();
    mockAuthenticate.mockReturnValue(pending.promise);
    await render();
    await act(async () => {
      unlockButtons()[0]!.props.onPress();
      unlockButtons()[0]!.props.onPress();
      await settle();
    });
    expect(mockAuthenticate).toHaveBeenCalledTimes(1);
    await act(async () => {
      pending.resolve({ success: true });
      await settle();
    });
    expect(unlockButtons()).toHaveLength(0);
  });

  it('explains missing device lock without trapping the owner behind the cover', async () => {
    mockLevel.mockResolvedValue(0);
    await render();
    expect(mockAuthenticate).not.toHaveBeenCalled();
    expect(notify).toHaveBeenCalledTimes(1);
    expect(unlockButtons()).toHaveLength(0);
  });

  it('does not open a native prompt after its owner has unmounted', async () => {
    const pending = deferred<number>();
    mockLevel.mockReturnValue(pending.promise);
    await render();
    await unmount();
    await act(async () => {
      pending.resolve(1);
      await settle();
    });
    expect(mockAuthenticate).not.toHaveBeenCalled();
    expect(alertError).not.toHaveBeenCalled();
  });

  it('records a late native failure without showing an orphaned alert', async () => {
    const pending = deferred<number>();
    mockLevel.mockReturnValue(pending.promise);
    await render();
    await unmount();
    const failure = new Error('Late native lock failure');
    await act(async () => {
      pending.reject(failure);
      await settle();
    });
    expect(alertError).not.toHaveBeenCalled();
    expect(logError).toHaveBeenCalledWith(failure, { source: 'handled', context: 'باز کردن قفل کامل نشد' });
  });
});

describe('explicit optional-lock removal after device credentials change', () => {
  it('turns off with no device screen lock instead of silently ignoring the owner', async () => {
    mockLevel.mockResolvedValue(0);
    mockAuthenticate.mockResolvedValue({ success: false });
    await expect(disableAppLock()).resolves.toBe(true);
    expect(mockAuthenticate).not.toHaveBeenCalled();
    expect(writeSetting).toHaveBeenCalledWith(lockEnabled, false);
    expect(audit).toHaveBeenCalledWith('lock.disabled');
  });

  it('still requires authentication on an enrolled phone and preserves a canceled change', async () => {
    mockLevel.mockResolvedValue(1);
    mockAuthenticate.mockResolvedValue({ success: false });
    await expect(disableAppLock()).resolves.toBe(false);
    expect(mockLevel).toHaveBeenCalledTimes(1);
    expect(mockAuthenticate).toHaveBeenCalledTimes(1);
    expect(writeSetting).not.toHaveBeenCalled();
    expect(audit).not.toHaveBeenCalled();
  });

  it('does not mistake an enrollment read failure for missing device credentials', async () => {
    const failure = new Error('Device enrollment read failed');
    mockLevel.mockRejectedValue(failure);
    await expect(disableAppLock()).rejects.toBe(failure);
    expect(mockAuthenticate).not.toHaveBeenCalled();
    expect(writeSetting).not.toHaveBeenCalled();
    expect(audit).not.toHaveBeenCalled();
  });

  it('awaits the enrolled setting write and existing best-effort audit call', async () => {
    await expect(disableAppLock()).resolves.toBe(true);
    expect(mockAuthenticate).toHaveBeenCalledTimes(1);
    expect(writeSetting).toHaveBeenCalledWith(lockEnabled, false);
    expect(audit).toHaveBeenCalledWith('lock.disabled');
  });

  // Real audit() is best effort. A rejecting stand-in tests defensive propagation,
  // not persisted audit rollback or stronger production acknowledgment.
  it.each(['write', 'audit'] as const)('propagates an unexpected %s helper rejection', async (stage) => {
    const failure = new Error('Lock acknowledgment failed');
    mockLevel.mockResolvedValue(0);
    if (stage === 'write') jest.mocked(writeSetting).mockRejectedValue(failure);
    else jest.mocked(audit).mockRejectedValue(failure);
    await expect(disableAppLock()).rejects.toBe(failure);
    expect(mockAuthenticate).not.toHaveBeenCalled();
    if (stage === 'write') expect(audit).not.toHaveBeenCalled();
    else expect(writeSetting).toHaveBeenCalledWith(lockEnabled, false);
  });
});
