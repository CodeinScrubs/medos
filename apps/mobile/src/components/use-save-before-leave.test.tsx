import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { Alert } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { DatasetChangedError, reserveDatasetReplacement } from '@/lib/dataset-write';

import { alertError } from './feedback';
import { useSaveBeforeLeave } from './use-save-before-leave';

let mockRemove: (event: { data: { action: object } }) => void;
const mockDispatch = jest.fn();
jest.mock('expo-router/react-navigation', () => ({
  useNavigation: () => ({ dispatch: mockDispatch }),
  usePreventRemove: (_enabled: boolean, callback: typeof mockRemove) => {
    mockRemove = callback;
  },
}));
jest.mock('./feedback', () => ({ alertError: jest.fn(), notify: jest.fn() }));
let tree: ReactTestRenderer | undefined;
const action = { type: 'GO_BACK' };
function Guard({ flush }: { flush: () => Promise<boolean> }) {
  useSaveBeforeLeave(flush);
  return null;
}
async function settle() {
  for (let i = 0; i < 12; i++) await Promise.resolve();
}
function commit() {
  const replacement = reserveDatasetReplacement();
  replacement.committed();
  replacement.release();
}
afterEach(() => {
  act(() => tree?.unmount());
  tree = undefined;
  jest.restoreAllMocks();
  mockDispatch.mockClear();
});

describe('stable removal guard for old editing intents', () => {
  it('permits confirmed local-only exit without flushing stale writers, including a form whose initial read is pending', async () => {
    const flush = jest.fn(async () => false);
    const dialog = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    await act(async () => {
      tree = create(<Guard flush={flush} />);
    });
    await act(async () => {
      commit();
      mockRemove({ data: { action } });
    });
    expect(flush).not.toHaveBeenCalled();
    expect(mockDispatch).not.toHaveBeenCalled();
    const close = dialog.mock.calls.at(-1)![2]!.find((item) => item.text === 'بستن فرم')!;
    await act(async () => {
      close.onPress!();
    });
    expect(mockDispatch).toHaveBeenCalledWith(action);
    expect(flush).not.toHaveBeenCalled();
  });

  it('does not silently leave when the generation changes while a clean flush is resolving', async () => {
    let finish!: (value: boolean) => void;
    const flush = jest.fn(
      () =>
        new Promise<boolean>((resolve) => {
          finish = resolve;
        }),
    );
    await act(async () => {
      tree = create(<Guard flush={flush} />);
    });
    await act(async () => {
      mockRemove({ data: { action } });
    });
    await act(async () => {
      commit();
      finish(true);
      await settle();
    });
    expect(mockDispatch).not.toHaveBeenCalled();
    expect(alertError).toHaveBeenCalledWith('ذخیره نشد', expect.any(DatasetChangedError));
  });
});
