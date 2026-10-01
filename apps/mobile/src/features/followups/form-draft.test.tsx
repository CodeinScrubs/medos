import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { eq } from 'drizzle-orm';
import { Alert, AppState, type AppStateStatus } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { ErrorNotice } from '@/components/error-notice';
import { alertError } from '@/components/feedback';
import { Button, ChipSelect, Input } from '@/components/ui';
import { followUpFormDrafts, followUps } from '@/db/schema';
import { createPatient } from '@/features/patients/queries';
import { useTestDatabase } from '@/test/db-client';
import { resetNotifications, scheduled } from '@/test/mocks/notifications';
import { createTestDatabase, type TestDatabase } from '@/test/sqljs';

import { FollowUpFormScreen } from './follow-up-form-screen';
import { decodeFollowUpForm } from './form-draft';
import { followUpFormQuery, saveFollowUpFormDraft } from './form-draft-queries';

let mockPatientId: string;
let mockFlush: (() => Promise<boolean>) | null;
const mockListeners = new Set<(event: { tableName: string }) => void>();
const mockBack = jest.fn();
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ id: mockPatientId }),
  useRouter: () => ({ back: mockBack }),
}));
jest.mock('@/components/use-now', () => ({ useNow: () => new Date('2026-10-01T12:00:00Z').getTime() }));
jest.mock('@/components/use-save-before-leave', () => ({
  useSaveBeforeLeave: (flush: () => Promise<boolean>) => {
    mockFlush = flush;
  },
}));
jest.mock('expo-sqlite', () => ({
  addDatabaseChangeListener: (listener: (event: { tableName: string }) => void) => {
    mockListeners.add(listener);
    return { remove: () => mockListeners.delete(listener) };
  },
}));
jest.mock('@/db/client', () => jest.requireActual('@/test/db-client'));
jest.mock('@/platform/notifications', () => jest.requireActual('@/test/mocks/notifications'));
jest.mock('@/components/error-notice', () => ({ ErrorNotice: 'ErrorNotice' }));
jest.mock('@/components/feedback', () => ({ alertError: jest.fn(), notify: jest.fn() }));
jest.mock('@/theme', () => ({ useTheme: () => ({ colors: {}, spacing: {} }) }));
jest.mock('@/components/ui', () => ({
  Button: 'Button',
  Card: 'Card',
  ChipSelect: 'ChipSelect',
  Column: 'Column',
  Field: 'Field',
  Input: 'Input',
  Row: 'Row',
  Screen: 'Screen',
  Segmented: 'Segmented',
  Text: 'Text',
}));

