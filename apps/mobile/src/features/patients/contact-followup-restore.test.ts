import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { eq } from 'drizzle-orm';

import { auditLog, clinicalVersions, encounters, followUps, patientContacts, type FollowUp } from '@/db/schema';
import { reconcileFollowUpReminder, followUpReminderId } from '@/features/followups/reminder-queries';
import { datasetGeneration, withDatasetWrite } from '@/lib/dataset-write';
import { stamps } from '@/lib/ids';
import * as notifications from '@/platform/notifications';
import { databaseRows, replacementFailure } from '@/test/dataset-snapshot';
import { useTestDatabase } from '@/test/db-client';
import { permission, resetNotifications, scheduled } from '@/test/mocks/notifications';
import { createTestDatabase, type TestDatabase } from '@/test/sqljs';

import { deletedClinicalQuery, restoreClinicalRecord } from './clinical-trash-queries';
import { addPatientContact, createPatient, deletePatientContact, patientContactsQuery } from './queries';

jest.mock('@/db/client', () => jest.requireActual('@/test/db-client'));
jest.mock('@/platform/notifications', () => jest.requireActual('@/test/mocks/notifications'));

const now = new Date('2026-10-01T10:00:00.000Z');
const earlier = new Date(now.getTime() - 1000);
const future = new Date(now.getTime() + 86_400_000);
let t: TestDatabase, patientId: string;
const stored = () => t.db.select().from(followUps).where(eq(followUps.id, 'follow-up')).get()!;
const histories = () => t.db.select().from(clinicalVersions).where(eq(clinicalVersions.kind, 'followup')).all();
const shown = () => deletedClinicalQuery({ kind: 'followup' }).get()!;

function seedFollowUp(patch: Partial<FollowUp> = {}) {
  t.db
    .insert(encounters)
    .values({ id: 'original-episode', patientId, kind: 'outpatient', isActive: false, ...stamps(earlier) })
    .run();
  t.db
    .insert(followUps)
    .values({
      id: 'follow-up',
      patientId,
      encounterId: 'original-episode',
      ...stamps(earlier),
      deletedAt: earlier,
      dueAt: future,
      reason: 'Synthetic result follow-up',
      status: 'pending',
      channel: 'lab',
      priority: 'high',
      outcome: 'Synthetic retained outcome',
      completedAt: earlier,
      notificationId: 'synthetic-old-alarm',
      reminderRevision: 4,
      reminderAppliedRevision: 4,
      ...patch,
    })
    .run();
  scheduled.set('synthetic-old-alarm', { at: future, title: 'Synthetic old alarm', channelId: 'follow-ups.v2' });
}
const restore = () => restoreClinicalRecord('followup', 'follow-up', shown().expectedBasis, now);

beforeEach(async () => {
  t = useTestDatabase(await createTestDatabase());
  jest.useFakeTimers({ now });
  resetNotifications();
  patientId = await createPatient({ firstName: 'Synthetic', lastName: 'Recovery' });
});
afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe('companion recovery and retained choices', () => {
  it('keeps every contact field and other primary contact intact without acquiring an episode', async () => {
    const id = await addPatientContact(patientId, {
      name: 'Synthetic companion',
      phone: '+12025550123',
      relation: 'Synthetic relation',
      isPrimary: true,
      notes: 'Exact\nSynthetic private text',
    });
    const old = patientContactsQuery(patientId).get()!;
    await deletePatientContact(id, old);
    const tombstone = t.db.select().from(patientContacts).where(eq(patientContacts.id, id)).get()!;
    const other = await addPatientContact(patientId, { phone: '+12025550124', isPrimary: true });
    t.db
      .insert(encounters)
      .values({ id: 'current', patientId, kind: 'admission', isActive: true, ...stamps(now) })
      .run();
    const otherBefore = t.db.select().from(patientContacts).where(eq(patientContacts.id, other)).get();
    const episodeBefore = t.db.select().from(encounters).all();
    const selected = deletedClinicalQuery({ kind: 'contact' }).get()!;
    await restoreClinicalRecord('contact', id, selected.expectedBasis, now);
    expect(t.db.select().from(patientContacts).where(eq(patientContacts.id, id)).get()).toEqual({
      ...tombstone,
      deletedAt: null,
      updatedAt: now,
    });
    expect(t.db.select().from(patientContacts).where(eq(patientContacts.id, other)).get()).toEqual(otherBefore);
    expect(t.db.select().from(encounters).all()).toEqual(episodeBefore);
    expect(scheduled.size).toBe(0);
    expect(
      t.db
        .select()
        .from(auditLog)
        .all()
        .map((row) => row.action),
    ).toEqual(['contact.deleted', 'contact.restored']);
  });

  it('uses existing history to refuse unused delete and restore choices after identical same-ms cycles', async () => {
    const id = await addPatientContact(patientId, { name: 'Synthetic companion', phone: '+12025550123' });
    const oldLive = patientContactsQuery(patientId).get()!;
    const original = t.db.select().from(patientContacts).get()!;
    await deletePatientContact(id, oldLive);
    const oldDeleted = deletedClinicalQuery({ kind: 'contact' }).get()!;
    const tombstone = t.db.select().from(patientContacts).get()!;
    await restoreClinicalRecord('contact', id, oldDeleted.expectedBasis, now);
    expect(t.db.select().from(patientContacts).get()).toEqual(original);
    let before = databaseRows(t);
    await expect(deletePatientContact(id, oldLive)).rejects.toThrow('تغییر');
    expect(databaseRows(t)).toEqual(before);
    const fresh = patientContactsQuery(patientId).get()!;
    expect(fresh.clinicalSequence).toBeGreaterThan(oldLive.clinicalSequence);
    await deletePatientContact(id, fresh);
    expect(t.db.select().from(patientContacts).get()).toEqual(tombstone);
    before = databaseRows(t);
    await expect(restoreClinicalRecord('contact', id, oldDeleted.expectedBasis, now)).rejects.toThrow('تغییر');
    expect(databaseRows(t)).toEqual(before);
  });
});

