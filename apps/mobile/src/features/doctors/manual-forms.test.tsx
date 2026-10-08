import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { eq } from 'drizzle-orm';
import type { ReactElement } from 'react';
import { Alert, AppState, View, type AppStateStatus } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { AutosaveScope } from '@/components/autosave-scope';
import { ErrorNotice } from '@/components/error-notice';
import { alertError } from '@/components/feedback';
import { PickerModal } from '@/components/picker-modal';
import { ScreenOptions } from '@/components/screen-options';
import { Button, ChipSelect, Column, Input, Screen } from '@/components/ui';
import { doctorFormDrafts, doctorProfiles, doctorRatings, doctors, places } from '@/db/schema';
import { DatasetBusyError } from '@/lib/dataset-write';
import { databaseRows, replacementFailure, snapshotDataset } from '@/test/dataset-snapshot';
import { useTestDatabase } from '@/test/db-client';
import { createTestDatabase, type TestDatabase } from '@/test/sqljs';

import { DoctorFormScreen } from './doctor-form-screen';
import { DoctorFormConflict } from './edit-basis';
import { decodeDoctorForm, initialDoctorForm } from './form-draft';
import { doctorFormQuery, saveDoctorFormDraft } from './form-draft-queries';
import * as draftQueries from './form-draft-queries';
import { ProfileFormScreen } from './profile-form-screen';
import { createDoctor, doctorQuery, updateDoctor } from './queries';
import { RatingScreen } from './rating-screen';
import { doctorProfileQuery, saveDoctorProfile } from './ratings-queries';

let mockParams: { doctorId?: string };
let mockFocused = true;
let mockFlush: (() => Promise<boolean>) | null;
const mockBack = jest.fn();
const mockNavigation = { isFocused: () => mockFocused, setOptions: jest.fn() };
const mockListeners = new Set<(event: { tableName: string }) => void>();
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => mockParams,
  useRouter: () => ({ back: mockBack }),
  useNavigation: () => mockNavigation,
}));
jest.mock('expo-router/react-navigation', () => ({ useNavigation: () => mockNavigation }));
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
jest.mock('@/components/use-now', () => ({ useNow: () => new Date('2026-10-08T12:00:00Z').getTime() }));
jest.mock('@/components/ui', () => ({
  Button: 'Button',
  Card: 'Card',
  ChipSelect: 'ChipSelect',
  Column: jest.requireActual<typeof import('@/components/ui/layout')>('@/components/ui/layout').Column,
  EmptyState: 'EmptyState',
  Input: 'Input',
  Row: 'Row',
  Screen: jest.requireActual<typeof import('@/components/ui/layout')>('@/components/ui/layout').Screen,
  SectionHeader: 'SectionHeader',
  SelectField: 'SelectField',
  Text: 'Text',
  Toggle: 'Toggle',
}));
jest.mock('@/components/collapsible-section', () => ({ CollapsibleSection: 'CollapsibleSection' }));
jest.mock('@/components/picker-modal', () => ({ PickerModal: 'PickerModal' }));
jest.mock('react-native-keyboard-controller', () => ({
  KeyboardAwareScrollView: jest.requireActual<typeof import('react-native')>('react-native').ScrollView,
  KeyboardController: { isVisible: () => false },
}));
jest.mock('@/components/error-notice', () => ({ ErrorNotice: 'ErrorNotice' }));
jest.mock('@/components/feedback', () => ({ alertError: jest.fn(), notify: jest.fn() }));
jest.mock('@/db/client', () => jest.requireActual('@/test/db-client'));
jest.mock('@/platform/notifications', () => jest.requireActual('@/test/mocks/notifications'));

