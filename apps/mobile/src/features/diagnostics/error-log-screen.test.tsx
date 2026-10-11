import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import * as Sharing from 'expo-sharing';
import { StrictMode } from 'react';
import { Alert } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { ErrorNotice } from '@/components/error-notice';
import { alertError, notify } from '@/components/feedback';
import { Button, EmptyState, Text } from '@/components/ui';
import {
  clearErrorLog,
  logError,
  prepareErrorLogShare,
  readErrorLog,
  retainErrorLogShare,
  type ErrorLogSnapshot,
} from '@/platform/error-log';

import { ErrorLogScreen } from './error-log-screen';

jest.mock('@/components/ui', () => ({
  Badge: 'Badge',
  Button: 'Button',
  Card: 'Card',
  Column: 'Column',
  Divider: 'Divider',
  EmptyState: 'EmptyState',
  Row: 'Row',
  Screen: 'Screen',
  Text: 'Text',
}));
jest.mock('@/components/error-notice', () => ({ ErrorNotice: 'ErrorNotice' }));
jest.mock('@/components/feedback', () => ({ alertError: jest.fn(), notify: jest.fn() }));
jest.mock('@/theme', () => ({ useTheme: () => ({ spacing: { md: 8 } }) }));
jest.mock('expo-sharing', () => ({ isAvailableAsync: jest.fn(), shareAsync: jest.fn() }));
let mockFocused = true;
jest.mock('expo-router/react-navigation', () => ({ useNavigation: () => ({ isFocused: () => mockFocused }) }));
jest.mock('@/platform/error-log', () => ({
  clearErrorLog: jest.fn(),
  logError: jest.fn(),
  readErrorLog: jest.fn(),
  prepareErrorLogShare: jest.fn(),
  retainErrorLogShare: jest.fn(),
}));
const snapshot: ErrorLogSnapshot = {
  entries: [
    {
      version: 2,
      at: '2026-01-01T00:00:00.000Z',
      source: 'handled',
      diagnostic: { kind: 'Error', frames: [], detailsOmitted: true, framesOmitted: false },
    },
  ],
  incomplete: false,
  legacyConverted: 0,
  skippedInWindow: 0,
  earlierBytesOmitted: false,
  writeFailureObserved: false,
};
let tree: ReactTestRenderer;
beforeEach(() => {
  mockFocused = true;
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  jest.mocked(readErrorLog).mockReturnValue({ status: 'ok', snapshot });
  jest.mocked(prepareErrorLogShare).mockReturnValue('file:///safe-immutable.json');
  jest.mocked(retainErrorLogShare).mockImplementation(() => () => {});
  jest.mocked(Sharing.isAvailableAsync).mockResolvedValue(true);
  jest.mocked(Sharing.shareAsync).mockResolvedValue(undefined);
});
afterEach(async () => {
  await act(async () => tree?.unmount());
  jest.resetAllMocks();
  jest.restoreAllMocks();
});
async function mount(strict = false) {
  await act(async () => {
    tree = create(
      strict ? (
        <StrictMode>
          <ErrorLogScreen />
        </StrictMode>
      ) : (
        <ErrorLogScreen />
      ),
    );
  });
}
function press(label: string) {
  return tree.root.findAllByType(Button).find((node) => node.props.label === label)!.props.onPress as () => void;
}
function confirm() {
  return jest
    .mocked(Alert.alert)
    .mock.calls.at(-1)![2]!
    .find((choice) => choice.style === 'destructive')!.onPress!;
}

