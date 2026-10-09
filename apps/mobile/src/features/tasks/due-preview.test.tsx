import { afterEach, beforeEach, expect, it, jest } from '@jest/globals';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { Button, ChipSelect, Input, SectionHeader } from '@/components/ui';
import { createPatient } from '@/features/patients/queries';
import { endOfDay } from '@/lib/time';
import { useTestDatabase } from '@/test/db-client';
import { createTestDatabase } from '@/test/sqljs';

import { DueTasksSection } from './due-tasks-section';
import { TaskListScreen } from './list-screen';
import { createTask } from './queries';
import { TaskRow } from './task-row';

const mockPush = jest.fn();
let mockParams: { scope?: string } = {};
const mockNow = new Date('2026-09-26T12:00:00Z').getTime();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }), useLocalSearchParams: () => mockParams }));
jest.mock('@/db/client', () => jest.requireActual('@/test/db-client'));
jest.mock('@/db/use-live', () => ({
  useLive: (query: { all(): unknown[] }) => ({ data: query.all(), retry: jest.fn(), loading: false }),
}));
jest.mock('@/platform/notifications', () => jest.requireActual('@/test/mocks/notifications'));
jest.mock('@/components/use-now', () => ({ useNow: () => mockNow }));
jest.mock('@/components/error-notice', () => ({ ErrorNotice: 'ErrorNotice' }));
jest.mock('@/components/screen-options', () => ({ ScreenOptions: 'ScreenOptions' }));
jest.mock('./task-row', () => ({ TaskRow: 'TaskRow' }));
jest.mock('@/components/ui', () => ({
  Button: 'Button',
  ChipSelect: 'ChipSelect',
  Column: 'Column',
  EmptyState: 'EmptyState',
  Input: 'Input',
  Screen: 'Screen',
  SectionHeader: 'SectionHeader',
}));
let tree: ReactTestRenderer | undefined;
let patientId: string;
beforeEach(async () => {
  useTestDatabase(await createTestDatabase());
  patientId = await createPatient({ firstName: 'Synthetic', lastName: 'Due deck' });
  mockParams = {};
  mockPush.mockClear();
});
afterEach(async () => {
  await act(async () => {
    tree?.unmount();
  });
  tree = undefined;
});
async function tasks(count: number) {
  for (let i = 0; i < count; i++)
    await createTask({
      patientId,
      title: 'Scheduled ' + i,
      dueAt: new Date(mockNow - 1000 + i),
      priority: i === count - 1 ? 'high' : 'normal',
    });
}
it('keeps the Today preview short while showing its whole matching count and exact full-list scope', async () => {
  await tasks(41);
  await act(async () => {
    tree = create(<DueTasksSection now={new Date(mockNow)} />);
  });
  expect(tree!.root.findAllByType(TaskRow)).toHaveLength(10);
  expect(tree!.root.findByType(SectionHeader).props.count).toBe(41);
  const header = tree!.root.findByType(SectionHeader);
  await act(async () => {
    tree!.update(<>{header.props.action}</>);
  });
  tree!.root.findByType(Button).props.onPress();
  expect(mockPush).toHaveBeenLastCalledWith({ pathname: '/tasks', params: { scope: 'due' } });
});
it('opens the full due-patient scope, keeps it while loading more, and clears it explicitly for global work', async () => {
  await tasks(61);
  await createTask({ title: 'Global work', dueAt: new Date(mockNow - 1000) });
  await createTask({ patientId, title: 'Undated work' });
  await createTask({ patientId, title: 'Future work', dueAt: new Date(endOfDay(new Date(mockNow)).getTime() + 1) });
  mockParams = { scope: 'due' };
  await act(async () => {
    tree = create(<TaskListScreen />);
  });
  expect(tree!.root.findAllByType(TaskRow)).toHaveLength(50);
  expect(tree!.root.findByType(SectionHeader).props.count).toBe(61);
  expect(tree!.root.findAllByType(TaskRow)[0]!.props.task.title).toBe('Scheduled 60');
  await act(async () => {
    tree!.root.findByType(Button).props.onPress();
  });
  expect(tree!.root.findAllByType(TaskRow)).toHaveLength(61);
  await act(async () => {
    tree!.root.findAllByType(ChipSelect)[0]!.props.onChange('global');
  });
  expect(tree!.root.findAllByType(TaskRow)).toHaveLength(1);
  expect(tree!.root.findByType(SectionHeader).props.count).toBe(1);
  expect(tree!.root.findAllByType(TaskRow)[0]!.props.task.title).toBe('Global work');
  await act(async () => {
    tree!.root.findAllByType(ChipSelect)[0]!.props.onChange('due');
    tree!.root.findByType(Input).props.onChangeText('Scheduled 60');
  });
  expect(tree!.root.findAllByType(TaskRow)).toHaveLength(1);
  expect(tree!.root.findByType(SectionHeader).props.count).toBe(1);
});
