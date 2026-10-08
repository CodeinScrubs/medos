import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Alert, View } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { AutosaveScope } from '@/components/autosave-scope';
import { ErrorNotice } from '@/components/error-notice';
import { alertError } from '@/components/feedback';
import { ScreenOptions } from '@/components/screen-options';
import { Button, Column, Input, Screen } from '@/components/ui';
import { contactFormDrafts } from '@/db/schema';
import { DatasetBusyError, DatasetChangedError } from '@/lib/dataset-write';
import { databaseRows, replacementFailure, snapshotDataset } from '@/test/dataset-snapshot';
import { useTestDatabase } from '@/test/db-client';
import { createTestDatabase, type TestDatabase } from '@/test/sqljs';

import { decodeContactForm } from './contact-form-draft';
import * as drafts from './contact-form-queries';
import { ContactFormScreen } from './contact-form-screen';
import { createPatient, deletePatient, patientContactsQuery } from './queries';

let mockPatientId: string;
let mockFocused = true;
let mockFlush: (() => Promise<boolean>) | undefined;
let mockReadError: Error | undefined;
const mockRetry = jest.fn();
const mockNavigation = { isFocused: () => mockFocused, setOptions: jest.fn() };
jest.mock('expo-router/react-navigation', () => ({ useNavigation: () => mockNavigation }));
jest.mock('@/components/use-save-before-leave', () => ({
  useSaveBeforeLeave: (flush: () => Promise<boolean>) => {
    mockFlush = flush;
  },
}));
jest.mock('@/db/use-live', () => ({
  useLive: (query: { all(): unknown[] }) => ({
    data: mockReadError ? undefined : query.all(),
    error: mockReadError,
    retry: mockRetry,
  }),
}));
const mockBack = jest.fn();
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ id: mockPatientId }),
  useRouter: () => ({ back: mockBack }),
  useNavigation: () => mockNavigation,
}));
jest.mock('@/components/error-notice', () => ({ ErrorNotice: 'ErrorNotice' }));
jest.mock('@/components/ui', () => ({
  Button: 'Button',
  ChipSelect: 'ChipSelect',
  Column: jest.requireActual<typeof import('@/components/ui/layout')>('@/components/ui/layout').Column,
  Input: 'Input',
  Screen: jest.requireActual<typeof import('@/components/ui/layout')>('@/components/ui/layout').Screen,
  Text: 'Text',
  Card: 'Card',
}));
jest.mock('@/components/feedback', () => ({ alertError: jest.fn(), notify: jest.fn() }));
jest.mock('react-native-keyboard-controller', () => ({
  KeyboardAwareScrollView: jest.requireActual<typeof import('react-native')>('react-native').ScrollView,
  KeyboardController: { isVisible: () => false },
}));
jest.mock('@/db/client', () => jest.requireActual('@/test/db-client'));
jest.mock('@/platform/notifications', () => jest.requireActual('@/test/mocks/notifications'));

