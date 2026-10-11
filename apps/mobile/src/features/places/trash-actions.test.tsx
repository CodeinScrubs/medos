import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { eq } from 'drizzle-orm';
import { Alert, Pressable } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { ErrorNotice } from '@/components/error-notice';
import { alertError } from '@/components/feedback';
import { Button, ChipSelect } from '@/components/ui';
import { auditLog, extensions, places } from '@/db/schema';
import { TrashScreen } from '@/features/patients/trash-screen';
import { databaseRows, snapshotDataset } from '@/test/dataset-snapshot';
import { useTestDatabase } from '@/test/db-client';
import { createTestDatabase, type TestDatabase } from '@/test/sqljs';

import { ExtensionsScreen } from './extensions-screen';
import { PlacesScreen } from './places-screen';
import { createExtension, createPlace, extensionsQuery, placesQuery } from './queries';
import { deleteExtension, deletePlace } from './trash-queries';

const mockListeners = new Set<(event: { tableName: string }) => void>();
const mockPush = jest.fn();
const mockReplace = jest.fn();
let mockFocused = true;
jest.mock('expo-sqlite', () => ({
  addDatabaseChangeListener: (listener: (event: { tableName: string }) => void) => {
    mockListeners.add(listener);
    return { remove: () => mockListeners.delete(listener) };
  },
}));
jest.mock('@/db/client', () => jest.requireActual('@/test/db-client'));
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush, replace: mockReplace }) }));
jest.mock('expo-router/react-navigation', () => ({ useNavigation: () => ({ isFocused: () => mockFocused }) }));
jest.mock('@/platform/notifications', () => jest.requireActual('@/test/mocks/notifications'));
jest.mock('@/components/use-save-before-leave', () => ({ useSaveBeforeLeave: () => {} }));
jest.mock('@/components/error-notice', () => ({ ErrorNotice: 'ErrorNotice' }));
jest.mock('@/components/feedback', () => ({ alertError: jest.fn(), notify: jest.fn() }));
jest.mock('@/components/ui', () => ({
  Button: 'Button',
  Card: 'Card',
  ChipSelect: 'ChipSelect',
  Column: 'Column',
  EmptyState: 'EmptyState',
  Fab: 'Fab',
  Row: 'Row',
  Screen: 'Screen',
  SectionHeader: 'SectionHeader',
  Text: 'Text',
  Badge: 'Badge',
}));
jest.mock('@/features/workspace-forms/unfinished-forms', () => ({
  UnfinishedWorkspaceForms: 'UnfinishedWorkspaceForms',
}));
jest.mock('@/features/places/actions', () => ({
  callExtension: jest.fn(),
  copyExtension: jest.fn(),
  openInMaps: jest.fn(),
}));
jest.mock('@expo/vector-icons/Ionicons', () => ({ __esModule: true, default: 'Ionicons' }));
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: 'SafeAreaView',
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 24, left: 0 }),
}));
jest.mock('@/theme', () => ({
  MIN_TOUCH: 44,
  useTheme: () => ({ colors: {}, radii: {}, spacing: { md: 12, lg: 16, huge: 32 }, typography: { body: {} } }),
}));
jest.mock('react-native', () => {
  const native = jest.requireActual('react-native') as typeof import('react-native');
  const React = jest.requireActual('react') as typeof import('react');
  const FlatList = ({
    data,
    renderItem,
  }: {
    data: unknown[];
    renderItem: (p: { item: unknown; index: number }) => import('react').ReactNode;
  }) =>
    React.createElement(
      React.Fragment,
      null,
      ...data.map((item, index) => React.createElement(React.Fragment, { key: index }, renderItem({ item, index }))),
    );
  // A spread eagerly reads unrelated native getters (including DevMenu).
  return new Proxy(native, {
    get: (target, key) =>
      key === 'FlatList' ? FlatList : key === 'Pressable' ? 'Pressable' : Reflect.get(target, key),
  });
});

let t: TestDatabase;
let tree: ReactTestRenderer | undefined;
let placeId: string;
let extensionId: string;
const now = new Date('2026-01-02T10:00:00.123Z');
type ScreenKind = 'place' | 'extension' | 'trash';
async function settle() {
  for (let i = 0; i < 50; i++) await Promise.resolve();
}
async function render(kind: ScreenKind) {
  await act(async () => {
    const component =
      kind === 'place' ? <PlacesScreen /> : kind === 'extension' ? <ExtensionsScreen /> : <TrashScreen />;
    if (tree) tree.update(component);
    else tree = create(component);
    await settle();
  });
}
async function askDelete(kind: 'place' | 'extension') {
  await act(async () => {
    tree!.root
      .findAllByType(Pressable)
      .find((p) => typeof p.props.onLongPress === 'function')!
      .props.onLongPress();
    await settle();
  });
  if (kind === 'extension') {
    const menu = jest.mocked(Alert.alert).mock.calls.at(-1)!;
    await act(async () => {
      menu[2]!.find((b) => b.text === 'حذف')!.onPress?.();
      await settle();
    });
  }
  return jest.mocked(Alert.alert).mock.calls.at(-1)!;
}
type NativeDialog = ReturnType<typeof jest.mocked<typeof Alert.alert>>['mock']['calls'][number];
async function confirm(dialog: NativeDialog, label = 'حذف', twice = false) {
  await act(async () => {
    const callback = dialog[2]!.find((b) => b.text === label)!.onPress!;
    callback();
    if (twice) callback();
    await settle();
  });
}
beforeEach(async () => {
  jest.clearAllMocks();
  mockListeners.clear();
  mockFocused = true;
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  t = useTestDatabase(await createTestDatabase());
  placeId = await createPlace({ name: 'Synthetic central', kind: 'hospital' });
  extensionId = await createExtension({ placeId, department: 'Synthetic radiology', extension: '2345' });
});
afterEach(async () => {
  if (tree)
    await act(async () => {
      tree!.unmount();
      await settle();
    });
  tree = undefined;
  jest.restoreAllMocks();
});

