import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { useState, type ReactNode } from 'react';
import { ActivityIndicator } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { EditGate } from './edit-gate';
import { ErrorNotice } from './error-notice';
import { EmptyState, Input } from './ui';

jest.mock('expo-router', () => ({ useRouter: () => ({ back: jest.fn() }) }));
jest.mock('@/theme', () => ({ useTheme: () => ({ colors: {}, spacing: {} }) }));
jest.mock('./ui', () => ({ Button: 'Button', EmptyState: 'EmptyState', Input: 'Input', Screen: 'Screen' }));
jest.mock('./error-notice', () => ({ ErrorNotice: 'ErrorNotice' }));

let tree: ReactTestRenderer;
afterEach(async () => {
  await act(async () => {
    tree?.unmount();
  });
});
type Row = { id: string; text: string };
function Form({ row, notice }: { row: Row | null; notice: ReactNode }) {
  const [text, setText] = useState(row?.text ?? '');
  return (
    <>
      {notice}
      <Input value={text} onChangeText={setText} />
    </>
  );
}
const retry = jest.fn();
function Screen({ rows, error, editing = true }: { rows?: Row[]; error?: Error; editing?: boolean }) {
  return (
    <EditGate editing={editing} rows={rows} error={error} onRetry={retry} what="رکورد">
      {(row, notice) => <Form row={row} notice={notice} />}
    </EditGate>
  );
}

describe('edit read gate', () => {
  it.each([undefined, []] as (Row[] | undefined)[])(
    'offers retry on failed initial or cached-empty reads (%s)',
    async (rows) => {
      retry.mockClear();
      const error = new Error('Synthetic read failure');
      await act(async () => {
        tree = create(<Screen rows={rows} error={error} />);
      });
      expect(tree.root.findAllByType(ActivityIndicator)).toHaveLength(0);
      expect(tree.root.findAllByType(EmptyState)).toHaveLength(0);
      expect(tree.root.findAllByType(Input)).toHaveLength(0);
      expect(tree.root.findByType(ErrorNotice).props.error).toBe(error);
      await act(async () => {
        tree.root.findByType(ErrorNotice).props.onRetry();
      });
      expect(retry).toHaveBeenCalledTimes(1);
    },
  );

  it('retains typed text through refresh failure and successful retry', async () => {
    const row = { id: 'example', text: 'Original' };
    await act(async () => {
      tree = create(<Screen rows={[row]} />);
    });
    await act(async () => {
      tree.root.findByType(Input).props.onChangeText('Latest unsaved text');
    });
    await act(async () => {
      tree.update(<Screen rows={[row]} error={new Error('Read failed')} />);
    });
    expect(tree.root.findByType(Input).props.value).toBe('Latest unsaved text');
    expect(tree.root.findByType(ErrorNotice).props.error).toBeInstanceOf(Error);
    await act(async () => {
      tree.update(<Screen rows={[{ ...row, text: 'Refreshed database text' }]} />);
    });
    expect(tree.root.findByType(Input).props.value).toBe('Latest unsaved text');
    expect(tree.root.findByType(ErrorNotice).props.error).toBeUndefined();
  });

  it('distinguishes real loading, confirmed absence and a new record', async () => {
    await act(async () => {
      tree = create(<Screen />);
    });
    expect(tree.root.findAllByType(ActivityIndicator)).toHaveLength(1);
    await act(async () => {
      tree.update(<Screen rows={[]} />);
    });
    expect(tree.root.findAllByType(EmptyState)).toHaveLength(1);
    await act(async () => {
      tree.update(<Screen editing={false} error={new Error('Unused edit query')} />);
    });
    expect(tree.root.findByType(Input).props.value).toBe('');
    expect(tree.root.findAllByType(ErrorNotice)).toHaveLength(0);
  });
});
