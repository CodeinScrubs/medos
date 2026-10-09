import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Pressable } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { ErrorNotice } from '@/components/error-notice';
import { Button, ChipSelect, EmptyState, Text } from '@/components/ui';
import { notes } from '@/db/schema';
import { addAttachment } from '@/features/attachments/queries';
import { createPatient } from '@/features/patients/queries';
import { stamps } from '@/lib/ids';
import { useTestDatabase } from '@/test/db-client';
import { createTestDatabase, type TestDatabase } from '@/test/sqljs';

import * as listQueries from './list-queries';
import { NotesTab } from './notes-tab';
import * as queries from './queries';

const mockListeners = new Set<(event: { tableName: string }) => void>();
const mockPush = jest.fn();
jest.mock('expo-sqlite', () => ({
  addDatabaseChangeListener: (listener: (event: { tableName: string }) => void) => {
    mockListeners.add(listener);
    return { remove: () => mockListeners.delete(listener) };
  },
}));
jest.mock('react-native', () => {
  const native = jest.requireActual<typeof import('react-native')>('react-native');
  return new Proxy(native, {
    get: (target, key) => (key === 'Pressable' ? 'Pressable' : Reflect.get(target, key)),
  });
});
jest.mock('@expo/vector-icons/Ionicons', () => 'Ionicon');
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));
jest.mock('@/db/client', () => jest.requireActual('@/test/db-client'));
jest.mock('@/platform/notifications', () => jest.requireActual('@/test/mocks/notifications'));
jest.mock('@/components/error-notice', () => ({ ErrorNotice: 'ErrorNotice' }));
jest.mock('@/components/feedback', () => ({ alertError: jest.fn(), notify: jest.fn() }));
jest.mock('@/components/ui', () => ({
  Badge: 'Badge',
  Button: 'Button',
  Card: 'Card',
  ChipSelect: 'ChipSelect',
  Column: 'Column',
  EmptyState: 'EmptyState',
  Row: 'Row',
  Text: 'Text',
}));
jest.mock('@/theme', () => ({ useTheme: () => ({ colors: {}, spacing: {} }) }));

let t: TestDatabase, patientId: string, tree: ReactTestRenderer | undefined;
async function settle() {
  for (let i = 0; i < 45; i++) await Promise.resolve();
}
async function render() {
  await act(async () => {
    tree = create(<NotesTab patientId={patientId} />);
    await settle();
  });
}
const text = () => tree!.root.findAllByType(Text).map((n) => [n.props.children].flat().join(''));
function add() {
  return tree!.root.findAllByType(Button).find((n) => n.props.label === 'نوت جدید')!;
}
async function changed(tableName = 'notes') {
  await act(async () => {
    for (const listener of mockListeners) listener({ tableName });
    await new Promise((resolve) => setTimeout(resolve, 90));
    await settle();
  });
}
beforeEach(async () => {
  jest.clearAllMocks();
  mockListeners.clear();
  t = useTestDatabase(await createTestDatabase());
  patientId = await createPatient({ firstName: 'Synthetic', lastName: 'Note reads' });
});
afterEach(async () => {
  await act(async () => {
    tree?.unmount();
    await settle();
  });
  tree = undefined;
  jest.restoreAllMocks();
});

