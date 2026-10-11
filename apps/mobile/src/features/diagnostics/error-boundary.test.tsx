import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import * as Clipboard from 'expo-clipboard';
import { NavigationContext } from 'expo-router/react-navigation';
import { StrictMode } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { alertError } from '@/components/feedback';
import { Button, Text } from '@/components/ui';
import { logError } from '@/platform/error-log';

import { RouteErrorBoundary } from './error-boundary';

jest.mock('expo-router/react-navigation', () => ({
  NavigationContext: jest.requireActual<typeof import('react')>('react').createContext(null),
}));
jest.mock('@expo/vector-icons/Ionicons', () => 'Icon');
jest.mock('@/components/ui', () => ({ Button: 'Button', Column: 'Column', Text: 'Text' }));
jest.mock('@/components/feedback', () => ({ alertError: jest.fn() }));
jest.mock('@/platform/error-log', () => ({ logError: jest.fn() }));
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn() }));
jest.mock('@/theme', () => ({ useTheme: () => ({ colors: {}, spacing: {}, radii: {} }) }));
let tree: ReactTestRenderer;
let focused = true;
const retry = jest.fn<() => Promise<void>>();
beforeEach(() => {
  focused = true;
  jest.mocked(Clipboard.setStringAsync).mockResolvedValue(true);
  retry.mockResolvedValue(undefined);
});
afterEach(async () => {
  await act(async () => tree?.unmount());
  jest.resetAllMocks();
});
async function mount(strict = false) {
  const error = new Error('SYNTHETIC_PRIVATE_CANARY');
  error.stack =
    'Error: SYNTHETIC_PRIVATE_CANARY\n    at SYNTHETIC_PRIVATE_CANARY (address at index.android.bundle:1:77)';
  await act(async () => {
    tree = create(
      <NavigationContext.Provider value={{ isFocused: () => focused } as never}>
        {strict ? (
          <StrictMode>
            <RouteErrorBoundary error={error} retry={retry} />
          </StrictMode>
        ) : (
          <RouteErrorBoundary error={error} retry={retry} />
        )}
      </NavigationContext.Provider>,
    );
  });
}
function copy() {
  return tree.root.findAllByType(Button).find((node) => node.props.label === 'کپی جزئیات خطا')!.props
    .onPress as () => void;
}
describe('content-free owned boundary details', () => {
  it('keeps copy and retry usable after React effect replay', async () => {
    await mount(true);
    await act(async () => copy()());
    expect(Clipboard.setStringAsync).toHaveBeenCalledTimes(1);
    await act(async () =>
      tree.root
        .findAllByType(Button)
        .find((node) => node.props.label === 'تلاش دوباره')!
        .props.onPress(),
    );
    expect(retry).toHaveBeenCalledTimes(1);
  });
  it('reports an unacknowledged clipboard result and keeps retry available', async () => {
    await mount();
    jest.mocked(Clipboard.setStringAsync).mockResolvedValueOnce(false);
    await act(async () => copy()());
    expect(alertError).toHaveBeenCalledWith('کپی جزئیات انجام نشد', expect.any(Error));
    await act(async () => copy()());
    expect(Clipboard.setStringAsync).toHaveBeenCalledTimes(2);
  });
  it('renders/copies only safe details, handles rejection and permits retry', async () => {
    await mount();
    expect(
      tree.root
        .findAllByType(Text)
        .map((node) => node.props.children)
        .join(' '),
    ).not.toContain('SYNTHETIC_PRIVATE_CANARY');
    const failure = new Error('synthetic copy failed');
    jest.mocked(Clipboard.setStringAsync).mockRejectedValueOnce(failure);
    await act(async () => copy()());
    expect(alertError).toHaveBeenCalledWith('کپی جزئیات انجام نشد', failure);
    await act(async () => copy()());
    expect(Clipboard.setStringAsync).toHaveBeenCalledTimes(2);
    expect(jest.mocked(Clipboard.setStringAsync).mock.calls[0]![0]).not.toContain('SYNTHETIC_PRIVATE_CANARY');
    expect(jest.mocked(Clipboard.setStringAsync).mock.calls[0]![0]).toContain('offset 77');
  });
  it('coalesces copy taps and refuses retained callbacks after unmount', async () => {
    let finish!: (success: boolean) => void;
    jest.mocked(Clipboard.setStringAsync).mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    await mount();
    const press = copy();
    await act(async () => {
      press();
      press();
    });
    expect(Clipboard.setStringAsync).toHaveBeenCalledTimes(1);
    await act(async () => tree.unmount());
    await act(async () => {
      press();
      finish(true);
    });
    expect(Clipboard.setStringAsync).toHaveBeenCalledTimes(1);
  });
  it('refuses unfocused callbacks and keeps late clipboard failure quiet', async () => {
    let reject!: (error: Error) => void;
    jest.mocked(Clipboard.setStringAsync).mockReturnValueOnce(
      new Promise((_, failure) => {
        reject = failure;
      }),
    );
    await mount();
    const press = copy();
    await act(async () => press());
    focused = false;
    const failure = new Error('synthetic late copy');
    await act(async () => {
      press();
      reject(failure);
    });
    expect(Clipboard.setStringAsync).toHaveBeenCalledTimes(1);
    expect(alertError).not.toHaveBeenCalled();
    expect(logError).toHaveBeenCalledWith(failure, { source: 'handled', context: 'diagnostics.clipboard' });
  });
});
