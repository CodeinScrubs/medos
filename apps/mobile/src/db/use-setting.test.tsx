import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { useEffect } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { z } from 'zod';

import { useTestDatabase } from '@/test/db-client';
import { createTestDatabase } from '@/test/sqljs';

import { defineSetting } from './settings';
import { useSetting } from './use-setting';

jest.mock('@/db/client', () => jest.requireActual('@/test/db-client'));
const mockRetry = jest.fn();
let mockData: { value: string | null }[] | undefined;
let mockError: Error | undefined;
jest.mock('./use-live', () => ({ useLive: () => ({ data: mockData, error: mockError, retry: mockRetry }) }));

const setting = defineSetting('test.preference', z.boolean(), false);
let tree: ReactTestRenderer | undefined;
let observed: ReturnType<typeof useSetting<boolean>>;
function Probe() {
  const value = useSetting(setting);
  useEffect(() => {
    observed = value;
  }, [value]);
  return null;
}
async function render() {
  await act(async () => {
    tree = create(<Probe />);
  });
}
beforeEach(async () => {
  useTestDatabase(await createTestDatabase());
  mockData = undefined;
  mockError = undefined;
  jest.clearAllMocks();
});
afterEach(async () => {
  await act(async () => {
    tree?.unmount();
  });
  tree = undefined;
});

describe('typed setting read acknowledgement', () => {
  it('exposes initial failure and the original live-query retry instead of disguising it as a loaded default', async () => {
    mockError = new Error('Setting read failed');
    await render();
    expect(observed.loaded).toBe(false);
    expect(observed.value).toBe(false);
    expect(observed.error).toBe(mockError);
    observed.retry();
    expect(mockRetry).toHaveBeenCalledTimes(1);
  });
  it('retains the last value and failed-refresh evidence together', async () => {
    mockData = [{ value: 'true' }];
    mockError = new Error('Refresh failed');
    await render();
    expect(observed.loaded).toBe(true);
    expect(observed.value).toBe(true);
    expect(observed.error).toBe(mockError);
  });
  it('distinguishes a successful empty read from an unresolved preference', async () => {
    await render();
    expect(observed.loaded).toBe(false);
    mockData = [];
    await act(async () => {
      tree!.update(<Probe />);
    });
    expect(observed.loaded).toBe(true);
    expect(observed.value).toBe(false);
    expect(observed.error).toBeUndefined();
  });
});
