import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { SectionHeader } from '@/components/ui';
import { followUps } from '@/db/schema';
import { openEncounter } from '@/features/encounters/queries';
import { FollowUpCard } from '@/features/followups/follow-up-card';
import { createFollowUp } from '@/features/followups/queries';
import { PatientCard } from '@/features/patients/patient-card';
import { createPatient } from '@/features/patients/queries';
import { ShiftCard } from '@/features/shifts/shift-card';
import { useTestDatabase } from '@/test/db-client';
import { createTestDatabase, type TestDatabase } from '@/test/sqljs';

import { TodayScreen } from './today-screen';

const mockPush = jest.fn();
let mockNow = new Date(2026, 8, 30, 12).getTime();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));
jest.mock('expo-sqlite', () => ({ addDatabaseChangeListener: () => ({ remove: () => {} }) }));
jest.mock('@/db/client', () => jest.requireActual('@/test/db-client'));
jest.mock('@/platform/notifications', () => jest.requireActual('@/test/mocks/notifications'));
jest.mock('@/components/use-now', () => ({ useNow: () => mockNow }));
jest.mock('@expo/vector-icons/Ionicons', () => 'Ionicon');
jest.mock('@/components/error-notice', () => ({ ErrorNotice: 'ErrorNotice' }));
jest.mock('@/components/ui', () => ({
  Button: 'Button',
  Card: 'Card',
  Column: 'Column',
  EmptyState: 'EmptyState',
  Fab: 'Fab',
  Row: 'Row',
  Screen: 'Screen',
  SectionHeader: 'SectionHeader',
  Text: 'Text',
}));
jest.mock('@/features/backup/backup-nudge', () => ({ BackupNudge: 'BackupNudge' }));
jest.mock('@/features/backup/restore-trouble', () => ({ RestoreTrouble: 'RestoreTrouble' }));
jest.mock('@/features/calls/recent-calls-card', () => ({ RecentCallsCard: 'RecentCallsCard' }));
jest.mock('@/features/capture/inbox-section', () => ({ InboxSection: 'InboxSection' }));
jest.mock('@/features/consults/open-consults', () => ({ OpenConsults: 'OpenConsults' }));
jest.mock('@/features/doctors/upcoming-occasions', () => ({ UpcomingOccasions: 'UpcomingOccasions' }));
jest.mock('@/features/followups/follow-up-card', () => ({ FollowUpCard: 'FollowUpCard' }));
jest.mock('@/features/notes/unfinished-notes', () => ({ UnfinishedNotes: 'UnfinishedNotes' }));
jest.mock('@/features/patients/patient-card', () => ({ PatientCard: 'PatientCard' }));
jest.mock('@/features/shifts/shift-card', () => ({ ShiftCard: 'ShiftCard' }));
jest.mock('@/features/tasks/due-tasks-section', () => ({ DueTasksSection: 'DueTasksSection' }));
jest.mock('@/features/tasks/tasks-section', () => ({ TasksSection: 'TasksSection' }));

let tree: ReactTestRenderer | undefined;
let db: TestDatabase;
async function settle() {
  for (let i = 0; i < 40; i++) await Promise.resolve();
}
async function render() {
  await act(async () => {
    if (tree) tree.update(<TodayScreen />);
    else tree = create(<TodayScreen />);
    await settle();
  });
}
const heading = (title: string) => tree!.root.findAllByType(SectionHeader).find((n) => n.props.title === title)!;
beforeEach(async () => {
  mockPush.mockClear();
  mockNow = new Date(2026, 8, 30, 12).getTime();
  db = useTestDatabase(await createTestDatabase());
});
afterEach(async () => {
  await act(async () => {
    tree?.unmount();
  });
  tree = undefined;
});

describe('Today direct destinations and truthful previews', () => {
  it('opens admitted and all-starred scopes without clinical writes', async () => {
    await render();
    for (const [label, params] of [
      ['بستری', { status: 'admitted', starred: '0', resetSearch: '1' }],
      ['ستاره‌دار', { status: 'all', starred: '1', resetSearch: '1' }],
    ] as const) {
      tree!.root
        .findAll((n) => n.props.accessibilityLabel === label && typeof n.props.onPress === 'function')[0]!
        .props.onPress();
      expect(mockPush).toHaveBeenLastCalledWith({ pathname: '/patients', params });
    }
    expect(db.db.select().from(followUps).all()).toEqual([]);
  });
  it.each([0, 1, 5, 6, 40])('counts %i upcoming rows fully and limits only the preview', async (count) => {
    const patientId = await createPatient({ firstName: 'Example', lastName: 'Patient' });
    for (let i = 0; i < count; i++)
      await createFollowUp({
        patientId,
        reason: `Review ${i}`,
        dueAt: new Date(2026, 9, 1, 12),
        channel: 'visit',
        priority: 'normal',
      });
    await render();
    expect(tree!.root.findAllByType(FollowUpCard)).toHaveLength(Math.min(count, 5));
    if (count === 0) expect(heading('پیگیری‌های پیش رو')).toBeUndefined();
    else {
      expect(heading('پیگیری‌های پیش رو').props.count).toBe(count);
      heading('پیگیری‌های پیش رو').props.action.props.onPress();
      expect(mockPush).toHaveBeenLastCalledWith({ pathname: '/followups', params: { mode: 'upcoming' } });
    }
    expect(
      db.db
        .select()
        .from(followUps)
        .all()
        .every((r) => r.status === 'pending'),
    ).toBe(true);
  });
  it('keeps shift entry before due work, preserves due priority, and exposes all forty admissions', async () => {
    for (let i = 0; i < 40; i++) {
      const patientId = await createPatient({ firstName: `Example ${i}`, lastName: 'Patient' });
      await openEncounter({ patientId, kind: 'admission' });
      if (i < 6)
        await createFollowUp({
          patientId,
          reason: `Due ${i}`,
          dueAt: new Date(2026, 8, 30, 18),
          channel: 'visit',
          priority: i === 5 ? 'high' : 'normal',
        });
    }
    await render();
    expect(heading('بیماران بستری').props.count).toBe(40);
    expect(tree!.root.findAllByType(PatientCard)).toHaveLength(8);
    heading('بیماران بستری').props.action.props.onPress();
    expect(mockPush).toHaveBeenLastCalledWith({
      pathname: '/patients',
      params: { status: 'admitted', starred: '0', resetSearch: '1' },
    });
    expect(heading('پیگیری‌های امروز').props.count).toBe(6);
    expect(tree!.root.findAllByType(FollowUpCard)).toHaveLength(5);
    expect(tree!.root.findAllByType(FollowUpCard)[0]!.props.followUp.reason).toBe('Due 5');
    const sequence = tree!.root.findAll(
      (n) => n.type === ShiftCard || n.type === FollowUpCard || n.type === PatientCard,
    );
    expect(sequence[0]!.type).toBe(ShiftCard);
    heading('پیگیری‌های امروز').props.action.props.onPress();
    expect(mockPush).toHaveBeenLastCalledWith({ pathname: '/followups', params: { mode: 'due' } });
  });
});
