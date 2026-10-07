import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Alert, AppState, type AppStateStatus } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { alertError } from '@/components/feedback';
import { PickerModal } from '@/components/picker-modal';
import { Button, ChipSelect, Input } from '@/components/ui';
import { encounterFormDrafts, encounters } from '@/db/schema';
import { createPatient } from '@/features/patients/queries';
import { DatasetBusyError, DatasetChangedError } from '@/lib/dataset-write';
import { databaseRows, replacementFailure, snapshotDataset } from '@/test/dataset-snapshot';
import { useTestDatabase } from '@/test/db-client';
import { createTestDatabase, type TestDatabase } from '@/test/sqljs';

import { DischargeScreen } from './discharge-screen';
import { EncounterFormScreen } from './encounter-form-screen';
import { decodeEncounterForm } from './form-draft';
import { saveEncounterFormDraft } from './form-draft-queries';
import * as draftQueries from './form-draft-queries';
import { openEncounter, updateEncounter } from './queries';

let mockPatientId: string;
let mockEncounterId: string | undefined;
let mockFlush: (() => Promise<boolean>) | null;
const mockBack = jest.fn();
const mockListeners = new Set<(event: { tableName: string }) => void>();
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ id: mockPatientId, encounterId: mockEncounterId }),
  useRouter: () => ({ back: mockBack }),
}));
jest.mock('@/db/client', () => jest.requireActual('@/test/db-client'));
jest.mock('@/platform/notifications', () => jest.requireActual('@/test/mocks/notifications'));
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
jest.mock('@/components/error-notice', () => ({ ErrorNotice: 'ErrorNotice' }));
jest.mock('@/components/picker-modal', () => ({ PickerModal: 'PickerModal' }));
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
  SelectField: 'SelectField',
  Text: 'Text',
  Toggle: 'Toggle',
}));

