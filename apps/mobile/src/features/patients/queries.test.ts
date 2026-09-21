import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import { auditLog, followUps, patients } from '@/db/schema';
import { createFollowUp } from '@/features/followups/queries';
import { useTestDatabase } from '@/test/db-client';
import { resetNotifications, scheduled } from '@/test/mocks/notifications';
import { createTestDatabase, type TestDatabase } from '@/test/sqljs';

import {
  createPatient,
  deletedPatientsQuery,
  deletePatient,
  findPossibleDuplicates,
  patientListQuery,
  reindexPatients,
  restorePatient,
  updatePatient,
} from './queries';

jest.mock('@/db/client', () => jest.requireActual('@/test/db-client'));
jest.mock('@/platform/notifications', () => jest.requireActual('@/test/mocks/notifications'));

const c = (code: number) => String.fromCharCode(code);
const ARABIC_YEH = c(0x064a);
const PERSIAN_YEH = c(0x06cc);

let t: TestDatabase;

beforeEach(async () => {
  t = useTestDatabase(await createTestDatabase());
  resetNotifications();
});

const listNames = async (search?: string) =>
  (await patientListQuery({ search })).map((p) => `${p.firstName} ${p.lastName}`);

const tomorrow = () => new Date(Date.now() + 24 * 3_600_000);

describe('patient search', () => {
  beforeEach(async () => {
    await createPatient({
      firstName: `عل${PERSIAN_YEH}`,
      lastName: 'رضایی',
      phone: '+98 912 000 0001',
      nationalId: '0000000019',
    });
    await createPatient({ firstName: 'مریم', lastName: 'کریمی', summary: 'DM, HTN — 50%' });
  });

  it('finds a name typed with the Arabic keyboard’s yeh', async () => {
    expect(await listNames(`عل${ARABIC_YEH}`)).toEqual([`عل${PERSIAN_YEH} رضایی`]);
  });

  it('matches every term, in any order', async () => {
    expect(await listNames('رضایی علی')).toEqual([`عل${PERSIAN_YEH} رضایی`]);
    expect(await listNames('رضایی مریم')).toEqual([]);
  });

  it('finds a phone number however it was typed', async () => {
    expect(await listNames('09120000001')).toHaveLength(1);
    expect(await listNames('۰۹۱۲ ۰۰۰')).toHaveLength(1);
    expect(await listNames('0000000019')).toHaveLength(1);
  });

  it('treats % and _ as the characters they are, not wildcards', async () => {
    expect(await listNames('%')).toEqual(['مریم کریمی']);
    expect(await listNames('_')).toEqual([]);
  });

  it('keeps the whole row searchable when one field is edited', async () => {
    const [ali] = await patientListQuery({ search: 'رضایی' });
    await updatePatient(ali!.id, { phone: '0912 000 0000' });
    expect(await listNames('رضایی')).toHaveLength(1);
    expect(await listNames('09120000000')).toHaveLength(1);
    expect(await listNames('09120000001')).toEqual([]);
  });

  it('warns about a likely duplicate by name or national id', async () => {
    expect(await findPossibleDuplicates(`عل${ARABIC_YEH}`, 'رضایی')).toHaveLength(1);
    expect(await findPossibleDuplicates('نام دیگر', 'کسی', '0000000019')).toHaveLength(1);
    expect(await findPossibleDuplicates('کسی', 'دیگر')).toEqual([]);
  });

  it('repairs a stale search index', async () => {
    t.conn.execSync("UPDATE patients SET search_text = 'stale'");
    expect(await listNames('رضایی')).toEqual([]);
    expect(await reindexPatients()).toBe(2);
    expect(await listNames('رضایی')).toHaveLength(1);
    expect(await reindexPatients()).toBe(0);
  });
});

describe('deleting a patient', () => {
  it('hides the patient, keeps the row, silences reminders, and is fully reversible', async () => {
    const id = await createPatient({ firstName: 'سارا', lastName: 'احمدی' });
    await createFollowUp({
      patientId: id,
      dueAt: tomorrow(),
      reason: 'call about CT',
      channel: 'call',
      priority: 'normal',
    });
    expect(scheduled.size).toBe(1);

    await deletePatient(id);
    expect(await listNames()).toEqual([]);
    expect((await deletedPatientsQuery()).map((p) => p.id)).toEqual([id]);
    expect(await t.db.select().from(patients)).toHaveLength(1);
    expect(scheduled.size).toBe(0);
    const [pending] = await t.db.select().from(followUps);
    expect(pending?.status).toBe('pending');

    await restorePatient(id);
    expect(await listNames()).toEqual(['سارا احمدی']);
    expect(scheduled.size).toBe(1);

    const actions = (await t.db.select().from(auditLog)).map((a) => a.action);
    expect(actions).toEqual(['patient.deleted', 'patient.restored']);
  });
});

describe('a record that was deleted', () => {
  /*
   * The queries are filtered now, so a screen cannot load a deleted row. A
   * screen that was already open still holds one, and its save button still
   * works — so the write has to refuse too.
   */
  it('cannot be edited by a screen that was already open', async () => {
    const id = await createPatient({ firstName: 'زهرا', lastName: 'نوری' });
    await deletePatient(id);

    await expect(updatePatient(id, { firstName: 'تغییر' })).rejects.toThrow();

    const [row] = await t.db.select().from(patients);
    expect(row?.firstName).toBe('زهرا');
  });

  it('comes back through restore, which is its own path', async () => {
    const id = await createPatient({ firstName: 'زهرا', lastName: 'نوری' });
    await deletePatient(id);

    await restorePatient(id);

    expect(await patientListQuery()).toHaveLength(1);
    await updatePatient(id, { firstName: 'زهرای' });
    expect((await t.db.select().from(patients))[0]?.firstName).toBe('زهرای');
  });
});
