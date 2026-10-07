import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Alert, AppState, type AppStateStatus } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { ErrorNotice } from '@/components/error-notice';
import { alertError } from '@/components/feedback';
import { Button, ChipSelect, Input, Toggle } from '@/components/ui';
import { occasionFormDrafts, occasions } from '@/db/schema';
import * as notifications from '@/platform/notifications';
import { databaseRows, snapshotDataset } from '@/test/dataset-snapshot';
import { useTestDatabase } from '@/test/db-client';
import { createTestDatabase, type TestDatabase } from '@/test/sqljs';

import { decodeOccasionForm } from './occasion-form-draft';
import { OccasionFormScreen } from './occasion-form-screen';
import { createOccasion, updateOccasion } from './occasions-queries';
import { createDoctor } from './queries';

let mockParams: { doctorId: string; occasionId?: string };
let mockFlush: (() => Promise<boolean>) | null;
let mockFocused = true;
const mockBack = jest.fn();
const mockListeners = new Set<(event: { tableName: string }) => void>();
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => mockParams,
  useRouter: () => ({ back: mockBack }),
}));
jest.mock('expo-router/react-navigation', () => ({
  useNavigation: () => ({ isFocused: () => mockFocused }),
}));
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
jest.mock('@/components/use-now', () => ({ useNow: () => new Date('2026-10-07T12:00:00Z').getTime() }));
jest.mock('@/components/ui', () => ({
  Button: 'Button',
  Card: 'Card',
  ChipSelect: 'ChipSelect',
  Column: 'Column',
  Input: 'Input',
  Row: 'Row',
  Screen: 'Screen',
  Text: 'Text',
  Toggle: 'Toggle',
}));
jest.mock('@/components/screen-options', () => ({ ScreenOptions: 'ScreenOptions' }));
jest.mock('@/components/error-notice', () => ({ ErrorNotice: 'ErrorNotice' }));
jest.mock('@/components/feedback', () => ({ alertError: jest.fn(), notify: jest.fn() }));
jest.mock('@/db/client', () => jest.requireActual('@/test/db-client'));
jest.mock('@/platform/notifications', () => jest.requireActual('@/test/mocks/notifications'));

