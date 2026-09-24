import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { eq } from 'drizzle-orm';

import { tasks, type TaskScheduleDraft } from '@/db/schema';
import { createPatient, deletePatient, restorePatient } from '@/features/patients/queries';
import * as notifications from '@/platform/notifications';
import { useTestDatabase } from '@/test/db-client';
import { permission, resetNotifications, scheduled } from '@/test/mocks/notifications';
import { createTestDatabase, type TestDatabase } from '@/test/sqljs';

import { createTask, deleteTask, restoreTask, setTaskStatus, updateTask } from './queries';
import { reconcileTaskReminder, repairTaskReminders, taskReminderId } from './reminder-queries';
import { initialTaskSchedule, parseTaskReminder, parseTaskSchedule, scheduleDateText } from './schedule-logic';
import { commitTaskSchedule, discardTaskScheduleDraft, saveTaskScheduleDraft } from './schedule-queries';

jest.mock('@/db/client', () => jest.requireActual('@/test/db-client'));
jest.mock('@/platform/notifications', () => jest.requireActual('@/test/mocks/notifications'));
let t: TestDatabase;
const future = new Date(2030, 6, 12, 18, 0);
const row = (id: string) => t.db.select().from(tasks).where(eq(tasks.id, id)).get()!;
const draft = (id: string, patch: Partial<TaskScheduleDraft> = {}) => ({
  ...initialTaskSchedule(row(id), future),
  hasDue: true,
  dateText: scheduleDateText(future),
  clockText: '۱۸:۰۰',
  reminderEnabled: true,
  ...patch,
});
beforeEach(async () => {
  t = useTestDatabase(await createTestDatabase());
  resetNotifications();
});
afterEach(() => {
  jest.restoreAllMocks();
});

describe('task schedules and raw drafts', () => {
  it('persists incomplete raw dates without changing a live deadline or alarm', async () => {
    const id = await createTask({ title: 'Review', dueAt: future, reminderEnabled: true });
    const raw = draft(id, { dateText: '۱۴۰', clockText: '۱:' });
    const revision = await saveTaskScheduleDraft(id, raw, 0);
    expect(row(id).scheduleDraft).toEqual(raw);
    expect(initialTaskSchedule(row(id), new Date())).toEqual(raw);
    await expect(commitTaskSchedule(id, revision)).rejects.toThrow();
    expect(row(id).dueAt).toEqual(future);
    expect(scheduled.get(taskReminderId(id))?.at).toEqual(future);
  });

  it('applies a valid Persian date/clock and clears the draft in the same transaction', async () => {
    const id = await createTask({ title: 'Global task' });
    const revision = await saveTaskScheduleDraft(id, draft(id), 0);
    expect(row(id).dueAt).toBeNull();
    expect(scheduled.size).toBe(0);
    await commitTaskSchedule(id, revision);
    expect(row(id)).toMatchObject({
      dueAt: future,
      reminderEnabled: true,
      scheduleDraft: null,
      scheduleDraftRevision: 2,
    });
    expect(parseTaskReminder(scheduled.get(taskReminderId(id))?.data)).toEqual({ kind: 'task', taskId: id });
  });

  it('rolls back a failed apply with its raw draft and old native alarm intact', async () => {
    const id = await createTask({ title: 'Review', dueAt: future, reminderEnabled: true });
    const raw = draft(id, { clockText: '19:00' });
    const revision = await saveTaskScheduleDraft(id, raw, 0);
    t.sqlite.exec(
      "CREATE TRIGGER fail_apply BEFORE UPDATE OF due_at ON tasks BEGIN SELECT RAISE(ABORT, 'synthetic failure'); END;",
    );
    await expect(commitTaskSchedule(id, revision)).rejects.toThrow();
    expect(row(id)).toMatchObject({ dueAt: future, scheduleDraft: raw, scheduleDraftRevision: revision });
    expect(scheduled.get(taskReminderId(id))?.at).toEqual(future);
  });

  it('rejects concurrent draft writes, stale applies and stale discards', async () => {
    const id = await createTask({ title: 'Review' });
    const first = draft(id);
    const revision = await saveTaskScheduleDraft(id, first, 0);
    await expect(saveTaskScheduleDraft(id, { ...first, clockText: '19:00' }, 0)).rejects.toThrow();
    await expect(discardTaskScheduleDraft(id, 0)).rejects.toThrow();
    await updateTask(id, { dueAt: future });
    await expect(commitTaskSchedule(id, revision)).rejects.toThrow();
    expect(row(id).scheduleDraft).toEqual(first);
  });

  it('allows title autosave while a schedule draft is open and cancellation keeps the applied schedule', async () => {
    const id = await createTask({ title: 'Before', dueAt: future });
    let revision = await saveTaskScheduleDraft(id, draft(id), 0);
    await updateTask(id, { title: 'After', notes: 'Kept' });
    await commitTaskSchedule(id, revision);
    expect(scheduled.get(taskReminderId(id))?.title).toBe('After');
    revision = await saveTaskScheduleDraft(id, draft(id, { dateText: 'unfinished' }), row(id).scheduleDraftRevision);
    await discardTaskScheduleDraft(id, revision);
    expect(row(id)).toMatchObject({ dueAt: future, title: 'After', notes: 'Kept', scheduleDraft: null });
  });

  it('removes the deadline and reminder explicitly, even if hidden draft text is invalid', async () => {
    const id = await createTask({ title: 'Review', dueAt: future, reminderEnabled: true });
    const revision = await saveTaskScheduleDraft(id, draft(id, { hasDue: false, dateText: 'invalid' }), 0);
    await commitTaskSchedule(id, revision);
    expect(row(id)).toMatchObject({ dueAt: null, reminderEnabled: false });
    expect(scheduled.size).toBe(0);
  });

  it('allows an overdue deadline but refuses a new alarm in the past', async () => {
    const id = await createTask({ title: 'Review' });
    let revision = await saveTaskScheduleDraft(id, draft(id, { dateText: '1400/01/01' }), 0);
    await expect(commitTaskSchedule(id, revision)).rejects.toThrow();
    revision = await saveTaskScheduleDraft(id, { ...row(id).scheduleDraft!, reminderEnabled: false }, revision);
    await commitTaskSchedule(id, revision);
    expect(row(id).dueAt!.getTime()).toBeLessThan(Date.now());
    expect(scheduled.size).toBe(0);
  });

  it('validates payloads and clocks without guessing missing values', () => {
    expect(parseTaskReminder({ kind: 'task', taskId: '' })).toBeNull();
    expect(parseTaskReminder({ kind: 'follow-up', taskId: 'id' })).toBeNull();
    expect(() =>
      parseTaskSchedule({
        hasDue: true,
        dateText: '1405/07/01',
        clockText: '25:00',
        reminderEnabled: false,
        baseSchedule: '',
      }),
    ).toThrow();
  });
});

