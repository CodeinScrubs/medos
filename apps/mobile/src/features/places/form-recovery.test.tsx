import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { eq } from 'drizzle-orm';
import { Alert, AppState } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { ErrorNotice } from '@/components/error-notice';
import { alertError, notify } from '@/components/feedback';
import { PickerModal } from '@/components/picker-modal';
import { ScreenOptions } from '@/components/screen-options';
import { Button, Input, SelectField } from '@/components/ui';
import { useSaveBeforeLeave } from '@/components/use-save-before-leave';
import { extensions, places, workspaceFormDrafts } from '@/db/schema';
import * as formQueries from '@/features/workspace-forms/queries';
import { UnfinishedWorkspaceForms } from '@/features/workspace-forms/unfinished-forms';
import { datasetGeneration, reserveDatasetReplacement } from '@/lib/dataset-write';
import { softDelete } from '@/lib/ids';
import { useTestDatabase } from '@/test/db-client';
import { createTestDatabase, type TestDatabase } from '@/test/sqljs';

import { ExtensionFormScreen } from './extension-form-screen';
import { ExtensionsScreen } from './extensions-screen';
import { extensionFormCodec, placeFormCodec } from './form-draft';
import { PlaceFormScreen } from './place-form-screen';
import { PlacesScreen } from './places-screen';
import { createExtension, createPlace, updatePlace } from './queries';

let mockParams: { placeId?: string; extensionId?: string; draftId?: string } = {};
let mockReadError: Error | undefined;
let mockFocused = true;
const mockBack = jest.fn();
const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => mockParams,
  useRouter: () => ({ back: mockBack, push: mockPush }),
}));
jest.mock('expo-router/react-navigation', () => ({ useNavigation: () => ({ isFocused: () => mockFocused }) }));
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: 'SafeAreaView',
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 24, left: 0 }),
}));
jest.mock('react-native', () => {
  const native = jest.requireActual<typeof import('react-native')>('react-native');
  return new Proxy(native, {
    get: (target, key) => (key === 'Pressable' || key === 'FlatList' ? String(key) : Reflect.get(target, key)),
  });
});
jest.mock('@/db/client', () => jest.requireActual('@/test/db-client'));
jest.mock('@/db/use-live', () => ({
  useLive: (query: { all(): unknown[] }) => ({
    data: mockReadError ? undefined : query.all(),
    error: mockReadError,
    retry: jest.fn(),
  }),
}));
jest.mock('@/components/use-save-before-leave', () => ({ useSaveBeforeLeave: jest.fn() }));
jest.mock('@/components/screen-options', () => ({ ScreenOptions: 'ScreenOptions' }));
jest.mock('@/components/error-notice', () => ({ ErrorNotice: 'ErrorNotice' }));
jest.mock('@/components/feedback', () => ({ alertError: jest.fn(), notify: jest.fn() }));
jest.mock('@/components/picker-modal', () => ({ PickerModal: 'PickerModal' }));
jest.mock('@/components/ui', () => ({
  Button: 'Button',
  Input: 'Input',
  Column: 'Column',
  Row: 'Row',
  Card: 'Card',
  Text: 'Text',
  Screen: 'Screen',
  ChipSelect: 'ChipSelect',
  SectionHeader: 'SectionHeader',
  SelectField: 'SelectField',
  EmptyState: 'EmptyState',
  Fab: 'Fab',
  Badge: 'Badge',
}));
jest.mock('@/theme', () => ({
  useTheme: () => ({ colors: {}, radii: {}, spacing: {}, typography: {} }),
  MIN_TOUCH: 44,
}));

