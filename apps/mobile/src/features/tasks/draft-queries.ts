import { and, eq, isNull } from 'drizzle-orm';

import { db, type DbTransaction } from '@/db/client';
import { patients, shifts, taskDrafts } from '@/db/schema';
import { softDelete, stamps, touch } from '@/lib/ids';

import { createTaskInTransaction } from './queries';

const scopeKey = (patientId: string | null) => (patientId ? `patient:${patientId}` : 'global');
const openScope = (patientId: string | null) =>
  and(isNull(taskDrafts.deletedAt), eq(taskDrafts.scopeKey, scopeKey(patientId)));

export class TaskDraftConflict extends Error {
  constructor(message = 'پیش‌نویس در صفحهٔ دیگری تغییر کرده است؛ نوشتهٔ شما جایگزین نشد.') {
    super(message);
    this.name = 'TaskDraftConflict';
  }
}

export function taskDraftQuery(patientId: string | null) {
  return db.select().from(taskDrafts).where(openScope(patientId)).limit(1);
}

function requirePatient(tx: DbTransaction, patientId: string | null): void {
  if (
    patientId &&
    !tx
      .select({ id: patients.id })
      .from(patients)
      .where(and(eq(patients.id, patientId), isNull(patients.deletedAt)))
      .get()
  ) {
    throw new TaskDraftConflict('پروندهٔ بیمار پیدا نشد.');
  }
}

export async function saveTaskDraft(
  id: string,
  target: { patientId: string | null; shiftId: string | null },
  title: string,
  expectedRevision: number,
): Promise<number> {
  return db.transaction((tx) => {
    requirePatient(tx, target.patientId);
    const current = tx.select().from(taskDrafts).where(eq(taskDrafts.id, id)).get();
    if (!current) {
      if (
        expectedRevision !== 0 ||
        tx.select({ id: taskDrafts.id }).from(taskDrafts).where(openScope(target.patientId)).get()
      )
        throw new TaskDraftConflict();
      // Merely opening an empty quick-add does not create a draft.
      if (!title) return 0;
      tx.insert(taskDrafts)
        .values({ id, ...stamps(), ...target, scopeKey: scopeKey(target.patientId), title, revision: 1 })
        .run();
      return 1;
    }
    if (
      current.deletedAt ||
      current.taskId ||
      current.patientId !== target.patientId ||
      current.revision !== expectedRevision
    )
      throw new TaskDraftConflict();
    if (current.title === title) return current.revision;
    const revision = current.revision + 1;
    tx.update(taskDrafts)
      .set({ title, revision, ...touch() })
      .where(eq(taskDrafts.id, id))
      .run();
    return revision;
  });
}

/** Create the task and retire its draft together. A retry never creates a second task. */
export async function commitTaskDraft(id: string, expectedRevision: number): Promise<string> {
  return db.transaction((tx) => {
    const current = tx.select().from(taskDrafts).where(eq(taskDrafts.id, id)).get();
    if (!current) throw new Error('پیش‌نویس پیدا نشد.');
    if (current.taskId && current.revision === expectedRevision + 1) return current.taskId;
    requirePatient(tx, current.patientId);
    if (current.deletedAt || current.revision !== expectedRevision) throw new TaskDraftConflict();
    if (!current.title.trim()) throw new Error('عنوان کار را بنویسید.');
    if (current.shiftId && !tx.select({ id: shifts.id }).from(shifts).where(eq(shifts.id, current.shiftId)).get())
      throw new Error('شیفت پیدا نشد.');
    const taskId = createTaskInTransaction(tx, {
      title: current.title,
      patientId: current.patientId,
      shiftId: current.shiftId,
      source: 'typed',
    });
    tx.update(taskDrafts)
      .set({ taskId, revision: current.revision + 1, ...softDelete() })
      .where(eq(taskDrafts.id, id))
      .run();
    return taskId;
  });
}
