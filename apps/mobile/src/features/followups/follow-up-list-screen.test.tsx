import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { FlashList } from '@shopify/flash-list';
import type { ReactElement } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { ErrorNotice } from '@/components/error-notice';
import { PromptModal } from '@/components/prompt-modal';
import { Input, EmptyState } from '@/components/ui';
import { followUps } from '@/db/schema';
import { createPatient, deletePatient } from '@/features/patients/queries';
import { useTestDatabase } from '@/test/db-client';
import { createTestDatabase, type TestDatabase } from '@/test/sqljs';

import { FollowUpListScreen } from './follow-up-list-screen';
import { createFollowUp } from './queries';

let mockParams: Record<string, unknown> = {};
let mockNow = new Date(2026, 8, 30, 12).getTime();
jest.mock('expo-router', () => ({ useLocalSearchParams: () => mockParams, useRouter: () => ({ push: jest.fn() }) }));
jest.mock('expo-sqlite', () => ({ addDatabaseChangeListener: () => ({ remove: () => {} }) }));
jest.mock('@/components/use-now', () => ({ useNow: () => mockNow }));
jest.mock('@/db/client', () => jest.requireActual('@/test/db-client'));
jest.mock('@/platform/notifications', () => jest.requireActual('@/test/mocks/notifications'));
jest.mock('@expo/vector-icons/Ionicons', () => 'Ionicon');
jest.mock('@/components/error-notice', () => ({ ErrorNotice: 'ErrorNotice' }));
jest.mock('@/components/screen-options', () => ({ ScreenOptions: 'ScreenOptions' }));
jest.mock('@/components/ui', () => ({
  Badge: 'Badge',
  Button: 'Button',
  Card: 'Card',
  Column: 'Column',
  Input: 'Input',
  Row: 'Row',
  Screen: 'Screen',
  Text: 'Text',
  EmptyState: 'EmptyState',
}));
jest.mock('@shopify/flash-list', () => ({
  FlashList: ({
    data,
    renderItem,
    keyExtractor,
  }: {
    data: unknown[];
    renderItem: (arg: unknown) => ReactElement;
    keyExtractor: (item: unknown) => string;
  }) => {
    const { cloneElement } = jest.requireActual<typeof import('react')>('react');
    return data.map((item, index) => cloneElement(renderItem({ item, index }), { key: keyExtractor(item) }));
  },
}));

let tree: ReactTestRenderer | undefined;
let db: TestDatabase;
let dueId: string;
let futureId: string;
async function settle() {
  for (let i = 0; i < 40; i++) await Promise.resolve();
}
async function render() {
  await act(async () => {
    if (tree) tree.update(<FollowUpListScreen />);
    else tree = create(<FollowUpListScreen />);
    await settle();
  });
}
function ids(): string[] {
  return (
    tree!.root.findAllByType(FlashList)[0]?.props.data.map((r: { followUp: { id: string } }) => r.followUp.id) ?? []
  );
}
const notice = () => tree!.root.findByType(ErrorNotice);
async function retry() {
  await act(async () => {
    notice().props.onRetry();
    await settle();
  });
}
beforeEach(async () => {
  mockParams = {};
  mockNow = new Date(2026, 8, 30, 12).getTime();
  db = useTestDatabase(await createTestDatabase());
  const patientId = await createPatient({ firstName: 'Example', lastName: 'Patient' });
  dueId = await createFollowUp({
    patientId,
    reason: 'Today',
    dueAt: new Date(2026, 8, 30, 18),
    channel: 'visit',
    priority: 'normal',
  });
  futureId = await createFollowUp({
    patientId,
    reason: 'Tomorrow',
    dueAt: new Date(2026, 9, 1, 18),
    channel: 'visit',
    priority: 'high',
  });
});
afterEach(async () => {
  await act(async () => {
    tree?.unmount();
  });
  tree = undefined;
  jest.restoreAllMocks();
});

