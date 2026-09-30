import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Alert, AppState, type AppStateStatus } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { ErrorNotice } from '@/components/error-notice';
import { alertError } from '@/components/feedback';
import { Button, Input } from '@/components/ui';
import { useTestDatabase } from '@/test/db-client';
import { createTestDatabase, type TestDatabase } from '@/test/sqljs';

import { decodePatientForm, initialPatientFields } from './form-draft';
import { patientFormDraftQuery, savePatientFormDraft } from './form-draft-queries';
import * as draftQueries from './form-draft-queries';
import { PatientForm } from './patient-form';
import { createPatient, patientListQuery, patientQuery, updatePatient } from './queries';

let mockFlush: (() => Promise<boolean>) | null;
const mockBack = jest.fn();
const mockReplace = jest.fn();
const mockListeners = new Set<(event: { tableName: string }) => void>();
jest.mock('expo-router', () => ({ useRouter: () => ({ back: mockBack, replace: mockReplace }) }));
jest.mock('expo-sqlite', () => ({
  addDatabaseChangeListener: (listener: (event: { tableName: string }) => void) => {
    mockListeners.add(listener);
    return { remove: () => mockListeners.delete(listener) };
  },
}));
jest.mock('@/components/use-save-before-leave', () => ({
  useSaveBeforeLeave: (flush: () => Promise<boolean>) => {
    mockFlush = flush;
  },
}));
jest.mock('@/components/use-now', () => ({ useNow: () => new Date('2026-09-30T12:00:00Z').getTime() }));
jest.mock('@/components/ui', () => ({
  Button: 'Button',
  Card: 'Card',
  Column: 'Column',
  Input: 'Input',
  Row: 'Row',
  Screen: 'Screen',
  Segmented: 'Segmented',
  Text: 'Text',
}));
jest.mock('@/theme', () => ({ useTheme: () => ({ colors: {}, spacing: {}, radii: {}, typography: {} }) }));
jest.mock('@/components/error-notice', () => ({ ErrorNotice: 'ErrorNotice' }));
jest.mock('@/components/collapsible-section', () => ({ CollapsibleSection: 'CollapsibleSection' }));
jest.mock('@/components/feedback', () => ({ alertError: jest.fn(), notify: jest.fn() }));
jest.mock('@/db/client', () => jest.requireActual('@/test/db-client'));
jest.mock('@/platform/notifications', () => jest.requireActual('@/test/mocks/notifications'));

