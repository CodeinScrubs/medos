import { and, asc, count, desc, eq, isNotNull, isNull, lte, or, sql, type SQL } from 'drizzle-orm';

import { audit } from '@/db/audit';
import { db, type DbTransaction } from '@/db/client';
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
  deleted?: boolean;
  /** Only tasks that are due, or overdue, at this moment. */
  dueBy?: Date;
};

function taskConditions(filter: TaskFilter) {
  const clauses: (SQL | undefined)[] = [filter.deleted ? isNotNull(tasks.deletedAt) : alive];
  if (filter.patientId !== undefined) {
    clauses.push(filter.patientId === null ? isNull(tasks.patientId) : eq(tasks.patientId, filter.patientId));
  }
  if (filter.shiftId !== undefined) {
    clauses.push(filter.shiftId === null ? isNull(tasks.shiftId) : eq(tasks.shiftId, filter.shiftId));
  }
  if (filter.status) clauses.push(eq(tasks.status, filter.status));
  // A task with no due date is always "now": it is not waiting for anything.
  if (filter.dueBy) clauses.push(or(isNull(tasks.dueAt), lte(tasks.dueAt, filter.dueBy)));
  clauses.push(...matchesSearch(tasks.searchText, filter.search));
  return and(...clauses);
}

export function tasksQuery(filter: TaskFilter = {}, limit?: number) {
  return db
    .select({ task: tasks, patient: patients })
    .from(tasks)
    .leftJoin(patients, and(eq(tasks.patientId, patients.id), isNull(patients.deletedAt)))
    .where(taskConditions(filter))
    .orderBy(
      ...(filter.deleted
        ? [desc(tasks.deletedAt)]
        : filter.status && filter.status !== 'open'
          ? [desc(tasks.completedAt)]
          : [
              asc(sql`CASE ${tasks.status} WHEN 'open' THEN 0 WHEN 'done' THEN 1 ELSE 2 END`),
              asc(sql`CASE ${tasks.priority} WHEN 'high' THEN 0 WHEN 'normal' THEN 1 ELSE 2 END`),
              asc(sql`CASE WHEN ${tasks.dueAt} IS NULL THEN 1 ELSE 0 END`),
              asc(tasks.dueAt),
            ]),
      desc(tasks.createdAt),
      desc(tasks.id),
    )
    .limit(limit ?? -1);
}

export function taskCountQuery(filter: TaskFilter = {}) {
  return db.select({ total: count() }).from(tasks).where(taskConditions(filter));
}

export function taskQuery(id: string, includeDeleted = false) {
  return db
    .select()
    .from(tasks)
    .where(and(includeDeleted ? undefined : alive, eq(tasks.id, id)))
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
  return db.transaction((tx) => createTaskInTransaction(tx, input));
}

/** Compose with capture filing without committing a half-finished operation. */
export function createTaskInTransaction(tx: DbTransaction, input: TaskInput): string {
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
  if (!row.title) throw new Error('A task needs a title');
  if (row.dueAt && !Number.isFinite(row.dueAt.getTime())) throw new Error('Invalid task date');
  tx.insert(tasks)
    .values({ id, ...stamps(), ...row, searchText: taskSearchText(row) })
    .run();
  return id;
}

export async function updateTask(id: string, patch: Partial<TaskInput> & { outcome?: string | null }): Promise<void> {
  db.transaction((tx) => {
    const current = tx
      .select()
      .from(tasks)
      .where(and(alive, eq(tasks.id, id)))
      .get();
    if (!current) throw new Error('Task not found');
    const defined = Object.fromEntries(Object.entries(patch).filter(([, value]) => value !== undefined));
    const merged = { ...current, ...defined, title: (patch.title ?? current.title).trim() };
    if (!merged.title) throw new Error('A task needs a title');
    if (patch.dueAt && !Number.isFinite(patch.dueAt.getTime())) throw new Error('Invalid task date');
    tx.update(tasks)
      .set({ ...defined, title: merged.title, searchText: taskSearchText(merged), ...touch() })
      .where(and(alive, eq(tasks.id, id)))
      .run();
  });
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
  const changed = await db
    .update(tasks)
    .set({
      status,
      completedAt: status === 'open' ? null : now,
      outcome: outcome === undefined ? undefined : (outcome?.trim() ?? null),
      ...touch(now),
    })
    .where(and(alive, eq(tasks.id, id)))
    .returning({ id: tasks.id });
  if (!changed.length) throw new Error('Task not found');
  await audit('task.statusChanged', { entityType: 'task', entityId: id, detail: { status } });
}

export async function deleteTask(id: string): Promise<void> {
  const changed = await db
    .update(tasks)
    .set(softDelete())
    .where(and(alive, eq(tasks.id, id)))
    .returning({ id: tasks.id });
  if (!changed.length) throw new Error('Task not found');
  await audit('task.deleted', { entityType: 'task', entityId: id });
}

export async function restoreTask(id: string): Promise<void> {
  const changed = await db
    .update(tasks)
    .set({ deletedAt: null, ...touch() })
    .where(and(isNotNull(tasks.deletedAt), eq(tasks.id, id)))
    .returning({ id: tasks.id });
  if (!changed.length) throw new Error('Deleted task not found');
  await audit('task.restored', { entityType: 'task', entityId: id });
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
