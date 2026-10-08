import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import * as Clipboard from 'expo-clipboard';
import { Alert, AppState, Pressable, TextInput, View, type AppStateStatus } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { alertError } from '@/components/feedback';
import { PromptModal } from '@/components/prompt-modal';
import { ScreenOptions } from '@/components/screen-options';
import { Button, ChipSelect, Column, Input, Text } from '@/components/ui';
import { restoreDatabase } from '@/db/client';
import { labFormDrafts, labPanels, labValues } from '@/db/schema';
import { importTables } from '@/features/backup/import';
import { createPatient } from '@/features/patients/queries';
import { DatasetBusyError, DatasetChangedError, reserveDatasetReplacement } from '@/lib/dataset-write';
import { useTestDatabase } from '@/test/db-client';
import { createTestDatabase, type TestDatabase } from '@/test/sqljs';

import { decodeLabForm } from './form-draft';
import * as drafts from './form-draft-queries';
import { LabEntryScreen } from './lab-entry-screen';
import * as queries from './queries';

let mockParams: { id: string; panelId?: string };
const mockBack = jest.fn();
let mockFocused = true;
let mockFlush: (() => Promise<boolean>) | undefined;
const mockNavigation = { isFocused: () => mockFocused, setOptions: jest.fn() };
jest.mock('expo-router/react-navigation', () => ({ useNavigation: () => mockNavigation }));
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => mockParams,
  useRouter: () => ({ back: mockBack, push: jest.fn() }),
  useNavigation: () => mockNavigation,
}));
jest.mock('react-native', () => {
  const native = jest.requireActual<typeof import('react-native')>('react-native');
  return new Proxy(native, {
    get: (target, key) => (key === 'TextInput' || key === 'Pressable' ? key : Reflect.get(target, key)),
  });
});
jest.mock('expo-clipboard', () => ({ getStringAsync: jest.fn() }));
jest.mock('expo-image', () => ({ Image: 'Image' }));
jest.mock('@/db/client', () => jest.requireActual('@/test/db-client'));
jest.mock('@/db/use-live', () => ({
  useLive: (query: { all(): unknown[] }) => ({ data: query.all(), retry: jest.fn() }),
}));
jest.mock('@/platform/notifications', () => jest.requireActual('@/test/mocks/notifications'));
jest.mock('@/platform/media', () => ({ mediaUri: (path: string) => path }));
jest.mock('@/components/feedback', () => ({ alertError: jest.fn(), notify: jest.fn() }));
jest.mock('@/components/error-notice', () => ({ ErrorNotice: 'ErrorNotice' }));
jest.mock('react-native-keyboard-controller', () => ({
  KeyboardAwareScrollView: jest.requireActual<typeof import('react-native')>('react-native').ScrollView,
  KeyboardController: { isVisible: () => false },
}));
jest.mock('@/components/use-save-before-leave', () => ({
  useSaveBeforeLeave: (flush: () => Promise<boolean>) => {
    mockFlush = flush;
  },
}));
jest.mock('@/components/use-now', () => ({ useNow: () => new Date('2026-10-08T09:00:00Z').getTime() }));
jest.mock('@/components/ui', () => ({
  Button: 'Button',
  Card: 'Card',
  Column: jest.requireActual<typeof import('@/components/ui/layout')>('@/components/ui/layout').Column,
  ChipSelect: 'ChipSelect',
  Field: 'Field',
  Divider: 'Divider',
  EmptyState: 'EmptyState',
  Input: 'Input',
  Row: 'Row',
  Screen: jest.requireActual<typeof import('@/components/ui/layout')>('@/components/ui/layout').Screen,
  SectionHeader: 'SectionHeader',
  Text: 'Text',
}));

