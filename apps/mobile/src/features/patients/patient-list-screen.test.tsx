import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { TextInput } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { ErrorNotice } from '@/components/error-notice';
import { EmptyState } from '@/components/ui';
import { openEncounter } from '@/features/encounters/queries';
import { useTestDatabase } from '@/test/db-client';
import { createTestDatabase, type TestDatabase } from '@/test/sqljs';

import { PatientListScreen } from './patient-list-screen';
import { createPatient } from './queries';

let mockParams: Record<string, string | string[] | undefined> = {};
const mockRouter = {
  push: jest.fn(),
  setParams: jest.fn((params: typeof mockParams) => {
    mockParams = { ...mockParams, ...params };
  }),
};
const mockListeners = new Set<(event: { tableName: string }) => void>();
jest.mock('expo-sqlite', () => ({
  addDatabaseChangeListener: (listener: (event: { tableName: string }) => void) => {
    mockListeners.add(listener);
    return { remove: () => mockListeners.delete(listener) };
  },
}));
jest.mock('@/db/client', () => jest.requireActual('@/test/db-client'));
jest.mock('@/platform/notifications', () => jest.requireActual('@/test/mocks/notifications'));
jest.mock('expo-router', () => ({ useRouter: () => mockRouter, useLocalSearchParams: () => mockParams }));
jest.mock('@shopify/flash-list', () => ({ FlashList: 'FlashList' }));
jest.mock('@expo/vector-icons/Ionicons', () => 'Ionicon');
jest.mock('react-native-safe-area-context', () => ({ SafeAreaView: 'SafeAreaView' }));
jest.mock('react-native-keyboard-controller', () => ({ KeyboardAwareScrollView: 'KeyboardAwareScrollView' }));
jest.mock('@/components/ui', () => ({
  ChipSelect: jest.requireActual<typeof import('@/components/ui/chips')>('@/components/ui/chips').ChipSelect,
  Column: 'Column',
  EmptyState: 'EmptyState',
  Fab: 'Fab',
  Row: 'Row',
  Text: 'Text',
}));
jest.mock('@/components/error-notice', () => ({ ErrorNotice: 'ErrorNotice' }));
jest.mock('./patient-card', () => ({ PatientCard: 'PatientCard' }));

let tree: ReactTestRenderer | undefined;
let database: TestDatabase;
let admitted: string;
let current: string;
let discharged: string;
let archived: string;
async function settle() {
  for (let i = 0; i < 35; i++) await Promise.resolve();
}
async function render() {
  await act(async () => {
    if (tree) tree.update(<PatientListScreen />);
    else tree = create(<PatientListScreen />);
    await settle();
  });
}
function ids(): string[] {
  return tree!.root.findAllByType('FlashList' as never)[0]?.props.data.map((p: { id: string }) => p.id) ?? [];
}
async function search(value: string) {
  await act(async () => {
    tree!.root.findByType(TextInput).props.onChangeText(value);
    await settle();
  });
}
async function tab(label: string) {
  const target = tree!.root
    .findAll((n) => n.props.accessibilityRole === 'radio' && typeof n.props.onPress === 'function')
    .find((n) => n.findAll((child) => child.props.children === label).length)!;
  await act(async () => {
    target.props.onPress();
    await settle();
  });
  await render();
}
beforeEach(async () => {
  jest.clearAllMocks();
  mockParams = {};
  mockListeners.clear();
  database = useTestDatabase(await createTestDatabase());
  admitted = await createPatient({ firstName: 'Inpatient', lastName: 'Example' });
  await openEncounter({ patientId: admitted, kind: 'admission', ward: 'Example ward' });
  current = await createPatient({ firstName: 'Outpatient', lastName: 'Example' });
  discharged = await createPatient({
    firstName: 'Discharged',
    lastName: 'Example',
    status: 'discharged',
    starred: true,
  });
  archived = await createPatient({ firstName: 'Archived', lastName: 'Example', status: 'archived', starred: true });
});
afterEach(async () => {
  await act(async () => {
    tree?.unmount();
    await settle();
  });
  tree = undefined;
  jest.restoreAllMocks();
});

describe('patient list route and recovery, using real useLive and SQLite', () => {
  it('keeps current patients as default and finds discharged names during search', async () => {
    await render();
    expect(ids().sort()).toEqual([admitted, current].sort());
    await search('Discharged');
    expect(ids()).toEqual([discharged]);
  });
  it('opens all starred statuses, including discharged and archived', async () => {
    mockParams = { status: 'all', starred: '1' };
    await render();
    expect(ids().sort()).toEqual([discharged, archived].sort());
  });
  it('honors an admitted route while the tab is already mounted', async () => {
    await render();
    mockParams = { status: 'admitted', starred: '0' };
    await render();
    expect(ids()).toEqual([admitted]);
    await search('Discharged');
    expect(ids()).toEqual([]);
  });
  it('toggles the visible star control without changing the selected status scope', async () => {
    mockParams = { status: 'all', starred: '0' };
    await render();
    const toggle = () =>
      tree!.root
        .findAll((n) => n.props.accessibilityRole === 'checkbox' && typeof n.props.onPress === 'function')[0]!
        .props.onPress();
    await act(async () => {
      toggle();
    });
    await render();
    expect(mockParams.status).toBe('all');
    expect(mockParams.starred).toBe('1');
    expect(ids().sort()).toEqual([discharged, archived].sort());
    await act(async () => {
      toggle();
    });
    await render();
    expect(ids()).toHaveLength(4);
    expect(mockParams.status).toBe('all');
  });
  it('synchronizes manual scope so the same external scope applies again', async () => {
    mockParams = { status: 'admitted' };
    await render();
    await tab('ترخیص‌شده');
    expect(mockParams.status).toBe('discharged');
    mockParams.status = 'admitted';
    await render();
    expect(ids()).toEqual([admitted]);
  });
  it('retains search on return but consumes an explicit fresh-list request once', async () => {
    await render();
    await search('Outpatient');
    await render();
    expect(tree!.root.findByType(TextInput).props.value).toBe('Outpatient');
    mockParams = { status: 'admitted', starred: '0', resetSearch: '1' };
    await render();
    expect(tree!.root.findByType(TextInput).props.value).toBe('');
    expect(mockParams.resetSearch).toBeUndefined();
    await search('Inpatient');
    await render();
    expect(tree!.root.findByType(TextInput).props.value).toBe('Inpatient');
  });
  it('reports a failed initial read without claiming absence and retries the real query', async () => {
    const prepare = database.sqlite.prepare.bind(database.sqlite);
    const failure = new Error('synthetic patient list failure');
    let broken = true;
    jest.spyOn(database.sqlite, 'prepare').mockImplementation((sql, params) => {
      if (broken && sql.includes('from "patients"')) throw failure;
      return prepare(sql, params);
    });
    await render();
    const notice = tree!.root.findAllByType(ErrorNotice).find((n) => n.props.what === 'لیست بیماران')!;
    expect(notice.props.error).toBeDefined();
    expect(tree!.root.findAllByType(EmptyState)).toHaveLength(0);
    broken = false;
    await act(async () => {
      notice.props.onRetry();
      await settle();
    });
    expect(ids().sort()).toEqual([admitted, current].sort());
  });
});
