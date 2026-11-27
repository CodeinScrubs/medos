import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { eq } from 'drizzle-orm';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { Alert, Linking, Pressable } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { ErrorNotice } from '@/components/error-notice';
import { alertError, notify } from '@/components/feedback';
import { doctors, extensions, places } from '@/db/schema';
import { DoctorScreen } from '@/features/doctors/doctor-screen';
import { createDoctor } from '@/features/doctors/queries';
import { logError } from '@/platform/error-log';
import { databaseRows, replacementFailure, snapshotDataset } from '@/test/dataset-snapshot';
import { useTestDatabase } from '@/test/db-client';
import { createTestDatabase, type TestDatabase } from '@/test/sqljs';

import { ExtensionsScreen } from './extensions-screen';
import { PlacesScreen } from './places-screen';
import { createExtension, createPlace } from './queries';
const mockListeners = new Set<(event: { tableName: string }) => void>();
let mockFocused = true;
let mockDoctorId = '';
const mockBack = jest.fn();
const mockPush = jest.fn();
jest.mock('expo-sqlite', () => ({
  addDatabaseChangeListener: (listener: (event: { tableName: string }) => void) => {
    mockListeners.add(listener);
    return { remove: () => mockListeners.delete(listener) };
  },
}));
jest.mock('@/db/client', () => jest.requireActual('@/test/db-client'));
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ id: mockDoctorId }),
  useRouter: () => ({ push: mockPush, replace: jest.fn(), back: mockBack }),
}));
jest.mock('expo-router/react-navigation', () => ({ useNavigation: () => ({ isFocused: () => mockFocused }) }));
jest.mock('@/components/error-notice', () => ({ ErrorNotice: 'ErrorNotice' }));
jest.mock('@/components/feedback', () => ({ alertError: jest.fn(), notify: jest.fn() }));
jest.mock('@/components/screen-options', () => ({ ScreenOptions: 'ScreenOptions' }));
jest.mock('@/components/collapsible-section', () => ({ CollapsibleSection: 'CollapsibleSection' }));
jest.mock('@/features/doctors/occasions-section', () => ({ OccasionsSection: 'OccasionsSection' }));
jest.mock('@/features/workspace-forms/unfinished-forms', () => ({
  UnfinishedWorkspaceForms: 'UnfinishedWorkspaceForms',
}));
jest.mock('@/platform/error-log', () => ({ logError: jest.fn() }));
jest.mock('@/platform/notifications', () => jest.requireActual('@/test/mocks/notifications'));
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn() }));
jest.mock('expo-haptics', () => ({ notificationAsync: jest.fn(), NotificationFeedbackType: { Success: 'success' } }));
jest.mock('@expo/vector-icons/Ionicons', () => ({ __esModule: true, default: 'Ionicons' }));
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: 'SafeAreaView',
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 24, left: 0 }),
}));
jest.mock('@/components/ui', () => ({
  Avatar: 'Avatar',
  Badge: 'Badge',
  Button: 'Button',
  Card: 'Card',
  ChipSelect: 'ChipSelect',
  Column: 'Column',
  DataRow: 'DataRow',
  EmptyState: 'EmptyState',
  Fab: 'Fab',
  IconButton: 'IconButton',
  Row: 'Row',
  Screen: 'Screen',
  Text: 'Text',
}));
jest.mock('@/theme', () => ({
  MIN_TOUCH: 44,
  useTheme: () => ({ colors: {}, radii: {}, spacing: { md: 12, lg: 16, huge: 32 }, typography: {} }),
}));
jest.mock('react-native', () => {
  const native = jest.requireActual<typeof import('react-native')>('react-native');
  const React = jest.requireActual<typeof import('react')>('react');
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
  return new Proxy(native, {
    get: (target, key) =>
      key === 'Pressable' ? 'Pressable' : key === 'FlatList' ? FlatList : Reflect.get(target, key),
  });
});
let t: TestDatabase;
let tree: ReactTestRenderer | undefined;
let placeId: string;
let extensionId: string;
type Kind = 'copy' | 'call' | 'phone' | 'map' | 'doctor-map';
async function settle() {
  for (let i = 0; i < 50; i++) await Promise.resolve();
}
async function render(kind: Kind) {
  await act(async () => {
    tree = create(
      kind === 'doctor-map' ? (
        <DoctorScreen />
      ) : kind === 'copy' || kind === 'call' ? (
        <ExtensionsScreen />
      ) : (
        <PlacesScreen />
      ),
    );
    await settle();
  });
}
function button(kind: Kind) {
  return tree!.root
    .findAllByType(Pressable)
    .find((p) =>
      kind === 'copy'
        ? String(p.props.accessibilityLabel).startsWith('کپی داخلی')
        : p.props.accessibilityLabel ===
          (kind === 'call' ? 'تماس' : kind === 'phone' ? 'تماس با مکان' : kind === 'map' ? 'نقشهٔ مکان' : 'نقشه'),
    )!;
}
async function press(callback: () => void, twice = false) {
  await act(async () => {
    callback();
    if (twice) callback();
    await settle();
  });
}
beforeEach(async () => {
  jest.clearAllMocks();
  mockListeners.clear();
  mockFocused = true;
  t = useTestDatabase(await createTestDatabase());
  placeId = await createPlace({
    name: 'Synthetic action owner',
    kind: 'hospital',
    phone: '5550127',
    switchboard: '5550127',
    address: 'Synthetic map location',
  });
  extensionId = await createExtension({ placeId, department: 'Synthetic ward', extension: '2345' });
  mockDoctorId = await createDoctor({ firstName: 'Synthetic', lastName: 'Doctor', primaryPlaceId: placeId });
  jest.mocked(Clipboard.setStringAsync).mockResolvedValue(true);
  jest.mocked(Haptics.notificationAsync).mockResolvedValue();
  jest.spyOn(Linking, 'openURL').mockResolvedValue();
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
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
const count = () => t.db.select().from(extensions).where(eq(extensions.id, extensionId)).get()!.usageCount;
async function askStar() {
  await act(async () => {
    tree!.root
      .findAllByType(Pressable)
      .find((p) => typeof p.props.onLongPress === 'function')!
      .props.onLongPress();
    await settle();
  });
  const menu = jest.mocked(Alert.alert).mock.calls.at(-1)!;
  return menu[2]!.find((entry) => entry.text === 'ستاره‌دار' || entry.text === 'برداشتن ستاره')!.onPress!;
}

describe('retained extension star menu', () => {
  it('fresh star runs once for repeated native callbacks, and a fresh unstar still succeeds', async () => {
    t.sqlite.exec(
      'CREATE TEMP TABLE synthetic_star_writes (n INTEGER); CREATE TEMP TRIGGER count_star_writes AFTER UPDATE OF starred ON extensions BEGIN INSERT INTO synthetic_star_writes VALUES (1); END',
    );
    await render('copy');
    await press(await askStar(), true);
    expect(t.db.select().from(extensions).where(eq(extensions.id, extensionId)).get()!.starred).toBe(true);
    expect(t.conn.getFirstSync<{ n: number }>('SELECT count(*) AS n FROM synthetic_star_writes')!.n).toBe(1);
    await press(await askStar());
    expect(t.db.select().from(extensions).where(eq(extensions.id, extensionId)).get()!.starred).toBe(false);
    expect(alertError).not.toHaveBeenCalled();
    expect(mockBack).not.toHaveBeenCalled();
  });
  it.each(['dataset', 'focus', 'unmount', 'edit'] as const)(
    'retained star menu refuses %s loss without mutating the current dataset',
    async (loss) => {
      await render('copy');
      const callback = await askStar();
      if (loss === 'dataset') {
        const replace = snapshotDataset(t);
        await act(async () => {
          replace();
          await settle();
        });
      } else if (loss === 'focus') mockFocused = false;
      else if (loss === 'unmount')
        await act(async () => {
          tree!.unmount();
          tree = undefined;
          await settle();
        });
      else
        t.db
          .update(extensions)
          .set({ notes: 'Synthetic hidden correction' })
          .where(eq(extensions.id, extensionId))
          .run();
      const before = databaseRows(t);
      await press(callback);
      expect(databaseRows(t)).toEqual(before);
      expect(alertError).toHaveBeenCalledTimes(loss === 'edit' ? 1 : 0);
      expect(mockBack).not.toHaveBeenCalled();
    },
  );
  it('a cached failed read cannot authorize its old star menu and a successful retry permits a fresh choice', async () => {
    await render('copy');
    const callback = await askStar();
    const prepare = t.sqlite.prepare.bind(t.sqlite);
    let broken = true;
    jest.spyOn(t.sqlite, 'prepare').mockImplementation((sql, params) => {
      if (broken && sql.includes('from "extensions"')) throw new Error('Synthetic star read failure');
      return prepare(sql, params);
    });
    await act(async () => {
      for (const listener of mockListeners) listener({ tableName: 'extensions' });
      await new Promise((resolve) => setTimeout(resolve, 90));
      await settle();
    });
    const notice = tree!.root.findAllByType(ErrorNotice).find((n) => n.props.error)!;
    expect(notice).toBeDefined();
    const before = databaseRows(t);
    await press(callback);
    expect(databaseRows(t)).toEqual(before);
    expect(alertError).not.toHaveBeenCalled();
    broken = false;
    await act(async () => {
      notice.props.onRetry();
      await settle();
    });
    await press(await askStar());
    expect(t.db.select().from(extensions).where(eq(extensions.id, extensionId)).get()!.starred).toBe(true);
  });
  it('a pending clipboard action holds the same latch against an already-open star menu', async () => {
    let acknowledge!: (saved: boolean) => void;
    jest.mocked(Clipboard.setStringAsync).mockImplementation(
      () =>
        new Promise((resolve) => {
          acknowledge = resolve;
        }),
    );
    await render('copy');
    const callback = await askStar();
    await press(button('copy').props.onPress);
    await press(callback);
    const afterStar = t.db.select().from(extensions).where(eq(extensions.id, extensionId)).get()!.starred;
    await act(async () => {
      acknowledge(true);
      await settle();
    });
    expect(afterStar).toBe(false);
    expect(count()).toBe(1);
    expect(alertError).not.toHaveBeenCalled();
  });
});

describe('retained rendered places device choices', () => {
  it.each(['copy', 'call', 'phone', 'map', 'doctor-map'] as const)(
    'dispatches %s once when a retained callback fires twice in one render',
    async (kind) => {
      await render(kind);
      await press(button(kind).props.onPress, true);
      expect(kind === 'copy' ? Clipboard.setStringAsync : Linking.openURL).toHaveBeenCalledTimes(1);
      expect(count()).toBe(kind === 'copy' || kind === 'call' ? 1 : 0);
      expect(mockBack).not.toHaveBeenCalled();
      expect(alertError).not.toHaveBeenCalled();
    },
  );
  it.each(['copy', 'call', 'phone', 'map', 'doctor-map'] as const)(
    'retained %s callback is refused after dataset replacement',
    async (kind) => {
      await render(kind);
      const callback = button(kind).props.onPress;
      const replace = snapshotDataset(t);
      await act(async () => {
        replace();
        await settle();
      });
      const before = databaseRows(t);
      await press(callback);
      expect(Clipboard.setStringAsync).not.toHaveBeenCalled();
      expect(Linking.openURL).not.toHaveBeenCalled();
      expect(databaseRows(t)).toEqual(before);
      expect(mockBack).not.toHaveBeenCalled();
    },
  );
  it.each(['focus', 'unmount'] as const)(
    'a deferred clipboard receipt after %s does not write usage, haptic or route feedback',
    async (loss) => {
      let acknowledge!: (saved: boolean) => void;
      jest.mocked(Clipboard.setStringAsync).mockImplementation(
        () =>
          new Promise((resolve) => {
            acknowledge = resolve;
          }),
      );
      await render('copy');
      await press(button('copy').props.onPress);
      expect(replacementFailure()).toBeInstanceOf(Error);
      if (loss === 'focus') mockFocused = false;
      else
        await act(async () => {
          tree!.unmount();
          tree = undefined;
          await settle();
        });
      await act(async () => {
        acknowledge(true);
        await settle();
      });
      expect(count()).toBe(0);
      expect(Haptics.notificationAsync).not.toHaveBeenCalled();
      expect(alertError).not.toHaveBeenCalled();
      expect(notify).not.toHaveBeenCalled();
      expect(mockBack).not.toHaveBeenCalled();
      expect(replacementFailure()).toBeNull();
    },
  );
  it('counter and haptic failures do not report an acknowledged copy as failed', async () => {
    t.sqlite.exec(
      "CREATE TRIGGER reject_usage BEFORE UPDATE OF usage_count ON extensions BEGIN SELECT RAISE(ABORT, 'Synthetic private counter failure'); END",
    );
    jest.mocked(Haptics.notificationAsync).mockRejectedValue(new Error('Synthetic private haptic failure'));
    await render('copy');
    await press(button('copy').props.onPress);
    expect(Clipboard.setStringAsync).toHaveBeenCalledWith('2345');
    expect(count()).toBe(0);
    expect(logError).toHaveBeenCalledTimes(2);
    expect(alertError).not.toHaveBeenCalled();
  });
  it('failed copy has one handled concise error and no usage', async () => {
    jest.mocked(Clipboard.setStringAsync).mockRejectedValue(new Error('Synthetic private value should not escape'));
    await render('copy');
    await press(button('copy').props.onPress);
    expect(count()).toBe(0);
    expect(alertError).toHaveBeenCalledTimes(1);
    expect((jest.mocked(alertError).mock.calls[0]![1] as Error).message).not.toContain('Synthetic');
    expect(Haptics.notificationAsync).not.toHaveBeenCalled();
  });
  it('a hidden switchboard correction before live refresh cannot launch the retained call URI', async () => {
    await render('call');
    const callback = button('call').props.onPress;
    t.db.update(places).set({ switchboard: '5550128' }).where(eq(places.id, placeId)).run();
    await press(callback);
    expect(Linking.openURL).not.toHaveBeenCalled();
    expect(count()).toBe(0);
    expect(alertError).toHaveBeenCalledTimes(1);
  });

  it.each(['copy', 'phone', 'doctor-map'] as const)(
    'late rejected %s receipt after focus loss cannot open feedback over another route',
    async (kind) => {
      let reject!: (error: Error) => void;
      if (kind === 'copy')
        jest.mocked(Clipboard.setStringAsync).mockImplementation(
          () =>
            new Promise((resolve, failure) => {
              reject = failure;
            }),
        );
      else
        jest.mocked(Linking.openURL).mockImplementation(
          () =>
            new Promise((resolve, failure) => {
              reject = failure;
            }),
        );
      await render(kind);
      await press(button(kind).props.onPress);
      mockFocused = false;
      await act(async () => {
        reject(new Error('Synthetic private late native exception'));
        await settle();
      });
      expect(count()).toBe(0);
      expect(alertError).not.toHaveBeenCalled();
      expect(notify).not.toHaveBeenCalled();
      expect(mockBack).not.toHaveBeenCalled();
      expect(replacementFailure()).toBeNull();
    },
  );

  it.each(['copy', 'doctor-map'] as const)(
    'a cached %s reference read failure refuses its retained callback until successful retry',
    async (kind) => {
      await render(kind);
      const callback = button(kind).props.onPress;
      const prepare = t.sqlite.prepare.bind(t.sqlite);
      let broken = true;
      jest.spyOn(t.sqlite, 'prepare').mockImplementation((sql, params) => {
        if (broken && sql.includes(kind === 'copy' ? 'from "extensions"' : 'from "places"'))
          throw new Error('Synthetic read failure');
        return prepare(sql, params);
      });
      await act(async () => {
        for (const listener of mockListeners) listener({ tableName: kind === 'copy' ? 'extensions' : 'places' });
        await new Promise((resolve) => setTimeout(resolve, 90));
        await settle();
      });
      const notice = tree!.root.findAllByType(ErrorNotice).find((n) => n.props.error)!;
      expect(notice).toBeDefined();
      await press(callback);
      expect(Clipboard.setStringAsync).not.toHaveBeenCalled();
      expect(Linking.openURL).not.toHaveBeenCalled();
      expect(alertError).not.toHaveBeenCalled();
      broken = false;
      await act(async () => {
        notice.props.onRetry();
        await settle();
      });
      await press(button(kind).props.onPress);
      expect(kind === 'copy' ? Clipboard.setStringAsync : Linking.openURL).toHaveBeenCalledTimes(1);
      expect(count()).toBe(kind === 'copy' ? 1 : 0);
    },
  );
  it('a doctor with an explicit null place cannot borrow an imported empty-key place map', async () => {
    t.db
      .insert(places)
      .values({
        id: '',
        createdAt: new Date(),
        updatedAt: new Date(),
        name: 'Synthetic empty-key unrelated place',
        kind: 'hospital',
        address: 'Synthetic map',
      })
      .run();
    t.db.update(doctors).set({ primaryPlaceId: null }).where(eq(doctors.id, mockDoctorId)).run();
    await render('doctor-map');
    expect(button('doctor-map')).toBeUndefined();
    expect(Linking.openURL).not.toHaveBeenCalled();
  });
  it('a hidden doctor-place reassignment cannot dispatch the old map from its retained route', async () => {
    await render('doctor-map');
    const callback = button('doctor-map').props.onPress;
    const replacementPlace = await createPlace({
      name: 'Synthetic other doctor place',
      kind: 'hospital',
      address: 'Synthetic other map',
    });
    t.db.update(doctors).set({ primaryPlaceId: replacementPlace }).where(eq(doctors.id, mockDoctorId)).run();
    await press(callback);
    expect(Linking.openURL).not.toHaveBeenCalled();
    expect(alertError).toHaveBeenCalledTimes(1);
    expect(mockBack).not.toHaveBeenCalled();
  });
});

async function askEdit() {
  await askStar();
  return jest
    .mocked(Alert.alert)
    .mock.calls.at(-1)![2]!
    .find((item) => item.text === 'ویرایش')!.onPress!;
}
describe('original extension edit navigation choice', () => {
  it('a fresh repeated native callback opens one original editor without changing records', async () => {
    await render('copy');
    const before = databaseRows(t);
    await press(await askEdit(), true);
    expect(mockPush).toHaveBeenCalledTimes(1);
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/extensions/edit', params: { extensionId } });
    expect(databaseRows(t)).toEqual(before);
    expect(alertError).not.toHaveBeenCalled();
    expect(replacementFailure()).toBeNull();
  });
  it.each(['dataset', 'focus', 'unmount', 'edit'] as const)(
    'a retained edit does not open a new route after %s loss',
    async (loss) => {
      await render('copy');
      const callback = await askEdit();
      if (loss === 'dataset') {
        const replace = snapshotDataset(t);
        await act(async () => {
          replace();
          await settle();
        });
      } else if (loss === 'focus') mockFocused = false;
      else if (loss === 'unmount')
        await act(async () => {
          tree!.unmount();
          tree = undefined;
          await settle();
        });
      else
        t.db
          .update(extensions)
          .set({ notes: 'Synthetic concurrent correction' })
          .where(eq(extensions.id, extensionId))
          .run();
      const before = databaseRows(t);
      await press(callback);
      expect(mockPush).not.toHaveBeenCalled();
      expect(databaseRows(t)).toEqual(before);
      expect(alertError).toHaveBeenCalledTimes(loss === 'edit' ? 1 : 0);
    },
  );
  it('a retained edit is refused after a cached read fails', async () => {
    await render('copy');
    const callback = await askEdit();
    const prepare = t.sqlite.prepare.bind(t.sqlite);
    let broken = true;
    jest.spyOn(t.sqlite, 'prepare').mockImplementation((sql, params) => {
      if (broken && sql.includes('from "extensions"')) throw Error('Synthetic read failure');
      return prepare(sql, params);
    });
    await act(async () => {
      for (const listener of mockListeners) listener({ tableName: 'extensions' });
      await new Promise((resolve) => setTimeout(resolve, 90));
      await settle();
    });
    expect(tree!.root.findAllByType(ErrorNotice).some((n) => n.props.error)).toBe(true);
    broken = false;
    const before = databaseRows(t);
    await press(callback);
    expect(mockPush).not.toHaveBeenCalled();
    expect(databaseRows(t)).toEqual(before);
    expect(alertError).not.toHaveBeenCalled();
  });
});
