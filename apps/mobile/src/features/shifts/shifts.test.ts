import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import { encounters, shiftPatients, shifts } from '@/db/schema';
import { createNote, deleteNote, latestPatientNoteQuery, patientNotesQuery } from '@/features/notes/queries';
import { useTestDatabase } from '@/test/db-client';
import { createTestDatabase, type TestDatabase } from '@/test/sqljs';

import {
  addPatientToShift,
  activeShiftQuery,
  deleteShift,
  endShift,
  removePatientFromShift,
  setShiftPatientReviewed,
  shiftPatientsQuery,
  shiftProgress,
  startShift,
} from './queries';
import { deleteEncounter, openEncounter } from '../encounters/queries';
import { createPatient, deletedPatientsQuery, deletePatient } from '../patients/queries';
import { createTask, setTaskStatus, tasksQuery } from '../tasks/queries';

jest.mock('@/db/client', () => jest.requireActual('@/test/db-client'));
jest.mock('@/platform/notifications', () => jest.requireActual('@/test/mocks/notifications'));

let t: TestDatabase;
let patientId: string;

beforeEach(async () => {
  t = useTestDatabase(await createTestDatabase());
  patientId = await createPatient({ firstName: 'سارا', lastName: 'احمدی', status: 'outpatient' });
});

describe('a shift', () => {
  it('is the only open one; starting another closes it', async () => {
    const first = await startShift({ ward: 'داخلی ۲' });
    const second = await startShift({ ward: 'اورژانس' });

    const open = await activeShiftQuery();
    expect(open).toHaveLength(1);
    expect(open[0]?.id).toBe(second);

    const closed = (await t.db.select().from(shifts)).find((s) => s.id === first);
    expect(closed?.isActive).toBe(false);
    expect(closed?.endAt).toBeInstanceOf(Date);
  });

  it('ends without disappearing', async () => {
    const id = await startShift();
    await endShift(id);

    expect(await activeShiftQuery()).toHaveLength(0);
    expect((await t.db.select().from(shifts)).find((s) => s.id === id)?.deletedAt).toBeNull();
  });

  it('carries patients in round order, and picks up their open episode', async () => {
    const encounterId = await openEncounter({ patientId, kind: 'admission', ward: 'CCU' });
    const other = await createPatient({ firstName: 'رضا', lastName: 'کریمی', status: 'outpatient' });
    const shiftId = await startShift();

    await addPatientToShift(shiftId, patientId);
    await addPatientToShift(shiftId, other);

    const rows = await shiftPatientsQuery(shiftId);
    expect(rows.map((r) => r.patient.firstName)).toEqual(['سارا', 'رضا']);
    expect(rows[0]?.member.encounterId).toBe(encounterId);
    expect(rows[0]?.encounter?.ward).toBe('CCU');
    expect(rows[1]?.member.encounterId).toBeNull();
  });

  it('does not list the same patient twice', async () => {
    const shiftId = await startShift();
    const first = await addPatientToShift(shiftId, patientId);
    const again = await addPatientToShift(shiftId, patientId);

    expect(again).toBe(first);
    expect(await shiftPatientsQuery(shiftId)).toHaveLength(1);
  });

  it('serializes simultaneous additions without duplicate membership', async () => {
    const shiftId = await startShift();
    const ids = await Promise.all(Array.from({ length: 5 }, () => addPatientToShift(shiftId, patientId)));
    expect(new Set(ids).size).toBe(1);
    expect(await shiftPatientsQuery(shiftId)).toHaveLength(1);
  });

  it('keeps membership when its encounter is deleted, but hides the deleted location', async () => {
    const encounterId = await openEncounter({ patientId, kind: 'admission', ward: 'OLD' });
    const shiftId = await startShift();
    await addPatientToShift(shiftId, patientId);
    await deleteEncounter(encounterId);
    const rows = await shiftPatientsQuery(shiftId);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.encounter).toBeNull();
    expect(rows[0]?.member.encounterId).toBe(encounterId);
  });

  it('refuses linking another patient encounter, including legacy mismatched joins', async () => {
    const other = await createPatient({ firstName: 'Other', lastName: 'Patient' });
    const encounterId = await openEncounter({ patientId: other, kind: 'admission', ward: 'OTHER' });
    const shiftId = await startShift();
    await expect(addPatientToShift(shiftId, patientId, { encounterId })).rejects.toThrow();
    const memberId = await addPatientToShift(shiftId, patientId, { encounterId: null });
    t.sqlite.run('UPDATE shift_patients SET encounter_id = ? WHERE id = ?', [encounterId, memberId]);
    expect((await shiftPatientsQuery(shiftId))[0]?.encounter).toBeNull();
    expect(t.db.select().from(encounters).all()).toHaveLength(1);
  });

  it('refuses new membership for deleted records without inserting a row', async () => {
    const shiftId = await startShift();
    await deleteShift(shiftId);
    await expect(addPatientToShift(shiftId, patientId)).rejects.toThrow();
    const activeId = await startShift();
    await deletePatient(patientId);
    await expect(addPatientToShift(activeId, patientId)).rejects.toThrow();
    expect(t.db.select().from(shiftPatients).all()).toHaveLength(0);
  });

  it('readding a removed patient preserves the old handoff and creates one new membership', async () => {
    const shiftId = await startShift();
    const old = await addPatientToShift(shiftId, patientId, { shiftSummary: 'previous shift summary' });
    await removePatientFromShift(old);
    const ids = await Promise.all([addPatientToShift(shiftId, patientId), addPatientToShift(shiftId, patientId)]);
    expect(ids[0]).toBe(ids[1]);
    expect(ids[0]).not.toBe(old);
    const all = t.db.select().from(shiftPatients).all();
    expect(all).toHaveLength(2);
    expect(all.find((row) => row.id === old)?.shiftSummary).toBe('previous shift summary');
    expect(await shiftPatientsQuery(shiftId)).toHaveLength(1);
  });

  it('tracks who has been seen', async () => {
    const shiftId = await startShift();
    const memberId = await addPatientToShift(shiftId, patientId);
    await addPatientToShift(shiftId, await createPatient({ firstName: 'رضا', lastName: 'کریمی' }));

    await setShiftPatientReviewed(memberId, true);
    expect(shiftProgress(await shiftPatientsQuery(shiftId))).toEqual({ seen: 1, total: 2 });

    await setShiftPatientReviewed(memberId, false);
    expect(shiftProgress(await shiftPatientsQuery(shiftId))).toEqual({ seen: 0, total: 2 });
  });

  /*
   * A shift is where the owner's attention was, not a fact about a patient.
   * Removing one must never take anybody's record with it.
   */
  it('takes nothing with it when it goes', async () => {
    const shiftId = await startShift();
    await addPatientToShift(shiftId, patientId);

    await deleteShift(shiftId);

    expect(await shiftPatientsQuery(shiftId)).toHaveLength(0);
    // The membership row is what was removed; the patient is untouched.
    expect((await t.db.select().from(shiftPatients))[0]?.deletedAt).toBeInstanceOf(Date);
    expect(await deletedPatientsQuery()).toHaveLength(0);
  });

  it('drops a patient who was deleted from the list', async () => {
    const shiftId = await startShift();
    await addPatientToShift(shiftId, patientId);

    await deletePatient(patientId);

    expect(await shiftPatientsQuery(shiftId)).toHaveLength(0);
  });

  it('lets a patient be taken off without ending the shift', async () => {
    const shiftId = await startShift();
    const memberId = await addPatientToShift(shiftId, patientId);
    await removePatientFromShift(memberId);

    expect(await shiftPatientsQuery(shiftId)).toHaveLength(0);
    expect(await activeShiftQuery()).toHaveLength(1);
  });
});

