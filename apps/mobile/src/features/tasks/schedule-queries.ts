import { eq, isNull, and } from 'drizzle-orm';

import { db, type DbTransaction } from '@/db/client';
import { tasks, patients, type TaskScheduleDraft } from '@/db/schema';
import { touch } from '@/lib/ids';

import { reconcileTaskReminder } from './reminder-queries';
import { parseTaskSchedule, taskScheduleSignature } from './schedule-logic';

export class TaskScheduleConflict extends Error {
  constructor() {
    super('موعد یا پیش‌نویس در صفحهٔ دیگری تغییر کرده است.');
    this.name = 'TaskScheduleConflict';
  }
}

function requireTask(tx: DbTransaction, id: string, expectedRevision: number) {
  const current = tx
    .select()
    .from(tasks)
    .where(and(eq(tasks.id, id), isNull(tasks.deletedAt)))
    .get();
  if (!current) throw new Error('کار در دسترس نیست.');
  if (current.scheduleDraftRevision !== expectedRevision) throw new TaskScheduleConflict();
  return current;
}

export async function saveTaskScheduleDraft(
  id: string,
  fields: TaskScheduleDraft,
  expectedRevision: number,
): Promise<number> {
  return db.transaction((tx) => {
    const current = requireTask(tx, id, expectedRevision);
    if (fields.baseSchedule !== taskScheduleSignature(current)) throw new TaskScheduleConflict();
    const revision = current.scheduleDraftRevision + 1;
    tx.update(tasks)
      .set({ scheduleDraft: fields, scheduleDraftRevision: revision, ...touch() })
      .where(eq(tasks.id, id))
      .run();
    return revision;
  });
}

export async function commitTaskSchedule(id: string, expectedRevision: number, now = new Date()): Promise<void> {
  db.transaction((tx) => {
    const current = requireTask(tx, id, expectedRevision);
    if (!current.scheduleDraft) throw new TaskScheduleConflict();
    if (current.scheduleDraft.baseSchedule !== taskScheduleSignature(current)) throw new TaskScheduleConflict();
    if (
      current.patientId &&
      !tx
        .select({ id: patients.id })
        .from(patients)
        .where(and(eq(patients.id, current.patientId), isNull(patients.deletedAt)))
        .get()
    )
      throw new Error('بیمار در دسترس نیست.');
    const schedule = parseTaskSchedule(current.scheduleDraft);
    if (schedule.reminderEnabled && schedule.dueAt && schedule.dueAt <= now)
      throw new Error('برای اعلان، موعد آینده را انتخاب کنید.');
    tx.update(tasks)
      .set({
        ...schedule,
        reminderRevision: current.reminderRevision + 1,
        scheduleDraft: null,
        scheduleDraftRevision: current.scheduleDraftRevision + 1,
        ...touch(),
      })
      .where(eq(tasks.id, id))
      .run();
  });
  await reconcileTaskReminder(id, true);
}

export async function discardTaskScheduleDraft(id: string, expectedRevision: number): Promise<void> {
  db.transaction((tx) => {
    const current = requireTask(tx, id, expectedRevision);
    tx.update(tasks)
      .set({ scheduleDraft: null, scheduleDraftRevision: current.scheduleDraftRevision + 1, ...touch() })
      .where(eq(tasks.id, id))
      .run();
  });
}