let t: TestDatabase;
let tree: ReactTestRenderer | undefined;
let discharge = false;
async function settle() {
  for (let i = 0; i < 45; i++) await Promise.resolve();
}
async function mount() {
  await act(async () => {
    tree = create(discharge ? <DischargeScreen /> : <EncounterFormScreen />);
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
const stored = () =>
  t.db
    .select()
    .from(encounterFormDrafts)
    .all()
    .find((row) => !row.deletedAt)!;
async function click(label: string) {
  await act(async () => {
    button(label).props.onPress();
    await settle();
  });
}
async function type(label: string, value: string, wait = true) {
  await act(async () => {
    input(label).props.onChangeText(value);
    if (wait) jest.advanceTimersByTime(850);
    await settle();
  });
}
async function confirm(text: string) {
  const options = jest.mocked(Alert.alert).mock.calls.at(-1)![2]!;
  await act(async () => {
    options.find((option) => option.text === text)!.onPress!();
    await settle();
  });
}
beforeEach(async () => {
  t = useTestDatabase(await createTestDatabase());
  mockPatientId = await createPatient({ firstName: 'Synthetic', lastName: 'Episode', status: 'outpatient' });
  mockEncounterId = undefined;
  mockFlush = null;
  discharge = false;
  mockBack.mockReset();
  mockListeners.clear();
  jest.mocked(alertError).mockClear();
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  // The mocked screen clock and default admission timestamps must agree.
  // A real wall clock after 12:00 made date validation mask the conflict test.
  jest.useFakeTimers({ now: new Date('2026-10-01T12:00:00Z') });
});
afterEach(async () => {
  await unmount();
  jest.clearAllTimers();
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe('episode draft editor handlers', () => {
  it.each([false, true])(
    'recovers raw text/date/clock without a clinical transition (discharge=%s)',
    async (closing) => {
      discharge = closing;
      if (closing) mockEncounterId = await openEncounter({ patientId: mockPatientId, kind: 'admission' });
      const before = t.db.select().from(encounters).all();
      const field = closing ? 'خلاصه‌ی نتیجه' : 'بخش';
      await mount();
      await type(field, 'Raw input');
      await act(async () => {
        tree!.root
          .findAllByType(ChipSelect)
          .find((node) => node.props.label === (closing ? 'تاریخ ترخیص' : 'تاریخ بستری'))!
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
      expect(input(field).props.value).toBe('Raw input');
      expect(input('تاریخ').props.value).toBe('1405/07/');
      expect(clock().props.value).toBe('2:');
      await click(closing ? 'ثبت ترخیص' : 'ثبت بستری');
      expect(t.db.select().from(encounters).all()).toEqual(before);
      expect(stored().deletedAt).toBeNull();
    },
  );
  it('retains all rapid changes even when no rerender occurs between different fields', async () => {
    await mount();
    await act(async () => {
      input('بخش').props.onChangeText('Ward');
      input('تخت').props.onChangeText('7');
      input('شکایت اصلی (CC)').props.onChangeText('Complaint');
      jest.advanceTimersByTime(850);
      await settle();
    });
    await unmount();
    await mount();
    expect(input('بخش').props.value).toBe('Ward');
    expect(input('تخت').props.value).toBe('7');
    expect(input('شکایت اصلی (CC)').props.value).toBe('Complaint');
    expect(t.db.select().from(encounters).all()).toEqual([]);
  });
  it('blocks exit on failed draft persistence and retains the final input for retry', async () => {
    await mount();
    await type('بخش', 'Latest without pause', false);
    t.sqlite.exec(
      "CREATE TRIGGER fail_draft BEFORE INSERT ON encounter_form_drafts BEGIN SELECT RAISE(ABORT, 'synthetic failure'); END;",
    );
    await act(async () => expect(await mockFlush!()).toBe(false));
    expect(input('بخش').props.value).toBe('Latest without pause');
    t.sqlite.exec('DROP TRIGGER fail_draft');
    await click('ذخیره نشد؛ تلاش دوباره');
    await act(async () => expect(await mockFlush!()).toBe(true));
    expect(decodeEncounterForm(stored().body).fields).toMatchObject({ ward: 'Latest without pause' });
  });
  it('flushes unfinished input on background without publishing an encounter', async () => {
    let listener: ((state: AppStateStatus) => void) | undefined;
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, callback) => {
      listener = callback;
      return { remove: () => {} };
    });
    await mount();
    await type('بخش', 'Before background', false);
    await act(async () => {
      listener!('background');
      await settle();
    });
    expect(decodeEncounterForm(stored().body).fields).toMatchObject({ ward: 'Before background' });
    expect(t.db.select().from(encounters).all()).toEqual([]);
  });
  it('requires explicit comparison before replacing a newer raw draft', async () => {
    await mount();
    await type('بخش', 'First');
    const row = stored();
    const changed = decodeEncounterForm(row.body);
    if (changed.mode === 'discharge') throw new Error('test mode');
    changed.fields.ward = 'Other editor';
    await saveEncounterFormDraft(row.id, 'new', mockPatientId, null, changed, row.revision);
    await type('بخش', 'My newer text');
    expect(decodeEncounterForm(stored().body).fields).toMatchObject({ ward: 'Other editor' });
    await click('بررسی نسخهٔ ذخیره‌شده');
    await click('نگه‌داشتن نوشتهٔ من');
    expect(decodeEncounterForm(stored().body).fields).toMatchObject({ ward: 'My newer text' });
    await click('ثبت بستری');
    expect(t.db.select().from(encounters).all()).toHaveLength(1);
    expect(t.db.select().from(encounters).get()?.ward).toBe('My newer text');
  });
  it('keeps loaded text when the clinical target changes, until an explicit comparison is accepted', async () => {
    mockEncounterId = await openEncounter({ patientId: mockPatientId, kind: 'admission', ward: 'Initial' });
    await mount();
    await type('بخش', 'Mine');
    await updateEncounter(mockEncounterId, { ward: 'External correction' });
    await click('ذخیره تغییرات');
    expect(input('بخش').props.value).toBe('Mine');
    expect(t.db.select().from(encounters).get()?.ward).toBe('External correction');
    await click('بررسی نسخهٔ ذخیره‌شده');
    await click('نگه‌داشتن نوشتهٔ من');
    await click('ذخیره تغییرات');
    expect(t.db.select().from(encounters).get()?.ward).toBe('Mine');
  });
  it('requires confirmation to replace visible text with a newer stored draft', async () => {
    await mount();
    await type('بخش', 'First');
    const row = stored();
    const newer = decodeEncounterForm(row.body);
    if (newer.mode === 'discharge') throw new Error('test mode');
    newer.fields.ward = 'Stored elsewhere';
    await saveEncounterFormDraft(row.id, 'new', mockPatientId, null, newer, row.revision);
    await type('بخش', 'My unsaved value');
    await click('بررسی نسخهٔ ذخیره‌شده');
    await click('بارگذاری نسخهٔ ذخیره‌شده');
    await confirm('انصراف');
    expect(input('بخش').props.value).toBe('My unsaved value');
    expect(decodeEncounterForm(stored().body).fields).toMatchObject({ ward: 'Stored elsewhere' });
    await click('بارگذاری نسخهٔ ذخیره‌شده');
    await confirm('بارگذاری');
    expect(input('بخش').props.value).toBe('Stored elsewhere');
    expect(t.db.select().from(encounters).all()).toEqual([]);
  });
  it('reports successful discard separately from a later navigation failure', async () => {
    await mount();
    await type('بخش', 'Discard only draft');
    mockBack.mockImplementationOnce(() => {
      throw new Error('synthetic navigation failure');
    });
    await click('حذف پیش‌نویس');
    await confirm('حذف پیش‌نویس');
    expect(t.db.select().from(encounterFormDrafts).get()?.deletedAt).not.toBeNull();
    expect(jest.mocked(alertError).mock.calls.at(-1)?.[0]).toBe('پیش‌نویس حذف شد؛ صفحه بسته نشد');
    await click('بستن');
    expect(t.db.select().from(encounters).all()).toEqual([]);
  });
  it('requires confirmation to discard visible text', async () => {
    await mount();
    await type('بخش', 'Keep me');
    await click('حذف پیش‌نویس');
    await confirm('انصراف');
    expect(stored().deletedAt).toBeNull();
    expect(input('بخش').props.value).toBe('Keep me');
    await click('حذف پیش‌نویس');
    await confirm('حذف پیش‌نویس');
    expect(t.db.select().from(encounterFormDrafts).get()?.deletedAt).not.toBeNull();
    expect(t.db.select().from(encounters).all()).toEqual([]);
    await unmount();
    await mount();
    expect(input('بخش').props.value).toBe('');
  });
  it('does not mutate twice when navigation fails after a successful publication', async () => {
    mockBack.mockImplementationOnce(() => {
      throw new Error('synthetic navigation failure');
    });
    await mount();
    await type('بخش', 'Published once');
    await click('ثبت بستری');
    expect(t.db.select().from(encounters).all()).toHaveLength(1);
    await click('ثبت بستری');
    expect(t.db.select().from(encounters).all()).toHaveLength(1);
    expect(t.db.select().from(encounterFormDrafts).get()?.committedEncounterId).not.toBeNull();
  });
});

describe('episode form original intent', () => {
  const cases = [
    { mode: 'new', field: 'بخش', save: 'ثبت بستری' },
    { mode: 'edit', field: 'بخش', save: 'ذخیره تغییرات' },
    { mode: 'discharge', field: 'خلاصه‌ی نتیجه', save: 'ثبت ترخیص' },
  ];
  async function prepare(mode: string) {
    discharge = mode === 'discharge';
    if (mode !== 'new') mockEncounterId = await openEncounter({ patientId: mockPatientId, kind: 'admission' });
    await mount();
  }
  it.each(cases)(
    'refuses a clean $mode publication and retains raw input after same-id restore',
    async ({ mode, field, save }) => {
      await prepare(mode);
      await type(field, 'Kept raw input');
      await act(async () => {
        snapshotDataset(t)();
        await settle();
      });
      const before = databaseRows(t);
      await click(save);
      expect(databaseRows(t)).toEqual(before);
      expect(input(field).props.value).toBe('Kept raw input');
      expect(mockBack).not.toHaveBeenCalled();
      expect(alertError).toHaveBeenLastCalledWith('ثبت نشد', expect.any(DatasetChangedError));
    },
  );
  it.each(cases)('refuses a delayed $mode draft deletion', async ({ mode, field }) => {
    await prepare(mode);
    await type(field, 'Retained draft');
    await click('حذف پیش‌نویس');
    const held = jest
      .mocked(Alert.alert)
      .mock.calls.at(-1)![2]!
      .find((option) => option.text === 'حذف پیش‌نویس')!.onPress!;
    await act(async () => {
      snapshotDataset(t)();
      await settle();
    });
    const before = databaseRows(t);
    await act(async () => {
      held();
      await settle();
    });
    expect(databaseRows(t)).toEqual(before);
    expect(input(field).props.value).toBe('Retained draft');
    expect(mockBack).not.toHaveBeenCalled();
  });
  it.each(['load', 'keep'])('refuses a held %s comparison action before reset or adoption', async (action) => {
    await prepare('edit');
    await type('بخش', 'My ward');
    await updateEncounter(mockEncounterId!, { ward: 'External ward' });
    await click('ذخیره تغییرات');
    await click('بررسی نسخهٔ ذخیره‌شده');
    let held: () => void;
    if (action === 'load') {
      await click('بارگذاری نسخهٔ ذخیره‌شده');
      held = jest
        .mocked(Alert.alert)
        .mock.calls.at(-1)![2]!
        .find((option) => option.text === 'بارگذاری')!.onPress!;
    } else held = button('نگه‌داشتن نوشتهٔ من').props.onPress;
    await act(async () => {
      snapshotDataset(t)();
      await settle();
    });
    const before = databaseRows(t);
    await act(async () => {
      held();
      await settle();
    });
    expect(databaseRows(t)).toEqual(before);
    expect(input('بخش').props.value).toBe('My ward');
    expect(alertError).toHaveBeenCalledWith(expect.any(String), expect.any(DatasetChangedError));
  });
  it('refuses a delayed mistaken-encounter deletion', async () => {
    await prepare('edit');
    await type('بخش', 'Keep episode');
    await click('حذف (ثبت اشتباه)');
    const held = jest
      .mocked(Alert.alert)
      .mock.calls.at(-1)![2]!
      .find((option) => option.text === 'حذف')!.onPress!;
    await act(async () => {
      snapshotDataset(t)();
      await settle();
    });
    const before = databaseRows(t);
    await act(async () => {
      held();
      await settle();
    });
    expect(databaseRows(t)).toEqual(before);
    expect(input('بخش').props.value).toBe('Keep episode');
    expect(mockBack).not.toHaveBeenCalled();
  });
  it.each(['بیمارستان / مرکز', 'اتند'])('refuses old inline %s creation before related writes', async (title) => {
    await prepare('edit');
    const picker = tree!.root.findAllByType(PickerModal).find((node) => node.props.title === title)!;
    await act(async () => {
      snapshotDataset(t)();
      await settle();
    });
    const before = databaseRows(t);
    await act(async () => {
      await expect(picker.props.onCreate('Synthetic related record')).rejects.toBeInstanceOf(DatasetChangedError);
    });
    expect(databaseRows(t)).toEqual(before);
  });
  it('retains admission through final publication acknowledgment', async () => {
    const original = draftQueries.commitEncounterFormDraft;
    let release = () => {};
    jest.spyOn(draftQueries, 'commitEncounterFormDraft').mockImplementationOnce(async (...args) => {
      const id = await original(...args);
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      return id;
    });
    await prepare('new');
    await type('بخش', 'One episode');
    await click('ثبت بستری');
    const failure = replacementFailure();
    await act(async () => {
      release();
      await settle();
    });
    expect(failure).toBeInstanceOf(DatasetBusyError);
    expect(mockBack).toHaveBeenCalledTimes(1);
  });
});