describe('follow-up restoration preserves clinical intent', () => {
  it.each([
    { status: 'pending' as const, dueAt: future, alarm: true },
    { status: 'pending' as const, dueAt: earlier, alarm: false },
    { status: 'done' as const, dueAt: future, alarm: false },
    { status: 'missed' as const, dueAt: future, alarm: false },
    { status: 'cancelled' as const, dueAt: future, alarm: false },
  ])(
    'retains $status outcome/date/context and schedules only eligible future work ($alarm)',
    async ({ status, dueAt, alarm }) => {
      seedFollowUp({ status, dueAt });
      const original = stored();
      const schedule = jest.spyOn(notifications, 'scheduleReminder');
      expect(await restore()).toBeUndefined();
      expect(stored()).toEqual({
        ...original,
        deletedAt: null,
        updatedAt: now,
        reminderRevision: 5,
        reminderAppliedRevision: 5,
        notificationId: alarm ? followUpReminderId(original.id) : null,
      });
      expect([...scheduled.keys()]).toEqual(alarm ? [followUpReminderId(original.id)] : []);
      // The platform refuses a past date before asking permission or scheduling;
      // invoking its API is distinct from having an alarm in the OS stand-in.
      expect(schedule).toHaveBeenCalledTimes(status === 'pending' ? 1 : 0);
      if (alarm)
        expect(schedule).toHaveBeenCalledWith(
          expect.objectContaining({
            identifier: followUpReminderId(original.id),
            askPermission: false,
            at: original.dueAt,
            data: { kind: 'follow-up', patientId, followUpId: original.id },
          }),
        );
      expect(histories().map((row) => row.reason)).toEqual(['baseline', 'restored']);
      expect(t.db.select().from(encounters).get()!.isActive).toBe(false);
    },
  );

  it('keeps recovered future work and exposes missing permission without prompting again', async () => {
    seedFollowUp();
    permission.granted = false;
    expect(await restore()).toEqual({ reminderIssue: 'unavailable' });
    expect(stored()).toMatchObject({
      deletedAt: null,
      status: 'pending',
      reminderRevision: 5,
      reminderAppliedRevision: 5,
      notificationId: null,
    });
    expect(scheduled.size).toBe(0);
    expect(histories()).toHaveLength(2);
  });

  it.each(['schedule', 'cancel', 'receipt'] as const)(
    'retains recovery and same-ID retry after native %s failure',
    async (fault) => {
      seedFollowUp();
      const original = stored();
      const failSchedule =
        fault === 'schedule'
          ? jest.spyOn(notifications, 'scheduleReminder').mockRejectedValue(new Error('Synthetic native schedule'))
          : undefined;
      const failCancel =
        fault === 'cancel'
          ? jest.spyOn(notifications, 'cancelReminderRequired').mockRejectedValue(new Error('Synthetic native cancel'))
          : undefined;
      if (fault === 'receipt')
        t.sqlite.exec(
          "CREATE TRIGGER fail_native_receipt BEFORE UPDATE OF notification_id ON follow_ups BEGIN SELECT RAISE(ABORT,'Synthetic native receipt'); END",
        );
      expect(await restore()).toEqual({ reminderIssue: 'dirty' });
      expect(stored()).toMatchObject({
        deletedAt: null,
        status: original.status,
        outcome: original.outcome,
        completedAt: original.completedAt,
        dueAt: original.dueAt,
        reminderRevision: 5,
        reminderAppliedRevision: -1,
      });
      expect(histories()).toHaveLength(2);
      expect(t.db.select().from(auditLog).all()).toMatchObject([{ action: 'followup.restored' }]);
      failSchedule?.mockRestore();
      failCancel?.mockRestore();
      if (fault === 'receipt') t.sqlite.exec('DROP TRIGGER fail_native_receipt');
      expect(await reconcileFollowUpReminder(original.id)).toBe(true);
      expect(stored()).toMatchObject({ reminderAppliedRevision: 5, notificationId: followUpReminderId(original.id) });
      expect([...scheduled.keys()]).toEqual([followUpReminderId(original.id)]);
      expect(histories()).toHaveLength(2);
    },
  );

  it('retains closed work with an explicit dirty-reminder notice when old cancellation fails', async () => {
    seedFollowUp({ status: 'done' });
    jest.spyOn(notifications, 'cancelReminderRequired').mockRejectedValue(new Error('Synthetic cancellation'));
    expect(await restore()).toEqual({ reminderIssue: 'dirty' });
    expect(stored()).toMatchObject({ deletedAt: null, status: 'done', reminderAppliedRevision: -1 });
    expect(scheduled.has('synthetic-old-alarm')).toBe(true);
  });

  it.each(['audit_log', 'clinical_versions'] as const)(
    'rolls every application table back before touching Android when %s fails',
    async (table) => {
      seedFollowUp();
      const basis = shown().expectedBasis;
      t.sqlite.exec(
        `CREATE TRIGGER fail_recovery BEFORE INSERT ON ${table} BEGIN SELECT RAISE(ABORT,'Synthetic recovery'); END`,
      );
      const before = databaseRows(t);
      const schedule = jest.spyOn(notifications, 'scheduleReminder');
      const cancel = jest.spyOn(notifications, 'cancelReminderRequired');
      await expect(restoreClinicalRecord('followup', 'follow-up', basis, now)).rejects.toThrow();
      expect(databaseRows(t)).toEqual(before);
      expect(schedule).not.toHaveBeenCalled();
      expect(cancel).not.toHaveBeenCalled();
      expect([...scheduled.keys()]).toEqual(['synthetic-old-alarm']);
    },
  );

  it.each([-1, 0.5, Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER + 1])(
    'refuses unsupported revision %s intact before Android is touched',
    async (revision) => {
      seedFollowUp({ reminderRevision: revision });
      const before = databaseRows(t);
      const cancel = jest.spyOn(notifications, 'cancelReminderRequired');
      await expect(restore()).rejects.toThrow();
      expect(databaseRows(t)).toEqual(before);
      expect(cancel).not.toHaveBeenCalled();
    },
  );

  it.each(['status', 'channel', 'priority'] as const)(
    'refuses unsupported %s without rewriting data or touching alarms',
    async (field) => {
      seedFollowUp();
      t.sqlite.exec(`UPDATE follow_ups SET ${field}='synthetic-unsupported' WHERE id='follow-up'`);
      const before = databaseRows(t);
      const cancel = jest.spyOn(notifications, 'cancelReminderRequired');
      await expect(restore()).rejects.toThrow('معتبر نیست');
      expect(databaseRows(t)).toEqual(before);
      expect(cancel).not.toHaveBeenCalled();
    },
  );

  it('holds the original dataset admission across a delayed native receipt', async () => {
    seedFollowUp();
    const originalSchedule = notifications.scheduleReminder;
    let release: () => void = () => {
      throw new Error('Not started');
    };
    jest.spyOn(notifications, 'scheduleReminder').mockImplementation(async (...args) => {
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      return originalSchedule(...args);
    });
    const token = datasetGeneration();
    const pending = withDatasetWrite(token, restore);
    for (let i = 0; i < 20; i++) await Promise.resolve();
    expect(stored().deletedAt).toBeNull();
    expect(replacementFailure()).toBeInstanceOf(Error);
    release();
    expect(await pending).toBeUndefined();
    expect(replacementFailure()).toBeNull();
    expect(stored().reminderAppliedRevision).toBe(5);
  });
});
