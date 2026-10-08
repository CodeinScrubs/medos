import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { eq } from 'drizzle-orm';
import { Alert } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { AutosaveScope } from '@/components/autosave-scope';
import { ErrorNotice } from '@/components/error-notice';
import { alertError } from '@/components/feedback';
import { QuickDateField } from '@/components/quick-date-field';
import { ScreenOptions } from '@/components/screen-options';
import { Button, Column, Input, Screen } from '@/components/ui';
import { imagingFormDrafts, imagingStudies } from '@/db/schema';
import { createPatient } from '@/features/patients/queries';
import { DatasetBusyError } from '@/lib/dataset-write';
import { databaseRows, replacementFailure, snapshotDataset } from '@/test/dataset-snapshot';
import { useTestDatabase } from '@/test/db-client';
import { createTestDatabase, type TestDatabase } from '@/test/sqljs';

import { decodeImagingForm } from './form-draft';
import * as drafts from './form-draft-queries';
import { ImagingFormScreen } from './imaging-form-screen';
import { createImagingStudy, updateImagingStudy } from './queries';

let mockParams: { id: string; studyId?: string };
let mockFocused = true;
let mockReadError: Error | undefined;
let mockFlush: (() => Promise<boolean>) | undefined;
const mockBack = jest.fn();
const mockRetry = jest.fn();
const mockNavigation = { isFocused: () => mockFocused, setOptions: jest.fn() };
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => mockParams,
  useRouter: () => ({ back: mockBack, push: jest.fn() }),
  useNavigation: () => mockNavigation,
}));
jest.mock('expo-router/react-navigation', () => ({ useNavigation: () => mockNavigation }));
jest.mock('@/components/use-save-before-leave', () => ({
  useSaveBeforeLeave: (flush: () => Promise<boolean>) => {
    mockFlush = flush;
  },
}));
jest.mock('@/components/quick-date-field', () => ({ QuickDateField: 'QuickDateField' }));
jest.mock('@/components/error-notice', () => ({ ErrorNotice: 'ErrorNotice' }));
jest.mock('@/components/feedback', () => ({ alertError: jest.fn(), notify: jest.fn() }));
jest.mock('@/features/attachments/capture', () => ({ askPhotoSource: jest.fn(), attachPhotos: jest.fn() }));
jest.mock('@/features/attachments/image-thumbnail', () => ({ ImageThumbnail: 'ImageThumbnail' }));
jest.mock('@/features/attachments/photo-recovery', () => ({ PhotoRecovery: 'PhotoRecovery' }));
jest.mock('@/components/ui', () => ({
  Button: 'Button',
  Card: 'Card',
  ChipSelect: 'ChipSelect',
  Input: 'Input',
  Text: 'Text',
  SectionHeader: 'SectionHeader',
  Column: jest.requireActual<typeof import('@/components/ui/layout')>('@/components/ui/layout').Column,
  Screen: jest.requireActual<typeof import('@/components/ui/layout')>('@/components/ui/layout').Screen,
}));
jest.mock('react-native-keyboard-controller', () => ({
  KeyboardAwareScrollView: jest.requireActual<typeof import('react-native')>('react-native').ScrollView,
  KeyboardController: { isVisible: () => false },
}));
jest.mock('@/db/client', () => jest.requireActual('@/test/db-client'));
jest.mock('@/platform/notifications', () => jest.requireActual('@/test/mocks/notifications'));
jest.mock('@/db/use-live', () => ({
  useLive: (query: { all(): unknown[] }) => ({
    data: mockReadError ? undefined : query.all(),
    error: mockReadError,
    retry: mockRetry,
  }),
}));

