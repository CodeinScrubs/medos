import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Alert } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { ErrorNotice } from '@/components/error-notice';
import { alertError } from '@/components/feedback';
import { Button } from '@/components/ui';
import type { RecordingJob } from '@/db/schema';
import { DatasetChangedError, reserveDatasetReplacement } from '@/lib/dataset-write';

import { RecordingRecovery, RecordingRecoveryNotice } from './recording-recovery';

let mockData: { job: RecordingJob; firstName: string | null; lastName: string | null }[] | undefined;
let mockError: Error | undefined;
const mockRetry = jest.fn();
const mockResume = jest.fn<(id: string, now: Date) => Promise<string>>();
const mockDiscard = jest.fn<(id: string, now: Date) => Promise<void>>();
const mockQuery = jest.fn((_target?: unknown, _exclude?: string) => ({ limit: (_limit: number) => ({}) }));
jest.mock('./recording-queries', () => ({
  pendingRecordingsQuery: (target?: unknown, exclude?: string) => mockQuery(target, exclude),
  resumeRecording: (id: string, now: Date) => mockResume(id, now),
  discardRecording: (id: string, now: Date) => mockDiscard(id, now),
}));
jest.mock('@/db/use-live', () => ({ useLive: () => ({ data: mockData, error: mockError, retry: mockRetry }) }));
jest.mock('@/components/ui', () => ({ Button: 'Button', Column: 'Column', Row: 'Row', Text: 'Text' }));
jest.mock('@/components/error-notice', () => ({ ErrorNotice: 'ErrorNotice' }));
jest.mock('@/components/feedback', () => ({ alertError: jest.fn() }));
let tree: ReactTestRenderer;
let dialog: ReturnType<typeof jest.spyOn>;

beforeEach(() => {
  mockData = [
    {
      job: {
        id: 'synthetic-job',
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
        entityType: 'patient',
        entityId: 'synthetic-patient',
        patientId: 'synthetic-patient',
        sourceUri: 'file:///synthetic-cache.m4a',
        capturedAt: new Date(),
        durationMs: 1200,
        relativePath: 'media/imports/synthetic.m4a',
        state: 'ready',
        revision: 2,
        checksum: 'a'.repeat(64),
        sizeBytes: 1234,
        attachmentId: null,
      },
      firstName: 'Synthetic',
      lastName: 'Patient',
    },
  ];
  mockError = undefined;
  mockRetry.mockClear();
  mockQuery.mockClear();
  mockResume.mockReset().mockResolvedValue('synthetic-audio');
  mockDiscard.mockReset().mockResolvedValue(undefined);
  jest.mocked(alertError).mockClear();
  dialog = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});
afterEach(async () => {
  if (tree) await act(async () => tree.unmount());
  dialog.mockRestore();
});
async function render(notice = false, onReview = jest.fn()) {
  await act(async () => {
    tree = create(notice ? <RecordingRecoveryNotice onReview={onReview} /> : <RecordingRecovery />);
  });
}
const action = (label: string) => tree.root.findAllByType(Button).find((b) => b.props.label === label)!.props.onPress;

