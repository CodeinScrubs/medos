import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import { consultations, consultRequestDrafts } from '@/db/schema';
import { deleteEncounter, openEncounter } from '@/features/encounters/queries';
import { createPatient, deletePatient } from '@/features/patients/queries';
import { useTestDatabase } from '@/test/db-client';
import { createTestDatabase, type TestDatabase } from '@/test/sqljs';

import { consultQuery, createConsult, openConsultsQuery } from './queries';
import { commitRequestDraft, RequestDraftConflict, requestDraftQuery, saveRequestDraft } from './request-drafts';

jest.mock('@/db/client', () => jest.requireActual('@/test/db-client'));
jest.mock('@/platform/notifications', () => jest.requireActual('@/test/mocks/notifications'));
let t: TestDatabase;
let patientId: string;
beforeEach(async () => {
  t = useTestDatabase(await createTestDatabase());
  patientId = await createPatient({ firstName: 'Test', lastName: 'Patient', status: 'outpatient' });
});
const fields = { specialty: '  Specialty ', reason: ' Exact\nquestion  ' };

describe('consult request draft recovery', () => {
  it('keeps both fields exact, isolated per patient, without creating outstanding consults', async () => {
    expect(await saveRequestDraft('empty', patientId, { specialty: '', reason: '' }, 0)).toBe(0);
    expect(await requestDraftQuery(patientId)).toHaveLength(0);
    await saveRequestDraft('first', patientId, fields, 0);
    const other = await createPatient({ firstName: 'Other', lastName: 'Patient', status: 'outpatient' });
    await saveRequestDraft('second', other, { specialty: 'Other service', reason: '' }, 0);
    expect((await requestDraftQuery(patientId))[0]).toMatchObject(fields);
    expect((await requestDraftQuery(other))[0]?.reason).toBe('');
    expect(await openConsultsQuery()).toHaveLength(0);
    await expect(commitRequestDraft('second', 1)).rejects.toThrow('سؤال');
  });

  it('publishes exactly once, retains source text, and does not claim the request was sent', async () => {
    await saveRequestDraft('draft', patientId, fields, 0);
    const [a, b] = await Promise.all([commitRequestDraft('draft', 1), commitRequestDraft('draft', 1)]);
    expect(a).toBe(b);
    expect(await openConsultsQuery()).toHaveLength(1);
    expect((await consultQuery(a))[0]).toMatchObject({
      specialty: 'Specialty',
      reason: 'Exact\nquestion',
      status: 'pending',
      requestedAt: null,
    });
    expect(t.db.select().from(consultRequestDrafts).get()).toMatchObject({ ...fields, consultId: a });
    expect(await requestDraftQuery(patientId)).toHaveLength(0);
    await expect(saveRequestDraft('draft', patientId, fields, 1)).rejects.toThrow();
    await saveRequestDraft('next', patientId, fields, 0);
  });

  it('rolls back the consult when retiring its draft fails, so retry creates only one', async () => {
    await saveRequestDraft('draft', patientId, fields, 0);
    t.sqlite.exec(
      "CREATE TRIGGER fail_retire BEFORE UPDATE ON consult_request_drafts WHEN NEW.consult_id IS NOT NULL BEGIN SELECT RAISE(ABORT, 'synthetic failure'); END;",
    );
    await expect(commitRequestDraft('draft', 1)).rejects.toThrow();
    expect(t.db.select().from(consultations).all()).toHaveLength(0);
    expect((await requestDraftQuery(patientId))[0]).toMatchObject({ ...fields, revision: 1, consultId: null });
    t.sqlite.exec('DROP TRIGGER fail_retire');
    await commitRequestDraft('draft', 1);
    expect(t.db.select().from(consultations).all()).toHaveLength(1);
  });

  it('rejects stale writes and conflicting first captures without replacing either field', async () => {
    const result = await Promise.allSettled([
      saveRequestDraft('a', patientId, fields, 0),
      saveRequestDraft('b', patientId, { specialty: '', reason: 'Other' }, 0),
    ]);
    expect(result.map((item) => item.status)).toEqual(['fulfilled', 'rejected']);
    await expect(saveRequestDraft('a', patientId, { specialty: 'Stale', reason: '' }, 0)).rejects.toBeInstanceOf(
      RequestDraftConflict,
    );
    await expect(commitRequestDraft('a', 0)).rejects.toBeInstanceOf(RequestDraftConflict);
    expect((await requestDraftQuery(patientId))[0]).toMatchObject(fields);
  });

  it('keeps the episode at capture, even if another episode opens before publication', async () => {
    const encounterId = await openEncounter({ patientId, kind: 'admission' });
    await saveRequestDraft('old', patientId, fields, 0);
    await deleteEncounter(encounterId);
    await openEncounter({ patientId, kind: 'admission' });
    const id = await commitRequestDraft('old', 1);
    expect((await consultQuery(id))[0]?.encounterId).toBe(encounterId);
    const other = await createPatient({ firstName: 'Other', lastName: 'Patient', status: 'outpatient' });
    await saveRequestDraft('unlinked', other, fields, 0);
    await openEncounter({ patientId: other, kind: 'admission' });
    const unlinked = await commitRequestDraft('unlinked', 1);
    expect((await consultQuery(unlinked))[0]?.encounterId).toBeNull();
    await expect(createConsult({ patientId: other, encounterId, reason: 'Wrong patient' })).rejects.toThrow();
  });

  it('retains recoverable text but rejects writes/publication after patient deletion', async () => {
    await saveRequestDraft('draft', patientId, fields, 0);
    await deletePatient(patientId);
    await expect(saveRequestDraft('draft', patientId, fields, 1)).rejects.toThrow();
    await expect(commitRequestDraft('draft', 1)).rejects.toThrow();
    await expect(createConsult({ patientId, reason: 'Deleted' })).rejects.toThrow();
    expect((await requestDraftQuery(patientId))[0]).toMatchObject(fields);
    expect(t.db.select().from(consultations).all()).toHaveLength(0);
  });
});
