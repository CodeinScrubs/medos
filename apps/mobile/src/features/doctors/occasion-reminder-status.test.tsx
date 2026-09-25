import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { Button } from '@/components/ui';
import { occasions } from '@/db/schema';
import { toIsoDate } from '@/lib/jalali';
import * as notifications from '@/platform/notifications';
import { useTestDatabase } from '@/test/db-client';
import { permission, resetNotifications } from '@/test/mocks/notifications';
import { createTestDatabase, type TestDatabase } from '@/test/sqljs';

import { OccasionReminderStatus } from './occasion-reminder-status';
import { createOccasion, updateOccasion } from './occasions-queries';
import { createDoctor } from './queries';

jest.mock('@/db/client', () => jest.requireActual('@/test/db-client'));
jest.mock('@/platform/notifications', () => jest.requireActual('@/test/mocks/notifications'));
jest.mock('@/components/ui', () => ({ Button: 'Button' }));
jest.mock('@/components/feedback', () => ({ alertError: jest.fn() }));

let t: TestDatabase;
let tree: ReactTestRenderer | undefined;
const current = () => t.db.select().from(occasions).get()!;
async function settle() {
  for (let i = 0; i < 30; i++) await Promise.resolve();
}
async function render() {
  await act(async () => {
    tree = create(<OccasionReminderStatus occasion={current()} />);
  });
}
async function refresh() {
  await act(async () => {
    tree!.update(<OccasionReminderStatus occasion={current()} />);
  });
}

beforeEach(async () => {
  t = useTestDatabase(await createTestDatabase());
  resetNotifications();
  const doctorId = await createDoctor({ firstName: 'Example', lastName: 'Colleague' });
  await createOccasion({
    doctorId,
    kind: 'custom',
    title: 'Occasion',
    isRecurring: false,
    onDate: toIsoDate(new Date(Date.now() + 60 * 86_400_000)),
  });
});
afterEach(async () => {
  await act(async () => {
    tree?.unmount();
  });
  tree = undefined;
  jest.restoreAllMocks();
});

describe('occasion reminder retry UI', () => {
  it('stays compact after success, shows refusal, and recovers through the actual retry handler', async () => {
    await render();
    expect(tree!.root.findAllByType(Button)).toHaveLength(0);
    permission.granted = false;
    await updateOccasion(current().id, { title: 'Changed' });
    await refresh();
    expect(tree!.root.findByType(Button).props.label).toContain('تلاش مجدد');
    permission.granted = true;
    const schedule = jest.spyOn(notifications, 'scheduleReminder');
    await act(async () => {
      tree!.root.findByType(Button).props.onPress();
      tree!.root.findByType(Button).props.onPress();
      await settle();
    });
    await refresh();
    expect(schedule).toHaveBeenCalledTimes(1);
    expect(schedule.mock.calls[0]?.[0].askPermission).toBe(true);
    expect(tree!.root.findAllByType(Button)).toHaveLength(0);
  });

  it('exposes unfinished cancellation even for a disabled reminder', async () => {
    jest.spyOn(notifications, 'cancelReminderRequired').mockRejectedValueOnce(new Error('native unavailable'));
    await updateOccasion(current().id, { isEnabled: false });
    await render();
    expect(tree!.root.findAllByType(Button)).toHaveLength(1);
    await act(async () => {
      tree!.root.findByType(Button).props.onPress();
      await settle();
    });
    await refresh();
    expect(tree!.root.findAllByType(Button)).toHaveLength(0);
    expect(current().notificationId).toBeNull();
  });
});