let t: TestDatabase;
let tree: ReactTestRenderer | undefined;
const input = (label: string) => tree!.root.findAllByType(Input).find((n) => n.props.label === label)!;
const button = (label: string) => tree!.root.findAllByType(Button).find((n) => n.props.label === label)!;
async function settle() {
  for (let i = 0; i < 50; i++) await Promise.resolve();
}
async function mount() {
  await act(async () => {
    tree = create(<OccasionFormScreen />);
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
async function type(label: string, text: string, wait = false) {
  await act(async () => {
    input(label).props.onChangeText(text);
    if (wait) jest.advanceTimersByTime(850);
    await settle();
  });
}
async function press(label: string) {
  await act(async () => {
    button(label).props.onPress();
    await settle();
  });
}
async function refresh() {
  await act(async () => {
    mockListeners.forEach((listener) => listener({ tableName: 'occasion_form_drafts' }));
    jest.advanceTimersByTime(80);
    await settle();
  });
}
const drafts = () => t.db.select().from(occasionFormDrafts).all();
const published = () => t.db.select().from(occasions).all();
const dialog = () => jest.mocked(Alert.alert).mock.calls.at(-1)![2]!;
beforeEach(async () => {
  t = useTestDatabase(await createTestDatabase());
  const doctorId = await createDoctor({ firstName: 'Synthetic', lastName: 'Colleague', relationship: 'colleague' });
  mockParams = { doctorId };
  mockBack.mockReset();
  mockFocused = true;
  mockFlush = null;
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

describe('occasion editor with real autosave scope, live reads and SQLite', () => {
  it('does not pop a newer screen when native reminder acknowledgment finishes after the editor loses focus', async () => {
    let release: () => void = () => {
      throw new Error('Reminder was not requested');
    };
    jest.spyOn(notifications, 'scheduleReminder').mockImplementation(
      () =>
        new Promise<string>((resolve) => {
          release = () => resolve('synthetic-notification');
        }),
    );
    await mount();
    await type('تاریخ', '1403/12/30');
    await press('افزودن مناسبت');
    expect(published()).toHaveLength(1);
    expect(mockBack).not.toHaveBeenCalled();
    mockFocused = false;
    await act(async () => {
      release();
      await settle();
    });
    expect(mockBack).not.toHaveBeenCalled();
    expect(input('عنوان').props.editable).toBe(false);
    expect(tree!.root.findAllByType(Button).filter((n) => n.props.label === 'بستن')).toHaveLength(1);
    const saved = databaseRows(t);
    mockFocused = true;
    await press('بستن');
    expect(mockBack).toHaveBeenCalledTimes(1);
    expect(databaseRows(t)).toEqual(saved);
  });
  it('defaults a religious occasion to a one-off date rather than inventing an annual Solar recurrence', async () => {
    await mount();
    await act(async () => {
      tree!.root
        .findAllByType(ChipSelect)
        .find((n) => n.props.label === 'نوع')!
        .props.onChange('religious');
      await settle();
    });
    expect(tree!.root.findAllByType(Toggle).find((n) => n.props.label === 'هر سال در همین روز شمسی')!.props.value).toBe(
      false,
    );
    await type('تاریخ', '1405/07/16');
    await press('افزودن مناسبت');
    expect(published()[0]).toMatchObject({
      kind: 'religious',
      isRecurring: false,
      onDate: '2026-10-08',
      jalaliMonth: null,
      jalaliDay: null,
    });
  });
  it('keeps one explicit stale close after a completed editor survives dataset replacement', async () => {
    await mount();
    await type('تاریخ', '1403/12/30');
    mockFocused = false;
    await press('افزودن مناسبت');
    expect(published()).toHaveLength(1);
    await act(async () => {
      snapshotDataset(t)();
      await settle();
    });
    const restored = databaseRows(t);
    mockFocused = true;
    expect(button('بستن').props.disabled).toBe(false);
    await press('بستن');
    await act(async () => {
      dialog()[1]!.onPress!();
      await settle();
    });
    expect(mockBack).toHaveBeenCalledTimes(1);
    expect(databaseRows(t)).toEqual(restored);
    await act(async () => expect(await mockFlush!()).toBe(true));
  });
  it('recovers exact incomplete date and message text without publishing an occasion', async () => {
    await mount();
    await type('تاریخ', '1405/12/');
    await type('متن آمادهٔ تبریک', '  Greeting\n\nKeep this last line\n');
    await act(async () => expect(await mockFlush!()).toBe(true));
    expect(published()).toEqual([]);
    await unmount();
    await mount();
    expect(input('تاریخ').props.value).toBe('1405/12/');
    expect(input('متن آمادهٔ تبریک').props.value).toBe('  Greeting\n\nKeep this last line\n');
    await press('افزودن مناسبت');
    expect(published()).toEqual([]);
    expect(mockBack).not.toHaveBeenCalled();
    await type('تاریخ', '1403/12/30');
    await press('افزودن مناسبت');
    expect(published()).toHaveLength(1);
    expect(published()[0]).toMatchObject({ jalaliMonth: 12, jalaliDay: 30 });
    expect(drafts()[0]?.deletedAt).not.toBeNull();
    expect(mockBack).toHaveBeenCalledTimes(1);
  });
  it('retains input and blocks leaving on failed storage, then saves the latest keystroke once', async () => {
    await mount();
    t.conn.execSync(
      "CREATE TRIGGER fail_draft BEFORE INSERT ON occasion_form_drafts BEGIN SELECT RAISE(ABORT, 'synthetic failure'); END",
    );
    await type('تاریخ', '1405/07/16');
    await type('عنوان', 'Still on screen');
    await act(async () => expect(await mockFlush!()).toBe(false));
    await press('افزودن مناسبت');
    expect(published()).toEqual([]);
    expect(input('عنوان').props.value).toBe('Still on screen');
    expect(mockBack).not.toHaveBeenCalled();
    t.conn.execSync('DROP TRIGGER fail_draft');
    await press('ذخیره نشد؛ تلاش دوباره');
    await type('عنوان', 'Last keystroke');
    await act(async () => {
      const save = button('افزودن مناسبت');
      save.props.onPress();
      save.props.onPress();
      await settle();
    });
    expect(published()).toHaveLength(1);
    expect(published()[0]?.title).toBe('Last keystroke');
    expect(mockBack).toHaveBeenCalledTimes(1);
  });
  it('flushes raw input before backgrounding without scheduling it', async () => {
    let background: (state: AppStateStatus) => void = () => {};
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, callback) => {
      background = callback;
      return { remove: jest.fn() };
    });
    await mount();
    await type('تاریخ', 'not yet a date');
    await act(async () => {
      background('background');
      await settle();
    });
    expect(decodeOccasionForm(drafts()[0]!.body).fields.dateText).toBe('not yet a date');
    expect(published()).toEqual([]);
  });
  it('gates the initial read, retries it, and never reseeds typed text on a failed refresh', async () => {
    t.conn.execSync('ALTER TABLE occasion_form_drafts RENAME TO hidden_drafts');
    await mount();
    expect(tree!.root.findAllByType(Input)).toHaveLength(0);
    t.conn.execSync('ALTER TABLE hidden_drafts RENAME TO occasion_form_drafts');
    await act(async () => {
      tree!.root
        .findAllByType(ErrorNotice)
        .find((n) => n.props.error)!
        .props.onRetry();
      await settle();
    });
    await type('عنوان', 'Local input', true);
    t.conn.execSync('ALTER TABLE occasion_form_drafts RENAME TO hidden_drafts');
    await refresh();
    expect(input('عنوان').props.value).toBe('Local input');
    t.conn.execSync('ALTER TABLE hidden_drafts RENAME TO occasion_form_drafts');
    await act(async () => {
      tree!.root
        .findAllByType(ErrorNotice)
        .find((n) => n.props.error)!
        .props.onRetry();
      await settle();
    });
    expect(input('عنوان').props.value).toBe('Local input');
  });
  it('exposes conflict recovery after a failed publication and compares before overwriting', async () => {
    const occasionId = await createOccasion({
      doctorId: mockParams.doctorId,
      kind: 'birthday',
      title: 'Original',
      jalaliMonth: 7,
      jalaliDay: 16,
    });
    mockParams.occasionId = occasionId;
    await mount();
    await type('عنوان', 'My wording', true);
    await updateOccasion(occasionId, { title: 'Other editor' });
    await press('ثبت تغییرات');
    expect(published()[0]?.title).toBe('Other editor');
    expect(input('عنوان').props.value).toBe('My wording');
    await press('بررسی نسخهٔ ذخیره‌شده');
    await press('نگه‌داشتن نوشتهٔ من');
    await press('ثبت تغییرات');
    expect(published()[0]?.title).toBe('My wording');
    expect(mockBack).toHaveBeenCalledTimes(1);
  });
  it('invalidates cancelled discard callbacks and consumes a confirmed discard only once', async () => {
    await mount();
    await type('عنوان', 'Keep me', true);
    await press('حذف پیش‌نویس');
    const old = dialog();
    await act(async () => {
      old[0]!.onPress!();
      old[1]!.onPress!();
      await settle();
    });
    expect(drafts()[0]?.deletedAt).toBeNull();
    expect(mockBack).not.toHaveBeenCalled();
    await press('حذف پیش‌نویس');
    const accepted = dialog()[1]!;
    await act(async () => {
      accepted.onPress!();
      accepted.onPress!();
      await settle();
    });
    expect(drafts()[0]?.deletedAt).not.toBeNull();
    expect(mockBack).toHaveBeenCalledTimes(1);
  });
  it('fences old pending dialog and Save callbacks after real dataset replacement without losing visible input', async () => {
    await mount();
    await type('عنوان', 'Belongs to old context', true);
    const replace = snapshotDataset(t);
    await press('حذف پیش‌نویس');
    const oldAccept = dialog()[1]!;
    await act(async () => {
      replace();
      await settle();
    });
    const restored = databaseRows(t);
    await act(async () => {
      oldAccept.onPress!();
      await settle();
    });
    await press('افزودن مناسبت');
    expect(databaseRows(t)).toEqual(restored);
    expect(input('عنوان').props.value).toBe('Belongs to old context');
    expect(mockBack).not.toHaveBeenCalled();
    await press('بستن');
    await act(async () => {
      dialog()[1]!.onPress!();
      await settle();
    });
    expect(mockBack).toHaveBeenCalledTimes(1);
    await act(async () => expect(await mockFlush!()).toBe(true));
    expect(databaseRows(t)).toEqual(restored);
  });
  it('does not publish again if navigation failed after a successful commit', async () => {
    await mount();
    await type('تاریخ', '1405/07/16');
    mockBack.mockImplementationOnce(() => {
      throw new Error('synthetic navigation failure');
    });
    await press('افزودن مناسبت');
    const saved = databaseRows(t);
    expect(published()).toHaveLength(1);
    expect(input('عنوان').props.editable).toBe(false);
    await act(async () => {
      tree!.root
        .findAllByType(Button)
        .find((n) => n.props.label === 'بستن')!
        .props.onPress();
      await settle();
    });
    expect(published()).toHaveLength(1);
    expect(databaseRows(t)).toEqual(saved);
    expect(mockBack).toHaveBeenCalledTimes(2);
  });
});
