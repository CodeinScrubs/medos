import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { eq } from 'drizzle-orm';
import type { ReactElement } from 'react';
import { Alert, View } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { AutosaveScope } from '@/components/autosave-scope';
import { ErrorNotice } from '@/components/error-notice';
import { alertError } from '@/components/feedback';
import { PickerModal } from '@/components/picker-modal';
import { Button, ChipSelect, Column, Input, Screen } from '@/components/ui';
import { doctorProfiles, doctorRatings, doctors, places } from '@/db/schema';
import { DatasetBusyError } from '@/lib/dataset-write';
import { databaseRows, replacementFailure, snapshotDataset } from '@/test/dataset-snapshot';
import { useTestDatabase } from '@/test/db-client';
import { createTestDatabase, type TestDatabase } from '@/test/sqljs';

import { DoctorFormScreen } from './doctor-form-screen';
import { DoctorFormConflict } from './edit-basis';
import { ProfileFormScreen } from './profile-form-screen';
import { createDoctor, doctorQuery, updateDoctor } from './queries';
import * as queries from './queries';
import { RatingScreen } from './rating-screen';
import { doctorProfileQuery, saveDoctorProfile } from './ratings-queries';
import * as ratingQueries from './ratings-queries';

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

describe('remaining manual doctor forms with real SQLite and original intent', () => {
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
    if (form.kind === 'doctor') {
      const original = queries.updateDoctor;
      jest.spyOn(queries, 'updateDoctor').mockImplementationOnce(async (...args) => {
        await original(...args);
        await wait();
      });
    } else if (form.kind === 'profile') {
      const original = ratingQueries.saveDoctorProfile;
      jest.spyOn(ratingQueries, 'saveDoctorProfile').mockImplementationOnce(async (...args) => {
        const id = await original(...args);
        await wait();
        return id;
      });
    } else {
      const original = ratingQueries.addDoctorRating;
      jest.spyOn(ratingQueries, 'addDoctorRating').mockImplementationOnce(async (...args) => {
        const id = await original(...args);
        await wait();
        return id;
      });
    }
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
    const seed = await doctorQuery(doctorId);
    let release = () => {};
    const pending = new Promise<typeof seed>((resolve) => {
      release = () => resolve(seed);
    });
    jest.spyOn(queries, 'doctorQuery').mockReturnValueOnce(pending as unknown as ReturnType<typeof doctorQuery>);
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
    const before = databaseRows(t);
    await press('ذخیره');
    expect(databaseRows(t)).toEqual(before);
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
