import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { eq } from 'drizzle-orm';

import { followUps } from '@/db/schema';
import { createPatient, deletePatient } from '@/features/patients/queries';
import * as notifications from '@/platform/notifications';
import { useTestDatabase } from '@/test/db-client';
import { cancelAllReminders, permission, resetNotifications, scheduled } from '@/test/mocks/notifications';
import { createTestDatabase, type TestDatabase } from '@/test/sqljs';

import { parseReminderPayload } from './logic';
import {
  completeFollowUp,
  createFollowUp,
  deleteFollowUp,
  dueFollowUpsQuery,
  rescheduleReminders,
  setFollowUpStatus,
  updateFollowUp,
  type FollowUpInput,
} from './queries';
import { followUpReminderId, reconcileFollowUpReminder, repairFollowUpReminders } from './reminder-queries';

jest.mock('@/db/client', () => jest.requireActual('@/test/db-client'));
jest.mock('@/platform/notifications', () => jest.requireActual('@/test/mocks/notifications'));

let t: TestDatabase;
let patientId: string;

const hoursFromNow = (h: number) => new Date(Math.floor(Date.now() / 1000) * 1000 + h * 3_600_000);
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
afterEach(() => {
  jest.restoreAllMocks();
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
    expect(second).toBe(first);
    expect(scheduled.get(second!)?.at).toEqual((await row(id)).dueAt);
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

  it('leaves the existing reminder untouched if changing the stored deadline fails', async () => {
    const id = await createFollowUp(input());
    const original = await row(id);
    t.sqlite.exec(
      "CREATE TRIGGER fail_followup BEFORE UPDATE ON follow_ups BEGIN SELECT RAISE(ABORT, 'synthetic failure'); END;",
    );
    await expect(updateFollowUp(id, { dueAt: hoursFromNow(72) })).rejects.toThrow();
    expect((await row(id)).dueAt).toEqual(original.dueAt);
    expect([...scheduled.keys()]).toEqual([original.notificationId]);
    expect(scheduled.get(original.notificationId!)?.at).toEqual(original.dueAt);
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

  it('creates no native reminder when clinical insertion fails', async () => {
    const schedule = jest.spyOn(notifications, 'scheduleReminder');
    t.sqlite.exec(
      "CREATE TRIGGER fail_insert BEFORE INSERT ON follow_ups BEGIN SELECT RAISE(ABORT, 'synthetic failure'); END;",
    );
    await expect(createFollowUp(input())).rejects.toThrow();
    expect(schedule).not.toHaveBeenCalled();
    expect(await t.db.select().from(followUps)).toHaveLength(0);
  });

  it('rejects invalid input and a deleted patient before any native work', async () => {
    await expect(createFollowUp(input({ dueAt: new Date(NaN) }))).rejects.toThrow();
    await expect(createFollowUp(input({ reason: '  ' }))).rejects.toThrow();
    await deletePatient(patientId);
    await expect(createFollowUp(input())).rejects.toThrow();
    expect(scheduled.size).toBe(0);
    expect(await t.db.select().from(followUps)).toHaveLength(0);
  });

  it('keeps a single saved follow-up when native scheduling fails, then repairs it without prompting', async () => {
    const schedule = jest
      .spyOn(notifications, 'scheduleReminder')
      .mockRejectedValueOnce(new Error('native unavailable'));
    const id = await createFollowUp(input());
    expect(await row(id)).toMatchObject({ reminderRevision: 0, reminderAppliedRevision: -1, notificationId: null });
    expect(await repairFollowUpReminders()).toBe(1);
    expect(schedule.mock.calls.at(-1)?.[0].askPermission).toBe(false);
    expect(await t.db.select().from(followUps)).toHaveLength(1);
    expect(await row(id)).toMatchObject({ reminderAppliedRevision: 0, notificationId: followUpReminderId(id) });
  });

  it('retries the same native identifier when scheduling succeeded but acknowledgement could not be stored', async () => {
    t.sqlite.exec(
      "CREATE TRIGGER fail_ack BEFORE UPDATE OF reminder_applied_revision ON follow_ups WHEN NEW.reminder_applied_revision >= 0 BEGIN SELECT RAISE(ABORT, 'synthetic failure'); END;",
    );
    const id = await createFollowUp(input());
    expect((await row(id)).reminderAppliedRevision).toBe(-1);
    expect([...scheduled.keys()]).toEqual([followUpReminderId(id)]);
    t.sqlite.exec('DROP TRIGGER fail_ack;');
    await repairFollowUpReminders();
    expect([...scheduled.keys()]).toEqual([followUpReminderId(id)]);
    expect((await row(id)).reminderAppliedRevision).toBe(0);
  });

  it('keeps completion and outcome when native cancellation fails, then retries cancellation', async () => {
    const id = await createFollowUp(input());
    jest.spyOn(notifications, 'cancelReminderRequired').mockRejectedValueOnce(new Error('native unavailable'));
    await completeFollowUp(id, 'reviewed');
    expect(await row(id)).toMatchObject({
      status: 'done',
      outcome: 'reviewed',
      reminderRevision: 1,
      reminderAppliedRevision: -1,
    });
    expect(scheduled.size).toBe(1);
    await repairFollowUpReminders();
    expect(scheduled.size).toBe(0);
    expect(await row(id)).toMatchObject({ notificationId: null, reminderAppliedRevision: 1 });
  });

  it('does not cancel a reminder if completing or deleting the clinical record fails', async () => {
    const id = await createFollowUp(input());
    t.sqlite.exec(
      "CREATE TRIGGER fail_change BEFORE UPDATE ON follow_ups BEGIN SELECT RAISE(ABORT, 'synthetic failure'); END;",
    );
    await expect(completeFollowUp(id, 'reviewed')).rejects.toThrow();
    await expect(deleteFollowUp(id)).rejects.toThrow();
    expect(await row(id)).toMatchObject({ status: 'pending', outcome: null, deletedAt: null });
    expect([...scheduled.keys()]).toEqual([followUpReminderId(id)]);
  });

  it('cancels an older request after permission is revoked or the new deadline is past', async () => {
    const id = await createFollowUp(input());
    permission.granted = false;
    await updateFollowUp(id, { dueAt: hoursFromNow(72) });
    expect(scheduled.size).toBe(0);
    expect(await row(id)).toMatchObject({ notificationId: null, reminderRevision: 1, reminderAppliedRevision: 1 });
    permission.granted = true;
    await reconcileFollowUpReminder(id, true);
    expect(scheduled.size).toBe(1);
    await updateFollowUp(id, { dueAt: hoursFromNow(-1) });
    expect(scheduled.size).toBe(0);
  });

  it('migrates an existing random native id without leaving a second request', async () => {
    const id = await createFollowUp(input());
    const reminder = scheduled.get(followUpReminderId(id))!;
    scheduled.clear();
    scheduled.set('legacy-id', reminder);
    t.db.update(followUps).set({ notificationId: 'legacy-id' }).where(eq(followUps.id, id)).run();
    await repairFollowUpReminders();
    expect([...scheduled.keys()]).toEqual([followUpReminderId(id)]);
  });

  it('reports native repair failure to restore housekeeping without rejecting the earlier clinical save', async () => {
    const id = await createFollowUp(input());
    jest.spyOn(notifications, 'scheduleReminder').mockRejectedValueOnce(new Error('native unavailable'));
    await expect(repairFollowUpReminders({ reportFailures: true })).rejects.toThrow();
    expect((await row(id)).status).toBe('pending');
    expect((await row(id)).reminderAppliedRevision).toBe(-1);
  });

  it('rechecks content if restore replaces the same id and revision during native scheduling', async () => {
    const id = await createFollowUp(input());
    const actual = notifications.scheduleReminder;
    const restoredDueAt = hoursFromNow(96);
    jest.spyOn(notifications, 'scheduleReminder').mockImplementationOnce(async (reminder) => {
      t.db.update(followUps).set({ reason: 'Restored reason', dueAt: restoredDueAt }).where(eq(followUps.id, id)).run();
      return actual(reminder);
    });
    await reconcileFollowUpReminder(id);
    expect(scheduled.get(followUpReminderId(id))?.body).toContain('Restored reason');
    expect(scheduled.get(followUpReminderId(id))?.at).toEqual(restoredDueAt);
    expect(scheduled.size).toBe(1);
  });

  it.each(['postpone', 'complete', 'delete', 'deletePatient'] as const)(
    'honors %s committed while an earlier native schedule is still in flight',
    async (operation) => {
      const id = await createFollowUp(input());
      const actual = notifications.scheduleReminder;
      let release!: () => void;
      let started!: () => void;
      const waiting = new Promise<void>((resolve) => {
        release = resolve;
      });
      const entered = new Promise<void>((resolve) => {
        started = resolve;
      });
      jest.spyOn(notifications, 'scheduleReminder').mockImplementationOnce(async (reminder) => {
        started();
        await waiting;
        return actual(reminder);
      });
      const first = updateFollowUp(id, { dueAt: hoursFromNow(72) });
      await entered;
      const lastDueAt = hoursFromNow(96);
      const second =
        operation === 'postpone'
          ? updateFollowUp(id, { dueAt: lastDueAt })
          : operation === 'complete'
            ? completeFollowUp(id, 'done')
            : operation === 'delete'
              ? deleteFollowUp(id)
              : deletePatient(patientId);
      release();
      await Promise.all([first, second]);
      if (operation === 'postpone') {
        expect([...scheduled.keys()]).toEqual([followUpReminderId(id)]);
        expect(scheduled.get(followUpReminderId(id))?.at).toEqual(lastDueAt);
      } else expect(scheduled.size).toBe(0);
      const result = await row(id);
      expect(result.reminderAppliedRevision).toBe(result.reminderRevision);
    },
  );
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