describe('full follow-up list with real SQLite and useLive', () => {
  it('opens each mode on an already mounted screen without making clinical writes', async () => {
    const before = db.db.select().from(followUps).all();
    await render();
    expect(ids()).toEqual([dueId]);
    mockParams.mode = 'upcoming';
    await render();
    expect(ids()).toEqual([futureId]);
    mockParams.mode = ['upcoming'];
    await render();
    expect(ids()).toEqual([dueId]);
    expect(db.db.select().from(followUps).all()).toEqual(before);
  });
  it('keeps all rows beyond the preview and excludes deleted patients', async () => {
    const patientId = await createPatient({ firstName: 'Another', lastName: 'Example' });
    for (let i = 0; i < 8; i++)
      await createFollowUp({
        patientId,
        reason: `Future ${i}`,
        dueAt: new Date(2026, 9, i + 2),
        channel: 'visit',
        priority: 'normal',
      });
    mockParams.mode = 'upcoming';
    await render();
    expect(ids()).toHaveLength(9);
    await deletePatient(patientId);
    await retry();
    expect(ids()).toEqual([futureId]);
  });
  it('reports initial and retained refresh failures, then recovers by actual retry', async () => {
    const prepare = db.sqlite.prepare.bind(db.sqlite);
    let broken = true;
    jest.spyOn(db.sqlite, 'prepare').mockImplementation((sql, params) => {
      if (broken && sql.includes('from "follow_ups"')) throw new Error('synthetic list failure');
      return prepare(sql, params);
    });
    await render();
    expect(notice().props.error).toBeDefined();
    expect(tree!.root.findAllByType(EmptyState)).toHaveLength(0);
    broken = false;
    await retry();
    expect(ids()).toEqual([dueId]);
    broken = true;
    await retry();
    expect(notice().props.error).toBeDefined();
    expect(ids()).toEqual([dueId]);
    broken = false;
    await retry();
    expect(notice().props.error).toBeUndefined();
  });
  it('preserves an outcome through a route change and submits it to its original patient', async () => {
    await render();
    await act(async () => {
      tree!.root
        .findAll((n) => n.props.accessibilityLabel === 'انجام شد' && typeof n.props.onPress === 'function')[0]!
        .props.onPress();
    });
    await act(async () => {
      tree!.root.findByType(Input).props.onChangeText('Outcome kept');
    });
    mockParams.mode = 'upcoming';
    await render();
    expect(ids()).toEqual([dueId]);
    expect(tree!.root.findByType(Input).props.value).toBe('Outcome kept');
    await act(async () => {
      tree!.root.findByType(PromptModal).props.onSubmit('Outcome kept');
      await settle();
    });
    expect(ids()).toEqual([futureId]);
    expect(
      db.db
        .select()
        .from(followUps)
        .all()
        .find((r) => r.id === dueId),
    ).toMatchObject({ status: 'done', outcome: 'Outcome kept' });
  });
  it('moves the due boundary at midnight without losing an open outcome', async () => {
    await render();
    await act(async () => {
      tree!.root
        .findAll((n) => n.props.accessibilityLabel === 'انجام شد' && typeof n.props.onPress === 'function')[0]!
        .props.onPress();
    });
    await act(async () => {
      tree!.root.findByType(Input).props.onChangeText('Before midnight');
    });
    mockNow = new Date(2026, 9, 1).getTime();
    await render();
    expect(ids()).toEqual([dueId]);
    expect(tree!.root.findByType(Input).props.value).toBe('Before midnight');
    await act(async () => {
      tree!.root.findByType(PromptModal).props.onCancel();
      await settle();
    });
    expect(ids()).toEqual([futureId, dueId]); // High priority stays before normal.
    expect(
      db.db
        .select()
        .from(followUps)
        .all()
        .every((r) => r.status === 'pending'),
    ).toBe(true);
  });
});
