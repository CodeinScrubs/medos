import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { AppState, type AppStateStatus } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { rescheduleOccasionReminders } from '@/features/doctors/occasions-queries';
import { repairFollowUpReminders } from '@/features/followups/reminder-queries';
import { repairTaskReminders } from '@/features/tasks/reminder-queries';
import { logError } from '@/platform/error-log';

import { useReminderUpkeep } from './use-reminder-upkeep';

jest.mock('@/features/doctors/occasions-queries', () => ({ rescheduleOccasionReminders: jest.fn() }));
jest.mock('@/features/followups/reminder-queries', () => ({ repairFollowUpReminders: jest.fn() }));
jest.mock('@/features/tasks/reminder-queries', () => ({ repairTaskReminders: jest.fn() }));
jest.mock('@/platform/error-log', () => ({ logError: jest.fn() }));
let tree: ReactTestRenderer;
let change: (state: AppStateStatus) => void;
const remove = jest.fn();
function Harness() {
  useReminderUpkeep();
  return null;
}
async function settle() {
  for (let i = 0; i < 12; i++) await Promise.resolve();
}

beforeEach(async () => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  jest.mocked(repairFollowUpReminders).mockResolvedValue(0);
  jest.mocked(repairTaskReminders).mockResolvedValue(0);
  jest.mocked(rescheduleOccasionReminders).mockResolvedValue(0);
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, listener) => {
    change = listener;
    return { remove };
  });
  await act(async () => {
    tree = create(<Harness />);
  });
});
afterEach(async () => {
  await act(async () => {
    tree.unmount();
  });
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe('reminder upkeep', () => {
  it('repairs at startup and on foreground, then detaches its listener', async () => {
    expect(repairFollowUpReminders).not.toHaveBeenCalled();
    await act(async () => {
      jest.advanceTimersByTime(6000);
      await settle();
    });
    expect(repairFollowUpReminders).toHaveBeenCalledTimes(1);
    expect(repairTaskReminders).toHaveBeenCalledTimes(1);
    expect(rescheduleOccasionReminders).toHaveBeenCalledTimes(1);
    await act(async () => {
      change('background');
      change('active');
      await settle();
    });
    expect(repairFollowUpReminders).toHaveBeenCalledTimes(2);
    expect(repairTaskReminders).toHaveBeenCalledTimes(2);
    expect(repairTaskReminders).toHaveBeenLastCalledWith();
    expect(repairFollowUpReminders).toHaveBeenLastCalledWith();
    await act(async () => {
      tree.unmount();
    });
    expect(remove).toHaveBeenCalledTimes(1);
  });

  it('coalesces foreground events during repair and allows retry after failure', async () => {
    let reject!: (error: Error) => void;
    jest.mocked(repairFollowUpReminders).mockImplementationOnce(
      () =>
        new Promise((_resolve, fail) => {
          reject = fail;
        }),
    );
    await act(async () => {
      change('active');
      change('active');
      await settle();
    });
    expect(repairFollowUpReminders).toHaveBeenCalledTimes(1);
    await act(async () => {
      reject(new Error('temporary failure'));
      await settle();
    });
    expect(logError).toHaveBeenCalledTimes(1);
    await act(async () => {
      change('active');
      await settle();
    });
    expect(repairFollowUpReminders).toHaveBeenCalledTimes(2);
  });

  it('waits for task repair when follow-up repair fails before accepting another foreground event', async () => {
    let finish!: (value: number) => void;
    jest.mocked(repairTaskReminders).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    jest.mocked(repairFollowUpReminders).mockRejectedValueOnce(new Error('temporary failure'));
    await act(async () => {
      change('active');
      await settle();
    });
    await act(async () => {
      change('active');
      await settle();
    });
    expect(repairTaskReminders).toHaveBeenCalledTimes(1);
    await act(async () => {
      finish(0);
      await settle();
      change('active');
      await settle();
    });
    expect(repairTaskReminders).toHaveBeenCalledTimes(2);
  });
});
