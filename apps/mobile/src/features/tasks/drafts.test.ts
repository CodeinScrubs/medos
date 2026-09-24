import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import { taskDrafts, tasks } from '@/db/schema';
import { createPatient, deletePatient } from '@/features/patients/queries';
import { useTestDatabase } from '@/test/db-client';
import { createTestDatabase, type TestDatabase } from '@/test/sqljs';

import { commitTaskDraft, saveTaskDraft, TaskDraftConflict, taskDraftQuery } from './draft-queries';
import { taskCountQuery } from './queries';

jest.mock('@/db/client', () => jest.requireActual('@/test/db-client'));
jest.mock('@/platform/notifications', () => jest.requireActual('@/test/mocks/notifications'));
let t: TestDatabase;
let patientId: string;
beforeEach(async () => {
  t = useTestDatabase(await createTestDatabase());
  patientId = await createPatient({ firstName: 'Test', lastName: 'Patient', status: 'outpatient' });
});

describe('quick-add task drafts', () => {
  it('persists exact text without creating open work and keeps each patient/global scope separate', async () => {
    const target = { patientId, shiftId: null };
    expect(await saveTaskDraft('empty', target, '', 0)).toBe(0);
    expect(await taskDraftQuery(patientId)).toHaveLength(0);
    await saveTaskDraft('patient', target, '  Retain this\nexact text  ', 0);
    await saveTaskDraft('global', { patientId: null, shiftId: null }, 'Global', 0);
    expect((await taskDraftQuery(patientId))[0]?.title).toBe('  Retain this\nexact text  ');
    expect((await taskDraftQuery(null))[0]?.title).toBe('Global');
    expect((await taskCountQuery())[0]?.total).toBe(0);
  });

  it('commits one task, retains the source draft and permits another quick-add in that scope', async () => {
    const target = { patientId, shiftId: null };
    const revision = await saveTaskDraft('first', target, '  Task title  ', 0);
    const [a, b] = await Promise.all([commitTaskDraft('first', revision), commitTaskDraft('first', revision)]);
    expect(a).toBe(b);
    expect(t.db.select().from(tasks).all()).toHaveLength(1);
    expect(t.db.select().from(tasks).get()?.title).toBe('Task title');
    const [retired] = t.db.select().from(taskDrafts).all();
    expect(retired).toMatchObject({ title: '  Task title  ', taskId: a });
    expect(retired?.deletedAt).not.toBeNull();
    expect(await taskDraftQuery(patientId)).toHaveLength(0);
    await expect(saveTaskDraft('first', target, 'Late text', revision)).rejects.toThrow();
    await saveTaskDraft('next', target, 'Next', 0);
    expect((await taskDraftQuery(patientId))[0]?.title).toBe('Next');
  });

  it('rolls back both task creation and draft retirement when either fails, then retries', async () => {
    const target = { patientId, shiftId: null };
    const revision = await saveTaskDraft('draft', target, 'Task title', 0);
    t.sqlite.exec(
      "CREATE TRIGGER fail_retire BEFORE UPDATE ON task_drafts WHEN NEW.task_id IS NOT NULL BEGIN SELECT RAISE(ABORT, 'synthetic failure'); END;",
    );
    await expect(commitTaskDraft('draft', revision)).rejects.toThrow();
    expect(t.db.select().from(tasks).all()).toHaveLength(0);
    expect((await taskDraftQuery(patientId))[0]).toMatchObject({ title: 'Task title', revision, taskId: null });
    t.sqlite.exec('DROP TRIGGER fail_retire');
    await commitTaskDraft('draft', revision);
    expect(t.db.select().from(tasks).all()).toHaveLength(1);
  });

  it('refuses concurrent creation and stale edits even when the caller guessed a new id', async () => {
    const target = { patientId, shiftId: null };
    const results = await Promise.allSettled([
      saveTaskDraft('a', target, 'First editor', 0),
      saveTaskDraft('b', target, 'Other editor', 0),
    ]);
    expect(results.map((result) => result.status)).toEqual(['fulfilled', 'rejected']);
    await expect(saveTaskDraft('a', target, 'Stale', 0)).rejects.toBeInstanceOf(TaskDraftConflict);
    await expect(commitTaskDraft('a', 0)).rejects.toBeInstanceOf(TaskDraftConflict);
    expect((await taskDraftQuery(patientId))[0]?.title).toBe('First editor');
    await expect(saveTaskDraft('a', { patientId: null, shiftId: null }, 'Wrong patient', 1)).rejects.toThrow();
    await saveTaskDraft('a', target, 'Owner resolved', 1);
    expect((await taskDraftQuery(patientId))[0]?.title).toBe('Owner resolved');
  });

  it('keeps blank drafts recoverable but never publishes one, and refuses deleted patients', async () => {
    const target = { patientId, shiftId: null };
    let revision = await saveTaskDraft('a', target, 'Title', 0);
    revision = await saveTaskDraft('a', target, '', revision);
    await expect(commitTaskDraft('a', revision)).rejects.toThrow();
    expect((await taskDraftQuery(patientId))[0]?.title).toBe('');
    revision = await saveTaskDraft('a', target, 'Title again', revision);
    await deletePatient(patientId);
    await expect(commitTaskDraft('a', revision)).rejects.toThrow();
    await expect(saveTaskDraft('a', target, 'Late', revision)).rejects.toThrow();
    expect((await taskDraftQuery(patientId))[0]?.title).toBe('Title again');
  });
});