let t: TestDatabase;
let tree: ReactTestRenderer | undefined;
let patientId: string;
const button = (label: string) => tree!.root.findAllByType(Button).find((node) => node.props.label === label)!;
const input = (label: string) => tree!.root.findAllByType(Input).find((node) => node.props.label === label)!;
async function settle() {
  for (let i = 0; i < 45; i++) await Promise.resolve();
}
async function mount(edit = false) {
  const patient = edit ? (await patientQuery(patientId))[0] : undefined;
  await act(async () => {
    tree = create(<PatientForm patient={patient} />);
    await settle();
  });
}
async function type(label: string, text: string, wait = true) {
  await act(async () => {
    input(label).props.onChangeText(text);
    if (wait) jest.advanceTimersByTime(850);
    await settle();
  });
}
async function click(label: string) {
  await act(async () => {
    button(label).props.onPress();
    await settle();
  });
}
async function unmount() {
  await act(async () => {
    tree?.unmount();
    await settle();
  });
  tree = undefined;
}
async function refreshDraft() {
  await act(async () => {
    for (const listener of mockListeners) listener({ tableName: 'patient_form_drafts' });
    jest.advanceTimersByTime(70);
    await settle();
  });
}
const stored = async (id: string | null = null) => decodePatientForm((await patientFormDraftQuery(id))[0]!.body).fields;
beforeEach(async () => {
  t = useTestDatabase(await createTestDatabase());
  patientId = await createPatient({
    firstName: 'Synthetic',
    lastName: 'Patient',
    summary: 'Original',
    birthDate: '2001-08-03',
  });
  mockFlush = null;
  mockBack.mockReset();
  mockReplace.mockReset();
  mockListeners.clear();
  jest.mocked(alertError).mockClear();
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  jest.useFakeTimers();
});
afterEach(async () => {
  await unmount();
  jest.clearAllTimers();
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe('patient form persistence and publication', () => {
  it('restores raw invalid birth date and age, preserving the confirmed chart until correction', async () => {
    await mount(true);
    await type('تاریخ تولد', '1405/07/');
    await type('سن', '24.5');
    await unmount();
    await mount(true);
    expect(input('تاریخ تولد').props.value).toBe('1405/07/');
    expect(input('سن').props.value).toBe('24.5');
    await click('ذخیره تغییرات');
    expect((await patientQuery(patientId))[0]).toMatchObject({ ageYears: null, birthDate: '2001-08-03' });
    expect(mockBack).not.toHaveBeenCalled();
    await type('تاریخ تولد', '1380/05/12');
    await type('سن', '۲۴');
    await click('ذخیره تغییرات');
    expect((await patientQuery(patientId))[0]?.ageYears).toBe(24);
    expect(await patientFormDraftQuery(patientId)).toEqual([]);
    expect(mockBack).toHaveBeenCalledTimes(1);
  });
  it('flushes a partial new form before leaving without publishing a patient', async () => {
    await mount();
    await type('نام', 'Partial', false);
    await act(async () => expect(await mockFlush!()).toBe(true));
    expect((await stored()).firstName).toBe('Partial');
    expect(await patientListQuery()).toHaveLength(1);
    await unmount();
    await mount();
    expect(input('نام').props.value).toBe('Partial');
  });
  it('captures the latest keystroke on immediate Save and blocks repeated submission', async () => {
    await mount();
    await type('نام', 'Quick', false);
    await type('نام خانوادگی', 'Patient', false);
    await act(async () => {
      button('ثبت بیمار').props.onPress();
      button('ثبت بیمار').props.onPress();
      await settle();
    });
    expect(await patientListQuery({ search: 'Quick Patient' })).toHaveLength(1);
    expect(mockReplace).toHaveBeenCalledTimes(1);
    expect(await patientFormDraftQuery(null)).toEqual([]);
  });
  it('blocks leaving and publication on write failure, retains input and retries successfully', async () => {
    await mount();
    t.conn.execSync(
      "CREATE TRIGGER fail_draft BEFORE INSERT ON patient_form_drafts BEGIN SELECT RAISE(ABORT, 'synthetic failure'); END",
    );
    await type('نام', 'Kept', false);
    await type('نام خانوادگی', 'Patient', false);
    await act(async () => expect(await mockFlush!()).toBe(false));
    await click('ثبت بیمار');
    expect(input('نام').props.value).toBe('Kept');
    expect(mockReplace).not.toHaveBeenCalled();
    expect(await patientListQuery()).toHaveLength(1);
    t.conn.execSync('DROP TRIGGER fail_draft');
    await click('ذخیره نشد؛ تلاش دوباره');
    await click('ثبت بیمار');
    expect(await patientListQuery({ search: 'Kept' })).toHaveLength(1);
    expect(mockReplace).toHaveBeenCalledTimes(1);
  });
  it('flushes before the app enters the background', async () => {
    let background: (next: AppStateStatus) => void = () => {};
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, listener) => {
      background = listener;
      return { remove: jest.fn() };
    });
    await mount();
    await type('نام', 'Background', false);
    await act(async () => {
      background('background');
      await settle();
    });
    expect((await stored()).firstName).toBe('Background');
  });
  it('shows initial draft read failure and retries instead of displaying a blank editor', async () => {
    t.conn.execSync('ALTER TABLE patient_form_drafts RENAME TO hidden_drafts');
    await mount();
    expect(tree!.root.findAllByType(Input)).toHaveLength(0);
    const notice = tree!.root.findAllByType(ErrorNotice).find((node) => node.props.error)!;
    expect(notice).toBeDefined();
    t.conn.execSync('ALTER TABLE hidden_drafts RENAME TO patient_form_drafts');
    await act(async () => {
      notice.props.onRetry();
      await settle();
    });
    expect(input('نام').props.value).toBe('');
  });
  it('keeps current input through a failed draft refresh and explicit retry', async () => {
    await mount();
    await type('نام', 'Local');
    t.conn.execSync('ALTER TABLE patient_form_drafts RENAME TO hidden_drafts');
    await refreshDraft();
    expect(input('نام').props.value).toBe('Local');
    const notice = tree!.root.findAllByType(ErrorNotice).find((node) => node.props.error)!;
    expect(notice).toBeDefined();
    t.conn.execSync('ALTER TABLE hidden_drafts RENAME TO patient_form_drafts');
    await act(async () => {
      notice.props.onRetry();
      await settle();
    });
    expect(input('نام').props.value).toBe('Local');
  });
  it('keeps a conflicting chart edit until an explicit comparison, rejecting stale comparison', async () => {
    await mount(true);
    await type('خلاصه‌ی یک‌خطی', 'Local');
    await updatePatient(patientId, { summary: 'External', phone: '456' });
    await click('ذخیره تغییرات');
    expect(mockBack).not.toHaveBeenCalled();
    expect(input('خلاصه‌ی یک‌خطی').props.value).toBe('Local');
    await click('بررسی نسخه‌های ذخیره‌شده');
    await updatePatient(patientId, { summary: 'New external' });
    await click('نگه‌داشتن تغییرات من');
    expect((await patientQuery(patientId))[0]?.summary).toBe('New external');
    await click('بررسی نسخه‌های ذخیره‌شده');
    await click('نگه‌داشتن تغییرات من');
    expect(input('شماره تماس بیمار').props.value).toBe('456');
    await click('ذخیره تغییرات');
    expect((await patientQuery(patientId))[0]).toMatchObject({ summary: 'Local', phone: '456' });
    expect(mockBack).toHaveBeenCalledTimes(1);
  });
  it('resolves two new-patient drafts only after comparing the stored revision', async () => {
    await mount();
    const fields = initialPatientFields();
    fields.firstName = 'Other';
    await savePatientFormDraft('other-draft', null, { version: 1, base: null, fields }, 0);
    await type('نام', 'Local');
    await click('بررسی نسخه‌های ذخیره‌شده');
    await savePatientFormDraft(
      'other-draft',
      null,
      { version: 1, base: null, fields: { ...fields, firstName: 'Newer' } },
      1,
    );
    await click('نگه‌داشتن تغییرات من');
    expect((await stored()).firstName).toBe('Newer');
    await click('بررسی نسخه‌های ذخیره‌شده');
    await click('نگه‌داشتن تغییرات من');
    expect((await stored()).firstName).toBe('Local');
    expect(await patientListQuery()).toHaveLength(1);
  });
  it('locks input while duplicate confirmation is open and commits one confirmed retry', async () => {
    await mount();
    await type('نام', 'Synthetic');
    await type('نام خانوادگی', 'Patient');
    await click('ثبت بیمار');
    const alerts = jest.mocked(Alert.alert).mock.calls;
    const confirm = alerts.at(-1)![2]!.find((item) => item.text === 'ثبت کن')!.onPress!;
    expect(input('نام').props.editable).toBe(false);
    await act(async () => expect(await mockFlush!()).toBe(false));
    await type('نام', 'Ignored');
    expect(input('نام').props.value).toBe('Synthetic');
    await act(async () => {
      confirm();
      confirm();
      await settle();
    });
    expect(await patientListQuery({ search: 'Synthetic Patient' })).toHaveLength(2);
    expect(mockReplace).toHaveBeenCalledTimes(1);
  });
  it('canceling duplicate confirmation keeps the recoverable form and permits further editing', async () => {
    await mount();
    await type('نام', 'Synthetic');
    await type('نام خانوادگی', 'Patient');
    await click('ثبت بیمار');
    const cancel = jest
      .mocked(Alert.alert)
      .mock.calls.at(-1)![2]!
      .find((item) => item.style === 'cancel')!.onPress!;
    await act(async () => {
      cancel();
      await settle();
    });
    expect(input('نام').props.editable).toBe(true);
    expect((await stored()).firstName).toBe('Synthetic');
    expect(await patientListQuery()).toHaveLength(1);
  });
  it('reports committed navigation failure honestly and retries opening without inserting again', async () => {
    await mount();
    await type('نام', 'Navigate');
    await type('نام خانوادگی', 'Test');
    mockReplace.mockImplementationOnce(() => {
      throw new Error('synthetic navigation failure');
    });
    await click('ثبت بیمار');
    expect(alertError).toHaveBeenCalledWith('پرونده ثبت شد؛ باز نشد', expect.any(Error));
    expect(await patientListQuery({ search: 'Navigate Test' })).toHaveLength(1);
    expect(input('نام').props.editable).toBe(false);
    await click('بازکردن پرونده');
    expect(mockReplace).toHaveBeenCalledTimes(2);
    expect(await patientListQuery({ search: 'Navigate Test' })).toHaveLength(1);
  });
  it('discards only after confirmation and pending persistence, leaving the chart unchanged', async () => {
    await mount(true);
    await type('خلاصه‌ی یک‌خطی', 'Discard', false);
    await click('حذف پیش‌نویس');
    expect(mockBack).not.toHaveBeenCalled();
    const confirm = jest
      .mocked(Alert.alert)
      .mock.calls.at(-1)![2]!
      .find((item) => item.style === 'destructive')!.onPress!;
    await act(async () => {
      confirm();
      confirm();
      await settle();
    });
    expect(await patientFormDraftQuery(patientId)).toEqual([]);
    expect((await patientQuery(patientId))[0]?.summary).toBe('Original');
    expect(mockBack).toHaveBeenCalledTimes(1);
    await unmount();
    await mount(true);
    expect(input('خلاصه‌ی یک‌خطی').props.value).toBe('Original');
  });

  it('waits for an in-flight autosave before discard and never recreates the retired draft', async () => {
    const original = draftQueries.savePatientFormDraft;
    let release: () => void = () => {};
    jest.spyOn(draftQueries, 'savePatientFormDraft').mockImplementationOnce(
      (...args) =>
        new Promise((resolve, reject) => {
          release = () => {
            void original(...args).then(resolve, reject);
          };
        }),
    );
    await mount(true);
    await type('خلاصه‌ی یک‌خطی', 'First write');
    await type('خلاصه‌ی یک‌خطی', 'Last write', false);
    await click('حذف پیش‌نویس');
    const confirm = jest
      .mocked(Alert.alert)
      .mock.calls.at(-1)![2]!
      .find((item) => item.style === 'destructive')!.onPress!;
    await act(async () => {
      confirm();
      await settle();
    });
    expect(mockBack).not.toHaveBeenCalled();
    await act(async () => {
      release();
      await settle();
    });
    expect(mockBack).toHaveBeenCalledTimes(1);
    await unmount();
    expect(await patientFormDraftQuery(patientId)).toEqual([]);
    expect((await patientQuery(patientId))[0]?.summary).toBe('Original');
  });

  it('loads the stored draft only after confirmation, replacing failed local pending input', async () => {
    await mount();
    const fields = { ...initialPatientFields(), firstName: 'Stored' };
    await savePatientFormDraft('stored', null, { version: 1, base: null, fields }, 0);
    await type('نام', 'Local');
    await click('بررسی نسخه‌های ذخیره‌شده');
    await click('بارگذاری نسخهٔ ذخیره‌شده');
    expect(input('نام').props.value).toBe('Local');
    const confirm = jest
      .mocked(Alert.alert)
      .mock.calls.at(-1)![2]!
      .find((item) => item.text === 'بارگذاری')!.onPress!;
    await act(async () => {
      confirm();
      await settle();
    });
    expect(input('نام').props.value).toBe('Stored');
    await unmount();
    expect((await stored()).firstName).toBe('Stored');
  });
});