describe('latest note on a round', () => {
  it('uses clinical note date, not pin order, excluding drafts and deleted notes', async () => {
    const base = { patientId, type: 'progress' as const };
    const pinned = await createNote({
      ...base,
      body: 'older pinned',
      isPinned: true,
      noteDate: new Date('2026-01-01'),
    });
    const latest = await createNote({ ...base, body: 'latest', noteDate: new Date('2026-01-02') });
    await createNote({ ...base, body: 'unfinished', isDraft: true, noteDate: new Date('2026-01-04') });
    const deleted = await createNote({ ...base, body: 'removed', noteDate: new Date('2026-01-05') });
    await deleteNote(deleted);
    expect((await patientNotesQuery(patientId))[0]?.id).toBe(pinned);
    expect((await latestPatientNoteQuery(patientId)).map((row) => row.id)).toEqual([latest]);
    expect(await latestPatientNoteQuery('missing')).toEqual([]);
  });
});

describe('tasks', () => {
  it('exist without a patient', async () => {
    await createTask({ title: 'تماس با رادیولوژی', kind: 'call' });

    const rows = await tasksQuery({ patientId: null });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.task.title).toBe('تماس با رادیولوژی');
    expect(rows[0]?.patient).toBeNull();
  });

  it('carry a patient when they have one', async () => {
    await createTask({ title: 'CT شکم', kind: 'imaging', patientId });

    const rows = await tasksQuery({ patientId });
    expect(rows[0]?.patient?.firstName).toBe('سارا');
    // And the global list does not include it.
    expect(await tasksQuery({ patientId: null })).toHaveLength(0);
  });

  it('are found by what they say', async () => {
    await createTask({ title: 'گرفتن جواب پاتولوژی', notes: 'از بخش نمونه‌برداری' });
    expect(await tasksQuery({ search: 'پاتولوژي' })).toHaveLength(1);
    expect(await tasksQuery({ search: 'نمونه' })).toHaveLength(1);
    expect(await tasksQuery({ search: 'رادیولوژی' })).toHaveLength(0);
  });

  it('clear the completion time when they are reopened', async () => {
    const id = await createTask({ title: 'تماس با آزمایشگاه' });
    await setTaskStatus(id, 'done', 'گرفته شد');
    let [row] = await tasksQuery({ status: 'done' });
    expect(row?.task.completedAt).toBeInstanceOf(Date);
    expect(row?.task.outcome).toBe('گرفته شد');

    await setTaskStatus(id, 'open');
    [row] = await tasksQuery({ status: 'open' });
    expect(row?.task.completedAt).toBeNull();
  });

  it('count an undated task as due now', async () => {
    await createTask({ title: 'همین حالا' });
    await createTask({ title: 'هفته‌ی بعد', dueAt: new Date(Date.now() + 7 * 86_400_000) });

    const due = await tasksQuery({ dueBy: new Date(), status: 'open' });
    expect(due.map((r) => r.task.title)).toEqual(['همین حالا']);
  });
});