let tree: ReactTestRenderer | undefined;
let t: TestDatabase;
let background: ((state: import('react-native').AppStateStatus) => void) | undefined;
const input = (label: string) => tree!.root.findAllByType(Input).find((node) => node.props.label === label)!;
const button = (label: string) => tree!.root.findAllByType(Button).find((node) => node.props.label === label)!;
async function settle() {
  for (let i = 0; i < 30; i++) await Promise.resolve();
}
async function mount(
  Form: typeof PlaceFormScreen | typeof ExtensionFormScreen | typeof PlacesScreen | typeof ExtensionsScreen,
) {
  await act(async () => {
    tree = create(<Form />);
    await settle();
  });
}
async function press(label: string) {
  await act(async () => {
    button(label).props.onPress();
    await settle();
  });
}
async function change(label: string, value: string) {
  await act(async () => {
    input(label).props.onChangeText(value);
    await settle();
  });
}
async function persist() {
  await act(async () => {
    jest.advanceTimersByTime(3200);
    await settle();
  });
}
async function rerender(Form: typeof PlaceFormScreen | typeof ExtensionFormScreen) {
  await act(async () => {
    tree!.update(<Form />);
    await settle();
  });
}
async function replaceDataset() {
  const replacement = reserveDatasetReplacement();
  await act(async () => {
    try {
      replacement.committed();
      await settle();
    } finally {
      replacement.release();
    }
  });
}
beforeEach(async () => {
  t = useTestDatabase(await createTestDatabase());
  mockParams = {};
  mockReadError = undefined;
  mockFocused = true;
  mockBack.mockReset();
  mockPush.mockReset();
  jest.mocked(alertError).mockClear();
  jest.mocked(notify).mockClear();
  jest.mocked(useSaveBeforeLeave).mockClear();
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, listener) => {
    background = listener;
    return { remove: jest.fn() };
  });
  jest.useFakeTimers();
  jest.setSystemTime(new Date('2026-01-02T10:00:00Z'));
});
afterEach(async () => {
  await act(async () => {
    tree?.unmount();
    await settle();
  });
  tree = undefined;
  jest.restoreAllMocks();
  jest.useRealTimers();
});