let t: TestDatabase;
let tree: ReactTestRenderer | undefined;
const input = (label: string) => tree!.root.findAllByType(Input).find((node) => node.props.label === label)!;
const button = (label: string) => tree!.root.findAllByType(Button).find((node) => node.props.label === label)!;
async function settle() {
  for (let i = 0; i < 45; i++) await Promise.resolve();
}
async function mount() {
  await act(async () => {
    tree = create(<ContactFormScreen />);
    await settle();
  });
}
async function type(label: string, value: string) {
  await act(async () => {
    input(label).props.onChangeText(value);
    await settle();
  });
}
async function save() {
  await act(async () => {
    button('ذخیره').props.onPress();
    await settle();
  });
}
beforeEach(async () => {
  t = useTestDatabase(await createTestDatabase());
  mockPatientId = await createPatient({ firstName: 'Synthetic', lastName: 'Contact' });
  mockFocused = true;
  mockReadError = undefined;
  mockFlush = undefined;
  mockRetry.mockReset();
  mockNavigation.setOptions.mockReset();
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  jest.useFakeTimers();
  mockBack.mockReset();
  jest.mocked(alertError).mockClear();
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

describe('companion form original intent', () => {
  it('refuses same-id replacement and retains all actual input', async () => {
    await mount();
    await type('شماره تماس', '+12025550123');
    await type('نام', 'Companion');
    await type('یادداشت', 'Keep this exact text');
    const replace = snapshotDataset(t);
    await act(async () => {
      replace();
      await settle();
    });
    const before = databaseRows(t);
    await save();
    expect(databaseRows(t)).toEqual(before);
    expect(mockBack).not.toHaveBeenCalled();
    expect(input('یادداشت').props.value).toBe('Keep this exact text');
    expect(alertError).toHaveBeenLastCalledWith('ذخیره نشد', expect.any(DatasetChangedError));
  });
  it('inherits an old parent intent even when this form mounts after replacement', async () => {
    await act(async () => {
      tree = create(
        <AutosaveScope>
          <></>
        </AutosaveScope>,
      );
      await settle();
    });
    snapshotDataset(t)();
    const before = databaseRows(t);
    await act(async () => {
      tree!.update(
        <AutosaveScope>
          <ContactFormScreen />
        </AutosaveScope>,
      );
      await settle();
    });
    expect(databaseRows(t)).toEqual(before);
    expect(tree!.root.findAllByType(Input)).toHaveLength(0);
    expect(mockBack).not.toHaveBeenCalled();
  });
  it('keeps admission and locks input/cancel through final query acknowledgment', async () => {
    const original = drafts.commitContactFormDraft;
    let release = () => {};
    jest.spyOn(drafts, 'commitContactFormDraft').mockImplementationOnce(async (...args) => {
      const id = await original(...args);
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      return id;
    });
    await mount();
    await type('شماره تماس', '+12025550123');
    await save();
    const failure = replacementFailure();
    const editable = input('شماره تماس').props.editable;
    await act(async () => {
      button('ذخیره').props.onPress();
      button('انصراف').props.onPress();
      release();
      await settle();
    });
    expect(failure).toBeInstanceOf(DatasetBusyError);
    expect(editable).toBe(false);
    expect(await patientContactsQuery(mockPatientId)).toHaveLength(1);
    expect(mockBack).toHaveBeenCalledTimes(1);
  });
  it('saves the latest input once when typing and repeated Save occur in the same turn', async () => {
    await mount();
    await act(async () => {
      input('شماره تماس').props.onChangeText('+12025550123');
      input('نام').props.onChangeText('Final name');
      input('یادداشت').props.onChangeText('Final text');
      button('ذخیره').props.onPress();
      button('ذخیره').props.onPress();
      await settle();
    });
    expect(await patientContactsQuery(mockPatientId)).toMatchObject([{ name: 'Final name', notes: 'Final text' }]);
    expect(mockBack).toHaveBeenCalledTimes(1);
  });
  it('rejects a soft-deleted parent before inserting a contact and keeps input', async () => {
    await mount();
    await type('شماره تماس', '+12025550123');
    await deletePatient(mockPatientId);
    await save();
    expect(await patientContactsQuery(mockPatientId)).toEqual([]);
    expect(decodeContactForm(t.db.select().from(contactFormDrafts).get()!.body).fields.phone).toBe('+12025550123');
    expect(input('شماره تماس').props.value).toBe('+12025550123');
    expect(mockBack).not.toHaveBeenCalled();
    expect(alertError).toHaveBeenCalled();
  });
  it('keeps SQL-failed input, unlocks it and permits a fresh retry', async () => {
    await mount();
    await type('شماره تماس', '+12025550123');
    t.sqlite.exec(
      "CREATE TRIGGER fail_contact BEFORE INSERT ON patient_contacts BEGIN SELECT RAISE(ABORT, 'synthetic failure'); END",
    );
    await save();
    expect(input('شماره تماس').props.value).toBe('+12025550123');
    expect(input('شماره تماس').props.editable).not.toBe(false);
    expect(mockBack).not.toHaveBeenCalled();
    t.sqlite.exec('DROP TRIGGER fail_contact');
    await save();
    expect(await patientContactsQuery(mockPatientId)).toHaveLength(1);
    expect(mockBack).toHaveBeenCalledTimes(1);
  });
});

describe('companion raw recovery and native navigation ownership', () => {
  it('creates no draft or contact for an untouched open form', async () => {
    await mount();
    await act(async () => {
      jest.advanceTimersByTime(850);
      await settle();
    });
    expect(t.db.select().from(contactFormDrafts).all()).toEqual([]);
    expect(await patientContactsQuery(mockPatientId)).toEqual([]);
  });
  it('recovers acknowledged raw text after unmounting without publishing an incomplete contact', async () => {
    await mount();
    await type('شماره تماس', '  +1202  ');
    await type('نام', '  Unfinished name  ');
    await type('یادداشت', '  English / فارسی\nunfinished  ');
    await act(async () => {
      jest.advanceTimersByTime(850);
      await settle();
    });
    const body = t.db.select().from(contactFormDrafts).get()!.body;
    expect(decodeContactForm(body).fields).toMatchObject({
      phone: '  +1202  ',
      name: '  Unfinished name  ',
      notes: '  English / فارسی\nunfinished  ',
    });
    await act(async () => {
      tree!.unmount();
      await settle();
    });
    tree = undefined;
    await mount();
    expect(input('شماره تماس').props.value).toBe('  +1202  ');
    expect(input('نام').props.value).toBe('  Unfinished name  ');
    expect(input('یادداشت').props.value).toBe('  English / فارسی\nunfinished  ');
    expect(await patientContactsQuery(mockPatientId)).toEqual([]);
    expect(t.db.select().from(contactFormDrafts).get()!.body).toBe(body);
  });
  it('keeps a failed draft on screen and blocks leave until a real retry acknowledges it', async () => {
    await mount();
    t.sqlite.exec(
      "CREATE TRIGGER fail_contact_draft BEFORE INSERT ON contact_form_drafts BEGIN SELECT RAISE(ABORT, 'synthetic failure'); END",
    );
    await type('یادداشت', 'Do not lose these words');
    await act(async () => {
      jest.advanceTimersByTime(850);
      await settle();
    });
    expect(input('یادداشت').props.value).toBe('Do not lose these words');
    let canLeave = true;
    await act(async () => {
      canLeave = await mockFlush!();
      await settle();
    });
    expect(canLeave).toBe(false);
    expect(t.db.select().from(contactFormDrafts).all()).toEqual([]);
    t.sqlite.exec('DROP TRIGGER fail_contact_draft');
    await act(async () => {
      button('ذخیره نشد؛ تلاش دوباره').props.onPress();
      await settle();
    });
    expect(decodeContactForm(t.db.select().from(contactFormDrafts).get()!.body).fields.notes).toBe(
      'Do not lose these words',
    );
    await act(async () => {
      canLeave = await mockFlush!();
    });
    expect(canLeave).toBe(true);
  });
  it('does not close a newer screen after delayed commit and leaves one explicit completed close', async () => {
    const real = drafts.commitContactFormDraft;
    let release!: () => void;
    jest.spyOn(drafts, 'commitContactFormDraft').mockImplementationOnce(async (...args) => {
      const id = await real(...args);
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      return id;
    });
    await mount();
    const scroll = tree!.root.findByType(Screen);
    const parent = tree!.root.findAllByType(Column).find((node) => node.props.collapsable === false)!;
    const nativeParent = parent.findByType(View);
    const title = tree!.root.findByType(ScreenOptions).props.options.title;
    await type('شماره تماس', '+12025550123');
    await save();
    expect(tree!.root.findByType(Screen)).toBe(scroll);
    expect(scroll.props.scroll).toBe(true);
    expect(tree!.root.findAllByType(Column).find((node) => node.props.collapsable === false)).toBe(parent);
    expect(parent.findByType(View)).toBe(nativeParent);
    expect(nativeParent.props.collapsable).toBe(false);
    expect(nativeParent.props.pointerEvents).toBe('none');
    mockFocused = false;
    await act(async () => {
      release();
      await settle();
    });
    expect(await patientContactsQuery(mockPatientId)).toHaveLength(1);
    expect(mockBack).not.toHaveBeenCalled();
    expect(tree!.root.findByType(ScreenOptions).props.options.title).toBe(title);
    expect(mockNavigation.setOptions).toHaveBeenCalledTimes(1);
    expect(input('شماره تماس').props.editable).toBe(false);
    expect(button('بستن')).toBeDefined();
    expect(tree!.root.findByType(Screen)).toBe(scroll);
    expect(parent.findByType(View)).toBe(nativeParent);
    expect(nativeParent.props.pointerEvents).toBe('auto');
    mockFocused = true;
    await act(async () => {
      button('بستن').props.onPress();
      await settle();
    });
    expect(await patientContactsQuery(mockPatientId)).toHaveLength(1);
    expect(mockBack).toHaveBeenCalledTimes(1);
  });
  it('reports initial read failure and keeps the same entered text on a failed refresh', async () => {
    mockReadError = new Error('Synthetic read failure');
    await mount();
    expect(tree!.root.findAllByType(Input)).toHaveLength(0);
    expect(tree!.root.findByType(ErrorNotice).props.error).toBe(mockReadError);
    await act(async () => {
      tree!.root.findByType(ErrorNotice).props.onRetry();
      await settle();
    });
    expect(mockRetry).toHaveBeenCalledTimes(1);
    mockReadError = undefined;
    await act(async () => {
      tree!.update(<ContactFormScreen />);
      await settle();
    });
    await type('یادداشت', 'Keep visible on refresh failure');
    mockReadError = new Error('Synthetic refresh failure');
    await act(async () => {
      tree!.update(<ContactFormScreen />);
      await settle();
    });
    expect(input('یادداشت').props.value).toBe('Keep visible on refresh failure');
    expect(tree!.root.findByType(ErrorNotice).props.error).toBe(mockReadError);
  });
  it('retains a loaded form when replacement no longer contains the patient', async () => {
    const replace = snapshotDataset(t);
    mockPatientId = await createPatient({ firstName: 'Synthetic', lastName: 'Later' });
    await mount();
    await type('یادداشت', 'Input from the removed dataset');
    await act(async () => {
      replace();
      await settle();
    });
    const before = databaseRows(t);
    await save();
    expect(databaseRows(t)).toEqual(before);
    expect(input('یادداشت').props.value).toBe('Input from the removed dataset');
    expect(mockBack).not.toHaveBeenCalled();
  });
  it('refuses a delayed discard confirmation after dataset replacement', async () => {
    await mount();
    await type('یادداشت', 'Retained before discard dialog');
    await act(async () => {
      jest.advanceTimersByTime(850);
      await settle();
    });
    await act(async () => {
      button('حذف پیش‌نویس').props.onPress();
      await settle();
    });
    const confirmation = jest
      .mocked(Alert.alert)
      .mock.calls.at(-1)![2]!
      .find((b) => b.text === 'حذف پیش‌نویس')!.onPress!;
    await act(async () => {
      snapshotDataset(t)();
      await settle();
    });
    const before = databaseRows(t);
    await act(async () => {
      confirmation();
      await settle();
    });
    expect(databaseRows(t)).toEqual(before);
    expect(input('یادداشت').props.value).toBe('Retained before discard dialog');
    expect(alertError).toHaveBeenLastCalledWith('ذخیره نشد', expect.any(DatasetChangedError));
  });
  it('refuses an unreviewed third draft write before accepting Load', async () => {
    await mount();
    await type('یادداشت', 'My only local branch');
    const stored = {
      version: 1 as const,
      fields: { name: '', phone: '+12025550123', relation: null, notes: 'Shown other branch' },
    };
    await drafts.saveContactFormDraft('other-draft', mockPatientId, stored, 0);
    await act(async () => {
      jest.advanceTimersByTime(850);
      await settle();
    });
    await act(async () => {
      button('بررسی پیش‌نویس ذخیره‌شده').props.onPress();
      await settle();
    });
    await act(async () => {
      button('بارگذاری پیش‌نویس ذخیره‌شده').props.onPress();
      await settle();
    });
    const confirm = jest
      .mocked(Alert.alert)
      .mock.calls.at(-1)![2]!
      .find((b) => b.text === 'بارگذاری')!.onPress!;
    await drafts.saveContactFormDraft(
      'other-draft',
      mockPatientId,
      { ...stored, fields: { ...stored.fields, notes: 'Changed after review' } },
      1,
    );
    const before = databaseRows(t);
    await act(async () => {
      confirm();
      await settle();
    });
    expect(databaseRows(t)).toEqual(before);
    expect(input('یادداشت').props.value).toBe('My only local branch');
    expect(alertError).toHaveBeenLastCalledWith('ذخیره نشد', expect.any(Error));
  });
  it('keeps the real form and native parent through soft discard acknowledgment', async () => {
    await mount();
    const scroll = tree!.root.findByType(Screen);
    const parent = tree!.root.findAllByType(Column).find((node) => node.props.collapsable === false)!;
    const nativeParent = parent.findByType(View);
    await type('یادداشت', 'Retained draft words');
    await act(async () => {
      jest.advanceTimersByTime(850);
      await settle();
    });
    const real = drafts.discardContactFormDraft;
    let release!: () => void;
    jest.spyOn(drafts, 'discardContactFormDraft').mockImplementationOnce(async (...args) => {
      await real(...args);
      await new Promise<void>((resolve) => {
        release = resolve;
      });
    });
    await act(async () => {
      button('حذف پیش‌نویس').props.onPress();
      await settle();
    });
    const confirm = jest
      .mocked(Alert.alert)
      .mock.calls.at(-1)![2]!
      .find((b) => b.text === 'حذف پیش‌نویس')!.onPress!;
    await act(async () => {
      confirm();
      await settle();
    });
    expect(parent.findByType(View)).toBe(nativeParent);
    expect(nativeParent.props.pointerEvents).toBe('none');
    mockFocused = false;
    await act(async () => {
      release();
      await settle();
    });
    expect(tree!.root.findByType(Screen)).toBe(scroll);
    expect(parent.findByType(View)).toBe(nativeParent);
    expect(nativeParent.props.collapsable).toBe(false);
    expect(nativeParent.props.pointerEvents).toBe('auto');
    expect(mockNavigation.setOptions).toHaveBeenCalledTimes(1);
    expect(mockBack).not.toHaveBeenCalled();
    expect(await patientContactsQuery(mockPatientId)).toEqual([]);
    expect(t.db.select().from(contactFormDrafts).get()!.deletedAt).not.toBeNull();
  });
});