describe('task native reminder lifecycle', () => {
  it('is optional for both global and patient tasks', async () => {
    const patientId = await createPatient({ firstName: 'Test', lastName: 'Patient' });
    await createTask({ title: 'No alarm', dueAt: future });
    const globalId = await createTask({ title: 'Global', dueAt: future, reminderEnabled: true });
    const patientTask = await createTask({ title: 'Patient work', patientId, dueAt: future, reminderEnabled: true });
    expect(scheduled.size).toBe(2);
    expect(scheduled.get(taskReminderId(globalId))?.body).toBeUndefined();
    expect(scheduled.get(taskReminderId(patientTask))?.body).toBe('Test Patient');
    await deletePatient(patientId);
    expect([...scheduled.keys()]).toEqual([taskReminderId(globalId)]);
    await restorePatient(patientId);
    expect(scheduled.size).toBe(2);
  });

  it('cancels on completion/deletion and re-arms on reopening/restore', async () => {
    const id = await createTask({ title: 'Review', dueAt: future, reminderEnabled: true });
    await setTaskStatus(id, 'done');
    expect(scheduled.size).toBe(0);
    await setTaskStatus(id, 'open');
    expect(scheduled.size).toBe(1);
    await deleteTask(id);
    expect(scheduled.size).toBe(0);
    await restoreTask(id);
    expect(scheduled.size).toBe(1);
    await updateTask(id, { dueAt: null });
    expect(scheduled.size).toBe(0);
    expect(row(id).reminderEnabled).toBe(false);
  });

  it('keeps saved tasks when permission or scheduling fails, then repairs one identifier', async () => {
    permission.granted = false;
    const id = await createTask({ title: 'Review', dueAt: future, reminderEnabled: true });
    expect(row(id).notificationId).toBeNull();
    permission.granted = true;
    jest.spyOn(notifications, 'scheduleReminder').mockRejectedValueOnce(new Error('native unavailable'));
    await updateTask(id, { title: 'Updated' });
    expect(row(id).title).toBe('Updated');
    expect(row(id).reminderAppliedRevision).toBe(-1);
    expect(await repairTaskReminders()).toBe(1);
    await repairTaskReminders();
    expect([...scheduled.keys()]).toEqual([taskReminderId(id)]);
  });

  it('retries failed native acknowledgement and failed cancellation without reverting clinical state', async () => {
    t.sqlite.exec(
      "CREATE TRIGGER fail_ack BEFORE UPDATE OF reminder_applied_revision ON tasks WHEN NEW.reminder_applied_revision >= 0 BEGIN SELECT RAISE(ABORT, 'synthetic failure'); END;",
    );
    const id = await createTask({ title: 'Review', dueAt: future, reminderEnabled: true });
    expect(scheduled.size).toBe(1);
    expect(row(id).reminderAppliedRevision).toBe(-1);
    t.sqlite.exec('DROP TRIGGER fail_ack');
    await repairTaskReminders();
    expect(scheduled.size).toBe(1);
    jest.spyOn(notifications, 'cancelReminderRequired').mockRejectedValueOnce(new Error('native unavailable'));
    await setTaskStatus(id, 'done');
    expect(row(id).status).toBe('done');
    expect(scheduled.size).toBe(1);
    await repairTaskReminders();
    expect(scheduled.size).toBe(0);
  });

  it('does not let a delayed schedule re-arm a task completed in the meantime', async () => {
    const id = await createTask({ title: 'Review', dueAt: future, reminderEnabled: true });
    const actual = notifications.scheduleReminder;
    let release!: () => void;
    let entered!: () => void;
    const waiting = new Promise<void>((resolve) => {
      release = resolve;
    });
    const started = new Promise<void>((resolve) => {
      entered = resolve;
    });
    jest.spyOn(notifications, 'scheduleReminder').mockImplementationOnce(async (request) => {
      entered();
      await waiting;
      return actual(request);
    });
    const first = reconcileTaskReminder(id);
    await started;
    const second = setTaskStatus(id, 'done');
    release();
    await Promise.all([first, second]);
    expect(scheduled.size).toBe(0);
    expect(row(id).reminderAppliedRevision).toBe(row(id).reminderRevision);
  });
});
