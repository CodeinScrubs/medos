import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import { followUps } from '@/db/schema';
import { createPatient, deletePatient } from '@/features/patients/queries';
import { useTestDatabase } from '@/test/db-client';
import { cancelAllReminders, permission, resetNotifications, scheduled } from '@/test/mocks/notifications';
import { createTestDatabase, type TestDatabase } from '@/test/sqljs';

import { parseReminderPayload } from './logic';
import {
  completeFollowUp,
  createFollowUp,
  dueFollowUpsQuery,
  rescheduleReminders,
  setFollowUpStatus,
  updateFollowUp,
  type FollowUpInput,
} from './queries';

jest.mock('@/db/client', () => jest.requireActual('@/test/db-client'));
jest.mock('@/platform/notifications', () => jest.requireActual('@/test/mocks/notifications'));

let t: TestDatabase;
let patientId: string;

const hoursFromNow = (h: number) => new Date(Date.now() + h * 3_600_000);
const input = (patch: Partial<FollowUpInput> = {}): FollowUpInput => ({
  patientId,
  dueAt: hoursFromNow(48),
  reason: 'results of the CT',
  channel: 'call',
  priority: 'normal',
  ...patch,
});
const row = async (id: string) => (await t.db.select().from(followUps)).find((f) => f.id === id)!;

beforeEach(async () => {
  t = useTestDatabase(await createTestDatabase());
  resetNotifications();
  patientId = await createPatient({ firstName: 'سارا', lastName: 'احمدی' });
});

describe('follow-up reminders', () => {
  it('schedules a reminder that opens the right patient', async () => {
    const id = await createFollowUp(input());
    const { notificationId } = await row(id);
    const reminder = scheduled.get(notificationId!);
    expect(reminder?.title).toContain('سارا احمدی');
    expect(parseReminderPayload(reminder?.data)).toEqual({ kind: 'follow-up', patientId, followUpId: id });
  });

  it('still saves the follow-up when notifications are refused', async () => {
    permission.granted = false;
    const id = await createFollowUp(input());
    expect((await row(id)).notificationId).toBeNull();
    expect(scheduled.size).toBe(0);
  });

  it('replaces the reminder when the time changes, and drops it when done', async () => {
    const id = await createFollowUp(input());
    const first = (await row(id)).notificationId;
    await updateFollowUp(id, { dueAt: hoursFromNow(72) });
    const second = (await row(id)).notificationId;
    expect(second).not.toBe(first);
    expect([...scheduled.keys()]).toEqual([second]);

    await completeFollowUp(id, 'called, results normal');
    expect(scheduled.size).toBe(0);
    expect(await row(id)).toMatchObject({ status: 'done', outcome: 'called, results normal', notificationId: null });
  });

  it('brings a reminder back when a follow-up is reopened', async () => {
    const id = await createFollowUp(input());
    await setFollowUpStatus(id, 'missed');
    expect(scheduled.size).toBe(0);
    await setFollowUpStatus(id, 'pending');
    expect(scheduled.size).toBe(1);
  });

  it('reschedules everything after a restore, only for living patients', async () => {
    const other = await createPatient({ firstName: 'Deleted', lastName: 'Patient' });
    await createFollowUp(input());
    await createFollowUp(input({ patientId: other }));
    await deletePatient(other);
    // A restore replaces the database and clears what the OS holds.
    await cancelAllReminders();

    expect(await rescheduleReminders()).toBe(1);
    expect(scheduled.size).toBe(1);
  });
});

describe('the Today list', () => {
  it('shows what is due or overdue, highest priority first, and never deleted patients', async () => {
    const other = await createPatient({ firstName: 'Deleted', lastName: 'Patient' });
    await createFollowUp(input({ dueAt: hoursFromNow(-30), priority: 'low', reason: 'overdue, low' }));
    await createFollowUp(input({ dueAt: hoursFromNow(-1), priority: 'high', reason: 'due, high' }));
    await createFollowUp(input({ dueAt: hoursFromNow(24 * 10), reason: 'next week' }));
    await createFollowUp(input({ patientId: other, dueAt: hoursFromNow(-2), reason: 'deleted patient' }));
    await deletePatient(other);

    const due = await dueFollowUpsQuery(hoursFromNow(1));
    expect(due.map((d) => d.followUp.reason)).toEqual(['due, high', 'overdue, low']);
  });
});
