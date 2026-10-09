import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { StackNavigationState } from 'expo-router/build/react-navigation/routers/StackRouter';
import { Alert } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { DatasetChangedError, reserveDatasetReplacement } from '@/lib/dataset-write';

import { alertError, notify } from './feedback';
import { useSaveBeforeLeave } from './use-save-before-leave';

// Exercise the router actually bundled by Expo Router, not a stand-in POP.
const { StackRouter, StackActions } = jest.requireActual<
  typeof import('expo-router/build/react-navigation/routers/StackRouter')
>('expo-router/build/react-navigation/routers/StackRouter');

let mockRemove: (event: { data: { action: object } }) => void;
type RouterAction = Parameters<ReturnType<typeof StackRouter>['getStateForAction']>[1];
const mockDispatch = jest.fn<(action: RouterAction) => void>();
let mockFocused = true;
let mockStack: StackNavigationState<Record<string, object | undefined>>;
jest.mock('expo-router/react-navigation', () => ({
  useNavigation: () => ({ dispatch: mockDispatch, isFocused: () => mockFocused, getState: () => mockStack }),
  usePreventRemove: (_enabled: boolean, callback: typeof mockRemove) => {
    mockRemove = callback;
  },
}));
jest.mock('./feedback', () => ({ alertError: jest.fn(), notify: jest.fn() }));
let tree: ReactTestRenderer | undefined;
const action = { type: 'GO_BACK' } as const;
const router = StackRouter({});
const options = { routeNames: ['Root', 'Editor', 'Notice'], routeParamList: {}, routeGetIdList: {} };
function transition(action: Parameters<typeof router.getStateForAction>[1]) {
  const next = router.getStateForAction(mockStack, action, options);
  if (!next || next.stale !== false) throw new Error('Expected an actual initialized stack transition');
  mockStack = next;
}
function pendingFlush() {
  let finish!: (value: boolean) => void;
  const flush = jest.fn(() => new Promise<boolean>((resolve) => (finish = resolve)));
  return { flush, finish: (value: boolean) => finish(value) };
}
function Guard({ flush }: { flush: () => Promise<boolean> }) {
  useSaveBeforeLeave(flush);
  return null;
}
async function renderGuard(flush: () => Promise<boolean>) {
  await act(async () => {
    tree = create(<Guard flush={flush} />);
  });
}
async function settle() {
  for (let i = 0; i < 12; i++) await Promise.resolve();
}
function commit() {
  const replacement = reserveDatasetReplacement();
  replacement.committed();
  replacement.release();
}

beforeEach(() => {
  mockFocused = true;
  mockStack = {
    stale: false,
    type: 'stack',
    key: 'qa-stack',
    index: 1,
    routeNames: options.routeNames,
    routes: [
      { key: 'qa-root', name: 'Root' },
      { key: 'qa-editor', name: 'Editor' },
    ],
    preloadedRoutes: [],
  };
});
afterEach(() => {
  act(() => tree?.unmount());
  tree = undefined;
  jest.restoreAllMocks();
  mockDispatch.mockReset();
  jest.mocked(alertError).mockClear();
  jest.mocked(notify).mockClear();
});

