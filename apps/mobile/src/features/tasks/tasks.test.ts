import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import { auditLog, tasks } from '@/db/schema';
import { useTestDatabase } from '@/test/db-client';
import { createTestDatabase, type TestDatabase } from '@/test/sqljs';

import {
  createTask,
  deleteTask,
  restoreTask,
  setTaskStatus,
  taskCountQuery,
  taskQuery,
  tasksQuery,
  updateTask,
} from './queries';
import { createPatient, deletePatient } from '../patients/queries';

jest.mock('@/db/client', () => jest.requireActual('@/test/db-client'));
jest.mock('@/platform/notifications', () => jest.requireActual('@/test/mocks/notifications'));

let t: TestDatabase;
beforeEach(async () => {
  t = useTestDatabase(await createTestDatabase());
});

describe('retrieving and correcting tasks', () => {
  it('ranks high before normal before low, with known deadlines first within each rank', async () => {
    await createTask({ title: 'low', priority: 'low' });
    await createTask({ title: 'normal', priority: 'normal' });
    await createTask({ title: 'high undated', priority: 'high' });
    await createTask({ title: 'high later', priority: 'high', dueAt: new Date('2026-09-25') });
    await createTask({ title: 'high earlier', priority: 'high', dueAt: new Date('2026-09-24') });
    expect((await tasksQuery({ status: 'open' })).map(({ task }) => task.title)).toEqual([
      'high earlier',
      'high later',
      'high undated',
      'normal',
      'low',
    ]);
  });

  it('retrieves beyond previews and keeps counts/search consistent with status and deletion', async () => {
    for (let i = 0; i < 54; i += 1) await createTask({ title: `پیگیری ${i}` });
    const completed = await createTask({ title: 'پیگیری انجام‌شده' });
    await setTaskStatus(completed, 'done');
    const removed = await createTask({ title: 'پیگیری حذف‌شده' });
    await deleteTask(removed);
    await createTask({ title: 'Unrelated' });
    const filter = { status: 'open' as const, search: 'پيگيري', patientId: null };
    const preview = await tasksQuery(filter, 20);
    const all = await tasksQuery(filter, 100);
    expect(preview).toHaveLength(20);
    expect(all).toHaveLength(54);
    expect(all.slice(0, 20)).toEqual(preview);
    expect((await taskCountQuery(filter))[0]?.total).toBe(54);
    expect((await tasksQuery({ status: 'done' })).map(({ task }) => task.id)).toEqual([completed]);
    expect((await taskCountQuery({ deleted: true }))[0]?.total).toBe(1);
  });

  it('keeps deleted-patient tasks distinct from global tasks without exposing their deleted identity', async () => {
    const patientId = await createPatient({ firstName: 'Test', lastName: 'Patient' });
    const id = await createTask({ title: 'Follow result', patientId });
    await deletePatient(patientId);
    const [row] = await tasksQuery();
    expect(row?.task.id).toBe(id);
    expect(row?.task.patientId).toBe(patientId);
    expect(row?.patient).toBeNull();
    expect(await tasksQuery({ patientId: null })).toHaveLength(0);
  });

  it('rejects blank titles and preserves merged search text across concurrent partial edits', async () => {
    const id = await createTask({ title: 'Call lab', notes: 'culture', source: 'round' });
    await expect(updateTask(id, { title: '   ' })).rejects.toThrow();
    await Promise.all([
      updateTask(id, { title: 'Call radiology' }),
      updateTask(id, { notes: 'CT result', source: undefined }),
    ]);
    const [row] = await taskQuery(id);
    expect(row?.title).toBe('Call radiology');
    expect(row?.notes).toBe('CT result');
    expect(row?.source).toBe('round');
    expect(await tasksQuery({ search: 'radiology CT round' })).toHaveLength(1);
    await expect(updateTask(id, { dueAt: new Date('invalid') })).rejects.toThrow();
    await expect(createTask({ title: 'Invalid', dueAt: new Date('invalid') })).rejects.toThrow();
  });

  it('keeps completion evidence through soft delete/restore and audits actions without the text', async () => {
    const id = await createTask({ title: 'private title', notes: 'private notes' });
    await setTaskStatus(id, 'done', 'private outcome');
    const before = (await taskQuery(id))[0]!;
    await deleteTask(id);
    expect(await taskQuery(id)).toHaveLength(0);
    expect((await tasksQuery({ deleted: true }))[0]?.task.outcome).toBe('private outcome');
    await expect(updateTask(id, { title: 'lost update' })).rejects.toThrow();
    await expect(setTaskStatus(id, 'open')).rejects.toThrow();
    await restoreTask(id);
    const after = (await taskQuery(id))[0]!;
    expect(after.status).toBe('done');
    expect(after.completedAt).toEqual(before.completedAt);
    expect(after.notes).toBe(before.notes);
    expect(after.outcome).toBe(before.outcome);
    expect(t.db.select().from(tasks).all()).toHaveLength(1);
    const events = t.db.select().from(auditLog).all();
    expect(events.map((row) => row.action)).toEqual(['task.statusChanged', 'task.deleted', 'task.restored']);
    expect(JSON.stringify(events)).not.toContain('private');
    await setTaskStatus(id, 'open');
    expect((await taskQuery(id))[0]?.completedAt).toBeNull();
    expect((await taskQuery(id))[0]?.outcome).toBe('private outcome');
  });

  it('reports failed writes and never returns a false successful status or deletion', async () => {
    const id = await createTask({ title: 'Call lab' });
    t.sqlite.exec(
      "CREATE TRIGGER fail_task BEFORE UPDATE ON tasks BEGIN SELECT RAISE(ABORT, 'synthetic failure'); END;",
    );
    await expect(setTaskStatus(id, 'done')).rejects.toThrow();
    await expect(deleteTask(id)).rejects.toThrow();
    expect((await taskQuery(id))[0]?.status).toBe('open');
    expect(t.db.select().from(auditLog).all()).toHaveLength(0);
    await expect(setTaskStatus('missing', 'done')).rejects.toThrow();
  });
});
