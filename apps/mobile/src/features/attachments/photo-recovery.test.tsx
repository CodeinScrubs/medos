import { afterEach, beforeEach, expect, it, jest } from '@jest/globals';
import { Alert } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { ErrorNotice } from '@/components/error-notice';
import { alertError } from '@/components/feedback';
import { Button, Text } from '@/components/ui';
import type { PhotoImportBatch } from '@/db/schema';
import { DatasetChangedError, reserveDatasetReplacement } from '@/lib/dataset-write';

import { PhotoRecovery, PhotoRecoveryNotice } from './photo-recovery';

let mockData:
  | (PhotoImportBatch & {
      firstName: string | null;
      lastName: string | null;
      doctorFirstName: string | null;
      doctorLastName: string | null;
    })[]
  | undefined;
let mockError: Error | undefined;
const mockRetry = jest.fn();
const mockResume = jest.fn<(id: string, now: Date, generation: number) => Promise<string[]>>();
const mockDiscard = jest.fn<(id: string, now: Date, generation: number) => Promise<void>>();
const mockQuery = jest.fn((_scope?: unknown) => ({ limit: (_limit: number) => ({}) }));
jest.mock('./photo-import-queries', () => ({
  pendingPhotoImportsQuery: (scope?: unknown) => mockQuery(scope),
  resumePhotoImport: (...args: Parameters<typeof mockResume>) => mockResume(...args),
  discardPhotoImport: (...args: Parameters<typeof mockDiscard>) => mockDiscard(...args),
}));
jest.mock('@/db/use-live', () => ({ useLive: () => ({ data: mockData, error: mockError, retry: mockRetry }) }));
jest.mock('@/components/ui', () => ({ Button: 'Button', Column: 'Column', Row: 'Row', Text: 'Text' }));
jest.mock('@/components/error-notice', () => ({ ErrorNotice: 'ErrorNotice' }));
jest.mock('@/components/feedback', () => ({ alertError: jest.fn() }));
jest.mock('@/components/use-now', () => ({ useNow: () => new Date('2026-01-02T12:00:00Z').getTime() }));
let tree: ReactTestRenderer;
let dialog: ReturnType<typeof jest.spyOn>;
beforeEach(() => {
  const now = new Date('2026-01-02T12:00:00Z');
  mockData = [
    {
      id: 'synthetic-batch',
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      capturedAt: now,
      entityType: 'patient',
      entityId: 'synthetic-patient',
      patientId: 'synthetic-patient',
      mode: 'attachment',
      kind: 'photo',
      caption: null,
      bodySite: null,
      encounterId: null,
      body: '',
      revision: 2,
      state: 'ready',
      firstName: 'Synthetic',
      lastName: 'Destination',
      doctorFirstName: null,
      doctorLastName: null,
    },
  ];
  mockError = undefined;
  mockRetry.mockClear();
  mockQuery.mockClear();
  mockResume.mockReset().mockResolvedValue(['synthetic-image']);
  mockDiscard.mockReset().mockResolvedValue(undefined);
  jest.mocked(alertError).mockClear();
  dialog = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});
afterEach(async () => {
  if (tree) await act(async () => tree.unmount());
  dialog.mockRestore();
});
const action = (label: string) =>
  tree.root.findAllByType(Button).find((button) => button.props.label === label)!.props.onPress;
async function render() {
  await act(async () => {
    tree = create(<PhotoRecovery />);
  });
}

it('shows the original patient identity in global recovery and no UI for empty/loading jobs', async () => {
  await render();
  expect(tree.root.findAllByType(Text).some((text) => text.props.children === 'Synthetic Destination')).toBe(true);
  mockData = [];
  await act(async () => tree.update(<PhotoRecovery />));
  expect(tree.toJSON()).toBeNull();
  mockData = undefined;
  await act(async () => tree.update(<PhotoRecoveryNotice onReview={jest.fn()} />));
  expect(tree.toJSON()).toBeNull();
});
it('refuses stale retry and delayed discard callbacks before mocked writes are called', async () => {
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
    discard();
    await Promise.resolve();
  });
  await act(async () => {
    retry();
    await Promise.resolve();
  });
  expect(mockResume).not.toHaveBeenCalled();
  expect(mockDiscard).not.toHaveBeenCalled();
  expect(alertError).toHaveBeenCalledWith('عکس ذخیره نشد', expect.any(DatasetChangedError));
  expect(alertError).toHaveBeenCalledWith('صرف‌نظر ثبت نشد', expect.any(DatasetChangedError));
});
it('ignores discard confirmation after the original recovery component unmounts', async () => {
  await render();
  await act(async () => action('صرف‌نظر')());
  const discard = jest.mocked(Alert.alert).mock.calls.at(-1)![2]![1]!.onPress!;
  await act(async () => tree.unmount());
  await act(async () => {
    discard();
    await Promise.resolve();
  });
  expect(mockDiscard).not.toHaveBeenCalled();
  expect(mockResume).not.toHaveBeenCalled();
});
it('retains failed retry controls, prevents rapid duplicates and confirms soft discard', async () => {
  let reject!: (e: Error) => void;
  mockResume.mockReturnValueOnce(
    new Promise((_yes, no) => {
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
  await act(async () => {
    reject(new Error('Synthetic publication failure'));
    await Promise.resolve();
  });
  expect(action('تلاش دوباره')).toBeDefined();
  await act(async () => action('صرف‌نظر')());
  expect(mockDiscard).not.toHaveBeenCalled();
  await act(async () => {
    jest.mocked(Alert.alert).mock.calls.at(-1)![2]![1]!.onPress!();
    await Promise.resolve();
  });
  expect(mockDiscard).toHaveBeenCalledTimes(1);
  expect(mockRetry).toHaveBeenCalledTimes(1);
});
it('shows read failures with retry and binds scope to the original patient/target', async () => {
  mockData = undefined;
  mockError = new Error('Synthetic query failure');
  const target = { entityType: 'imaging_study' as const, entityId: 'synthetic-study' };
  await act(async () => {
    tree = create(<PhotoRecovery patientId="synthetic-patient" target={target} />);
  });
  expect(mockQuery).toHaveBeenCalledWith({ patientId: 'synthetic-patient', target });
  expect(tree.root.findByType(ErrorNotice).props.error).toBe(mockError);
  tree.root.findByType(ErrorNotice).props.onRetry();
  expect(mockRetry).toHaveBeenCalledTimes(1);
});
