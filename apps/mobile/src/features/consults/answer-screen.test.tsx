import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Alert } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { alertError } from '@/components/feedback';
import { Button, Input } from '@/components/ui';
import type { Consultation } from '@/db/schema';
import { createPatient } from '@/features/patients/queries';
import { DatasetBusyError, DatasetChangedError, datasetGeneration } from '@/lib/dataset-write';
import { databaseRows, replacementFailure, snapshotDataset } from '@/test/dataset-snapshot';
import { useTestDatabase } from '@/test/db-client';
import { createTestDatabase, type TestDatabase } from '@/test/sqljs';

import { AnswerEditor } from './answer-screen';
import { consultQuery, createConsult, saveConsultAnswerDraft } from './queries';
import * as queries from './queries';

const mockBack = jest.fn();
let mockExit: () => Promise<boolean>;
let mockParentGeneration: number | null;
jest.mock('@/components/autosave-scope', () => ({
  useAutosaveScope: () => (mockParentGeneration === null ? null : { generation: mockParentGeneration }),
}));
jest.mock('@/components/screen-options', () => ({ ScreenOptions: 'ScreenOptions' }));
jest.mock('expo-router', () => ({ useRouter: () => ({ back: mockBack }) }));
jest.mock('@/components/ui', () => ({
  Button: 'Button',
  Card: 'Card',
  Column: 'Column',
  Input: 'Input',
  Screen: 'Screen',
  Text: 'Text',
}));
jest.mock('@/components/edit-gate', () => ({ EditGate: 'EditGate' }));
jest.mock('@/components/error-notice', () => ({ ErrorNotice: 'ErrorNotice' }));
jest.mock('@/components/feedback', () => ({
  alertError: jest.fn(),
  notify: jest.requireActual<typeof import('@/components/feedback')>('@/components/feedback').notify,
}));
jest.mock('@/components/use-save-before-leave', () => ({
  useSaveBeforeLeave: (flush: () => Promise<boolean>) => {
    mockExit = flush;
  },
}));
jest.mock('@/db/use-live', () => ({ useLive: () => ({ data: [], error: undefined }) }));
jest.mock('@/db/client', () => jest.requireActual('@/test/db-client'));
jest.mock('@/platform/notifications', () => jest.requireActual('@/test/mocks/notifications'));

let t: TestDatabase;
let initial: Consultation;
let tree: ReactTestRenderer;
const input = (label: string) => tree.root.findAllByType(Input).find((node) => node.props.label === label)!;
const button = (label: string) => tree.root.findAllByType(Button).find((node) => node.props.label === label)!;
async function settle() {
  for (let i = 0; i < 12; i++) await Promise.resolve();
}
async function mount(row: Consultation) {
  await act(async () => {
    tree = create(<AnswerEditor initial={row} onReload={() => {}} />);
  });
}

