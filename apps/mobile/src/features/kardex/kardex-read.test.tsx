import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { eq } from 'drizzle-orm';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { ErrorNotice } from '@/components/error-notice';
import { EmptyState, SectionHeader, Text } from '@/components/ui';
import { encounters, orders } from '@/db/schema';
import { KardexTab } from '@/features/kardex/kardex-tab';
import * as queries from '@/features/kardex/queries';
import { createPatient } from '@/features/patients/queries';
import { stamps } from '@/lib/ids';
import { useTestDatabase } from '@/test/db-client';
import { createTestDatabase, type TestDatabase } from '@/test/sqljs';

const mockListeners = new Set<(event: { tableName: string }) => void>();
jest.mock('expo-sqlite', () => ({
  addDatabaseChangeListener: (listener: (event: { tableName: string }) => void) => {
    mockListeners.add(listener);
    return { remove: () => mockListeners.delete(listener) };
  },
}));
jest.mock('react-native', () => {
  const native = jest.requireActual<typeof import('react-native')>('react-native');
  return new Proxy(native, {
    get: (target, key) => (['Pressable', 'View'].includes(String(key)) ? String(key) : Reflect.get(target, key)),
  });
});
jest.mock('@expo/vector-icons/Ionicons', () => 'Ionicon');
jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock('@/db/client', () => jest.requireActual('@/test/db-client'));
jest.mock('@/platform/notifications', () => jest.requireActual('@/test/mocks/notifications'));
jest.mock('@/components/error-notice', () => ({ ErrorNotice: 'ErrorNotice' }));
jest.mock('@/components/feedback', () => ({ alertError: jest.fn(), notify: jest.fn() }));
jest.mock('@/components/ui', () => ({
  Badge: 'Badge',
  Button: 'Button',
  Card: 'Card',
  Column: 'Column',
  EmptyState: 'EmptyState',
  Row: 'Row',
  SectionHeader: 'SectionHeader',
  Text: 'Text',
}));
jest.mock('@/theme', () => ({ useTheme: () => ({ colors: {}, spacing: {}, radii: {} }) }));

let t: TestDatabase, patientId: string, tree: ReactTestRenderer | undefined;
const at = new Date('2025-01-01T12:00:00Z');
async function settle() {
  for (let i = 0; i < 50; i++) await Promise.resolve();
}
async function render() {
  await act(async () => {
    tree = create(<KardexTab patientId={patientId} />);
    await settle();
  });
}
const text = () => tree!.root.findAllByType(Text).map((n) => [n.props.children].flat().join(''));
const error = () => tree!.root.findAllByType(ErrorNotice).find((n) => n.props.what === 'کاردکس')!;
async function changed() {
  await act(async () => {
    for (const listener of mockListeners) listener({ tableName: 'encounters' });
    await new Promise((resolve) => setTimeout(resolve, 90));
    await settle();
  });
}
function addEpisode(id: string, admittedAt: Date, active: boolean) {
  t.db
    .insert(encounters)
    .values({ id, patientId, ...stamps(at), admittedAt, isActive: active, kind: 'admission' })
    .run();
}
function addOrder(id: string, encounterId: string | null, name: string) {
  t.db
    .insert(orders)
    .values({ id, patientId, encounterId, name, kind: 'drug', startAt: at, ...stamps(at) })
    .run();
}
function fixture() {
  addEpisode('synthetic-current', at, true);
  addEpisode('synthetic-old', new Date('2024-01-01T12:00:00Z'), false);
  addOrder('synthetic-current-order', 'synthetic-current', 'Synthetic current drug');
  addOrder('synthetic-standing-order', null, 'Synthetic standing drug');
  addOrder('synthetic-old-order', 'synthetic-old', 'Synthetic historical drug');
}
beforeEach(async () => {
  jest.clearAllMocks();
  mockListeners.clear();
  t = useTestDatabase(await createTestDatabase());
  patientId = await createPatient({ firstName: 'Synthetic', lastName: 'Kardex reads' });
});
afterEach(async () => {
  await act(async () => {
    tree?.unmount();
    await settle();
  });
  tree = undefined;
  jest.restoreAllMocks();
});

