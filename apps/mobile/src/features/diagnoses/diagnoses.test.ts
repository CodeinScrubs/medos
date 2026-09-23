import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import { auditLog } from '@/db/schema';
import { useTestDatabase } from '@/test/db-client';
import { createTestDatabase, type TestDatabase } from '@/test/sqljs';

import {
  activeDiagnoses,
  addDiagnosis,
  deleteDiagnosis,
  diagnosisQuery,
  patientDiagnosesQuery,
  setDiagnosisStatus,
  updateDiagnosis,
} from './queries';
import { openEncounter } from '../encounters/queries';
import { createPatient } from '../patients/queries';

jest.mock('@/db/client', () => jest.requireActual('@/test/db-client'));
jest.mock('@/platform/notifications', () => jest.requireActual('@/test/mocks/notifications'));

let patientId: string;
let t: TestDatabase;

beforeEach(async () => {
  t = useTestDatabase(await createTestDatabase());
  patientId = await createPatient({ firstName: 'سارا', lastName: 'احمدی', status: 'admitted' });
});

describe('the problem list', () => {
  it('rejects empty titles instead of replacing a real diagnosis with whitespace', async () => {
    const id = await addDiagnosis({ patientId, title: 'Recorded condition' });
    await expect(updateDiagnosis(id, { title: '   ' })).rejects.toThrow();
    await expect(addDiagnosis({ patientId, title: '' })).rejects.toThrow();
    expect((await diagnosisQuery(id))[0]?.title).toBe('Recorded condition');
  });

  it('audits status changes and deletion without recording clinical text', async () => {
    const id = await addDiagnosis({ patientId, title: 'Private condition' });
    await setDiagnosisStatus(id, 'resolved');
    await deleteDiagnosis(id);
    const logs = t.db.select().from(auditLog).all();
    expect(logs.map((entry) => entry.action)).toEqual(['diagnosis.updated', 'diagnosis.deleted']);
    expect(logs.every((entry) => entry.entityId === id && entry.summary == null && entry.detail == null)).toBe(true);
  });
  it('starts active, attached to the open admission', async () => {
    const encounterId = await openEncounter({ patientId, kind: 'admission' });
    const id = await addDiagnosis({ patientId, title: 'CKD stage 3' });

    const [row] = await diagnosisQuery(id);
    expect(row?.status).toBe('active');
    expect(row?.kind).toBe('secondary');
    expect(row?.encounterId).toBe(encounterId);
  });

  /*
   * Closing a problem is somebody's decision. Nothing about adding another
   * one, or time passing, may make it for them.
   */
  it('changes state only when someone says so', async () => {
    const id = await addDiagnosis({ patientId, title: 'AKI' });
    await addDiagnosis({ patientId, title: 'Hypertension', kind: 'primary' });
    expect((await diagnosisQuery(id))[0]?.status).toBe('active');

    await setDiagnosisStatus(id, 'resolved');
    expect((await diagnosisQuery(id))[0]?.status).toBe('resolved');

    await setDiagnosisStatus(id, 'active');
    expect((await diagnosisQuery(id))[0]?.status).toBe('active');
  });

  /*
   * What was ruled out is part of the reasoning. Dropping it off the list
   * invites the same workup a second time.
   */
  it('keeps what was ruled out, listed apart from what is live', async () => {
    const live = await addDiagnosis({ patientId, title: 'Pneumonia' });
    const out = await addDiagnosis({ patientId, title: 'PE', kind: 'rule_out' });
    await setDiagnosisStatus(out, 'ruled_out');

    const rows = await patientDiagnosesQuery(patientId);
    expect(rows).toHaveLength(2);
    expect(activeDiagnoses(rows).map((d) => d.id)).toEqual([live]);
  });

  it('keeps the order things were added in', async () => {
    const first = await addDiagnosis({ patientId, title: 'One' });
    const second = await addDiagnosis({ patientId, title: 'Two' });
    const third = await addDiagnosis({ patientId, title: 'Three' });

    expect((await patientDiagnosesQuery(patientId)).map((d) => d.id)).toEqual([first, second, third]);
  });

  it('trims what is typed and treats an empty code as no code', async () => {
    const id = await addDiagnosis({ patientId, title: '  Anemia  ', icdCode: '   ' });
    const [row] = await diagnosisQuery(id);
    expect(row?.title).toBe('Anemia');
    expect(row?.icdCode).toBeNull();
  });

  it('edits one field without disturbing the rest', async () => {
    const id = await addDiagnosis({ patientId, title: 'CKD', kind: 'primary', notes: 'baseline Cr 2.1' });
    await updateDiagnosis(id, { title: 'CKD stage 4' });

    const [row] = await diagnosisQuery(id);
    expect(row?.title).toBe('CKD stage 4');
    expect(row?.kind).toBe('primary');
    expect(row?.notes).toBe('baseline Cr 2.1');
  });

  it('is soft-deleted like everything else', async () => {
    const id = await addDiagnosis({ patientId, title: 'Typo' });
    await deleteDiagnosis(id);
    expect(await patientDiagnosesQuery(patientId)).toHaveLength(0);
  });
});
