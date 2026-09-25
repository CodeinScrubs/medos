import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { Button, Text } from '@/components/ui';
import { logError } from '@/platform/error-log';

import { ErrorNotice } from './error-notice';

jest.mock('@/components/ui', () => ({ Button: 'Button', Card: 'Card', Column: 'Column', Row: 'Row', Text: 'Text' }));
jest.mock('@/theme', () => ({ useTheme: () => ({ colors: {}, spacing: {} }) }));
jest.mock('@/platform/error-log', () => ({ logError: jest.fn() }));
let tree: ReactTestRenderer;
afterEach(async () => {
  await act(async () => {
    tree?.unmount();
  });
  jest.clearAllMocks();
});
const visibleText = () =>
  tree.root
    .findAllByType(Text)
    .map((node) => node.props.children)
    .join(' ');

describe('compact read failure notice', () => {
  it('offers retry and reveals only redacted diagnostics on request', async () => {
    const error = new Error('Failed query: example params: synthetic-secret\ncontinued');
    const retry = jest.fn();
    await act(async () => {
      tree = create(<ErrorNotice error={error} what="فهرست" onRetry={retry} />);
    });
    expect(visibleText()).not.toContain('Failed query');
    expect(logError).toHaveBeenCalledWith(error, { source: 'handled', context: 'فهرست' });
    await act(async () => {
      tree.root
        .findAllByType(Button)
        .find((b) => b.props.label === 'تلاش دوباره')!
        .props.onPress();
    });
    expect(retry).toHaveBeenCalledTimes(1);
    await act(async () => {
      tree.root
        .findAllByType(Button)
        .find((b) => b.props.label === 'جزئیات')!
        .props.onPress();
    });
    expect(visibleText()).toContain('Failed query: example params: [redacted]');
    expect(visibleText()).not.toContain('synthetic-secret');
    expect(visibleText()).not.toContain('continued');
    await act(async () => {
      tree.update(<ErrorNotice error={undefined} what="فهرست" onRetry={retry} />);
    });
    expect(tree.toJSON()).toBeNull();
  });
});
