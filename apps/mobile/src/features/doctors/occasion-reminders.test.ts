import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { eq } from 'drizzle-orm';

import { auditLog, doctors, occasions } from '@/db/schema';
import { formatJalali, fromJalali, toIsoDate, toJalali } from '@/lib/jalali';
import { addDays } from '@/lib/time';
import * as notifications from '@/platform/notifications';
import { useTestDatabase } from '@/test/db-client';
import { permission, resetNotifications, scheduled } from '@/test/mocks/notifications';
import { createTestDatabase, type TestDatabase } from '@/test/sqljs';

import { occasionReminderId, reconcileOccasionReminder, repairOccasionReminders } from './occasion-reminder-queries';
import { createOccasion, deleteOccasion, updateOccasion } from './occasions-queries';
import { createDoctor, deleteDoctor, updateDoctor } from './queries';

jest.mock('@/db/client', () => jest.requireActual('@/test/db-client'));
jest.mock('@/platform/notifications', () => jest.requireActual('@/test/mocks/notifications'));

let t: TestDatabase;
let doctorId: string;
const later = (days: number) => toIsoDate(new Date(Date.now() + days * 86_400_000));
const input = () => ({
  doctorId,
  kind: 'custom' as const,
  title: 'Example occasion',
  isRecurring: false,
  onDate: later(60),
});
const row = (id: string) => t.db.select().from(occasions).where(eq(occasions.id, id)).get()!;

beforeEach(async () => {
  t = useTestDatabase(await createTestDatabase());
  resetNotifications();
  doctorId = await createDoctor({ firstName: 'Example', lastName: 'Colleague', relationship: 'colleague' });
});
afterEach(() => {
  jest.restoreAllMocks();
  jest.useRealTimers();
});