describe('stopped voice recovery controls', () => {
  it('rejects old retry and already-open discard confirmation callbacks after replacement', async () => {
    await render();
    const retry = action('تلاش دوباره');
    await act(async () => action('صرف‌نظر')());
    const discard = jest.mocked(Alert.alert).mock.calls.at(-1)![2]![1]!.onPress!;
    await act(async () => {
      const replacement = reserveDatasetReplacement();
      replacement.committed();
      replacement.release();
    });
    await act(async () => {
      retry();
      await Promise.resolve();
      await Promise.resolve();
    });
    await act(async () => {
      discard();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(mockResume).not.toHaveBeenCalled();
    expect(mockDiscard).not.toHaveBeenCalled();
    expect(alertError).toHaveBeenCalledWith('وویس ذخیره نشد', expect.any(DatasetChangedError));
    expect(alertError).toHaveBeenCalledWith('پاک‌کردن کپی ناتمام انجام نشد', expect.any(DatasetChangedError));
  });
  it('adds no UI for empty/loading jobs and no banner without an actual pending job', async () => {
    mockData = undefined;
    await render();
    expect(tree.toJSON()).toBeNull();
    mockData = [];
    await act(async () => tree.update(<RecordingRecovery />));
    expect(tree.toJSON()).toBeNull();
    await act(async () => tree.update(<RecordingRecoveryNotice onReview={jest.fn()} />));
    expect(tree.toJSON()).toBeNull();
  });

  it('surfaces failed reads with retry instead of claiming the job list is empty', async () => {
    mockData = undefined;
    mockError = new Error('Synthetic read failure');
    await render();
    expect(tree.root.findByType(ErrorNotice).props.error).toBe(mockError);
    tree.root.findByType(ErrorNotice).props.onRetry();
    expect(mockRetry).toHaveBeenCalledTimes(1);
  });

  it('serializes retry presses and retains the failed item for retry', async () => {
    let reject!: (e: Error) => void;
    mockResume.mockReturnValueOnce(
      new Promise((_resolve, no) => {
        reject = no;
      }),
    );
    await render();
    const retry = action('تلاش دوباره');
    await act(async () => {
      retry();
      retry();
      await Promise.resolve();
    });
    expect(mockResume).toHaveBeenCalledTimes(1);
    expect(mockResume.mock.calls[0]![0]).toBe('synthetic-job');
    await act(async () => {
      reject(new Error('Synthetic write failure'));
      await Promise.resolve();
    });
    expect(alertError).toHaveBeenCalled();
    expect(action('تلاش دوباره')).toBeDefined();
    await act(async () => {
      action('تلاش دوباره')();
      await Promise.resolve();
    });
    expect(mockResume).toHaveBeenCalledTimes(2);
    expect(mockRetry).toHaveBeenCalledTimes(1);
  });

  it('requires explicit confirmation before discarding and retains cleanup failures', async () => {
    await render();
    await act(async () => action('صرف‌نظر')());
    expect(mockDiscard).not.toHaveBeenCalled();
    const choices = jest.mocked(Alert.alert).mock.calls.at(-1)![2]!;
    choices[0]!.onPress?.();
    expect(mockDiscard).not.toHaveBeenCalled();
    mockDiscard.mockRejectedValueOnce(new Error('Synthetic cleanup failure'));
    await act(async () => {
      choices[1]!.onPress?.();
      await Promise.resolve();
    });
    expect(mockDiscard).toHaveBeenCalledTimes(1);
    expect(alertError).toHaveBeenCalled();
    expect(action('صرف‌نظر')).toBeDefined();
  });

  it('offers only cleanup for an already cancelled job', async () => {
    mockData![0]!.job.state = 'discarding';
    mockData![0]!.job.deletedAt = new Date();
    await render();
    expect(tree.root.findAllByType(Button).map((b) => b.props.label)).toEqual(['تکمیل حذف کپی']);
    await act(async () => {
      action('تکمیل حذف کپی')();
      await Promise.resolve();
    });
    expect(mockDiscard).toHaveBeenCalledTimes(1);
    expect(mockResume).not.toHaveBeenCalled();
  });

  it('opens the existing inbox from the failure-only Today notice', async () => {
    const onReview = jest.fn();
    await render(true, onReview);
    tree.root.findByType(Button).props.onPress();
    expect(onReview).toHaveBeenCalledTimes(1);
  });

  it('binds inline recovery to its destination and excludes the current recorder owner', async () => {
    const target = { entityType: 'patient' as const, entityId: 'synthetic-patient' };
    await act(async () => {
      tree = create(<RecordingRecovery target={target} excludeId="synthetic-owned" />);
    });
    expect(mockQuery).toHaveBeenCalledWith(target, 'synthetic-owned');
  });
});
