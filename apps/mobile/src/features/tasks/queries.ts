import { and, asc, desc, eq, isNull, lte, or, type SQL } from 'drizzle-orm';

import { db } from '@/db/client';
import { patients, tasks, type Task, type TaskKind } from '@/db/schema';
import { matchesSearch } from '@/db/search';
import { newId, softDelete, stamps, touch } from '@/lib/ids';
import { buildSearchText } from '@/lib/persian';

/*
 * Things to do, with or without a patient.
 *
 * `follow_ups` are a patient's appointments with the future and cannot exist
 * without one. Half of a shift is not like that: ring radiology, collect a
 * form, ask the lab to repeat a sample. Those lived on paper because the app
 * had nowhere to put them.
 *
 * Deliberately not merged with follow-ups. A follow-up carries a reminder, a
 * channel and an outcome for a named patient; a task carries a title and a
 * state. Merging them would mean every quick "ring radiology" had to answer
 * which patient it was about.
 */

const alive = isNull(tasks.deletedAt);

export function taskSearchText(task: Pick<Task, 'title' | 'notes' | 'source'>): string {
  return buildSearchText(task.title, task.notes, task.source);
}

export type TaskFilter = {
  search?: string;
  patientId?: string | null;
  shiftId?: string | null;
  status?: Task['status'];
  /** Only tasks that are due, or overdue, at this moment. */
  dueBy?: Date;
};

export function tasksQuery(filter: TaskFilter = {}) {
  const clauses: (SQL | undefined)[] = [alive];
  if (filter.patientId !== undefined) {
    clauses.push(filter.patientId === null ? isNull(tasks.patientId) : eq(tasks.patientId, filter.patientId));
  }
  if (filter.shiftId) clauses.push(eq(tasks.shiftId, filter.shiftId));
  if (filter.status) clauses.push(eq(tasks.status, filter.status));
  // A task with no due date is always "now": it is not waiting for anything.
  if (filter.dueBy) clauses.push(or(isNull(tasks.dueAt), lte(tasks.dueAt, filter.dueBy)));
  clauses.push(...matchesSearch(tasks.searchText, filter.search));

  return db
    .select({ task: tasks, patient: patients })
    .from(tasks)
    .leftJoin(patients, eq(tasks.patientId, patients.id))
    .where(and(...clauses))
    .orderBy(asc(tasks.status), desc(tasks.priority), asc(tasks.dueAt), desc(tasks.createdAt));
}

export function taskQuery(id: string) {
  return db
    .select()
    .from(tasks)
    .where(and(alive, eq(tasks.id, id)))
    .limit(1);
}

export type TaskInput = {
  title: string;
  kind?: TaskKind;
  patientId?: string | null;
  encounterId?: string | null;
  shiftId?: string | null;
  doctorId?: string | null;
  placeId?: string | null;
  dueAt?: Date | null;
  priority?: Task['priority'];
  source?: string | null;
  notes?: string | null;
};

export async function createTask(input: TaskInput): Promise<string> {
  const id = newId();
  const row = {
    title: input.title.trim(),
    kind: input.kind ?? ('general' as const),
    patientId: input.patientId ?? null,
    encounterId: input.encounterId ?? null,
    shiftId: input.shiftId ?? null,
    doctorId: input.doctorId ?? null,
    placeId: input.placeId ?? null,
    dueAt: input.dueAt ?? null,
    priority: input.priority ?? ('normal' as const),
    source: input.source ?? null,
    notes: input.notes ?? null,
  };
  await db.insert(tasks).values({ id, ...stamps(), ...row, searchText: taskSearchText(row) });
  return id;
}

export async function updateTask(id: string, patch: Partial<TaskInput>): Promise<void> {
  const current = (await taskQuery(id))[0];
  if (!current) throw new Error(`Task ${id} not found`);
  const merged = { ...current, ...patch, title: (patch.title ?? current.title).trim() };
  await db
    .update(tasks)
    .set({ ...patch, title: merged.title, searchText: taskSearchText(merged), ...touch() })
    .where(and(alive, eq(tasks.id, id)));
}

/**
 * Tick a task off, or put it back.
 *
 * `completedAt` is cleared when it is reopened: a task that was done on
 * Tuesday and is open again has no completion time, and leaving the old one
 * would put a finished date on an unfinished job.
 */
export async function setTaskStatus(id: string, status: Task['status'], outcome?: string | null): Promise<void> {
  const now = new Date();
  await db
    .update(tasks)
    .set({
      status,
      completedAt: status === 'open' ? null : now,
      outcome: outcome === undefined ? undefined : (outcome?.trim() ?? null),
      ...touch(now),
    })
    .where(and(alive, eq(tasks.id, id)));
}

export async function deleteTask(id: string): Promise<void> {
  await db
    .update(tasks)
    .set(softDelete())
    .where(and(alive, eq(tasks.id, id)));
}

export async function reindexTasks(): Promise<number> {
  const rows = await db.select().from(tasks);
  let changed = 0;
  db.transaction((tx) => {
    for (const row of rows) {
      const next = taskSearchText(row);
      if (next === row.searchText) continue;
      tx.update(tasks).set({ searchText: next }).where(eq(tasks.id, row.id)).run();
      changed += 1;
    }
  });
  return changed;
}