describe('occasion reminder failure boundaries', () => {
  it('does not touch Android when inserting the occasion fails', async () => {
    const schedule = jest.spyOn(notifications, 'scheduleReminder');
    t.sqlite.exec(
      "CREATE TRIGGER fail_insert BEFORE INSERT ON occasions BEGIN SELECT RAISE(ABORT, 'synthetic failure'); END;",
    );
    await expect(createOccasion(input())).rejects.toThrow();
    expect(schedule).not.toHaveBeenCalled();
    expect(t.db.select().from(occasions).all()).toHaveLength(0);
  });

  it('keeps the old reminder when a date update or deletion cannot commit', async () => {
    const id = await createOccasion(input());
    const before = row(id);
    const reminder = scheduled.get(before.notificationId!);
    t.sqlite.exec(
      "CREATE TRIGGER fail_update BEFORE UPDATE ON occasions BEGIN SELECT RAISE(ABORT, 'synthetic failure'); END;",
    );
    await expect(updateOccasion(id, { onDate: later(90) })).rejects.toThrow();
    expect(scheduled.get(before.notificationId!)).toEqual(reminder);
    expect([...scheduled.keys()]).toEqual([before.notificationId]);
    await expect(deleteOccasion(id)).rejects.toThrow();
    expect(row(id)).toEqual(before);
    expect(scheduled.get(before.notificationId!)).toEqual(reminder);
  });

  it('keeps one saved occasion when Android scheduling fails', async () => {
    const schedule = jest
      .spyOn(notifications, 'scheduleReminder')
      .mockRejectedValueOnce(new Error('native unavailable'));
    const id = await createOccasion(input());
    expect(row(id).title).toBe(input().title);
    expect(t.db.select().from(occasions).all()).toHaveLength(1);
    expect(scheduled.size).toBe(0);
    expect(row(id)).toMatchObject({ reminderRevision: 0, reminderAppliedRevision: -1, notificationId: null });
    expect(await repairOccasionReminders()).toBe(1);
    expect(schedule.mock.calls.at(-1)?.[0].askPermission).toBe(false);
    expect(row(id)).toMatchObject({ reminderAppliedRevision: 0, notificationId: occasionReminderId(id) });
  });

  it('reuses the same id when the native request succeeds but its acknowledgement fails', async () => {
    t.sqlite.exec(
      "CREATE TRIGGER fail_ack BEFORE UPDATE OF reminder_applied_revision ON occasions WHEN NEW.reminder_applied_revision >= 0 BEGIN SELECT RAISE(ABORT, 'synthetic failure'); END;",
    );
    const id = await createOccasion(input());
    expect(row(id).reminderAppliedRevision).toBe(-1);
    expect([...scheduled.keys()]).toEqual([occasionReminderId(id)]);
    t.sqlite.exec('DROP TRIGGER fail_ack;');
    await repairOccasionReminders();
    expect([...scheduled.keys()]).toEqual([occasionReminderId(id)]);
    expect(row(id).reminderAppliedRevision).toBe(0);
  });

  it.each(['disable', 'delete', 'deleteDoctor'] as const)(
    'retries failed native cancellation after %s has committed',
    async (operation) => {
      const id = await createOccasion(input());
      jest.spyOn(notifications, 'cancelReminderRequired').mockRejectedValueOnce(new Error('native unavailable'));
      if (operation === 'disable') await updateOccasion(id, { isEnabled: false });
      else if (operation === 'delete') await deleteOccasion(id);
      else await deleteDoctor(doctorId);
      expect(row(id)).toMatchObject({ reminderRevision: 1, reminderAppliedRevision: -1 });
      expect(scheduled.size).toBe(1);
      await repairOccasionReminders();
      expect(scheduled.size).toBe(0);
      expect(row(id)).toMatchObject({ reminderAppliedRevision: 1, notificationId: null });
      if (operation !== 'disable') expect(row(id).deletedAt).toBeInstanceOf(Date);
    },
  );

  it('rolls back occasions and leaves Android unchanged when doctor deletion fails', async () => {
    const id = await createOccasion(input());
    const before = row(id);
    t.sqlite.exec(
      "CREATE TRIGGER fail_delete BEFORE UPDATE ON doctors BEGIN SELECT RAISE(ABORT, 'synthetic failure'); END;",
    );
    await expect(deleteDoctor(doctorId)).rejects.toThrow();
    expect(row(id)).toEqual(before);
    expect(t.db.select().from(doctors).where(eq(doctors.id, doctorId)).get()?.deletedAt).toBeNull();
    expect([...scheduled.keys()]).toEqual([before.notificationId]);
  });

  it('rejects invalid timing or deleted parents before persistence/native work', async () => {
    await expect(createOccasion({ ...input(), onDate: '2030-02-30' })).rejects.toThrow();
    await expect(createOccasion({ ...input(), remindDaysBefore: -1 })).rejects.toThrow();
    await expect(createOccasion({ ...input(), isRecurring: true, jalaliMonth: 7, jalaliDay: 31 })).rejects.toThrow();
    await deleteDoctor(doctorId);
    await expect(createOccasion(input())).rejects.toThrow();
    expect(t.db.select().from(occasions).all()).toHaveLength(0);
    expect(scheduled.size).toBe(0);
  });

  it('keeps saved data after permission refusal, cancels stale alarms and later retries without prompting', async () => {
    const id = await createOccasion(input());
    permission.granted = false;
    await updateOccasion(id, { onDate: later(90) });
    expect(row(id).onDate).toBe(later(90));
    expect(row(id).notificationId).toBeNull();
    expect(scheduled.size).toBe(0);
    await expect(repairOccasionReminders({ reportFailures: true })).rejects.toThrow();
    permission.granted = true;
    expect(await repairOccasionReminders()).toBe(1);
    await updateOccasion(id, { onDate: later(-1) });
    expect(scheduled.size).toBe(0);
  });

  it('retires a legacy random id, including when cancellation initially fails', async () => {
    const id = await createOccasion(input());
    const reminder = scheduled.get(occasionReminderId(id))!;
    scheduled.clear();
    scheduled.set('legacy-id', reminder);
    t.db.update(occasions).set({ notificationId: 'legacy-id' }).where(eq(occasions.id, id)).run();
    jest.spyOn(notifications, 'cancelReminderRequired').mockRejectedValueOnce(new Error('native unavailable'));
    await repairOccasionReminders();
    expect([...scheduled.keys()]).toEqual(['legacy-id']);
    expect(row(id).notificationId).toBe('legacy-id');
    await repairOccasionReminders();
    expect([...scheduled.keys()]).toEqual([occasionReminderId(id)]);
  });

  it('continues repairing other occasions when one fails and reports incomplete restore housekeeping', async () => {
    const first = await createOccasion(input());
    const second = await createOccasion({ ...input(), title: 'Another occasion' });
    scheduled.clear();
    jest.spyOn(notifications, 'scheduleReminder').mockRejectedValueOnce(new Error('native unavailable'));
    await expect(repairOccasionReminders({ reportFailures: true })).rejects.toThrow();
    expect(row(first).reminderAppliedRevision).toBe(-1);
    expect(scheduled.has(occasionReminderId(second))).toBe(true);
    expect(t.db.select().from(occasions).all()).toHaveLength(2);
  });

  it("uses the actual next-year occurrence in the reminder text once this year's lead time has passed", async () => {
    jest.useFakeTimers().setSystemTime(fromJalali(1403, 5, 12));
    const id = await createOccasion({
      ...input(),
      isRecurring: true,
      jalaliMonth: 5,
      jalaliDay: 13,
      remindDaysBefore: 3,
    });
    const reminder = scheduled.get(occasionReminderId(id))!;
    const on = addDays(reminder.at, 3);
    expect(toJalali(on)).toEqual({ jy: 1404, jm: 5, jd: 13 });
    expect(reminder.body).toContain(formatJalali(on));
  });

  it('refreshes scheduled names after a doctor rename and records deletions without private content', async () => {
    const id = await createOccasion(input());
    await updateDoctor(doctorId, { lastName: 'Updated' });
    expect(scheduled.get(occasionReminderId(id))?.title).toContain('Example Updated');
    await deleteOccasion(id);
    await deleteDoctor(doctorId);
    const entries = t.db.select().from(auditLog).all();
    expect(entries.map((entry) => entry.action)).toEqual(
      expect.arrayContaining(['occasion.deleted', 'doctor.deleted']),
    );
    expect(JSON.stringify(entries)).not.toContain('Example');
  });

  it('rechecks restored content even if the id and revision stayed the same', async () => {
    const id = await createOccasion(input());
    const actual = notifications.scheduleReminder;
    jest.spyOn(notifications, 'scheduleReminder').mockImplementationOnce(async (reminder) => {
      t.db
        .update(occasions)
        .set({ title: 'Restored title', onDate: later(90) })
        .where(eq(occasions.id, id))
        .run();
      return actual(reminder);
    });
    await reconcileOccasionReminder(id);
    expect(scheduled.size).toBe(1);
    expect(scheduled.get(occasionReminderId(id))?.body).toContain('Restored title');
    expect(row(id).reminderAppliedRevision).toBe(row(id).reminderRevision);
  });

  it.each(['postpone', 'disable', 'delete', 'deleteDoctor'] as const)(
    'honors %s committed during an older native request',
    async (operation) => {
      const id = await createOccasion(input());
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
      const first = updateOccasion(id, { onDate: later(80) });
      await entered;
      const second =
        operation === 'postpone'
          ? updateOccasion(id, { onDate: later(90) })
          : operation === 'disable'
            ? updateOccasion(id, { isEnabled: false })
            : operation === 'delete'
              ? deleteOccasion(id)
              : deleteDoctor(doctorId);
      release();
      await Promise.all([first, second]);
      if (operation === 'postpone') {
        expect([...scheduled.keys()]).toEqual([occasionReminderId(id)]);
        expect(toIsoDate(addDays(scheduled.get(occasionReminderId(id))!.at, 1))).toBe(later(90));
      } else expect(scheduled.size).toBe(0);
      expect(row(id).reminderAppliedRevision).toBe(row(id).reminderRevision);
    },
  );
});
