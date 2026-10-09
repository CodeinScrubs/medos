import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { ErrorNotice } from '@/components/error-notice';
import { Button, EmptyState, Text } from '@/components/ui';
import { addAttachment } from '@/features/attachments/queries';
import { createPatient } from '@/features/patients/queries';
import { useTestDatabase } from '@/test/db-client';
import { createTestDatabase, type TestDatabase } from '@/test/sqljs';

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
    const read = queries.patientNotesQuery;
    jest.spyOn(queries, 'patientNotesQuery').mockImplementation((...args) => {
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
});