beforeEach(async () => {
  t = useTestDatabase(await createTestDatabase());
  const patientId = await createPatient({ firstName: 'Test', lastName: 'Patient', status: 'outpatient' });
  const id = await createConsult({ patientId, reason: 'Question' });
  initial = (await consultQuery(id))[0]!;
  mockBack.mockClear();
  mockParentGeneration = null;
  jest.mocked(alertError).mockClear();
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  jest.useFakeTimers();
});
afterEach(async () => {
  if (tree)
    await act(async () => {
      tree.unmount();
      await settle();
    });
  jest.clearAllTimers();
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe('consult answer original intent', () => {
  it('refuses publication of a clean saved draft after same-id restore', async () => {
    await saveConsultAnswerDraft(initial.id, { response: 'Saved draft', instruction: 'Keep instruction' }, 0);
    initial = (await consultQuery(initial.id))[0]!;
    await mount(initial);
    await act(async () => snapshotDataset(t)());
    const before = databaseRows(t);
    await act(async () => {
      button('ثبت پاسخ').props.onPress();
      await settle();
    });
    expect(databaseRows(t)).toEqual(before);
    expect(input('پاسخ').props.value).toBe('Saved draft');
    expect(input('دستور پیگیری').props.value).toBe('Keep instruction');
    expect(mockBack).not.toHaveBeenCalled();
    expect(alertError).toHaveBeenLastCalledWith('ثبت نشد', expect.any(DatasetChangedError));
  });
  it.each(['load', 'keep'])('refuses held %s before replacing input or adopting restored revision', async (action) => {
    const onReload = jest.fn();
    await act(async () => {
      tree = create(<AnswerEditor initial={initial} onReload={onReload} />);
    });
    await saveConsultAnswerDraft(initial.id, { response: 'Other editor', instruction: '' }, 0);
    await act(async () => {
      input('پاسخ').props.onChangeText('My pending reply');
      expect(await mockExit()).toBe(false);
    });
    await act(async () => {
      button('مقایسه با نسخهٔ ذخیره‌شده').props.onPress();
      await settle();
    });
    let held: () => void;
    if (action === 'load') {
      await act(async () => {
        button('بارگذاری این نسخه به‌جای نوشتهٔ من').props.onPress();
      });
      held = jest
        .mocked(Alert.alert)
        .mock.calls.at(-1)![2]!
        .find((option) => option.text === 'بارگذاری')!.onPress!;
    } else held = button('ذخیرهٔ نوشتهٔ من به‌جای این نسخه').props.onPress;
    await act(async () => snapshotDataset(t)());
    const before = databaseRows(t);
    await act(async () => {
      held();
      await settle();
    });
    expect(databaseRows(t)).toEqual(before);
    expect(input('پاسخ').props.value).toBe('My pending reply');
    expect(onReload).not.toHaveBeenCalled();
    expect(alertError).toHaveBeenLastCalledWith('ثبت نشد', expect.any(DatasetChangedError));
  });
  it('keeps a late editor autosave on its enclosing original intent', async () => {
    mockParentGeneration = datasetGeneration();
    snapshotDataset(t)();
    const before = databaseRows(t);
    await mount(initial);
    await act(async () => {
      input('پاسخ').props.onChangeText('Late local input');
      expect(await mockExit()).toBe(false);
    });
    expect(databaseRows(t)).toEqual(before);
    expect(input('پاسخ').props.value).toBe('Late local input');
  });
  it('holds publication admission and prevents leaving until final query acknowledgment', async () => {
    const original = queries.commitConsultAnswerDraft;
    let release = () => {};
    jest.spyOn(queries, 'commitConsultAnswerDraft').mockImplementationOnce(async (...args) => {
      await original(...args);
      await new Promise<void>((resolve) => {
        release = resolve;
      });
    });
    await mount(initial);
    await act(async () => {
      input('پاسخ').props.onChangeText('One answer');
      button('ثبت پاسخ').props.onPress();
      await settle();
    });
    const failure = replacementFailure();
    let mayLeave = false;
    await act(async () => {
      mayLeave = await mockExit();
      release();
      await settle();
    });
    expect(failure).toBeInstanceOf(DatasetBusyError);
    expect(mayLeave).toBe(false);
    expect(mockBack).toHaveBeenCalledTimes(1);
  });
});

describe('consult answer editor with SQLite', () => {
  it('ignores later taps and field changes after acknowledged publication without repeating navigation', async () => {
    await mount(initial);
    await act(async () => {
      input('پاسخ').props.onChangeText('Final acknowledged reply');
      button('ثبت پاسخ').props.onPress();
      await settle();
    });
    const before = databaseRows(t);
    await act(async () => {
      button('ثبت پاسخ').props.onPress();
      input('پاسخ').props.onChangeText('Late change after publication');
      await settle();
    });
    expect(mockBack).toHaveBeenCalledTimes(1);
    expect(databaseRows(t)).toEqual(before);
    expect(input('پاسخ').props.value).toBe('Final acknowledged reply');
    expect(input('پاسخ').props.editable).toBe(false);
    expect(button('ثبت پاسخ').props.disabled).toBe(true);
  });
  it('reports a navigation failure separately from the already committed reply', async () => {
    const failure = new Error('Synthetic navigation failure');
    mockBack.mockImplementationOnce(() => {
      throw failure;
    });
    await mount(initial);
    await act(async () => {
      input('پاسخ').props.onChangeText('Persisted before navigation');
      button('ثبت پاسخ').props.onPress();
      await settle();
    });
    expect((await consultQuery(initial.id))[0]?.status).toBe('answered');
    expect(alertError).toHaveBeenLastCalledWith('پاسخ ثبت شد؛ بازگشت انجام نشد', failure);
    const before = databaseRows(t);
    await act(async () => {
      button('ثبت پاسخ').props.onPress();
      await settle();
    });
    expect(databaseRows(t)).toEqual(before);
    expect(mockBack).toHaveBeenCalledTimes(1);
    expect(await mockExit()).toBe(true);
  });
  it('retains a retryable reply when the clinical publish SQL fails', async () => {
    t.sqlite.exec(
      "CREATE TRIGGER refuse_final_reply BEFORE UPDATE OF status ON consultations BEGIN SELECT RAISE(ABORT, 'Synthetic failure'); END;",
    );
    await mount(initial);
    await act(async () => {
      input('پاسخ').props.onChangeText('Keep this reply for retry');
      button('ثبت پاسخ').props.onPress();
      await settle();
    });
    expect((await consultQuery(initial.id))[0]?.status).toBe('pending');
    expect(input('پاسخ').props.value).toBe('Keep this reply for retry');
    expect(input('پاسخ').props.editable).toBe(true);
    expect(button('ثبت پاسخ').props.disabled).not.toBe(true);
    t.sqlite.exec('DROP TRIGGER refuse_final_reply');
    await act(async () => {
      button('ثبت پاسخ').props.onPress();
      await settle();
    });
    expect((await consultQuery(initial.id))[0]?.response).toBe('Keep this reply for retry');
    expect(mockBack).toHaveBeenCalledTimes(1);
  });
  it('flushes both fields on exit without publishing, then reopens the exact draft', async () => {
    await mount(initial);
    await act(async () => {
      input('پاسخ').props.onChangeText('Draft A\nExact words');
      input('دستور پیگیری').props.onChangeText('Later');
      expect(await mockExit()).toBe(true);
    });
    const stored = (await consultQuery(initial.id))[0]!;
    expect(stored).toMatchObject({
      draftResponse: 'Draft A\nExact words',
      draftInstruction: 'Later',
      status: 'pending',
      response: null,
    });
    await act(async () => tree.unmount());
    await mount(stored);
    expect(input('پاسخ').props.value).toBe('Draft A\nExact words');
    expect(input('دستور پیگیری').props.value).toBe('Later');
    expect(mockBack).not.toHaveBeenCalled();
  });

  it('blocks publish and exit on a failed save, keeps text visible, and retries the latest text once', async () => {
    await mount(initial);
    t.sqlite.exec(
      "CREATE TRIGGER fail_draft BEFORE UPDATE ON consultations BEGIN SELECT RAISE(ABORT, 'synthetic failure'); END;",
    );
    await act(async () => {
      input('پاسخ').props.onChangeText('Latest reply');
      button('ثبت پاسخ').props.onPress();
      button('ثبت پاسخ').props.onPress();
      await settle();
    });
    expect(input('پاسخ').props.value).toBe('Latest reply');
    expect(mockBack).not.toHaveBeenCalled();
    await act(async () => {
      expect(await mockExit()).toBe(false);
    });
    expect((await consultQuery(initial.id))[0]?.status).toBe('pending');
    t.sqlite.exec('DROP TRIGGER fail_draft');
    await act(async () => {
      button('ثبت پاسخ').props.onPress();
      await settle();
    });
    expect((await consultQuery(initial.id))[0]).toMatchObject({
      response: 'Latest reply',
      status: 'answered',
      draftResponse: '',
    });
    expect(mockBack).toHaveBeenCalledTimes(1);
  });

  it('requires choosing the displayed stored revision before replacing a conflicting draft', async () => {
    await mount(initial);
    await saveConsultAnswerDraft(initial.id, { response: 'Other editor', instruction: 'Other instruction' }, 0);
    await act(async () => {
      input('پاسخ').props.onChangeText('My reply');
      expect(await mockExit()).toBe(false);
    });
    expect(input('پاسخ').props.value).toBe('My reply');
    expect((await consultQuery(initial.id))[0]?.draftResponse).toBe('Other editor');
    await act(async () => {
      button('مقایسه با نسخهٔ ذخیره‌شده').props.onPress();
      await settle();
    });
    // Another change after the comparison must not be overwritten by that stale approval.
    await saveConsultAnswerDraft(initial.id, { response: 'Newer remote reply', instruction: '' }, 1);
    await act(async () => {
      button('ذخیرهٔ نوشتهٔ من به‌جای این نسخه').props.onPress();
      await settle();
    });
    expect((await consultQuery(initial.id))[0]?.draftResponse).toBe('Newer remote reply');
    expect(input('پاسخ').props.value).toBe('My reply');
    await act(async () => {
      button('مقایسه با نسخهٔ ذخیره‌شده').props.onPress();
      await settle();
    });
    await act(async () => {
      button('ذخیرهٔ نوشتهٔ من به‌جای این نسخه').props.onPress();
      await settle();
    });
    expect((await consultQuery(initial.id))[0]).toMatchObject({ draftResponse: 'My reply', status: 'pending' });
    expect(mockBack).not.toHaveBeenCalled();
  });
});