let tree: ReactTestRenderer | undefined;
let t: TestDatabase;
async function settle() {
  for (let i = 0; i < 45; i++) await Promise.resolve();
}
async function mount() {
  await act(async () => {
    tree = create(<FollowUpFormScreen />);
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
const input = (label: string) => tree!.root.findAllByType(Input).find((node) => node.props.label === label)!;
const clock = () => tree!.root.findAllByType(Input).find((node) => node.props.icon === 'time-outline')!;
const button = (label: string) => tree!.root.findAllByType(Button).find((node) => node.props.label === label)!;
async function typeReason(text: string, wait = true) {
  await act(async () => {
    input('برای چه؟').props.onChangeText(text);
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
async function refresh() {
  await act(async () => {
    for (const listener of mockListeners) listener({ tableName: 'follow_up_form_drafts' });
    jest.advanceTimersByTime(70);
    await settle();
  });
}
const stored = () =>
  t.db
    .select()
    .from(followUpFormDrafts)
    .where(eq(followUpFormDrafts.patientId, mockPatientId))
    .all()
    .find((row) => !row.deletedAt)!;
const confirm = async (text: string) => {
  const options = jest.mocked(Alert.alert).mock.calls.at(-1)![2]!;
  await act(async () => {
    options.find((option) => option.text === text)!.onPress!();
    await settle();
  });
};
beforeEach(async () => {
  t = useTestDatabase(await createTestDatabase());
  resetNotifications();
  mockPatientId = await createPatient({ firstName: 'Synthetic', lastName: 'Followup' });
  mockFlush = null;
  mockListeners.clear();
  mockBack.mockReset();
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

describe('follow-up form recovery', () => {
  it('recovers reason and incomplete date/clock after reopening without publishing a follow-up', async () => {
    await mount();
    await act(async () => {
      input('برای چه؟').props.onChangeText('Check the outstanding report');
      tree!.root
        .findAllByType(ChipSelect)
        .find((node) => node.props.label === 'کِی؟')!
        .props.onChange('custom');
      await settle();
    });
    await act(async () => {
      input('تاریخ').props.onChangeText('1405/07/');
      clock().props.onChangeText('2:');
      jest.advanceTimersByTime(850);
      await settle();
    });
    await unmount();
    await mount();
    expect(input('برای چه؟').props.value).toBe('Check the outstanding report');
    expect(input('تاریخ').props.value).toBe('1405/07/');
    expect(clock().props.value).toBe('2:');
    expect(mockBack).not.toHaveBeenCalled();
    await click('ثبت پیگیری');
    expect(t.db.select().from(followUps).all()).toEqual([]);
    expect(scheduled.size).toBe(0);
    expect(stored().deletedAt).toBeNull();
  });
  it('flushes latest input before exit and blocks leaving after a write failure, then retries', async () => {
    await mount();
    await typeReason('Latest without a pause', false);
    t.sqlite.exec(
      "CREATE TRIGGER refuse_draft BEFORE INSERT ON follow_up_form_drafts BEGIN SELECT RAISE(ABORT, 'synthetic failure'); END;",
    );
    await act(async () => expect(await mockFlush!()).toBe(false));
    expect(input('برای چه؟').props.value).toBe('Latest without a pause');
    expect(t.db.select().from(followUpFormDrafts).all()).toEqual([]);
    expect(button('ذخیره نشد؛ تلاش دوباره')).toBeDefined();
    t.sqlite.exec('DROP TRIGGER refuse_draft');
    await click('ذخیره نشد؛ تلاش دوباره');
    await act(async () => expect(await mockFlush!()).toBe(true));
    expect(decodeFollowUpForm(stored().body).fields.reason).toBe('Latest without a pause');
    expect(t.db.select().from(followUps).all()).toEqual([]);
  });
  it('background flush retains input without an explicit clinical save', async () => {
    let listener: ((state: AppStateStatus) => void) | undefined;
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, callback) => {
      listener = callback;
      return { remove: () => {} };
    });
    await mount();
    await typeReason('Just entered before background', false);
    await act(async () => {
      listener!('background');
      await settle();
    });
    expect(decodeFollowUpForm(stored().body).fields.reason).toBe('Just entered before background');
    expect(t.db.select().from(followUps).all()).toEqual([]);
  });
  it('publishes the latest valid fields once and retires their raw draft', async () => {
    await mount();
    await typeReason('Validated report', false);
    await act(async () => {
      const submit = button('ثبت پیگیری').props.onPress;
      submit();
      submit();
      await settle();
    });
    const rows = t.db.select().from(followUps).all();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.reason).toBe('Validated report');
    expect(t.db.select().from(followUpFormDrafts).all()[0]).toMatchObject({ committedFollowUpId: rows[0]!.id });
    expect(mockBack).toHaveBeenCalledTimes(1);
  });
  it('requires an explicit comparison and rechecks it before replacing a competing draft', async () => {
    await mount();
    await typeReason('Initial');
    const original = stored();
    let doc = decodeFollowUpForm(original.body);
    await saveFollowUpFormDraft(
      original.id,
      mockPatientId,
      null,
      { ...doc, fields: { ...doc.fields, reason: 'Other editor' } },
      original.revision,
    );
    await typeReason('My latest input');
    expect(decodeFollowUpForm(stored().body).fields.reason).toBe('Other editor');
    expect(input('برای چه؟').props.value).toBe('My latest input');
    await click('بررسی نسخهٔ ذخیره‌شده');
    doc = decodeFollowUpForm(stored().body);
    await saveFollowUpFormDraft(
      original.id,
      mockPatientId,
      null,
      { ...doc, fields: { ...doc.fields, reason: 'Changed after comparison' } },
      stored().revision,
    );
    await click('نگه‌داشتن نوشتهٔ من');
    expect(decodeFollowUpForm(stored().body).fields.reason).toBe('Changed after comparison');
    expect(input('برای چه؟').props.value).toBe('My latest input');
    await click('بررسی نسخهٔ ذخیره‌شده');
    await click('نگه‌داشتن نوشتهٔ من');
    expect(decodeFollowUpForm(stored().body).fields.reason).toBe('My latest input');
    expect(t.db.select().from(followUps).all()).toEqual([]);
  });
  it('confirms loading another draft before discarding this screen input', async () => {
    await mount();
    await typeReason('First');
    const row = stored();
    const doc = decodeFollowUpForm(row.body);
    await saveFollowUpFormDraft(
      row.id,
      mockPatientId,
      null,
      { ...doc, fields: { ...doc.fields, reason: 'Stored elsewhere' } },
      row.revision,
    );
    await typeReason('My pending');
    await click('بررسی نسخهٔ ذخیره‌شده');
    await click('بارگذاری نسخهٔ ذخیره‌شده');
    await confirm('انصراف');
    expect(input('برای چه؟').props.value).toBe('My pending');
    await click('بارگذاری نسخهٔ ذخیره‌شده');
    await confirm('بارگذاری');
    expect(input('برای چه؟').props.value).toBe('Stored elsewhere');
  });
  it('does not mount an empty form on an initial read failure and retains input on a later failure', async () => {
    let fail = true;
    const prepare = t.sqlite.prepare.bind(t.sqlite);
    jest.spyOn(t.sqlite, 'prepare').mockImplementation((sql, params) => {
      if (fail && sql.includes('follow_up_form_drafts')) throw new Error('synthetic read failure');
      return prepare(sql, params);
    });
    await mount();
    expect(tree!.root.findAllByType(Input)).toHaveLength(0);
    expect(tree!.root.findByType(ErrorNotice).props.error).toBeDefined();
    fail = false;
    await act(async () => {
      tree!.root.findByType(ErrorNotice).props.onRetry();
      await settle();
    });
    await typeReason('Retain through read failure');
    fail = true;
    await refresh();
    expect(input('برای چه؟').props.value).toBe('Retain through read failure');
    expect(tree!.root.findByType(ErrorNotice).props.error).toBeDefined();
    fail = false;
    await act(async () => {
      tree!.root.findByType(ErrorNotice).props.onRetry();
      await settle();
    });
    expect(input('برای چه؟').props.value).toBe('Retain through read failure');
  });
  it('soft-discards only after confirmation and retains the draft after SQL failure', async () => {
    await mount();
    await typeReason('Discard only on confirmation');
    await click('حذف پیش‌نویس');
    await confirm('انصراف');
    expect(stored()).toBeDefined();
    expect(mockBack).not.toHaveBeenCalled();
    t.sqlite.exec(
      "CREATE TRIGGER refuse_discard BEFORE UPDATE ON follow_up_form_drafts BEGIN SELECT RAISE(ABORT, 'synthetic failure'); END;",
    );
    await click('حذف پیش‌نویس');
    await confirm('حذف پیش‌نویس');
    expect(stored()).toBeDefined();
    expect(mockBack).not.toHaveBeenCalled();
    expect(input('برای چه؟').props.value).toBe('Discard only on confirmation');
    t.sqlite.exec('DROP TRIGGER refuse_discard');
    await click('حذف پیش‌نویس');
    await confirm('حذف پیش‌نویس');
    expect(stored()).toBeUndefined();
    expect(mockBack).toHaveBeenCalledTimes(1);
    expect(t.db.select().from(followUps).all()).toEqual([]);
  });
  it('flushes the old patient scope and never loads it into a different patient', async () => {
    const first = mockPatientId;
    await mount();
    await typeReason('Old patient raw text', false);
    mockPatientId = await createPatient({ firstName: 'Different', lastName: 'Scope' });
    await act(async () => {
      tree!.update(<FollowUpFormScreen />);
      await settle();
    });
    expect(input('برای چه؟').props.value).toBe('');
    expect((await followUpFormQuery(first))[0]!.draft?.body).toContain('Old patient raw text');
    await typeReason('New patient');
    expect(decodeFollowUpForm(stored().body).fields.reason).toBe('New patient');
  });
});
