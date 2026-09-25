import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { useEffect } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { useLive } from './use-live';

let mockChange: (event: { tableName: string }) => void;
const mockRemove = jest.fn();
jest.mock('expo-sqlite', () => ({
  addDatabaseChangeListener: (listener: typeof mockChange) => {
    mockChange = listener;
    return { remove: mockRemove };
  },
}));
jest.mock('./query-tables', () => ({ tablesOf: () => ['example', 'joined'] }));

let tree: ReactTestRenderer;
let result: ReturnType<typeof useLive<string>>;
const fetchRows = jest.fn<() => Promise<string[]>>();
const query = { then: ((resolve, reject) => fetchRows().then(resolve, reject)) as Promise<string[]>['then'] };
function Harness({ identity = 'one' }: { identity?: string }) {
  const current = useLive(query, [identity]);
  useEffect(() => {
    result = current;
  }, [current]);
  return null;
}
async function settle() {
  for (let i = 0; i < 20; i++) await Promise.resolve();
}
async function mount() {
  await act(async () => {
    tree = create(<Harness />);
    await settle();
  });
}
beforeEach(() => {
  jest.useFakeTimers();
  fetchRows.mockReset();
  mockRemove.mockClear();
});
afterEach(async () => {
  await act(async () => {
    tree?.unmount();
    await settle();
  });
  jest.useRealTimers();
});

describe('live-query recovery', () => {
  it('reports a synchronous query exception and can retry it', async () => {
    const error = new Error('synthetic synchronous failure');
    fetchRows
      .mockImplementationOnce(() => {
        throw error;
      })
      .mockResolvedValueOnce(['recovered']);
    await mount();
    expect(result.error).toBe(error);
    await act(async () => {
      result.retry();
      await settle();
    });
    expect(result.data).toEqual(['recovered']);
    expect(result.error).toBeUndefined();
  });

  it('ignores a late result from an old dependency and disables retry after unmount', async () => {
    let finish!: (rows: string[]) => void;
    fetchRows
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finish = resolve;
          }),
      )
      .mockResolvedValueOnce(['current']);
    await mount();
    await act(async () => {
      tree.update(<Harness identity="two" />);
      await settle();
    });
    await act(async () => {
      finish(['old']);
      await settle();
    });
    expect(result.data).toEqual(['current']);
    const retry = result.retry;
    await act(async () => {
      tree.unmount();
      await settle();
    });
    await act(async () => {
      retry();
      await settle();
    });
    expect(fetchRows).toHaveBeenCalledTimes(2);
    expect(mockRemove).toHaveBeenCalledTimes(2);
  });

  it('recovers an initial failure by explicit retry without requiring any database write', async () => {
    const error = new Error('synthetic read failure');
    fetchRows.mockRejectedValueOnce(error).mockResolvedValueOnce(['recovered']);
    await mount();
    expect(result).toMatchObject({ data: undefined, error, loading: false });
    expect(typeof result.retry).toBe('function');
    await act(async () => {
      result.retry();
      await settle();
    });
    expect(result).toMatchObject({ data: ['recovered'], error: undefined, loading: false });
    expect(fetchRows).toHaveBeenCalledTimes(2);
  });

  it('keeps loaded rows after a joined-table refresh fails, and retry clears the error', async () => {
    fetchRows
      .mockResolvedValueOnce(['stored'])
      .mockRejectedValueOnce(new Error('synthetic failure'))
      .mockResolvedValueOnce(['new']);
    await mount();
    await act(async () => {
      mockChange({ tableName: 'joined' });
      jest.advanceTimersByTime(60);
      await settle();
    });
    expect(result.data).toEqual(['stored']);
    expect(result.error).toBeInstanceOf(Error);
    await act(async () => {
      result.retry();
      await settle();
    });
    expect(result.data).toEqual(['new']);
    expect(result.error).toBeUndefined();
  });

  it('coalesces retries during an in-flight read rather than starting overlapping reads', async () => {
    let finish!: (rows: string[]) => void;
    fetchRows
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finish = resolve;
          }),
      )
      .mockResolvedValueOnce(['latest']);
    await mount();
    await act(async () => {
      result.retry();
      result.retry();
      result.retry();
      await settle();
    });
    expect(fetchRows).toHaveBeenCalledTimes(1);
    await act(async () => {
      finish(['first']);
      await settle();
    });
    expect(fetchRows).toHaveBeenCalledTimes(2);
    expect(result.data).toEqual(['latest']);
  });
});