describe('owned diagnostic share and clear', () => {
  it('accepts one new action after React effect replay and settles its latch', async () => {
    await mount(true);
    await act(async () => {
      const share = press('ارسال گزارش');
      share();
      share();
    });
    expect(Sharing.shareAsync).toHaveBeenCalledTimes(1);
    await act(async () => press('پاک کردن')());
    await act(async () => confirm()());
    expect(clearErrorLog).toHaveBeenCalledTimes(1);
    expect(tree.root.findAllByType(EmptyState)).toHaveLength(1);
  });
  it('retains an offered snapshot until native completion after unmount', async () => {
    const release = jest.fn();
    jest.mocked(retainErrorLogShare).mockReturnValueOnce(release);
    let finish!: () => void;
    jest.mocked(Sharing.shareAsync).mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    await mount();
    await act(async () => press('ارسال گزارش')());
    expect(retainErrorLogShare).toHaveBeenCalledWith('file:///safe-immutable.json');
    await act(async () => tree.unmount());
    expect(release).not.toHaveBeenCalled();
    await act(async () => finish());
    expect(release).toHaveBeenCalledTimes(1);
  });
  it.each(['availability', 'prepare', 'native'])(
    'handles %s rejection and retains a successful retry',
    async (stage) => {
      await mount();
      const error = new Error('SYNTHETIC_FAILURE');
      if (stage === 'availability') jest.mocked(Sharing.isAvailableAsync).mockRejectedValueOnce(error);
      if (stage === 'prepare')
        jest.mocked(prepareErrorLogShare).mockImplementationOnce(() => {
          throw error;
        });
      if (stage === 'native') jest.mocked(Sharing.shareAsync).mockRejectedValueOnce(error);
      await act(async () => press('ارسال گزارش')());
      expect(alertError).toHaveBeenCalledWith('ارسال گزارش کامل نشد', error);
      await act(async () => press('ارسال گزارش')());
      expect(Sharing.shareAsync).toHaveBeenCalledWith(
        'file:///safe-immutable.json',
        expect.objectContaining({ mimeType: 'application/json' }),
      );
      expect(clearErrorLog).not.toHaveBeenCalled();
      expect(notify).not.toHaveBeenCalled();
    },
  );
  it('reports unavailable without asserting delivery or losing retry', async () => {
    await mount();
    jest.mocked(Sharing.isAvailableAsync).mockResolvedValueOnce(false);
    await act(async () => press('ارسال گزارش')());
    expect(notify).toHaveBeenCalledTimes(1);
    expect(Sharing.shareAsync).not.toHaveBeenCalled();
    await act(async () => press('ارسال گزارش')());
    expect(Sharing.shareAsync).toHaveBeenCalledTimes(1);
    expect(notify).toHaveBeenCalledTimes(1);
  });
  it('coalesces same-turn share and blocks clear while availability is pending', async () => {
    let finish!: (available: boolean) => void;
    jest.mocked(Sharing.isAvailableAsync).mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    await mount();
    const share = press('ارسال گزارش');
    const clear = press('پاک کردن');
    await act(async () => {
      share();
      share();
      clear();
    });
    expect(Sharing.isAvailableAsync).toHaveBeenCalledTimes(1);
    expect(Alert.alert).not.toHaveBeenCalled();
    await act(async () => finish(true));
    expect(Sharing.shareAsync).toHaveBeenCalledTimes(1);
  });
  it.each(['unmount', 'blur'])('refuses retained share and a late availability result after %s', async (departure) => {
    let finish!: (available: boolean) => void;
    jest.mocked(Sharing.isAvailableAsync).mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    await mount();
    const share = press('ارسال گزارش');
    await act(async () => share());
    if (departure === 'unmount') await act(async () => tree.unmount());
    else mockFocused = false;
    await act(async () => {
      share();
      finish(true);
    });
    expect(Sharing.isAvailableAsync).toHaveBeenCalledTimes(1);
    expect(prepareErrorLogShare).not.toHaveBeenCalled();
    expect(Sharing.shareAsync).not.toHaveBeenCalled();
  });
  it('keeps late native rejection quiet over a different route', async () => {
    let reject!: (error: Error) => void;
    jest.mocked(Sharing.shareAsync).mockReturnValueOnce(
      new Promise((_, failure) => {
        reject = failure;
      }),
    );
    await mount();
    await act(async () => press('ارسال گزارش')());
    mockFocused = false;
    const failure = new Error('SYNTHETIC_LATE_FAILURE');
    await act(async () => reject(failure));
    expect(alertError).not.toHaveBeenCalled();
    expect(logError).toHaveBeenCalledWith(failure, { source: 'handled', context: 'diagnostics.share' });
  });
  it('shows read failure with retry instead of claiming an empty log', async () => {
    jest.mocked(readErrorLog).mockReturnValueOnce({ status: 'error', error: new Error('SYNTHETIC_READ_FAILURE') });
    await mount();
    expect(tree.root.findAllByType(EmptyState)).toHaveLength(0);
    await act(async () => tree.root.findByType(ErrorNotice).props.onRetry());
    expect(tree.root.findByType(ErrorNotice).props.error).toBeUndefined();
    expect(
      tree.root
        .findAllByType(Text)
        .map((node) => node.props.children)
        .join(' '),
    ).toContain('Arbitrary error text omitted');
  });
  it('does not falsely clear entries after deletion failure; a new prompt retries once', async () => {
    await mount();
    jest.mocked(clearErrorLog).mockImplementationOnce(() => {
      throw new Error('SYNTHETIC_DELETE_FAILURE');
    });
    await act(async () => press('پاک کردن')());
    await act(async () => confirm()());
    expect(alertError).toHaveBeenCalledWith('پاک کردن گزارش انجام نشد', expect.any(Error));
    expect(tree.root.findAllByType(EmptyState)).toHaveLength(0);
    await act(async () => press('پاک کردن')());
    const accepted = confirm();
    await act(async () => {
      accepted();
      accepted();
    });
    expect(clearErrorLog).toHaveBeenCalledTimes(2);
    expect(tree.root.findAllByType(EmptyState)).toHaveLength(1);
  });
  it.each(['unmount', 'blur'])('does not consume an old destructive confirmation after %s', async (departure) => {
    await mount();
    await act(async () => press('پاک کردن')());
    const accepted = confirm();
    if (departure === 'unmount') await act(async () => tree.unmount());
    else mockFocused = false;
    await act(async () => accepted());
    expect(clearErrorLog).not.toHaveBeenCalled();
  });
});
