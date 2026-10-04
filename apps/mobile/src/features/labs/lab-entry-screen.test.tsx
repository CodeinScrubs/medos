import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import * as Clipboard from 'expo-clipboard';
import { TextInput } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { alertError } from '@/components/feedback';
import { Button, Input } from '@/components/ui';
import { restoreDatabase } from '@/db/client';
import { labPanels, labValues } from '@/db/schema';
import { importTables } from '@/features/backup/import';
import { createPatient } from '@/features/patients/queries';
import { DatasetBusyError, DatasetChangedError, reserveDatasetReplacement } from '@/lib/dataset-write';
import { useTestDatabase } from '@/test/db-client';
import { createTestDatabase, type TestDatabase } from '@/test/sqljs';

import { LabEntryScreen } from './lab-entry-screen';
import * as queries from './queries';

let mockParams: { id: string; panelId?: string };
const mockBack = jest.fn();
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => mockParams,
  useRouter: () => ({ back: mockBack, push: jest.fn() }),
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
jest.mock('@/components/prompt-modal', () => ({ PromptModal: 'PromptModal' }));
jest.mock('@/components/quick-date-field', () => ({ QuickDateField: 'QuickDateField' }));
jest.mock('@/components/use-save-before-leave', () => ({ useSaveBeforeLeave: () => {} }));
jest.mock('@/components/ui', () => ({
  Button: 'Button',
  Card: 'Card',
  Column: 'Column',
  Divider: 'Divider',
  EmptyState: 'EmptyState',
  Input: 'Input',
  Row: 'Row',
  Screen: 'Screen',
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
  jest.mocked(alertError).mockClear();
  jest.mocked(Clipboard.getStringAsync).mockReset().mockResolvedValue('');
});
afterEach(async () => {
  await act(async () => tree?.unmount());
  tree = undefined;
  jest.restoreAllMocks();
});

describe('lab entry mounted intent and retained raw values', () => {
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
    const actual = queries.updateLabPanel;
    let release!: () => void;
    const ack = new Promise<void>((resolve) => {
      release = resolve;
    });
    const write = jest.spyOn(queries, 'updateLabPanel').mockImplementation(async (...args) => {
      await actual(...args);
      await ack;
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
    const write = jest.spyOn(queries, 'updateLabPanel').mockRejectedValueOnce(new Error('Synthetic write failure'));
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