describe('mounted place and extension recovery', () => {
  it('recovers every raw place field exactly after remount without publishing', async () => {
    await mount(PlaceFormScreen);
    const values = {
      نام: ' ',
      شهر: ' synthetic city ',
      آدرس: '\n address ',
      تلفن: ' ۱۲+ ( ',
      'تلفنخانه (برای گرفتن داخلی از بیرون)': ' ۳۴- ',
      'لینک نقشه (نشان، بلد، گوگل)': ' geo:35.7000,51.4000 ',
      'عرض جغرافیایی': ' ۳۵. ',
      'طول جغرافیایی': ' - ',
      یادداشت: '  raw\n\nnotes  ',
    };
    for (const [label, value] of Object.entries(values)) await change(label, value);
    expect(tree!.root.findAllByType(Input).every((node) => !node.props.numericFold)).toBe(true);
    await persist();
    const raw = t.db.select().from(workspaceFormDrafts).get()!;
    const document = placeFormCodec.decode(raw.body);
    expect(document.fields.phone).toBe(values['تلفن']);
    expect(document.fields.lat).toBe(values['عرض جغرافیایی']);
    expect(t.db.select().from(places).all()).toEqual([]);
    await act(async () => {
      tree!.unmount();
      await settle();
    });
    mockParams = { draftId: raw.id };
    await mount(PlaceFormScreen);
    for (const [label, value] of Object.entries(values)) expect(input(label).props.value).toBe(value);
    await press('ذخیره');
    expect(notify).toHaveBeenCalledWith('نام لازم است');
    expect(t.db.select().from(places).all()).toEqual([]);
    expect(mockBack).not.toHaveBeenCalled();
  });

  it('preserves a partial extension, its original selected place and raw digits through background/remount', async () => {
    const placeId = await createPlace({ name: 'Synthetic hospital', kind: 'hospital' });
    mockParams = { placeId };
    await mount(ExtensionFormScreen);
    const values = {
      بخش: '  Synthetic department ',
      داخلی: ' ۲۳* ',
      طبقه: ' ۲ ',
      'خط مستقیم': ' ۴۵+ ( ',
      'مسئول / فرد رابط': ' synthetic contact ',
      یادداشت: ' \nraw  ',
    };
    for (const [label, value] of Object.entries(values)) await change(label, value);
    await act(async () => {
      background?.('background');
      await settle();
    });
    const raw = t.db.select().from(workspaceFormDrafts).get()!;
    expect(extensionFormCodec.decode(raw.body).fields.placeId).toBe(placeId);
    expect(t.db.select().from(extensions).all()).toEqual([]);
    await act(async () => {
      tree!.unmount();
      await settle();
    });
    mockParams = { draftId: raw.id };
    await mount(ExtensionFormScreen);
    for (const [label, value] of Object.entries(values)) expect(input(label).props.value).toBe(value);
    expect(tree!.root.findByType(SelectField).props.value).toBe('Synthetic hospital');
    expect(tree!.root.findAllByType(Input).every((node) => !node.props.numericFold)).toBe(true);
  });

  it('flushes raw input through the one permanent removal guard without publishing', async () => {
    await mount(PlaceFormScreen);
    await change('یادداشت', 'Immediate back words');
    const guard = jest.mocked(useSaveBeforeLeave).mock.calls.at(-1)![0];
    await act(async () => {
      expect(await guard()).toBe(true);
      await settle();
    });
    expect(placeFormCodec.decode(t.db.select().from(workspaceFormDrafts).get()!.body).fields.notes).toBe(
      'Immediate back words',
    );
    expect(t.db.select().from(places).all()).toEqual([]);
  });

  it('defers map extraction until separate Save and retains native header and form parents on completion', async () => {
    await mount(PlaceFormScreen);
    const header = tree!.root.findByType(ScreenOptions);
    const form = input('نام').parent!;
    await change('نام', ' Synthetic new place ');
    await change('لینک نقشه (نشان، بلد، گوگل)', ' geo:35.7000,51.4000 ');
    expect(input('عرض جغرافیایی').props.value).toBe('');
    await persist();
    expect(t.db.select().from(places).all()).toEqual([]);
    await press('ذخیره');
    expect(t.db.select().from(places).get()).toMatchObject({
      name: 'Synthetic new place',
      lat: '35.7000',
      lng: '51.4000',
    });
    expect(tree!.root.findByType(ScreenOptions)).toBe(header);
    expect(input('نام').parent).toBe(form);
    expect(form.props.collapsable).toBe(false);
    expect(form.props.pointerEvents).toBe('auto');
    expect(input('نام').props.editable).toBe(false);
    expect(mockBack).toHaveBeenCalledTimes(1);
  });

  it.each([PlaceFormScreen, ExtensionFormScreen])(
    'retains typed input and disables publication after a failed form read',
    async (Form) => {
      await mount(Form);
      await change('یادداشت', 'Unsaved retained words');
      const retained = input('یادداشت');
      mockReadError = new Error('Synthetic read failure');
      await rerender(Form);
      expect(input('یادداشت')).toBe(retained);
      expect(input('یادداشت').props.value).toBe('Unsaved retained words');
      expect(button('ذخیره').props.disabled).toBe(true);
      expect(tree!.root.findAllByType(ErrorNotice).some((node) => node.props.error === mockReadError)).toBe(true);
      await press('ذخیره');
      expect(t.db.select().from(places).all()).toEqual([]);
      expect(t.db.select().from(extensions).all()).toEqual([]);
      expect(mockBack).not.toHaveBeenCalled();
    },
  );

  it('locks original extension input if the incoming place route changes', async () => {
    const original = await createPlace({ name: 'Synthetic original', kind: 'hospital' });
    const later = await createPlace({ name: 'Synthetic later', kind: 'hospital' });
    mockParams = { placeId: original };
    await mount(ExtensionFormScreen);
    await change('بخش', 'Retained department');
    mockParams = { placeId: later };
    await rerender(ExtensionFormScreen);
    expect(tree!.root.findByType(SelectField).props.value).toBe('Synthetic original');
    expect(input('بخش').props.value).toBe('Retained department');
    expect(button('ذخیره').props.disabled).toBe(true);
    await press('ذخیره');
    expect(t.db.select().from(extensions).all()).toEqual([]);
  });

  it('shows an archived original place honestly and refuses publication or implicit recovery', async () => {
    const placeId = await createPlace({ name: 'Synthetic archived', kind: 'hospital' });
    const extensionId = await createExtension({ placeId, department: 'Synthetic department', extension: '2345' });
    t.db.update(places).set(softDelete()).where(eq(places.id, placeId)).run();
    mockParams = { extensionId };
    await mount(ExtensionFormScreen);
    expect(tree!.root.findByType(SelectField).props.value).toBe('Synthetic archived (بایگانی‌شده)');
    expect(tree!.root.findByType(PickerModal).props.items).toEqual([]);
    await change('یادداشت', 'Retained edit');
    await press('ذخیره');
    expect(alertError).toHaveBeenCalled();
    expect(t.db.select().from(extensions).get()?.notes).toBeNull();
    expect(input('یادداشت').props.value).toBe('Retained edit');
    expect(extensionFormCodec.decode(t.db.select().from(workspaceFormDrafts).get()!.body).fields.notes).toBe(
      'Retained edit',
    );
  });

  it('does not let old-dataset picker callbacks create or select a place', async () => {
    await mount(ExtensionFormScreen);
    await change('یادداشت', 'Old dataset words');
    await persist();
    const picker = tree!.root.findByType(PickerModal).props;
    const generation = datasetGeneration();
    await replaceDataset();
    await rerender(ExtensionFormScreen);
    await act(async () => {
      await expect(picker.onCreate('Synthetic late place')).rejects.toThrow();
      picker.onSelect({ id: 'late-selected', label: 'Late selection' });
      await settle();
    });
    expect(datasetGeneration()).toBe(generation + 1);
    expect(t.db.select().from(places).all()).toEqual([]);
    expect(input('یادداشت').props.value).toBe('Old dataset words');
    expect(input('یادداشت').props.editable).toBe(false);
    expect(tree!.root.findByType(SelectField).props.value).toBeNull();
    expect(mockBack).not.toHaveBeenCalled();
  });

  it('retains only the original owned place label and empties choices after same-key replacement', async () => {
    const placeId = await createPlace({ name: 'Synthetic original label', kind: 'hospital' });
    mockParams = { placeId };
    await mount(ExtensionFormScreen);
    await change('یادداشت', 'Original raw words');
    await persist();
    await replaceDataset();
    t.db.update(places).set({ name: 'Synthetic replacement label' }).where(eq(places.id, placeId)).run();
    await createPlace({ name: 'Synthetic replacement choice', kind: 'hospital' });
    await rerender(ExtensionFormScreen);
    expect(tree!.root.findByType(SelectField).props.value).toBe('Synthetic original label');
    expect(tree!.root.findByType(PickerModal).props.items).toEqual([]);
    expect(input('یادداشت').props.value).toBe('Original raw words');
    expect(input('یادداشت').props.editable).toBe(false);
    expect(mockBack).not.toHaveBeenCalled();
  });

  it('does not close a newer focused route when publication acknowledges after focus loss', async () => {
    await mount(PlaceFormScreen);
    await change('نام', 'Synthetic late acknowledgement');
    const realPublish = formQueries.publishWorkspaceDraft;
    let release: (() => void) | undefined;
    const waiting = new Promise<void>((resolve) => {
      release = resolve;
    });
    jest.spyOn(formQueries, 'publishWorkspaceDraft').mockImplementation(async (...args) => {
      const id = await realPublish(...args);
      await waiting;
      return id;
    });
    await act(async () => {
      button('ذخیره').props.onPress();
      await settle();
    });
    mockFocused = false;
    await act(async () => {
      release!();
      await settle();
    });
    expect(t.db.select().from(places).all()).toHaveLength(1);
    expect(mockBack).not.toHaveBeenCalled();
    expect(input('نام').props.editable).toBe(false);
    mockFocused = true;
    await press('بستن');
    expect(mockBack).toHaveBeenCalledTimes(1);
  });

  it('keeps conflict adoption separate from Save and rejects a delayed confirmation after replacement', async () => {
    const placeId = await createPlace({ name: 'Synthetic original', kind: 'hospital' });
    mockParams = { placeId };
    await mount(PlaceFormScreen);
    await change('یادداشت', 'Local retained words');
    await persist();
    await updatePlace(placeId, { city: 'Concurrent synthetic city' });
    await press('ذخیره');
    await press('مقایسهٔ نسخه‌ها');
    await press('نگه‌داشتن نسخهٔ من');
    const accepted = jest
      .mocked(Alert.alert)
      .mock.calls.at(-1)![2]!
      .find((item) => item.text === 'نگه‌داشتن نسخهٔ من')!.onPress!;
    const before = t.db.select().from(workspaceFormDrafts).all();
    await replaceDataset();
    await rerender(PlaceFormScreen);
    await act(async () => {
      accepted();
      await settle();
    });
    expect(t.db.select().from(workspaceFormDrafts).all()).toEqual(before);
    expect(t.db.select().from(places).get()?.notes).toBeNull();
    expect(input('یادداشت').props.value).toBe('Local retained words');
  });

  it.each([
    { Form: PlacesScreen, kind: 'place', pathname: '/places/edit', key: 'placeId' },
    { Form: ExtensionsScreen, kind: 'extension', pathname: '/extensions/edit', key: 'extensionId' },
  ])(
    'keeps $kind recovery links inside its existing list with exact selected draft navigation',
    async ({ Form, kind, pathname, key }) => {
      await mount(Form);
      const links = tree!.root.findByType(UnfinishedWorkspaceForms);
      expect(links.props.kind).toBe(kind);
      links.props.onOpen('synthetic-record', 'synthetic-draft');
      expect(mockPush).toHaveBeenLastCalledWith({
        pathname,
        params: { [key]: 'synthetic-record', draftId: 'synthetic-draft' },
      });
      links.props.onOpen(null, 'synthetic-new');
      expect(mockPush).toHaveBeenLastCalledWith({ pathname, params: { draftId: 'synthetic-new' } });
    },
  );
});