describe('current kardex reads retain their episode and report incomplete information', () => {
  it('does not treat failed encounter resolution as a standing-only or empty kardex and retries', async () => {
    fixture();
    const prepare = t.sqlite.prepare.bind(t.sqlite);
    let broken = true;
    jest.spyOn(t.sqlite, 'prepare').mockImplementation((sql, params) => {
      if (broken && sql.includes('"encounters"') && sql.startsWith('select')) throw new Error('Synthetic episode read');
      return prepare(sql, params);
    });
    await render();
    expect(error().props.error).toBeInstanceOf(Error);
    expect(error().props.onRetry).toEqual(expect.any(Function));
    expect(tree!.root.findAllByType(EmptyState)).toHaveLength(0);
    expect(text()).not.toContain('Synthetic standing drug');
    broken = false;
    await act(async () => {
      error().props.onRetry();
      await settle();
    });
    expect(text()).toContain('Synthetic current drug');
    expect(text()).toContain('Synthetic standing drug');
    expect(text()).not.toContain('Synthetic historical drug');
  });
  it('an unresolved first snapshot does not assert an empty kardex', async () => {
    const read = queries.patientCurrentOrdersQuery;
    jest.spyOn(queries, 'patientCurrentOrdersQuery').mockImplementation((...args) => {
      const query = read(...args);
      jest.spyOn(query, 'then').mockImplementation(() => new Promise<never>(() => {}));
      return query;
    });
    await render();
    expect(tree!.root.findAllByType(EmptyState)).toHaveLength(0);
    expect(text()).toContain('در حال خواندن…');
  });
  it('keeps cached orders without trustworthy counts when the episode read fails and recovers on retry', async () => {
    fixture();
    await render();
    expect(text()).toContain('Synthetic current drug');
    const prepare = t.sqlite.prepare.bind(t.sqlite);
    let broken = true;
    jest.spyOn(t.sqlite, 'prepare').mockImplementation((sql, params) => {
      if (broken && sql.includes('"encounters"') && sql.startsWith('select')) throw new Error('Synthetic refresh');
      return prepare(sql, params);
    });
    await changed();
    expect(text()).toContain('Synthetic current drug');
    expect(error().props.error).toBeInstanceOf(Error);
    expect(tree!.root.findAllByType(SectionHeader).every((n) => n.props.count === undefined)).toBe(true);
    broken = false;
    await act(async () => {
      error().props.onRetry();
      await settle();
    });
    expect(error().props.error).toBeUndefined();
    expect(tree!.root.findAllByType(SectionHeader).find((n) => n.props.title === 'در جریان')!.props.count).toBe(2);
  });
  it('a failed refresh of an empty snapshot does not claim current absence', async () => {
    await render();
    expect(tree!.root.findAllByType(EmptyState)).toHaveLength(1);
    const prepare = t.sqlite.prepare.bind(t.sqlite);
    jest.spyOn(t.sqlite, 'prepare').mockImplementation((sql, params) => {
      if (sql.includes('"encounters"') && sql.startsWith('select')) throw new Error('Synthetic empty refresh');
      return prepare(sql, params);
    });
    await changed();
    expect(error().props.error).toBeInstanceOf(Error);
    expect(tree!.root.findAllByType(EmptyState)).toHaveLength(0);
    expect(text()).not.toContain('دستور فعالی نیست.');
  });
  it('a changed episode becomes visible with its own drugs and standing orders', async () => {
    fixture();
    await render();
    t.db.update(encounters).set({ isActive: false }).where(eq(encounters.id, 'synthetic-current')).run();
    addEpisode('synthetic-next', new Date('2025-01-02T12:00:00Z'), true);
    addOrder('synthetic-next-order', 'synthetic-next', 'Synthetic next drug');
    await changed();
    expect(text()).toContain('Synthetic next drug');
    expect(text()).toContain('Synthetic standing drug');
    expect(text()).not.toContain('Synthetic current drug');
    expect(text()).not.toContain('Synthetic historical drug');
  });
});