describe('retained native notebook choices', () => {
  it.each(['place', 'extension'] as const)(
    'deletes %s once from the original shown row despite repeated native callbacks',
    async (kind) => {
      await render(kind);
      await confirm(await askDelete(kind), 'حذف', true);
      const table = kind === 'place' ? places : extensions;
      const id = kind === 'place' ? placeId : extensionId;
      expect(t.db.select().from(table).where(eq(table.id, id)).get()?.deletedAt).not.toBeNull();
      expect(
        t.db
          .select()
          .from(auditLog)
          .all()
          .map((r) => r.action),
      ).toEqual([`${kind}.deleted`]);
      expect(alertError).not.toHaveBeenCalled();
    },
  );

  it.each(['place', 'extension'] as const)(
    'rejects a hidden same-timestamp %s correction before live-query refresh',
    async (kind) => {
      await render(kind);
      const dialog = await askDelete(kind);
      const table = kind === 'place' ? places : extensions;
      const id = kind === 'place' ? placeId : extensionId;
      t.db.update(table).set({ notes: 'Synthetic concurrent correction' }).where(eq(table.id, id)).run();
      const before = databaseRows(t);
      await confirm(dialog);
      expect(databaseRows(t)).toEqual(before);
      expect(alertError).toHaveBeenCalledTimes(1);
    },
  );

  it.each(['place', 'extension'] as const)(
    'refuses a retained %s confirmation after focus loss, unmount or dataset replacement',
    async (kind) => {
      await render(kind);
      const lostFocus = await askDelete(kind);
      mockFocused = false;
      const beforeFocus = databaseRows(t);
      await confirm(lostFocus);
      expect(databaseRows(t)).toEqual(beforeFocus);
      mockFocused = true;
      const replacement = snapshotDataset(t);
      const oldDataset = await askDelete(kind);
      await act(async () => {
        replacement();
        await settle();
      });
      const replaced = databaseRows(t);
      await confirm(oldDataset);
      expect(databaseRows(t)).toEqual(replaced);
      await act(async () => {
        tree!.unmount();
        tree = undefined;
        await settle();
      });
      await render(kind);
      const unmounted = await askDelete(kind);
      await act(async () => {
        tree!.unmount();
        tree = undefined;
        await settle();
      });
      const afterUnmount = databaseRows(t);
      await confirm(unmounted);
      expect(databaseRows(t)).toEqual(afterUnmount);
      expect(alertError).not.toHaveBeenCalled();
    },
  );

  it('a failed read leaves a cached place visible but cannot authorize its old confirmation', async () => {
    await render('place');
    const dialog = await askDelete('place');
    const prepare = t.sqlite.prepare.bind(t.sqlite);
    let broken = true;
    jest.spyOn(t.sqlite, 'prepare').mockImplementation((sql, params) => {
      if (broken && sql.includes('from "places"')) throw new Error('Synthetic place read failure');
      return prepare(sql, params);
    });
    await act(async () => {
      for (const listener of mockListeners) listener({ tableName: 'places' });
      await new Promise((resolve) => setTimeout(resolve, 90));
      await settle();
    });
    expect(tree!.root.findAllByType(Pressable).some((p) => typeof p.props.onLongPress === 'function')).toBe(true);
    const notice = tree!.root.findAllByType(ErrorNotice).find((n) => n.props.error)!;
    expect(notice).toBeDefined();
    broken = false;
    const before = databaseRows(t);
    await confirm(dialog);
    expect(databaseRows(t)).toEqual(before);
    expect(alertError).not.toHaveBeenCalled();
    await act(async () => {
      notice.props.onRetry();
      await settle();
    });
    await confirm(await askDelete('place'));
    expect(t.db.select().from(places).where(eq(places.id, placeId)).get()?.deletedAt).not.toBeNull();
  });

  it('restores a place through existing /trash and only exposes the still-live child', async () => {
    const deletedChild = await createExtension({ placeId, department: 'Synthetic deleted child', extension: '3456' });
    const childBasis = (await extensionsQuery()).find((r) => r.extension.id === deletedChild)!.expectedBasis;
    await deleteExtension(deletedChild, childBasis, now);
    await deletePlace(placeId, (await placesQuery()).find((r) => r.id === placeId)!.expectedBasis, now);
    await render('trash');
    const buttons = tree!.root.findAllByType(Button).filter((b) => b.props.label === 'برگرداندن مکان یا داخلی');
    expect(buttons).toHaveLength(2);
    // Stable kind order is extension then place for equal deletion times.
    await act(async () => {
      buttons[1]!.props.onPress();
      await settle();
    });
    const dialog = jest.mocked(Alert.alert).mock.calls.at(-1)!;
    expect(dialog[1]).toContain('جداگانه حذف‌شده');
    await confirm(dialog, 'برگردان', true);
    expect((await extensionsQuery()).map((r) => r.extension.id)).toEqual([extensionId]);
    expect(t.db.select().from(extensions).where(eq(extensions.id, deletedChild)).get()?.deletedAt).toEqual(now);
    expect(
      t.db
        .select()
        .from(auditLog)
        .all()
        .filter((r) => r.action === 'place.restored'),
    ).toHaveLength(1);
  });

  async function askRestore() {
    await act(async () => {
      tree!.root
        .findAllByType(Button)
        .find((b) => b.props.label === 'برگرداندن مکان یا داخلی')!
        .props.onPress();
      await settle();
    });
    return jest.mocked(Alert.alert).mock.calls.at(-1)!;
  }

  it.each(['focus', 'unmount', 'dataset', 'filter'] as const)(
    'refuses a retained trash confirmation after %s ownership is lost',
    async (loss) => {
      await deletePlace(placeId, (await placesQuery())[0]!.expectedBasis, now);
      await render('trash');
      const dialog = await askRestore();
      if (loss === 'focus') mockFocused = false;
      else if (loss === 'unmount')
        await act(async () => {
          tree!.unmount();
          tree = undefined;
          await settle();
        });
      else if (loss === 'dataset') {
        const replace = snapshotDataset(t);
        await act(async () => {
          replace();
          await settle();
        });
      } else
        await act(async () => {
          tree!.root.findByType(ChipSelect).props.onChange('extension');
          await settle();
        });
      const before = databaseRows(t);
      await confirm(dialog, 'برگردان');
      expect(databaseRows(t)).toEqual(before);
      expect(alertError).not.toHaveBeenCalled();
    },
  );

  it.each(['page', 'count'] as const)(
    'cached trash %s failure blocks old confirmation and has a working retry',
    async (failure) => {
      await deletePlace(placeId, (await placesQuery())[0]!.expectedBasis, now);
      await render('trash');
      const dialog = await askRestore();
      const prepare = t.sqlite.prepare.bind(t.sqlite);
      let broken = true;
      jest.spyOn(t.sqlite, 'prepare').mockImplementation((sql, params) => {
        const isCount = sql.startsWith('select count(*)');
        if (broken && sql.includes('as deleted_places') && (failure === 'count' ? isCount : !isCount))
          throw new Error('Synthetic trash read failure');
        return prepare(sql, params);
      });
      await act(async () => {
        for (const listener of mockListeners) listener({ tableName: 'places' });
        await new Promise((resolve) => setTimeout(resolve, 90));
        await settle();
      });
      expect(tree!.root.findAllByType(Button).some((b) => b.props.label === 'برگرداندن مکان یا داخلی')).toBe(true);
      const notices = tree!.root.findAllByType(ErrorNotice).filter((n) => n.props.error);
      expect(notices.length).toBeGreaterThan(0);
      broken = false;
      const before = databaseRows(t);
      await confirm(dialog, 'برگردان');
      expect(databaseRows(t)).toEqual(before);
      expect(alertError).not.toHaveBeenCalled();
      await act(async () => {
        notices.forEach((n) => n.props.onRetry());
        await settle();
      });
      await confirm(await askRestore(), 'برگردان');
      expect(t.db.select().from(places).where(eq(places.id, placeId)).get()?.deletedAt).toBeNull();
    },
  );

  it('an audit-only live event changes the retained lifecycle without changing row columns', async () => {
    await render('place');
    const dialog = await askDelete('place');
    const beforeRow = t.db.select().from(places).where(eq(places.id, placeId)).get();
    t.db
      .insert(auditLog)
      .values({
        id: 'synthetic-lifecycle',
        createdAt: now,
        updatedAt: now,
        at: now,
        action: 'place.restored',
        entityType: 'place',
        entityId: placeId,
      })
      .run();
    await act(async () => {
      for (const listener of mockListeners) listener({ tableName: 'audit_log' });
      await new Promise((resolve) => setTimeout(resolve, 90));
      await settle();
    });
    expect(t.db.select().from(places).where(eq(places.id, placeId)).get()).toEqual(beforeRow);
    const before = databaseRows(t);
    await confirm(dialog);
    expect(databaseRows(t)).toEqual(before);
    // No SQL attempt/error: the observed new basis rejects the retained choice.
    expect(alertError).not.toHaveBeenCalled();
  });
});