let t: TestDatabase;
let doctorId: string;
let tree: ReactTestRenderer | undefined;
const forms = [
  { kind: 'doctor', element: () => <DoctorFormScreen />, text: 'یادداشت', save: 'ذخیره', table: 'doctors' },
  {
    kind: 'profile',
    element: () => <ProfileFormScreen />,
    text: 'یادداشت شخصی',
    save: 'ذخیره',
    table: 'doctor_profiles',
  },
  {
    kind: 'rating',
    element: () => <RatingScreen />,
    text: 'دلیل و توضیح',
    save: 'ثبت امتیاز',
    table: 'doctor_ratings',
  },
] as const;
const input = (label: string) => tree!.root.findAllByType(Input).find((node) => node.props.label === label)!;
const button = (label: string) => tree!.root.findAllByType(Button).find((node) => node.props.label === label)!;
async function settle() {
  for (let i = 0; i < 65; i++) await Promise.resolve();
}
async function mount(element: ReactElement) {
  await act(async () => {
    tree = create(element);
    await settle();
  });
}
async function type(label: string, value: string) {
  await act(async () => {
    input(label).props.onChangeText(value);
    await settle();
  });
}
async function press(label: string) {
  await act(async () => {
    button(label).props.onPress();
    await settle();
  });
}
async function refresh(tableName: string) {
  await act(async () => {
    mockListeners.forEach((listener) => listener({ tableName }));
    jest.advanceTimersByTime(80);
    await settle();
  });
}
beforeEach(async () => {
  t = useTestDatabase(await createTestDatabase());
  doctorId = await createDoctor({ firstName: 'Synthetic', lastName: 'Colleague', notes: 'Original' });
  mockParams = { doctorId };
  mockFocused = true;
  mockFlush = null;
  mockBack.mockReset();
  mockNavigation.setOptions.mockReset();
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  mockListeners.clear();
  jest.mocked(alertError).mockClear();
  jest.useFakeTimers();
});
afterEach(async () => {
  await act(async () => {
    tree?.unmount();
    await settle();
  });
  tree = undefined;
  jest.clearAllTimers();
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe('raw doctor forms with real SQLite and original intent', () => {
  it.each(forms)('raw cold recovery restores exact unfinished $kind input without publication', async (form) => {
    await mount(form.element());
    const clinical = databaseRows(t);
    expect(t.db.select().from(doctorFormDrafts).all()).toEqual([]);
    await type(form.text, '  Raw exact\nفارسی / English  ');
    if (form.kind === 'doctor') await type('نام', '  ');
    if (form.kind === 'profile') await type('تاریخ تولد', '۱۴۰۵/');
    if (form.kind === 'rating')
      await act(async () => {
        tree!.root.findAllByType(ChipSelect)[0]!.props.onChange('4');
        tree!.root.findAllByType(ChipSelect)[1]!.props.onChange(null);
        await settle();
      });
    await act(async () => {
      jest.advanceTimersByTime(800);
      await settle();
    });
    const saved = t.db.select().from(doctorFormDrafts).get()!;
    expect(saved).toMatchObject({ revision: 1, deletedAt: null, committedEntityId: null });
    expect(databaseRows(t).doctors).toEqual(clinical.doctors);
    expect(databaseRows(t).doctor_profiles).toEqual(clinical.doctor_profiles);
    expect(databaseRows(t).doctor_ratings).toEqual(clinical.doctor_ratings);
    await act(async () => {
      tree!.unmount();
      await settle();
    });
    tree = undefined;
    await mount(form.element());
    expect(input(form.text).props.value).toBe('  Raw exact\nفارسی / English  ');
    if (form.kind === 'doctor') expect(input('نام').props.value).toBe('  ');
    if (form.kind === 'profile') expect(input('تاریخ تولد').props.value).toBe('۱۴۰۵/');
    if (form.kind === 'rating') {
      expect(tree!.root.findAllByType(ChipSelect)[0]!.props.value).toBe('4');
      expect(tree!.root.findAllByType(ChipSelect)[1]!.props.value).toBeNull();
    }
    expect(t.db.select().from(doctorFormDrafts).all()).toEqual([saved]);
    expect(tree!.root.findAllByType(AutosaveScope)).toHaveLength(1);
  });
  it('raw cold recovery resumes an incomplete new directory form without creating a doctor', async () => {
    mockParams = {};
    await mount(<DoctorFormScreen />);
    expect(t.db.select().from(doctorFormDrafts).all()).toEqual([]);
    await type('نام', '  New partial  ');
    await type('موبایل', ' +۱۲۳ ');
    await act(async () => {
      jest.advanceTimersByTime(800);
      await settle();
    });
    expect(t.db.select().from(doctors).all()).toHaveLength(1);
    await act(async () => {
      tree!.unmount();
      await settle();
    });
    tree = undefined;
    await mount(<DoctorFormScreen />);
    expect(input('نام').props.value).toBe('  New partial  ');
    expect(input('نام خانوادگی').props.value).toBe('');
    expect(input('موبایل').props.value).toBe(' +۱۲۳ ');
    await press('ثبت پزشک');
    expect(t.db.select().from(doctors).all()).toHaveLength(1);
    expect(mockBack).not.toHaveBeenCalled();
  });
  it.each(forms)('flushes the $kind raw writer on background and through its existing leave guard', async (form) => {
    const listeners: ((state: AppStateStatus) => void)[] = [];
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, listener) => {
      listeners.push(listener);
      return { remove: jest.fn() };
    });
    await mount(form.element());
    await type(form.text, 'Background exact input');
    await act(async () => {
      listeners.forEach((listener) => listener('background'));
      await settle();
    });
    const key = form.kind === 'doctor' ? 'notes' : form.kind === 'profile' ? 'personalNotes' : 'reasoning';
    expect(decodeDoctorForm(t.db.select().from(doctorFormDrafts).get()!.body).fields).toMatchObject({
      [key]: 'Background exact input',
    });
    await type(form.text, 'Final leave input');
    await act(async () => {
      expect(await mockFlush!()).toBe(true);
      await settle();
    });
    expect(decodeDoctorForm(t.db.select().from(doctorFormDrafts).get()!.body).fields).toMatchObject({
      [key]: 'Final leave input',
    });
  });
  it('waits for the new directory draft read and exposes retry instead of mounting a blank form over it', async () => {
    mockParams = {};
    t.sqlite.exec('ALTER TABLE doctor_form_drafts RENAME TO unavailable_doctor_drafts');
    await mount(<DoctorFormScreen />);
    expect(tree!.root.findAllByType(Input)).toHaveLength(0);
    const notice = tree!.root.findAllByType(ErrorNotice).find((node) => node.props.error)!;
    expect(notice).toBeDefined();
    t.sqlite.exec('ALTER TABLE unavailable_doctor_drafts RENAME TO doctor_form_drafts');
    await act(async () => {
      notice.props.onRetry();
      await settle();
    });
    expect(input('نام').props.value).toBe('');
    expect(t.db.select().from(doctorFormDrafts).all()).toEqual([]);
  });
  it.each(forms)(
    'soft-discards the acknowledged $kind raw draft while preserving its form/header/native parent',
    async (form) => {
      await mount(form.element());
      const screen = tree!.root.findByType(Screen);
      const parent = tree!.root.findAllByType(Column).find((node) => node.props.collapsable === false)!;
      const nativeParent = parent.findByType(View);
      const clinical = databaseRows(t);
      await type(form.text, 'Discard exact input');
      await act(async () => {
        expect(await mockFlush!()).toBe(true);
        await settle();
      });
      const body = t.db.select().from(doctorFormDrafts).get()!.body;
      mockFocused = false;
      await press('حذف پیش‌نویس');
      const confirm = jest
        .mocked(Alert.alert)
        .mock.calls.at(-1)![2]!
        .find((b) => b.text === 'حذف پیش‌نویس')!.onPress!;
      await act(async () => {
        confirm();
        await settle();
      });
      expect(t.db.select().from(doctorFormDrafts).get()).toMatchObject({ body, revision: 2, committedEntityId: null });
      expect(t.db.select().from(doctorFormDrafts).get()?.deletedAt).not.toBeNull();
      expect(databaseRows(t).doctors).toEqual(clinical.doctors);
      expect(databaseRows(t).doctor_profiles).toEqual(clinical.doctor_profiles);
      expect(databaseRows(t).doctor_ratings).toEqual(clinical.doctor_ratings);
      expect(tree!.root.findByType(Screen)).toBe(screen);
      expect(parent.findByType(View)).toBe(nativeParent);
      expect(mockNavigation.setOptions).toHaveBeenCalledTimes(1);
      expect(mockBack).not.toHaveBeenCalled();
      expect(input(form.text).props.value).toBe('Discard exact input');
      mockFocused = true;
      await press('بستن');
      expect(mockBack).toHaveBeenCalledTimes(1);
    },
  );
  it('retains a competing raw branch and refuses a third write during a delayed keep-mine confirmation', async () => {
    await mount(<DoctorFormScreen />);
    await type('یادداشت', 'Local exact input');
    const seed = doctorFormQuery('directory', doctorId).get()!;
    const external = initialDoctorForm('directory', seed.doctor, seed.profile);
    external.fields.notes = 'External raw input';
    await saveDoctorFormDraft('external', 'directory', doctorId, external, 0);
    await act(async () => {
      jest.advanceTimersByTime(800);
      await settle();
    });
    expect(input('یادداشت').props.value).toBe('Local exact input');
    await press('بررسی پیش‌نویس ذخیره‌شده');
    await press('نگه‌داشتن نسخهٔ من');
    const confirm = jest
      .mocked(Alert.alert)
      .mock.calls.at(-1)![2]!
      .find((b) => b.text === 'نگه‌داشتن نسخهٔ من')!.onPress!;
    external.fields.phone = '+12025550124';
    await saveDoctorFormDraft('external', 'directory', doctorId, external, 1);
    const before = databaseRows(t);
    await act(async () => {
      confirm();
      await settle();
    });
    expect(databaseRows(t)).toEqual(before);
    expect(input('یادداشت').props.value).toBe('Local exact input');
    await press('بررسی پیش‌نویس ذخیره‌شده');
    await press('نگه‌داشتن نسخهٔ من');
    const accept = jest
      .mocked(Alert.alert)
      .mock.calls.at(-1)![2]!
      .find((b) => b.text === 'نگه‌داشتن نسخهٔ من')!.onPress!;
    await act(async () => {
      accept();
      await settle();
    });
    expect(decodeDoctorForm(t.db.select().from(doctorFormDrafts).get()!.body).fields).toMatchObject({
      notes: 'Local exact input',
    });
    expect((await doctorQuery(doctorId))[0]?.notes).toBe('Original');
  });
  it('loads only the reviewed saved branch and leaves clinical data unchanged', async () => {
    await mount(<ProfileFormScreen />);
    await type('یادداشت شخصی', 'Local profile');
    const seed = doctorFormQuery('profile', doctorId).get()!;
    const external = initialDoctorForm('profile', seed.doctor, seed.profile);
    external.fields.personalNotes = 'Saved profile';
    external.fields.birthDate = '۱۴۰۵/';
    await saveDoctorFormDraft('external', 'profile', doctorId, external, 0);
    await act(async () => {
      jest.advanceTimersByTime(800);
      await settle();
    });
    await press('بررسی پیش‌نویس ذخیره‌شده');
    await press('بارگذاری پیش‌نویس ذخیره‌شده');
    const accept = jest
      .mocked(Alert.alert)
      .mock.calls.at(-1)![2]!
      .find((b) => b.text === 'بارگذاری')!.onPress!;
    await act(async () => {
      accept();
      await settle();
    });
    expect(input('یادداشت شخصی').props.value).toBe('Saved profile');
    expect(input('تاریخ تولد').props.value).toBe('۱۴۰۵/');
    expect(t.db.select().from(doctorProfiles).all()).toEqual([]);
    await press('ذخیره');
    expect(t.db.select().from(doctorProfiles).all()).toEqual([]);
  });
  it('does not replace unreadable saved raw bytes with a blank form', async () => {
    const seed = doctorFormQuery('profile', doctorId).get()!;
    await saveDoctorFormDraft(
      'unreadable',
      'profile',
      doctorId,
      initialDoctorForm('profile', seed.doctor, seed.profile),
      0,
    );
    const body = '{"version":99,"private":"Synthetic private input"}';
    t.db.update(doctorFormDrafts).set({ body }).run();
    const before = databaseRows(t);
    await mount(<ProfileFormScreen />);
    expect(tree!.root.findAllByType(Input)).toHaveLength(0);
    expect(tree!.root.findAllByType(ErrorNotice).some((node) => node.props.error)).toBe(true);
    await press('بستن');
    expect(databaseRows(t)).toEqual(before);
  });
  it('refuses a delayed raw discard after dataset replacement and retains the visible old fields', async () => {
    await mount(<RatingScreen />);
    await type('دلیل و توضیح', 'Copy original raw opinion');
    await act(async () => {
      expect(await mockFlush!()).toBe(true);
      await settle();
    });
    await press('حذف پیش‌نویس');
    const accept = jest
      .mocked(Alert.alert)
      .mock.calls.at(-1)![2]!
      .find((b) => b.text === 'حذف پیش‌نویس')!.onPress!;
    await act(async () => {
      snapshotDataset(t)();
      await settle();
    });
    const before = databaseRows(t);
    await act(async () => {
      accept();
      await settle();
    });
    expect(databaseRows(t)).toEqual(before);
    expect(input('دلیل و توضیح').props.value).toBe('Copy original raw opinion');
    expect(mockBack).not.toHaveBeenCalled();
  });
  it.each(forms)('publishes latest $kind input from its stable header and offers focused Close', async (form) => {
    await mount(form.element());
    const header = () => {
      const right = tree!.root.findByType(ScreenOptions).props.options.headerRight;
      expect(right).toEqual(expect.any(Function));
      return right({}).props;
    };
    const first = header();
    const screen = tree!.root.findByType(Screen);
    const title = tree!.root.findByType(ScreenOptions).props.options.title;
    expect(first.label).toBe(form.save);
    mockFocused = false;
    await act(async () => {
      input(form.text).props.onChangeText('Latest header input');
      first.onPress();
      first.onPress();
      await settle();
    });
    expect(tree!.root.findByType(Screen)).toBe(screen);
    expect(tree!.root.findByType(ScreenOptions).props.options.title).toBe(title);
    expect(mockNavigation.setOptions).toHaveBeenCalledTimes(1);
    expect(header().label).toBe('بستن');
    const rows = t.sqlite
      .exec(`SELECT * FROM ${form.table} WHERE deleted_at IS NULL`)
      .flatMap((r) => r.values.map((v) => Object.fromEntries(r.columns.map((c, i) => [c, v[i]]))));
    expect(rows).toHaveLength(1);
    const text = form.kind === 'doctor' ? 'notes' : form.kind === 'profile' ? 'personal_notes' : 'reasoning';
    expect(rows[0]![text]).toBe('Latest header input');
    expect(mockBack).not.toHaveBeenCalled();
    mockFocused = true;
    await act(async () => {
      header().onPress();
      await settle();
    });
    expect(mockBack).toHaveBeenCalledTimes(1);
  });
  it.each(forms)('can explicitly close a stale $kind form after reviewing its input', async (form) => {
    await mount(form.element());
    await type(form.text, 'Copy before stale close');
    await act(async () => {
      snapshotDataset(t)();
      await settle();
    });
    await refresh('doctors');
    await press('انصراف');
    const confirm = jest
      .mocked(Alert.alert)
      .mock.calls.at(-1)![2]!
      .find((b) => b.text === 'بستن فرم')!.onPress!;
    const before = databaseRows(t);
    await act(async () => {
      confirm();
      await settle();
    });
    expect(mockBack).toHaveBeenCalledTimes(1);
    expect(databaseRows(t)).toEqual(before);
    expect(await mockFlush!()).toBe(true);
  });
  it.each(forms)('rejects stale $kind close confirmation while another route is focused', async (form) => {
    await mount(form.element());
    await act(async () => {
      snapshotDataset(t)();
      await settle();
    });
    await refresh('doctors');
    await press('انصراف');
    const confirm = jest
      .mocked(Alert.alert)
      .mock.calls.at(-1)![2]!
      .find((b) => b.text === 'بستن فرم')!.onPress!;
    mockFocused = false;
    await act(async () => {
      confirm();
      await settle();
    });
    expect(mockBack).not.toHaveBeenCalled();
    await expect(mockFlush!()).rejects.toThrow();
  });
  it.each(forms)('retains the parent intent if the $kind child mounts only after replacement', async (form) => {
    await mount(
      <AutosaveScope>
        <></>
      </AutosaveScope>,
    );
    await act(async () => {
      snapshotDataset(t)();
      await settle();
    });
    const before = databaseRows(t);
    await act(async () => {
      tree!.update(<AutosaveScope>{form.element()}</AutosaveScope>);
      await settle();
    });
    expect(tree!.root.findAllByType(Input)).toHaveLength(0);
    expect(databaseRows(t)).toEqual(before);
  });
  it.each(forms)('publishes the latest same-turn $kind input once', async (form) => {
    await mount(form.element());
    await act(async () => {
      input(form.text).props.onChangeText('Final exact text');
      if (form.kind === 'rating') {
        const axes = tree!.root.findAllByType(ChipSelect);
        axes[0]!.props.onChange('4');
        axes[1]!.props.onChange('5');
      }
      button(form.save).props.onPress();
      button(form.save).props.onPress();
      await settle();
    });
    const rows = t.conn.getAllSync<Record<string, unknown>>(`SELECT * FROM ${form.table}`);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.[form.kind === 'doctor' ? 'notes' : form.kind === 'profile' ? 'personal_notes' : 'reasoning']).toBe(
      'Final exact text',
    );
    if (form.kind === 'rating') expect(rows[0]).toMatchObject({ knowledge: 4, orientation: 5, teaching: null });
    expect(mockBack).toHaveBeenCalledTimes(1);
  });
  it('creates one new doctor with latest same-turn names', async () => {
    mockParams = {};
    await mount(<DoctorFormScreen />);
    await act(async () => {
      input('نام').props.onChangeText('Latest');
      input('نام خانوادگی').props.onChangeText('Created');
      button('ثبت پزشک').props.onPress();
      button('ثبت پزشک').props.onPress();
      await settle();
    });
    expect(t.db.select().from(doctors).all()).toHaveLength(2);
    expect(
      t.db
        .select()
        .from(doctors)
        .all()
        .find((row) => row.firstName === 'Latest')?.lastName,
    ).toBe('Created');
    expect(mockBack).toHaveBeenCalledTimes(1);
  });
  it.each(forms)('retains $kind input through same-id replacement without publishing into it', async (form) => {
    await mount(form.element());
    await type(form.text, 'Keep exact\nraw text');
    await act(async () => {
      snapshotDataset(t)();
      await settle();
    });
    await refresh('doctors');
    const before = databaseRows(t);
    await press(form.save);
    expect(databaseRows(t)).toEqual(before);
    expect(input(form.text).props.value).toBe('Keep exact\nraw text');
    expect(input(form.text).props.editable).toBe(false);
    expect(mockBack).not.toHaveBeenCalled();
  });
  it.each(forms)('keeps $kind raw input when restore omits its doctor', async (form) => {
    t.db.update(doctors).set({ deletedAt: new Date() }).where(eq(doctors.id, doctorId)).run();
    const replacement = snapshotDataset(t);
    t.db.update(doctors).set({ deletedAt: null }).where(eq(doctors.id, doctorId)).run();
    await mount(form.element());
    await type(form.text, 'Keep missing-parent input');
    await act(async () => {
      replacement();
      await settle();
    });
    await refresh('doctors');
    const before = databaseRows(t);
    await press(form.save);
    expect(input(form.text).props.value).toBe('Keep missing-parent input');
    expect(databaseRows(t)).toEqual(before);
    expect(mockBack).not.toHaveBeenCalled();
  });
  it.each(forms)('retains $kind input on parent deletion within the same dataset', async (form) => {
    await mount(form.element());
    await type(form.text, 'Retained after delete');
    t.db.update(doctors).set({ deletedAt: new Date() }).where(eq(doctors.id, doctorId)).run();
    await refresh('doctors');
    const before = databaseRows(t);
    await press(form.save);
    expect(input(form.text).props.value).toBe('Retained after delete');
    expect(databaseRows(t)).toEqual(before);
  });
  it.each(forms)('holds $kind admission and keeps completed input after unfocused acknowledgment', async (form) => {
    let release = () => {};
    const wait = () =>
      new Promise<void>((resolve) => {
        release = resolve;
      });
    const original = draftQueries.commitDoctorFormDraft;
    jest.spyOn(draftQueries, 'commitDoctorFormDraft').mockImplementationOnce(async (...args) => {
      const id = await original(...args);
      await wait();
      return id;
    });
    await mount(form.element());
    await type(form.text, 'Acknowledged input');
    const scroll = tree!.root.findByType(Screen);
    const parent = tree!.root.findAllByType(Column).find((node) => node.props.collapsable === false)!;
    const nativeParent = parent.findByType(View);
    await press(form.save);
    expect(tree!.root.findByType(Screen)).toBe(scroll);
    expect(scroll.props.scroll).toBe(true);
    expect(parent.findByType(View)).toBe(nativeParent);
    expect(nativeParent.props.collapsable).toBe(false);
    expect(replacementFailure()).toBeInstanceOf(DatasetBusyError);
    expect(await mockFlush!()).toBe(false);
    expect(tree!.root.findAllByType(Column).find((node) => node.props.collapsable === false)).toBeDefined();
    await act(async () => {
      input(form.text).props.onChangeText('Should be locked');
      button(form.save).props.onPress();
      button('انصراف').props.onPress();
      mockFocused = false;
      release();
      await settle();
    });
    expect(mockBack).not.toHaveBeenCalled();
    expect(input(form.text).props.value).toBe('Acknowledged input');
    expect(input(form.text).props.editable).toBe(false);
    expect(tree!.root.findByType(Screen)).toBe(scroll);
    expect(parent.findByType(View)).toBe(nativeParent);
    expect(mockNavigation.setOptions).toHaveBeenCalledTimes(1);
    const before = databaseRows(t);
    await press('بستن');
    expect(databaseRows(t)).toEqual(before);
    expect(mockBack).not.toHaveBeenCalled();
    mockFocused = true;
    await press('بستن');
    expect(mockBack).toHaveBeenCalledTimes(1);
  });
  it('rejects a late directory seed after replacement during initial loading', async () => {
    const seed = await doctorFormQuery('directory', doctorId);
    let release = () => {};
    const pending = new Promise<typeof seed>((resolve) => {
      release = () => resolve(seed);
    });
    jest
      .spyOn(draftQueries, 'doctorFormQuery')
      .mockReturnValueOnce(pending as unknown as ReturnType<typeof doctorFormQuery>);
    await mount(<DoctorFormScreen />);
    await act(async () => {
      snapshotDataset(t)();
      release();
      await settle();
    });
    expect(tree!.root.findAllByType(Input)).toHaveLength(0);
  });
  it('rejects inline place creation from the original form after restore', async () => {
    await mount(<DoctorFormScreen />);
    const picker = tree!.root.findAllByType(PickerModal).find((node) => node.props.onCreate)!;
    const createPlace = picker.props.onCreate as (name: string) => Promise<unknown>;
    await act(async () => {
      snapshotDataset(t)();
      await settle();
    });
    const before = databaseRows(t);
    await expect(createPlace('Synthetic center')).rejects.toThrow();
    expect(databaseRows(t)).toEqual(before);
    expect(t.db.select().from(places).all()).toHaveLength(0);
  });
  it('offers profile initial-read retry and keeps incomplete raw date/text through failed refresh', async () => {
    t.sqlite.exec('ALTER TABLE doctor_profiles RENAME TO unavailable_profiles');
    await mount(<ProfileFormScreen />);
    const notice = tree!.root.findAllByType(ErrorNotice).find((node) => node.props.error)!;
    expect(notice).toBeDefined();
    expect(tree!.root.findAllByType(Input)).toHaveLength(0);
    t.sqlite.exec('ALTER TABLE unavailable_profiles RENAME TO doctor_profiles');
    await act(async () => {
      notice.props.onRetry();
      await settle();
    });
    await type('یادداشت شخصی', 'Keep exact profile input');
    await type('تاریخ تولد', '1405/');
    t.sqlite.exec('ALTER TABLE doctor_profiles RENAME TO unavailable_profiles');
    await refresh('doctors');
    expect(input('یادداشت شخصی').props.value).toBe('Keep exact profile input');
    expect(input('تاریخ تولد').props.value).toBe('1405/');
    expect(tree!.root.findAllByType(ErrorNotice).some((node) => node.props.error)).toBe(true);
    t.sqlite.exec('ALTER TABLE unavailable_profiles RENAME TO doctor_profiles');
    await press('ذخیره');
    expect(t.db.select().from(doctorProfiles).all()).toHaveLength(0);
    expect(mockBack).not.toHaveBeenCalled();
  });
  it('preserves external directory changes while reporting conflicting local edits without loss', async () => {
    await mount(<DoctorFormScreen />);
    await type('موبایل', '+12025550123');
    await updateDoctor(doctorId, { notes: 'External note', starred: true, tags: ['external'] });
    await refresh('doctors');
    await press('ذخیره');
    expect((await doctorQuery(doctorId))[0]).toMatchObject({
      phone: '+12025550123',
      notes: 'External note',
      starred: true,
      tags: ['external'],
    });
  });
  it('refuses a profile same-field conflict and retains text for review', async () => {
    await saveDoctorProfile(doctorId, { personalNotes: 'Initial' });
    await mount(<ProfileFormScreen />);
    await type('یادداشت شخصی', 'Local');
    await saveDoctorProfile(doctorId, { personalNotes: 'External' });
    await refresh('doctor_profiles');
    const before = databaseRows(t).doctor_profiles;
    await press('ذخیره');
    expect(databaseRows(t).doctor_profiles).toEqual(before);
    expect(decodeDoctorForm(t.db.select().from(doctorFormDrafts).get()!.body).fields).toMatchObject({
      personalNotes: 'Local',
    });
    expect(input('یادداشت شخصی').props.value).toBe('Local');
    expect(input('یادداشت شخصی').props.editable).toBe(true);
    expect(alertError).toHaveBeenLastCalledWith('ذخیره نشد', expect.any(DoctorFormConflict));
    expect(mockBack).not.toHaveBeenCalled();
    expect((await doctorProfileQuery(doctorId))[0]?.personalNotes).toBe('External');
  });
  it('retains SQL-failed rating input and retries once after the failure is repaired', async () => {
    await mount(<RatingScreen />);
    await type('دلیل و توضیح', 'Retry exact text');
    t.sqlite.exec(
      "CREATE TRIGGER fail_rating BEFORE INSERT ON doctor_ratings BEGIN SELECT RAISE(ABORT, 'synthetic failure'); END",
    );
    await press('ثبت امتیاز');
    expect(input('دلیل و توضیح').props.value).toBe('Retry exact text');
    expect(input('دلیل و توضیح').props.editable).toBe(true);
    expect(mockBack).not.toHaveBeenCalled();
    t.sqlite.exec('DROP TRIGGER fail_rating');
    await press('ثبت امتیاز');
    expect(t.db.select().from(doctorRatings).all()).toMatchObject([{ reasoning: 'Retry exact text' }]);
    expect(mockBack).toHaveBeenCalledTimes(1);
  });
});
