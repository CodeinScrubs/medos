import { describe, expect, it, jest } from '@jest/globals';
import { AppState, type AppStateStatus } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { logError } from '@/platform/error-log';

import { markStaleRunsFailed, runAutoBackupIfDue } from './engine';
import { useAutoBackup } from './use-auto-backup';

jest.mock('./engine', () => ({ markStaleRunsFailed: jest.fn(), runAutoBackupIfDue: jest.fn() }));
jest.mock('@/platform/error-log', () => ({ logError: jest.fn() }));

function StartupBackup() {
  useAutoBackup();
  return null;
}

describe('automatic backup triggers', () => {
  it('reports startup and foreground read failures, then accepts a later retry', async () => {
    jest.useFakeTimers();
    let tree: ReactTestRenderer | undefined;
    let change: ((status: AppStateStatus) => void) | undefined;
    const remove = jest.fn();
    const listen = jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, handler) => {
      change = handler;
      return { remove };
    });
    const cleanup = new Error('Synthetic stale-run failure');
    const read = new Error('Synthetic settings read failure');
    const check = jest.mocked(runAutoBackupIfDue);
    jest.mocked(markStaleRunsFailed).mockRejectedValueOnce(cleanup);
    check.mockRejectedValueOnce(read).mockRejectedValueOnce(read).mockResolvedValueOnce('done');
    try {
      await act(async () => {
        tree = create(<StartupBackup />);
      });
      await act(async () => {
        await jest.advanceTimersByTimeAsync(4000);
      });
      expect(logError).toHaveBeenNthCalledWith(1, cleanup, {
        source: 'handled',
        context: 'checking automatic backup',
      });
      expect(logError).toHaveBeenNthCalledWith(2, read, {
        source: 'handled',
        context: 'checking automatic backup',
      });
      await act(async () => change?.('background'));
      expect(check).toHaveBeenCalledTimes(1);
      await act(async () => change?.('active'));
      expect(logError).toHaveBeenCalledTimes(3);
      await act(async () => change?.('active'));
      expect(check).toHaveBeenCalledTimes(3);
      expect(logError).toHaveBeenCalledTimes(3);
    } finally {
      await act(async () => tree?.unmount());
      listen.mockRestore();
      jest.useRealTimers();
    }
    expect(remove).toHaveBeenCalledTimes(1);
  });
});
