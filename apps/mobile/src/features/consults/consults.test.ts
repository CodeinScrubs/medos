import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import { useTestDatabase } from '@/test/db-client';
import { createTestDatabase } from '@/test/sqljs';

import {
  commitConsultAnswerDraft,
  saveConsultAnswerDraft,
  cancelConsult,
  consultQuery,
  createConsult,
  markConsultRequested,
  openConsultsQuery,
  patientConsultsQuery,
} from './queries';
import { openEncounter } from '../encounters/queries';
import { createPatient, deletePatient } from '../patients/queries';

jest.mock('@/db/client', () => jest.requireActual('@/test/db-client'));
jest.mock('@/platform/notifications', () => jest.requireActual('@/test/mocks/notifications'));

let patientId: string;

beforeEach(async () => {
  useTestDatabase(await createTestDatabase());
  patientId = await createPatient({ firstName: 'سارا', lastName: 'احمدی', status: 'outpatient' });
});

describe('a consult', () => {
  it('puts emergency before urgent before routine instead of alphabetic urgency order', async () => {
    await createConsult({ patientId, reason: 'Routine', urgency: 'routine' });
    await createConsult({ patientId, reason: 'Urgent', urgency: 'urgent' });
    await createConsult({ patientId, reason: 'Emergency', urgency: 'emergency' });
    expect((await openConsultsQuery()).map(({ consult }) => consult.urgency)).toEqual([
      'emergency',
      'urgent',
      'routine',
    ]);
  });

  it('starts owed, and attaches itself to the open admission', async () => {
    const encounterId = await openEncounter({ patientId, kind: 'admission' });
    const id = await createConsult({ patientId, specialty: 'قلب', reason: 'افت فشار بعد از دیالیز' });

    const [row] = await consultQuery(id);
    expect(row?.status).toBe('pending');
    expect(row?.encounterId).toBe(encounterId);
    expect(row?.requestedAt).toBeNull();
    expect(await openConsultsQuery()).toHaveLength(1);
  });

  /*
   * Each step is a real-world event the app cannot observe: writing it down,
   * actually asking, being answered. None of them is inferred.
   */
  it('moves only when someone says it moved', async () => {
    const id = await createConsult({ patientId, specialty: 'عفونی', reason: 'تب طول‌کشیده' });

    await markConsultRequested(id);
    expect((await consultQuery(id))[0]?.status).toBe('requested');
    expect((await consultQuery(id))[0]?.requestedAt).toBeInstanceOf(Date);
    expect(await openConsultsQuery()).toHaveLength(1);

    const revision = await saveConsultAnswerDraft(id, { response: 'شروع مروپنم', instruction: 'کشت خون تکرار شود' }, 0);
    await commitConsultAnswerDraft(id, revision);
    const [answered] = await consultQuery(id);
    expect(answered?.status).toBe('answered');
    expect(answered?.response).toBe('شروع مروپنم');
    expect(answered?.followUpInstruction).toBe('کشت خون تکرار شود');
    expect(answered?.respondedAt).toBeInstanceOf(Date);
    // Answered ones stop being owed.
    expect(await openConsultsQuery()).toHaveLength(0);
  });

  it('can be called off without pretending it was answered', async () => {
    const id = await createConsult({ patientId, reason: 'دیگر لازم نیست' });
    await cancelConsult(id);

    expect((await consultQuery(id))[0]?.response).toBeNull();
    expect(await openConsultsQuery()).toHaveLength(0);
    // It is still on the patient's own list, as something that happened.
    expect(await patientConsultsQuery(patientId)).toHaveLength(1);
  });

  it('indexes the question and the answer, so both can be found later', async () => {
    const id = await createConsult({ patientId, specialty: 'نفرولوژی', reason: 'کراتینین بالا' });
    const revision = await saveConsultAnswerDraft(id, { response: 'دیالیز لازم نیست', instruction: '' }, 0);
    await commitConsultAnswerDraft(id, revision);

    const [row] = await consultQuery(id);
    expect(row?.searchText).toContain('دیالیز');
    expect(row?.searchText).toContain('کراتینین');
    expect(row?.searchText).toContain('نفرولوژی');
  });

  it('leaves the open list when its patient does', async () => {
    await createConsult({ patientId, reason: 'یک سؤال' });
    await deletePatient(patientId);

    expect(await openConsultsQuery()).toHaveLength(0);
  });
});