let tree: ReactTestRenderer | undefined;
let t: TestDatabase;
let snapshotCounter = 0;
const current = () => ({ panels: t.db.select().from(labPanels).all(), values: t.db.select().from(labValues).all() });
const input = (label: string) => tree!.root.findAllByType(Input).find((node) => node.props.label === label);
const button = (label: string) => tree!.root.findAllByType(Button).find((node) => node.props.label === label)!;
const save = () => tree!.root.findAllByType(Button).find((node) => /^ذخیره/.test(node.props.label))!;
const value = () => tree!.root.findAllByType(TextInput).find((node) => node.props.placeholder === '—')!;
async function settle() {
  for (let i = 0; i < 40; i++) await Promise.resolve();
}
async function invoke(action: () => unknown) {
  await act(async () => {
    action();
    await settle();
  });
}
async function render() {
  await act(async () => {
    tree = create(<LabEntryScreen />);
  });
}
function snapshot() {
  const path = `/lab-editor-intent-${++snapshotCounter}.db`;
  t.sqlite.exec(`VACUUM INTO '${path}'`);
  return () => {
    const replacement = reserveDatasetReplacement();
    const trusted = restoreDatabase(replacement);
    try {
      trusted.sqlite.execSync('PRAGMA foreign_keys = OFF');
      trusted.sqlite.execSync(`ATTACH DATABASE '${path}' AS restore_src`);
      try {
        importTables(trusted.sqlite);
      } finally {
        trusted.sqlite.execSync('DETACH DATABASE restore_src');
        trusted.sqlite.execSync('PRAGMA foreign_keys = ON');
      }
      replacement.committed();
    } finally {
      replacement.release();
    }
  };
}
beforeEach(async () => {
  t = useTestDatabase(await createTestDatabase());
  const id = await createPatient({ firstName: 'Synthetic', lastName: 'Laboratory' });
  const panelId = await queries.createLabPanel({
    patientId: id,
    source: 'manual',
    collectedAt: new Date('2025-03-01T12:00:00Z'),
    name: 'Synthetic panel',
    notes: 'Source note',
    values: [{ analyte: 'Hb', value: '12', unit: 'g/dL', refLow: 10, refHigh: 17 }],
  });
  mockParams = { id, panelId };
  mockBack.mockClear();
  mockFocused = true;
  mockFlush = undefined;
  mockNavigation.setOptions.mockClear();
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  jest.mocked(alertError).mockClear();
  jest.mocked(Clipboard.getStringAsync).mockReset().mockResolvedValue('');
  jest.useFakeTimers();
});
afterEach(async () => {
  await act(async () => tree?.unmount());
  tree = undefined;
  jest.clearAllTimers();
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe('lab entry mounted intent and retained raw values', () => {
  it('recovers and publishes a custom unit without changing the value or preset units', async () => {
    await render();
    await invoke(() => button('آنالیت دیگر').props.onPress());
    const field = (placeholder: string) =>
      tree!.root.findAllByType(TextInput).find((n) => n.props.placeholder === placeholder)!;
    await invoke(() => field('Analyte').props.onChangeText('Synthetic custom'));
    await invoke(() => field('Unit').props.onChangeText('  mmol/L  '));
    const custom = () => tree!.root.findAll((n) => n.props.row?.analyte === 'Synthetic custom')[0]!;
    await invoke(() => custom().props.onChange({ value: '5.8' }));
    await invoke(() => jest.advanceTimersByTime(850));
    const draft = decodeLabForm(t.db.select().from(labFormDrafts).get()!.body);
    expect(draft.fields.rows.find((r) => r.analyte === 'Synthetic custom')).toMatchObject({
      unit: '  mmol/L  ',
      value: '5.8',
    });
    await act(async () => tree!.unmount());
    tree = undefined;
    await render();
    expect(field('Unit').props.value).toBe('  mmol/L  ');
    await invoke(() => save().props.onPress());
    expect(current().values).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ analyte: 'Synthetic custom', value: '5.8', unit: '  mmol/L  ' }),
        expect.objectContaining({ analyte: 'Hb', unit: 'g/dL', value: '12' }),
      ]),
    );
  });

  it.each(['5,8', '2', '20'])('keeps custom-row removal accessible for flagged input %s', async (raw) => {
    await render();
    await invoke(() => button('آنالیت دیگر').props.onPress());
    const custom = () => tree!.root.findAll((n) => n.props.row?.custom && n.props.onChange)[0]!;
    await invoke(() => custom().props.onChange({ analyte: 'Synthetic custom', value: raw, refLow: 5, refHigh: 15 }));
    const remove = tree!.root.findAllByType(Pressable).find((n) => n.props.accessibilityLabel === 'حذف ردیف');
    expect(remove).toBeDefined();
    if (raw === '5,8')
      expect(tree!.root.findAllByType(Text).some((n) => n.props.accessibilityLabel === 'عدد خوانا نیست')).toBe(true);
    await invoke(() => remove!.props.onPress());
    await invoke(() => jest.advanceTimersByTime(850));
    expect(decodeLabForm(t.db.select().from(labFormDrafts).get()!.body).fields.rows.map((r) => r.analyte)).toEqual([
      'Hb',
    ]);
    await act(async () => tree!.unmount());
    tree = undefined;
    await render();
    expect(tree!.root.findAll((n) => n.props.row?.custom && n.props.onChange)).toHaveLength(0);
  });

  it.each(['new', 'edit'] as const)('keeps %s lab publication accessible in the stable header', async (kind) => {
    if (kind === 'new') {
      mockParams = { id: mockParams.id };
      await render();
      await invoke(() => button('آنالیت دیگر').props.onPress());
      await invoke(() =>
        tree!.root
          .findAllByType(TextInput)
          .find((n) => n.props.placeholder === 'Analyte')!
          .props.onChangeText('QA'),
      );
      await invoke(() => value().props.onChangeText('14'));
    } else await render();
    const header = () => {
      const right = tree!.root.findByType(ScreenOptions).props.options.headerRight;
      expect(typeof right).toBe('function');
      return right().props;
    };
    const title = tree!.root.findByType(ScreenOptions).props.options.title;
    const first = header();
    expect(first.label).toBe('ثبت آزمایش');
    let release!: () => void;
    const real = drafts.commitLabFormDraft;
    jest.spyOn(drafts, 'commitLabFormDraft').mockImplementation(async (...args) => {
      const result = await real(...args);
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      return result;
    });
    mockFocused = false;
    await invoke(() => {
      input('یادداشت')!.props.onChangeText('Latest header publication');
      first.onPress();
    });
    expect(header().disabled).toBe(true);
    expect(tree!.root.findByType(ScreenOptions).props.options.title).toBe(title);
    expect(mockNavigation.setOptions).toHaveBeenCalledTimes(1);
    await invoke(release);
    expect(header().label).toBe('بستن');
    expect(mockNavigation.setOptions).toHaveBeenCalledTimes(1);
    expect(current().panels.some((r) => r.notes === 'Latest header publication')).toBe(true);
    expect(mockBack).not.toHaveBeenCalled();
    mockFocused = true;
    await invoke(() => header().onPress());
    expect(mockBack).toHaveBeenCalledTimes(1);
  });
  it('recovers acknowledged raw edits after leaving and reopening without changing clinical values', async () => {
    const before = current();
    await render();
    await invoke(() => input('یادداشت')!.props.onChangeText('Recover unfinished laboratory note'));
    await invoke(() => value().props.onChangeText('5,8'));
    await invoke(() => jest.advanceTimersByTime(850));
    const acknowledged = t.db.select().from(labFormDrafts).get()!;
    expect(decodeLabForm(acknowledged.body).fields.notes).toBe('Recover unfinished laboratory note');
    expect(decodeLabForm(acknowledged.body).fields.rows[0]!.value).toBe('5,8');
    await act(async () => {
      tree!.unmount();
      await settle();
    });
    tree = undefined;
    expect(current()).toEqual(before);
    await render();
    expect(input('یادداشت')!.props.value).toBe('Recover unfinished laboratory note');
    expect(value().props.value).toBe('5,8');
    expect(current()).toEqual(before);
  });
  it('shows current clinical changes before offering to replace them with the raw draft', async () => {
    await render();
    await invoke(() => input('یادداشت')!.props.onChangeText('My unfinished edit'));
    await queries.updateLabPanel(mockParams.panelId!, {
      source: 'manual',
      collectedAt: new Date('2025-03-01T12:00:00Z'),
      notes: 'Other published changes',
      values: [{ analyte: 'Hb', value: '15', unit: 'g/dL' }],
    });
    await invoke(() => save().props.onPress());
    expect(mockBack).not.toHaveBeenCalled();
    await invoke(() => button('بررسی نسخهٔ ذخیره‌شده').props.onPress());
    const visible = tree!.root
      .findAllByType(Text)
      .map((node) => JSON.stringify(node.props.children))
      .join('\n');
    expect(visible).toContain('Other published changes');
    expect(visible).toContain('15');
    expect(input('یادداشت')!.props.value).toBe('My unfinished edit');
  });
  it.each(['new', 'edit'])(
    'recovers %s invalid date, clock and open reference dialog from an acknowledged draft',
    async (mode) => {
      if (mode === 'new') mockParams = { id: mockParams.id };
      const before = current();
      await render();
      if (mode === 'new') {
        await invoke(() => button('آنالیت دیگر').props.onPress());
        await invoke(() =>
          tree!.root
            .findAllByType(TextInput)
            .find((n) => n.props.placeholder === 'Analyte')!
            .props.onChangeText('Custom unfinished analyte'),
        );
      }
      await invoke(() => value().props.onChangeText('5,8'));
      await invoke(() =>
        tree!.root
          .findAllByType(ChipSelect)
          .find((n) => n.props.label === 'زمان نمونه‌گیری')!
          .props.onChange('custom'),
      );
      await invoke(() => input('تاریخ')!.props.onChangeText('1405/07/'));
      const clock = () => tree!.root.findAllByType(Input).find((n) => n.props.icon === 'time-outline')!;
      await invoke(() => clock().props.onChangeText('2:'));
      const row = tree!.root.findAll((n) => n.props.row?.key && n.props.onEditRange)[0]!;
      await invoke(() => row.props.onEditRange());
      const modal = () => tree!.root.findByType(PromptModal);
      await invoke(() =>
        modal()
          .findAllByType(Input)
          .find((n) => n.props.autoFocus)!
          .props.onChangeText('135-'),
      );
      await invoke(() => jest.advanceTimersByTime(850));
      const acknowledged = decodeLabForm(t.db.select().from(labFormDrafts).get()!.body);
      expect(acknowledged.fields.date).toEqual({ dateText: '1405/07/', clockText: '2:', customOpen: true });
      expect(acknowledged.fields.rangeEditor?.text).toBe('135-');
      expect(current()).toEqual(before);
      await act(async () => {
        tree!.unmount();
        await settle();
      });
      tree = undefined;
      await render();
      expect(input('تاریخ')!.props.value).toBe('1405/07/');
      expect(clock().props.value).toBe('2:');
      expect(modal().props.visible).toBe(true);
      expect(
        modal()
          .findAllByType(Input)
          .find((n) => n.props.autoFocus)!.props.value,
      ).toBe('135-');
      expect(value().props.value).toBe('5,8');
      expect(decodeLabForm(t.db.select().from(labFormDrafts).get()!.body)).toEqual(acknowledged);
      expect(current()).toEqual(before);
    },
  );
  it('blocks exit on autosave failure, retains latest raw fields and explicitly retries them', async () => {
    await render();
    const writer = jest.spyOn(drafts, 'saveLabFormDraft').mockRejectedValue(new Error('Synthetic full disk'));
    await invoke(() => input('یادداشت')!.props.onChangeText('Latest unsaved words'));
    let allowed: boolean | undefined;
    await invoke(async () => {
      allowed = await mockFlush!();
    });
    expect(allowed).toBe(false);
    expect(input('یادداشت')!.props.value).toBe('Latest unsaved words');
    expect(current().panels[0]!.notes).toBe('Source note');
    writer.mockRestore();
    await invoke(() => button('ذخیره نشد؛ تلاش دوباره').props.onPress());
    expect(decodeLabForm(t.db.select().from(labFormDrafts).get()!.body).fields.notes).toBe('Latest unsaved words');
    await invoke(async () => {
      allowed = await mockFlush!();
    });
    expect(allowed).toBe(true);
  });
  it('flushes raw fields on background without publishing a panel', async () => {
    let background!: (state: AppStateStatus) => void;
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_, callback) => {
      background = callback;
      return { remove: jest.fn() };
    });
    const before = current();
    await render();
    await invoke(() => input('یادداشت')!.props.onChangeText('Background raw words'));
    await invoke(() => background('background'));
    expect(decodeLabForm(t.db.select().from(labFormDrafts).get()!.body).fields.notes).toBe('Background raw words');
    expect(current()).toEqual(before);
  });
  it('uses latest same-event fields and never pops a newer page after late acknowledgment', async () => {
    const actual = drafts.commitLabFormDraft;
    let release!: () => void;
    const ack = new Promise<void>((resolve) => {
      release = resolve;
    });
    const commit = jest.spyOn(drafts, 'commitLabFormDraft').mockImplementation(async (...args) => {
      const id = await actual(...args);
      await ack;
      return id;
    });
    await render();
    const host = tree!.root.findAllByType(Column)[0]!.findByType(View);
    const header = tree!.root.findByType(ScreenOptions);
    const writeText = input('یادداشت')!.props.onChangeText;
    const oldPublish = save().props.onPress;
    await invoke(() => {
      writeText('Same-event final words');
      oldPublish();
      oldPublish();
    });
    expect(host.props.collapsable).toBe(false);
    expect(host.props.pointerEvents).toBe('none');
    expect(mockBack).not.toHaveBeenCalled();
    mockFocused = false;
    await invoke(() => release());
    expect(commit).toHaveBeenCalledTimes(1);
    expect(current().panels[0]!.notes).toBe('Same-event final words');
    expect(input('یادداشت')!.props.editable).toBe(false);
    expect(tree!.root.findAllByType(Column)[0]!.findByType(View)).toBe(host);
    expect(tree!.root.findByType(ScreenOptions)).toBe(header);
    expect(mockNavigation.setOptions).toHaveBeenCalledTimes(1);
    await invoke(() => {
      writeText('Late stale input');
      oldPublish();
    });
    expect(commit).toHaveBeenCalledTimes(1);
    expect(input('یادداشت')!.props.value).toBe('Same-event final words');
    expect(mockBack).not.toHaveBeenCalled();
    mockFocused = true;
    await invoke(() => button('بستن').props.onPress());
    expect(mockBack).toHaveBeenCalledTimes(1);
  });
  it('rejects old range callbacks after closing and reopening the same row', async () => {
    await render();
    const opener = tree!.root.findAll((n) => n.props.row?.key && n.props.onEditRange)[0]!.props.onEditRange;
    await invoke(opener);
    const old = tree!.root.findByType(PromptModal).props;
    await invoke(() => old.onCancel());
    await invoke(opener);
    await invoke(() => tree!.root.findByType(PromptModal).props.onChangeText('11-16'));
    await invoke(() => {
      old.onChangeText('Danger stale range');
      old.onCancel();
      old.onSubmit('10-17');
    });
    expect(tree!.root.findByType(PromptModal).props.value).toBe('11-16');
    expect(tree!.root.findByType(PromptModal).props.visible).toBe(true);
    await invoke(() => tree!.root.findByType(PromptModal).props.onSubmit('11-16'));
    await invoke(opener);
    expect(tree!.root.findByType(PromptModal).props.value).toBe('11-16');
  });
  it('rejects retained draft actions after publication instead of reopening the completed form', async () => {
    await render();
    await invoke(() => input('یادداشت')!.props.onChangeText('Final local note'));
    await queries.updateLabPanel(mockParams.panelId!, {
      source: 'manual',
      collectedAt: new Date('2025-03-01T12:00:00Z'),
      notes: 'External note',
      values: [{ analyte: 'Hb', value: '15', unit: 'g/dL' }],
    });
    await invoke(() => save().props.onPress());
    await invoke(() => button('بررسی نسخهٔ ذخیره‌شده').props.onPress());
    const oldLoad = button('بارگذاری نسخهٔ ذخیره‌شده').props.onPress;
    const oldDiscard = button('حذف پیش‌نویس').props.onPress;
    const oldCompare = button('بررسی نسخهٔ ذخیره‌شده').props.onPress;
    await invoke(() => button('نگه‌داشتن نسخهٔ من').props.onPress());
    await invoke(() => jest.mocked(Alert.alert).mock.calls.at(-1)![2]![1]!.onPress!());
    mockFocused = false;
    await invoke(() => save().props.onPress());
    const before = current();
    jest.mocked(Alert.alert).mockClear();
    await invoke(() => {
      oldLoad();
      oldDiscard();
      oldCompare();
    });
    expect(Alert.alert).not.toHaveBeenCalled();
    expect(input('یادداشت')!.props.value).toBe('Final local note');
    expect(input('یادداشت')!.props.editable).toBe(false);
    expect(current()).toEqual(before);
    expect(mockBack).not.toHaveBeenCalled();
  });
  it('blocks a retained discard and route exit until clipboard import is acknowledged', async () => {
    await render();
    await invoke(() => input('یادداشت')!.props.onChangeText('Retain alongside clipboard'));
    const discard = button('حذف پیش‌نویس').props.onPress;
    let release!: (text: string) => void;
    jest.mocked(Clipboard.getStringAsync).mockImplementation(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    await invoke(() => button('چسباندن از اکسل').props.onPress());
    await invoke(discard);
    let allowed: boolean | undefined;
    await invoke(async () => {
      allowed = await mockFlush!();
    });
    expect(allowed).toBe(false);
    expect(Alert.alert).not.toHaveBeenCalled();
    await invoke(() => release('Hb\t14\tg/dL'));
    await invoke(async () => {
      allowed = await mockFlush!();
    });
    expect(allowed).toBe(true);
    const raw = decodeLabForm(t.db.select().from(labFormDrafts).get()!.body).fields;
    expect(raw.notes).toBe('Retain alongside clipboard');
    expect(raw.rows[0]!.value).toBe('14');
    expect(current().values.filter((r) => !r.deletedAt)[0]!.value).toBe('12');
  });
  it.each(['15', '', '12'])(
    'preserves a newer manual value %p while clipboard retrieval is pending',
    async (latest) => {
      await render();
      let release!: (text: string) => void;
      jest.mocked(Clipboard.getStringAsync).mockImplementation(
        () =>
          new Promise((resolve) => {
            release = resolve;
          }),
      );
      await invoke(() => button('چسباندن از اکسل').props.onPress());
      await invoke(() => value().props.onChangeText(latest));
      await invoke(() => release('Hb\t14\tg/dL'));
      expect(value().props.value).toBe(latest);
      await invoke(() => jest.advanceTimersByTime(850));
      expect(decodeLabForm(t.db.select().from(labFormDrafts).get()!.body).fields.rows[0]!.value).toBe(latest);
      expect(current().values.filter((r) => !r.deletedAt)[0]!.value).toBe('12');
    },
  );
  it('refuses publication into a same-ID restored panel and retains raw fields', async () => {
    const restore = snapshot();
    const before = current();
    await render();
    await invoke(() => input('یادداشت')!.props.onChangeText('Pending laboratory note'));
    await invoke(() => value().props.onChangeText('14'));
    await act(async () => restore());
    await invoke(() => save().props.onPress());
    expect(current()).toEqual(before);
    expect(mockBack).not.toHaveBeenCalled();
    expect(input('یادداشت')?.props.value).toBe('Pending laboratory note');
    expect(value().props.value).toBe('14');
    expect(alertError).toHaveBeenCalledWith('ذخیره نشد', expect.any(DatasetChangedError));
  });
  it('keeps actual input when replacement removes the edited panel', async () => {
    await queries.deleteLabPanel(mockParams.panelId!);
    const restore = snapshot();
    t.db.update(labPanels).set({ deletedAt: null }).run();
    t.db.update(labValues).set({ deletedAt: null }).run();
    await render();
    await invoke(() => input('یادداشت')!.props.onChangeText('Keep missing-panel input'));
    await act(async () => restore());
    // useLive is a synchronous stand-in: explicitly refresh the query while
    // retaining the same mounted screen, as the real live subscription does.
    await act(async () => tree!.update(<LabEntryScreen />));
    expect(input('یادداشت')).toBeDefined();
    expect(input('یادداشت')?.props.value).toBe('Keep missing-panel input');
    const before = current();
    await invoke(() => save().props.onPress());
    expect(current()).toEqual(before);
    expect(mockBack).not.toHaveBeenCalled();
  });
  it('refuses stale creation while retaining the new analyte/value', async () => {
    mockParams = { id: mockParams.id };
    const restore = snapshot();
    const before = current();
    await render();
    await invoke(() => button('آنالیت دیگر').props.onPress());
    await invoke(() =>
      tree!.root
        .findAllByType(TextInput)
        .find((node) => node.props.placeholder === 'Analyte')!
        .props.onChangeText('Synthetic analyte'),
    );
    await invoke(() => value().props.onChangeText('5'));
    await act(async () => restore());
    await invoke(() => save().props.onPress());
    expect(current()).toEqual(before);
    expect(value().props.value).toBe('5');
    expect(mockBack).not.toHaveBeenCalled();
  });
  it('refuses a retained clipboard callback before native read or local reset', async () => {
    const restore = snapshot();
    await render();
    const paste = button('چسباندن از اکسل').props.onPress;
    await act(async () => restore());
    await invoke(paste);
    expect(Clipboard.getStringAsync).not.toHaveBeenCalled();
    expect(value().props.value).toBe('12');
    expect(alertError).toHaveBeenCalledWith('چسبانده نشد', expect.any(DatasetChangedError));
  });
  it('holds admission through SQL acknowledgment and suppresses same-event double Save', async () => {
    const actual = drafts.commitLabFormDraft;
    let release!: () => void;
    const ack = new Promise<void>((resolve) => {
      release = resolve;
    });
    const write = jest.spyOn(drafts, 'commitLabFormDraft').mockImplementation(async (...args) => {
      const result = await actual(...args);
      await ack;
      return result;
    });
    await render();
    await invoke(() => input('یادداشت')!.props.onChangeText('Acknowledged lab note'));
    const publish = save().props.onPress;
    await invoke(() => {
      publish();
      publish();
    });
    let refused = false;
    try {
      const replacement = reserveDatasetReplacement();
      replacement.release();
    } catch (error) {
      refused = error instanceof DatasetBusyError;
    }
    const leftBeforeAck = mockBack.mock.calls.length;
    await act(async () => {
      release();
      await ack;
      await settle();
    });
    expect(refused).toBe(true);
    expect(leftBeforeAck).toBe(0);
    expect(write).toHaveBeenCalledTimes(1);
    expect(mockBack).toHaveBeenCalledTimes(1);
    expect(current().panels[0]!.notes).toBe('Acknowledged lab note');
  });
  it('preserves ordinary manual save and clipboard imports', async () => {
    await render();
    jest.mocked(Clipboard.getStringAsync).mockResolvedValue('Hb\t14\tg/dL');
    await invoke(() => button('چسباندن از اکسل').props.onPress());
    expect(value().props.value).toBe('14');
    await invoke(() => input('یادداشت')!.props.onChangeText('Fresh laboratory note'));
    await invoke(() => save().props.onPress());
    expect(current().panels[0]!.notes).toBe('Fresh laboratory note');
    expect(current().values.filter((row) => !row.deletedAt)[0]!.value).toBe('14');
    expect(mockBack).toHaveBeenCalledTimes(1);
    expect(alertError).not.toHaveBeenCalled();
  });
  it('retains raw values after a failed write and saves on explicit retry', async () => {
    await render();
    await invoke(() => input('یادداشت')!.props.onChangeText('Retry laboratory note'));
    await invoke(() => value().props.onChangeText('14'));
    const write = jest.spyOn(drafts, 'commitLabFormDraft').mockRejectedValueOnce(new Error('Synthetic write failure'));
    await invoke(() => save().props.onPress());
    expect(mockBack).not.toHaveBeenCalled();
    expect(input('یادداشت')!.props.value).toBe('Retry laboratory note');
    expect(value().props.value).toBe('14');
    expect(value().props.editable).toBe(true);
    expect(alertError).toHaveBeenCalledWith('ذخیره نشد', expect.any(Error));
    await invoke(() => save().props.onPress());
    expect(write).toHaveBeenCalledTimes(2);
    expect(current().panels[0]!.notes).toBe('Retry laboratory note');
    expect(mockBack).toHaveBeenCalledTimes(1);
  });
  it('holds the clipboard lease, prevents early Save, and merges into current rows', async () => {
    let release!: (text: string) => void;
    const read = new Promise<string>((resolve) => {
      release = resolve;
    });
    jest.mocked(Clipboard.getStringAsync).mockImplementation(() => read);
    await render();
    const paste = button('چسباندن از اکسل').props.onPress;
    const publish = save().props.onPress;
    await invoke(() => {
      paste();
      publish();
      paste();
    });
    await invoke(() => button('آنالیت دیگر').props.onPress());
    await invoke(() =>
      tree!.root
        .findAllByType(TextInput)
        .find((node) => node.props.placeholder === 'Analyte')!
        .props.onChangeText('Synthetic new analyte'),
    );
    await invoke(() =>
      tree!.root
        .findAllByType(TextInput)
        .filter((node) => node.props.placeholder === '—')[1]!
        .props.onChangeText('6'),
    );
    let refused = false;
    try {
      reserveDatasetReplacement().release();
    } catch (error) {
      refused = error instanceof DatasetBusyError;
    }
    const leftBeforeAck = mockBack.mock.calls.length;
    await act(async () => {
      release('Hb\t14\tg/dL');
      await read;
      await settle();
    });
    expect(refused).toBe(true);
    expect(leftBeforeAck).toBe(0);
    expect(Clipboard.getStringAsync).toHaveBeenCalledTimes(1);
    expect(value().props.value).toBe('14');
    expect(tree!.root.findAllByType(TextInput).filter((node) => node.props.placeholder === '—')[1]!.props.value).toBe(
      '6',
    );
    await invoke(() => save().props.onPress());
    expect(
      current()
        .values.filter((row) => !row.deletedAt)
        .map((row) => row.value),
    ).toEqual(['14', '6']);
  });
  it('reports native clipboard failure and leaves input available for retry', async () => {
    await render();
    jest.mocked(Clipboard.getStringAsync).mockRejectedValueOnce(new Error('Synthetic clipboard failure'));
    await invoke(() => button('چسباندن از اکسل').props.onPress());
    expect(value().props.value).toBe('12');
    expect(alertError).toHaveBeenCalledWith('چسبانده نشد', expect.any(Error));
    jest.mocked(Clipboard.getStringAsync).mockResolvedValue('Hb\t14\tg/dL');
    await invoke(() => button('چسباندن از اکسل').props.onPress());
    expect(value().props.value).toBe('14');
  });
});