describe('actual note and voice reads remain truthful and retryable', () => {
  it('a failed initial note read is not empty and retries the original SQL', async () => {
    await queries.createNote({
      patientId,
      type: 'progress',
      title: 'Synthetic retained note',
      body: 'Synthetic content',
    });
    const prepare = t.sqlite.prepare.bind(t.sqlite);
    let broken = true;
    jest.spyOn(t.sqlite, 'prepare').mockImplementation((sql, params) => {
      if (broken && sql.includes('from "notes"')) throw new Error('Synthetic note read');
      return prepare(sql, params);
    });
    await render();
    expect(tree!.root.findAllByType(EmptyState)).toHaveLength(0);
    const notice = tree!.root.findAllByType(ErrorNotice).find((n) => n.props.what === 'نوت‌ها')!;
    expect(notice.props.error).toBeInstanceOf(Error);
    expect(notice.props.onRetry).toEqual(expect.any(Function));
    broken = false;
    await act(async () => {
      notice.props.onRetry();
      await settle();
    });
    expect(text()).toContain('Synthetic retained note');
    expect(tree!.root.findAllByType(ErrorNotice).find((n) => n.props.what === 'نوت‌ها')!.props.error).toBeUndefined();
  });
  it('an unresolved first read does not claim there are no notes or choose a first-note template', async () => {
    const read = listQueries.patientNotePageQuery;
    jest.spyOn(listQueries, 'patientNotePageQuery').mockImplementation((...args) => {
      const query = read(...args);
      jest.spyOn(query, 'then').mockImplementation(() => new Promise<never>(() => {}));
      return query;
    });
    await render();
    expect(tree!.root.findAllByType(EmptyState)).toHaveLength(0);
    expect(text()).toContain('در حال خواندن…');
    await act(async () => add().props.onPress());
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/patient/[id]/note', params: { id: patientId } });
  });
  it('a failed refresh retains the actual note and offers retry', async () => {
    await queries.createNote({
      patientId,
      type: 'progress',
      title: 'Synthetic cached note',
      body: 'Synthetic content',
    });
    await render();
    const prepare = t.sqlite.prepare.bind(t.sqlite);
    let broken = true;
    jest.spyOn(t.sqlite, 'prepare').mockImplementation((sql, params) => {
      if (broken && sql.includes('from "notes"')) throw new Error('Synthetic refresh');
      return prepare(sql, params);
    });
    await changed();
    expect(text()).toContain('Synthetic cached note');
    expect(tree!.root.findAllByType(EmptyState)).toHaveLength(0);
    const notice = tree!.root.findAllByType(ErrorNotice).find((n) => n.props.what === 'نوت‌ها')!;
    expect(notice.props.error).toBeInstanceOf(Error);
    broken = false;
    await act(async () => {
      notice.props.onRetry();
      await settle();
    });
    expect(tree!.root.findAllByType(ErrorNotice).find((n) => n.props.what === 'نوت‌ها')!.props.error).toBeUndefined();
  });
  it('a cached empty result after read failure is not current absence or a first-note template', async () => {
    await render();
    expect(tree!.root.findAllByType(EmptyState)).toHaveLength(1);
    await act(async () => add().props.onPress());
    expect(mockPush).toHaveBeenLastCalledWith({
      pathname: '/patient/[id]/note',
      params: { id: patientId, type: 'admission' },
    });
    const prepare = t.sqlite.prepare.bind(t.sqlite);
    jest.spyOn(t.sqlite, 'prepare').mockImplementation((sql, params) => {
      if (sql.includes('from "notes"')) throw new Error('Synthetic stale empty');
      return prepare(sql, params);
    });
    await changed();
    expect(tree!.root.findAllByType(EmptyState)).toHaveLength(0);
    await act(async () => add().props.onPress());
    expect(mockPush).toHaveBeenLastCalledWith({ pathname: '/patient/[id]/note', params: { id: patientId } });
  });
  it('a failed voice read is visible and retry restores its existing voice count', async () => {
    const noteId = await queries.createNote({ patientId, type: 'progress', title: 'Synthetic voice note' });
    await addAttachment({
      entityType: 'note',
      entityId: noteId,
      patientId,
      kind: 'voice',
      relativePath: 'media/synthetic/read-note.m4a',
      durationMs: 1000,
    });
    const prepare = t.sqlite.prepare.bind(t.sqlite);
    let broken = true;
    jest.spyOn(t.sqlite, 'prepare').mockImplementation((sql, params) => {
      if (broken && sql.includes('from "attachments"')) throw new Error('Synthetic voice read');
      return prepare(sql, params);
    });
    await render();
    expect(text()).toContain('Synthetic voice note');
    const notice = tree!.root.findAllByType(ErrorNotice).find((n) => n.props.what === 'وویس‌های نوت')!;
    expect(notice).toBeDefined();
    expect(notice.props.error).toBeInstanceOf(Error);
    broken = false;
    await act(async () => {
      notice.props.onRetry();
      await settle();
    });
    expect(text()).toContain('۱ وویس');
    expect(
      tree!.root.findAllByType(ErrorNotice).find((n) => n.props.what === 'وویس‌های نوت')!.props.error,
    ).toBeUndefined();
  });
  it('withholds cached voice counts during a failed refresh and recovers on retry', async () => {
    const noteId = await queries.createNote({ patientId, type: 'progress', title: 'Synthetic cached voice' });
    await addAttachment({
      entityType: 'note',
      entityId: noteId,
      patientId,
      kind: 'voice',
      relativePath: 'media/synthetic/cached-note.m4a',
      durationMs: 1000,
    });
    await render();
    expect(text()).toContain('۱ وویس');
    const prepare = t.sqlite.prepare.bind(t.sqlite);
    let broken = true;
    jest.spyOn(t.sqlite, 'prepare').mockImplementation((sql, params) => {
      if (broken && sql.includes('from "attachments"')) throw new Error('Synthetic cached voice read');
      return prepare(sql, params);
    });
    await changed('attachments');
    expect(text()).toContain('Synthetic cached voice');
    expect(text()).not.toContain('۱ وویس');
    const notice = tree!.root.findAllByType(ErrorNotice).find((n) => n.props.what === 'وویس‌های نوت')!;
    expect(notice.props.error).toBeInstanceOf(Error);
    broken = false;
    await act(async () => {
      notice.props.onRetry();
      await settle();
    });
    expect(text()).toContain('۱ وویس');
  });

  it('replaces each 40-card page and opens the full source note by ID rather than its preview', async () => {
    const at = new Date('2025-01-01T12:00:00Z');
    t.db.transaction((tx) => {
      for (let i = 0; i < 85; i++)
        tx.insert(notes)
          .values({
            id: `page-${String(i).padStart(3, '0')}`,
            patientId,
            type: 'progress',
            title: `Synthetic entry ${i}`,
            body: 'Long original '.repeat(1000),
            noteDate: new Date(at.getTime() - i),
            ...stamps(at),
          })
          .run();
    });
    await render();
    const cards = () => tree!.root.findAllByType(Pressable).filter((n) => n.props.onLongPress);
    const press = async (label: string) =>
      act(async () => {
        tree!.root
          .findAllByType(Button)
          .find((n) => n.props.label === label)!
          .props.onPress();
        await settle();
      });
    expect(cards()).toHaveLength(40);
    expect(text()).toContain('Synthetic entry 0');
    expect(text()).not.toContain('Synthetic entry 40');
    await press('قدیمی‌تر');
    expect(cards()).toHaveLength(40);
    expect(text()).not.toContain('Synthetic entry 0');
    expect(text()).toContain('Synthetic entry 40');
    await act(async () => cards()[0]!.props.onPress());
    expect(mockPush).toHaveBeenLastCalledWith({
      pathname: '/patient/[id]/note',
      params: { id: patientId, noteId: 'page-040' },
    });
    await press('قدیمی‌تر');
    expect(cards()).toHaveLength(5);
    expect(tree!.root.findAllByType(Button).some((n) => n.props.label === 'قدیمی‌تر')).toBe(false);
    await press('جدیدتر');
    expect(cards()).toHaveLength(40);
    expect(text()).toContain('Synthetic entry 40');
    await press('جدیدتر');
    expect(text()).toContain('Synthetic entry 0');
  });

  it('finds a type outside the first page and never displays previous-filter cards while its read is unresolved', async () => {
    const at = new Date('2025-01-01T12:00:00Z');
    t.db.transaction((tx) => {
      for (let i = 0; i < 45; i++)
        tx.insert(notes)
          .values({
            id: `filter-${i}`,
            patientId,
            type: 'progress',
            title: `Synthetic progress ${i}`,
            noteDate: at,
            ...stamps(at),
          })
          .run();
      tx.insert(notes)
        .values({
          id: 'operation',
          patientId,
          type: 'operation',
          title: 'Synthetic older operation',
          noteDate: new Date(0),
          ...stamps(at),
        })
        .run();
    });
    await render();
    const filters = () => tree!.root.findByType(ChipSelect);
    expect(filters().props.options.some((option: { value: string }) => option.value === 'operation')).toBe(true);
    await act(async () => {
      filters().props.onChange('operation');
      await settle();
    });
    expect(text()).toContain('Synthetic older operation');
    expect(text()).not.toContain('Synthetic progress 0');
    await act(async () => {
      filters().props.onChange('all');
      await settle();
    });

    const read = listQueries.patientNotePageQuery;
    jest.spyOn(listQueries, 'patientNotePageQuery').mockImplementation((...args) => {
      const query = read(...args);
      if (args[1] === 'operation') jest.spyOn(query, 'then').mockImplementation(() => new Promise<never>(() => {}));
      return query;
    });
    await act(async () => {
      filters().props.onChange('operation');
      await settle();
    });
    expect(text()).not.toContain('Synthetic progress 0');
    expect(text()).not.toContain('Synthetic older operation');
    expect(text()).toContain('در حال خواندن…');
    expect(tree!.root.findAllByType(EmptyState)).toHaveLength(0);
  });

  it('keeps notes readable when the type query fails and does not select an unproved first-note template', async () => {
    const prepare = t.sqlite.prepare.bind(t.sqlite);
    let broken = true;
    jest.spyOn(t.sqlite, 'prepare').mockImplementation((sql, params) => {
      if (broken && sql.includes('group by "notes"."type"')) throw new Error('Synthetic note type read');
      return prepare(sql, params);
    });
    await render();
    const notice = tree!.root.findAllByType(ErrorNotice).find((n) => n.props.what === 'نوع نوت‌ها')!;
    expect(notice.props.error).toBeInstanceOf(Error);
    await act(async () => add().props.onPress());
    expect(mockPush).toHaveBeenLastCalledWith({ pathname: '/patient/[id]/note', params: { id: patientId } });
    broken = false;
    await act(async () => {
      notice.props.onRetry();
      await settle();
    });
    await act(async () => add().props.onPress());
    expect(mockPush).toHaveBeenLastCalledWith({
      pathname: '/patient/[id]/note',
      params: { id: patientId, type: 'admission' },
    });
  });
});