let t: TestDatabase;
let tree: ReactTestRenderer | undefined;
const input = (label: string) => tree!.root.findAllByType(Input).find((node) => node.props.label === label)!;
const button = (label: string) => tree!.root.findAllByType(Button).find((node) => node.props.label === label)!;
const header = () => tree!.root.findByType(ScreenOptions).props.options.headerRight({}).props;
async function settle() {
  for (let i = 0; i < 55; i++) await Promise.resolve();
}
async function invoke(action: () => unknown) {
  await act(async () => {
    action();
    await settle();
  });
}
async function mount() {
  await act(async () => {
    tree = create(<ImagingFormScreen />);
    await settle();
  });
}
beforeEach(async () => {
  t = useTestDatabase(await createTestDatabase());
  mockParams = { id: await createPatient({ firstName: 'Synthetic', lastName: 'Imaging' }) };
  mockFocused = true;
  mockReadError = undefined;
  mockFlush = undefined;
  mockBack.mockReset();
  mockRetry.mockReset();
  mockNavigation.setOptions.mockReset();
  jest.mocked(alertError).mockClear();
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
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

describe('imaging raw form and original route', () => {
  it('recovers exact incomplete date/time and text without publishing a clinical study', async () => {
    await mount();
    await invoke(() => input('متن کامل گزارش').props.onChangeText('  Pending report\nMore details  '));
    await invoke(() =>
      tree!.root
        .findByType(QuickDateField)
        .props.onRawInputChange({ dateText: '1400/12/30', clockText: '25:', customOpen: true }),
    );
    await act(async () => {
      expect(await mockFlush!()).toBe(true);
    });
    const raw = t.db.select().from(imagingFormDrafts).get()!;
    expect(decodeImagingForm(raw.body).fields).toMatchObject({
      reportText: '  Pending report\nMore details  ',
      date: { dateText: '1400/12/30', clockText: '25:', customOpen: true },
    });
    expect(t.db.select().from(imagingStudies).all()).toHaveLength(0);
    await act(async () => tree!.unmount());
    tree = undefined;
    await mount();
    expect(input('متن کامل گزارش').props.value).toBe('  Pending report\nMore details  ');
    expect(tree!.root.findByType(QuickDateField).props.rawInput.clockText).toBe('25:');
    await invoke(() => header().onPress());
    expect(t.db.select().from(imagingStudies).all()).toHaveLength(0);
    expect(mockBack).not.toHaveBeenCalled();
    expect(t.db.select().from(imagingFormDrafts).get()!.deletedAt).toBeNull();
  });
  it('retains the real scroll host, native parent and header through delayed idempotent publication', async () => {
    await mount();
    const screen = tree!.root.findByType(Screen);
    const parent = tree!.root.findByType(Column);
    expect(parent.props.collapsable).toBe(false);
    const actual = drafts.commitImagingFormDraft;
    let release!: () => void;
    const write = jest.spyOn(drafts, 'commitImagingFormDraft').mockImplementationOnce(async (...args) => {
      const id = await actual(...args);
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      return id;
    });
    await invoke(() => {
      input('Impression').props.onChangeText('Latest impression');
      header().onPress();
      header().onPress();
    });
    expect(header().disabled).toBe(true);
    expect(input('Impression').props.editable).toBe(false);
    expect(tree!.root.findByType(Screen)).toBe(screen);
    expect(tree!.root.findByType(Column)).toBe(parent);
    expect(parent.props.collapsable).toBe(false);
    expect(replacementFailure()).toBeInstanceOf(DatasetBusyError);
    mockFocused = false;
    await invoke(release);
    expect(write).toHaveBeenCalledTimes(1);
    expect(t.db.select().from(imagingStudies).get()!.impression).toBe('Latest impression');
    expect(mockBack).not.toHaveBeenCalled();
    expect(header().label).toBe('بستن');
    expect(tree!.root.findByType(Screen)).toBe(screen);
    expect(tree!.root.findByType(Column)).toBe(parent);
    expect(mockNavigation.setOptions).toHaveBeenCalledTimes(1);
    mockFocused = true;
    await invoke(() => header().onPress());
    expect(mockBack).toHaveBeenCalledTimes(1);
    expect(t.db.select().from(imagingStudies).all()).toHaveLength(1);
  });
  it('retains local fields through failed refresh and retries the read explicitly', async () => {
    await mount();
    await invoke(() => input('راهنمای دسترسی').props.onChangeText('Pending access'));
    mockReadError = new Error('Synthetic refresh failure');
    await act(async () => tree!.update(<ImagingFormScreen />));
    expect(input('راهنمای دسترسی').props.value).toBe('Pending access');
    const notice = tree!.root.findAllByType(ErrorNotice).find((n) => n.props.error === mockReadError)!;
    await invoke(notice.props.onRetry);
    expect(mockRetry).toHaveBeenCalled();
  });
  it('refuses stale publication/discard confirmations after an actual replacement', async () => {
    const restore = snapshotDataset(t);
    await mount();
    await invoke(() => input('Impression').props.onChangeText('Old local text'));
    await act(async () => {
      expect(await mockFlush!()).toBe(true);
    });
    await invoke(() => button('حذف پیش‌نویس').props.onPress());
    const confirm = jest
      .mocked(Alert.alert)
      .mock.calls.at(-1)![2]!
      .find((c) => c.text === 'حذف پیش‌نویس')!.onPress!;
    await act(async () => restore());
    const before = databaseRows(t);
    await invoke(confirm);
    expect(databaseRows(t)).toEqual(before);
    expect(input('Impression').props.value).toBe('Old local text');
    expect(mockBack).not.toHaveBeenCalled();
  });
  it('rejects Load when the clinical version changed after comparison and preserves local input', async () => {
    mockParams.studyId = await createImagingStudy({
      patientId: mockParams.id,
      modality: 'ct',
      status: 'done',
      impression: 'Original',
    });
    await mount();
    await invoke(() => input('Impression').props.onChangeText('Local'));
    await updateImagingStudy(mockParams.studyId, { impression: 'Other writer' });
    await invoke(() => header().onPress());
    await invoke(() => button('بررسی نسخهٔ ذخیره‌شده').props.onPress());
    await invoke(() => button('بارگذاری نسخهٔ ذخیره‌شده').props.onPress());
    const confirm = jest
      .mocked(Alert.alert)
      .mock.calls.at(-1)![2]!
      .find((c) => c.text === 'بارگذاری')!.onPress!;
    await updateImagingStudy(mockParams.studyId, { impression: 'Third writer' });
    await invoke(confirm);
    expect(input('Impression').props.value).toBe('Local');
    expect(t.db.select().from(imagingStudies).get()!.impression).toBe('Third writer');
  });
  it('shows unknown raw bytes without silently resetting or overwriting them', async () => {
    await mount();
    await invoke(() => input('ناحیه / شرح').props.onChangeText('Pending'));
    await act(async () => {
      expect(await mockFlush!()).toBe(true);
      tree!.unmount();
    });
    tree = undefined;
    const id = t.db.select().from(imagingFormDrafts).get()!.id;
    t.db
      .update(imagingFormDrafts)
      .set({ body: '{"version":99,"future":"raw"}' })
      .where(eq(imagingFormDrafts.id, id))
      .run();
    await mount();
    expect(tree!.root.findAllByType(Input)).toHaveLength(0);
    expect(tree!.root.findAllByType(ErrorNotice).some((n) => !!n.props.error)).toBe(true);
    expect(t.db.select().from(imagingFormDrafts).get()!.body).toBe('{"version":99,"future":"raw"}');
  });
  it('does not load a fresh editable seed under an inherited stale scope', async () => {
    const restore = snapshotDataset(t);
    await act(async () => {
      tree = create(<AutosaveScope />);
    });
    await act(async () => restore());
    await act(async () =>
      tree!.update(
        <AutosaveScope>
          <ImagingFormScreen />
        </AutosaveScope>,
      ),
    );
    expect(tree!.root.findAllByType(Input)).toHaveLength(0);
  });
});