describe('stable removal guard for old editing intents', () => {
  it('pins the source only for a targeted header action; a targetless root Back otherwise pops the newer route', () => {
    transition(StackActions.push('Notice'));
    const rootBack = router.getStateForAction(mockStack, { ...action, source: 'qa-editor' }, options)!;
    expect(rootBack.routes.map((route) => route.name)).toEqual(['Root', 'Editor']);
    const headerBack = router.getStateForAction(
      mockStack,
      { ...StackActions.pop(), source: 'qa-editor', target: mockStack.key },
      options,
    )!;
    expect(headerBack.routes.map((route) => route.name)).toEqual(['Root', 'Notice']);
  });

  it.each([
    ['system Back', action],
    ['targeted header Back', { ...StackActions.pop(), source: 'qa-editor', target: 'qa-stack' }],
  ])('does not replay %s after a new notification route opens during flush', async (_label, removal) => {
    const pending = pendingFlush();
    mockDispatch.mockImplementation((next) => transition({ ...next, source: next.source ?? 'qa-editor' }));
    await renderGuard(pending.flush);
    await act(async () => {
      mockRemove({ data: { action: removal } });
    });
    transition(StackActions.push('Notice'));
    mockFocused = false;
    await act(async () => {
      pending.finish(true);
      await settle();
    });
    expect(mockDispatch).not.toHaveBeenCalled();
    expect(mockStack.routes.map((route) => route.name)).toEqual(['Root', 'Editor', 'Notice']);
    expect(mockStack.index).toBe(2);
  });

  it('allows unchanged background stack cleanup instead of requiring every removed editor to be focused', async () => {
    transition(StackActions.push('Notice'));
    mockFocused = false;
    const pending = pendingFlush();
    const removal = { ...StackActions.pop(2), source: mockStack.routes[2]!.key, target: mockStack.key };
    mockDispatch.mockImplementation((next) => transition({ ...next, source: next.source ?? 'qa-editor' }));
    await renderGuard(pending.flush);
    await act(async () => {
      mockRemove({ data: { action: removal } });
      pending.finish(true);
      await settle();
    });
    expect(mockDispatch).toHaveBeenCalledWith(removal);
    expect(mockStack.routes.map((route) => route.name)).toEqual(['Root']);
  });

  it('checks the actual stack even if a focus notification has not caught up with a push', async () => {
    const pending = pendingFlush();
    await renderGuard(pending.flush);
    await act(async () => mockRemove({ data: { action } }));
    transition(StackActions.push('Notice'));
    expect(mockFocused).toBe(true);
    await act(async () => {
      pending.finish(true);
      await settle();
    });
    expect(mockDispatch).not.toHaveBeenCalled();
    expect(mockStack.routes.map((route) => route.name)).toEqual(['Root', 'Editor', 'Notice']);
  });

  it('ignores a delayed acknowledgment after unmount', async () => {
    const pending = pendingFlush();
    await renderGuard(pending.flush);
    await act(async () => {
      mockRemove({ data: { action } });
    });
    await act(async () => tree?.unmount());
    tree = undefined;
    await act(async () => {
      pending.finish(true);
      await settle();
    });
    expect(mockDispatch).not.toHaveBeenCalled();
  });

  it('keeps a failed flush on its owner and allows another attempt', async () => {
    const flush = jest.fn(async () => false);
    await renderGuard(flush);
    await act(async () => {
      mockRemove({ data: { action } });
      mockRemove({ data: { action } });
      await settle();
    });
    expect(flush).toHaveBeenCalledTimes(1);
    expect(notify).toHaveBeenCalledTimes(1);
    expect(mockDispatch).not.toHaveBeenCalled();
    flush.mockResolvedValueOnce(true);
    await act(async () => {
      mockRemove({ data: { action } });
      await settle();
    });
    expect(mockDispatch).toHaveBeenCalledWith(action);
  });

  it('does not display a failed-flush dialog on a newer route', async () => {
    const pending = pendingFlush();
    await renderGuard(pending.flush);
    await act(async () => {
      mockRemove({ data: { action } });
    });
    transition(StackActions.push('Notice'));
    mockFocused = false;
    await act(async () => {
      pending.finish(false);
      await settle();
    });
    expect(notify).not.toHaveBeenCalled();
    expect(mockDispatch).not.toHaveBeenCalled();
  });

  it('permits a fresh Back when the owner returns after the earlier action was superseded', async () => {
    const pending = pendingFlush();
    await renderGuard(pending.flush);
    await act(async () => mockRemove({ data: { action } }));
    transition(StackActions.push('Notice'));
    mockFocused = false;
    await act(async () => {
      pending.finish(true);
      await settle();
    });
    expect(mockDispatch).not.toHaveBeenCalled();
    transition(StackActions.pop());
    mockFocused = true;
    await act(async () => mockRemove({ data: { action } }));
    await act(async () => {
      pending.finish(true);
      await settle();
    });
    expect(mockDispatch).toHaveBeenCalledTimes(1);
  });

  it.each(['push', 'unmount', 'restore', 'dismiss'] as const)(
    'does not consume an old-dataset close confirmation after %s',
    async (supersede) => {
      const flush = jest.fn(async () => true);
      const dialog = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
      await renderGuard(flush);
      await act(async () => {
        commit();
        mockRemove({ data: { action } });
      });
      const call = dialog.mock.calls.at(-1)!;
      const close = call[2]!.find((item) => item.text === 'بستن فرم')!;
      if (supersede === 'push') {
        transition(StackActions.push('Notice'));
        mockFocused = false;
      } else if (supersede === 'unmount') {
        await act(async () => tree?.unmount());
        tree = undefined;
      } else if (supersede === 'restore') commit();
      else call[3]!.onDismiss!();
      await act(async () => close.onPress!());
      expect(mockDispatch).not.toHaveBeenCalled();
      expect(flush).not.toHaveBeenCalled();
    },
  );

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

  it('does not let a dismissed confirmation unlock or close a later removal attempt', async () => {
    const flush = jest.fn(async () => true);
    const dialog = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    await renderGuard(flush);
    await act(async () => {
      commit();
      mockRemove({ data: { action } });
    });
    const previous = dialog.mock.calls.at(-1)!;
    await act(async () => previous[3]!.onDismiss!());
    await act(async () => mockRemove({ data: { action } }));
    const current = dialog.mock.calls.at(-1)!;
    await act(async () => {
      previous[3]!.onDismiss!();
      previous[2]!.find((item) => item.text === 'بستن فرم')!.onPress!();
      mockRemove({ data: { action } });
    });
    expect(dialog).toHaveBeenCalledTimes(2);
    expect(mockDispatch).not.toHaveBeenCalled();
    await act(async () => {
      const close = current[2]!.find((item) => item.text === 'بستن فرم')!;
      close.onPress!();
      close.onPress!();
    });
    expect(mockDispatch).toHaveBeenCalledTimes(1);
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
