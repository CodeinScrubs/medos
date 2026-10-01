import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { eq } from 'drizzle-orm';

import { auditLog, encounters, labValues, notes, orders, patients } from '@/db/schema';
import { useTestDatabase } from '@/test/db-client';
import { resetNotifications } from '@/test/mocks/notifications';
import { createTestDatabase, type TestDatabase } from '@/test/sqljs';

import {
  deleteEncounter,
  dischargeEncounter,
  EncounterNotEmptyError,
  encounterRecordCount,
  openEncounter,
  updateEncounter,
} from './encounters/queries';
import { reconcileAllPatientStatuses, reconcilePatientStatus } from './encounters/status';
import { createOrder, patientOrdersQuery, setOrderStatus, suggestOrderNames } from './kardex/queries';
import { analyteSeriesQuery, createLabPanel, updateLabPanel } from './labs/queries';
import { reflagLabValuesIfNeeded } from './labs/reflag';
import { createNote, updateNote } from './notes/queries';
import { createPatient, deletePatient, updatePatient } from './patients/queries';
import { createExtension, createPlace, extensionsQuery, updatePlace } from './places/queries';

jest.mock('@/db/client', () => jest.requireActual('@/test/db-client'));
jest.mock('@/platform/notifications', () => jest.requireActual('@/test/mocks/notifications'));

let t: TestDatabase;
let patientId: string;

beforeEach(async () => {
  t = useTestDatabase(await createTestDatabase());
  resetNotifications();
  patientId = await createPatient({ firstName: 'سارا', lastName: 'احمدی', status: 'outpatient' });
});

const patientStatus = async () => (await t.db.select().from(patients))[0]?.status;

describe('encounters', () => {
  it('admits, supersedes and discharges, keeping the patient’s status in step', async () => {
    const first = await openEncounter({ patientId, kind: 'emergency' });
    expect(await patientStatus()).toBe('admitted');

    const second = await openEncounter({ patientId, kind: 'admission', ward: 'CCU' });
    const rows = await t.db.select().from(encounters);
    expect(rows.find((e) => e.id === first)?.isActive).toBe(false);
    expect(rows.find((e) => e.id === second)?.isActive).toBe(true);

    await dischargeEncounter(second, { dischargedAt: new Date(), dischargeType: 'improved', nextStatus: 'followup' });
    expect(await patientStatus()).toBe('followup');
  });

  // Correcting an admission that was really an ER visit has to move the patient
  // too, or the admitted list keeps a bed that does not exist.
  it('follows a change of kind on the active episode, and leaves closed ones alone', async () => {
    const id = await openEncounter({ patientId, kind: 'admission' });
    expect(await patientStatus()).toBe('admitted');

    await updateEncounter(id, { kind: 'outpatient' });
    expect(await patientStatus()).toBe('outpatient');

    await dischargeEncounter(id, { dischargedAt: new Date(), dischargeType: 'improved', nextStatus: 'discharged' });
    await updateEncounter(id, { kind: 'admission', ward: 'CCU' });
    // The episode is history now; editing it does not readmit anyone.
    expect(await patientStatus()).toBe('discharged');
    expect((await t.db.select().from(encounters)).find((e) => e.id === id)?.ward).toBe('CCU');
  });

  it('records a death as deceased whatever follow-up status was chosen', async () => {
    const id = await openEncounter({ patientId, kind: 'admission' });
    await dischargeEncounter(id, { dischargedAt: new Date(), dischargeType: 'death', nextStatus: 'followup' });
    expect(await patientStatus()).toBe('deceased');
  });

  it('attaches new notes to the active admission unless told otherwise', async () => {
    const encounterId = await openEncounter({ patientId, kind: 'admission' });
    const attached = await createNote({ patientId, type: 'progress', subjective: 'better' });
    const standalone = await createNote({ patientId, type: 'general', body: 'phone call', encounterId: null });
    const rows = await t.db.select().from(notes);
    expect(rows.find((n) => n.id === attached)?.encounterId).toBe(encounterId);
    expect(rows.find((n) => n.id === standalone)?.encounterId).toBeNull();
  });

  it('refuses to open or mutate an episode for a deleted patient', async () => {
    const id = await openEncounter({ patientId, kind: 'admission', ward: 'Original' });
    await deletePatient(patientId);
    const before = t.db.select().from(encounters).all();
    const patientBefore = t.db.select().from(patients).get();

    await expect(openEncounter({ patientId, kind: 'outpatient' })).rejects.toThrow();
    await expect(updateEncounter(id, { ward: 'Overwrite' })).rejects.toThrow();
    await expect(
      dischargeEncounter(id, { dischargedAt: new Date(), dischargeType: 'improved', nextStatus: 'followup' }),
    ).rejects.toThrow();
    await expect(deleteEncounter(id)).rejects.toThrow();

    expect(t.db.select().from(encounters).all()).toEqual(before);
    expect(t.db.select().from(patients).get()).toEqual(patientBefore);
  });

  it('does not let a stale discharge of a superseded episode change the current patient', async () => {
    const old = await openEncounter({ patientId, kind: 'admission', ward: 'Previous' });
    const current = await openEncounter({ patientId, kind: 'admission', ward: 'Current' });
    const before = t.db.select().from(encounters).all();
    const patientBefore = t.db.select().from(patients).get();
    await expect(
      dischargeEncounter(old, { dischargedAt: new Date(), dischargeType: 'death', nextStatus: 'followup' }),
    ).rejects.toThrow();
    expect(t.db.select().from(encounters).all()).toEqual(before);
    expect(t.db.select().from(patients).get()).toEqual(patientBefore);
    expect(t.db.select().from(encounters).where(eq(encounters.id, current)).get()?.isActive).toBe(true);
    expect(t.db.select().from(auditLog).all()).toEqual([]);
  });

  it('keeps status in step with the newest episode when editing an imported duplicate', async () => {
    const older = await openEncounter({ patientId, kind: 'admission', admittedAt: new Date(2025, 0, 1) });
    const newest = await openEncounter({ patientId, kind: 'admission', admittedAt: new Date(2025, 0, 2) });
    t.db.update(encounters).set({ isActive: true }).where(eq(encounters.id, older)).run();
    await updateEncounter(older, { kind: 'outpatient' });
    expect(await patientStatus()).toBe('admitted');
    const before = t.db.select().from(encounters).all();
    await expect(
      dischargeEncounter(newest, { dischargedAt: new Date(), dischargeType: 'improved', nextStatus: 'discharged' }),
    ).rejects.toThrow();
    expect(t.db.select().from(encounters).all()).toEqual(before);
    expect(await patientStatus()).toBe('admitted');
  });

  it('reads active state in the same transaction as a kind correction', async () => {
    const old = await openEncounter({ patientId, kind: 'admission', ward: 'Previous' });
    const editing = updateEncounter(old, { kind: 'outpatient' });
    // Let the old implementation execute its awaited read, then open the new
    // admission before its continuation writes the cached active state.
    await Promise.resolve();
    const current = await openEncounter({ patientId, kind: 'admission', ward: 'Current' });
    await editing;
    expect(await patientStatus()).toBe('admitted');
    expect(t.db.select().from(encounters).where(eq(encounters.id, current)).get()?.isActive).toBe(true);
    expect(t.db.select().from(encounters).where(eq(encounters.id, old)).get()?.isActive).toBe(false);
    expect(t.db.select().from(patients).get()?.searchText).toContain('current');
    expect(t.db.select().from(patients).get()?.searchText).not.toContain('previous');
  });

  it('rejects invalid dates without changing an episode, orders or patient status', async () => {
    const id = await openEncounter({ patientId, kind: 'admission' });
    await createOrder({ patientId, kind: 'drug', name: 'Synthetic medication' });
    const before = {
      patient: t.db.select().from(patients).get(),
      encounters: t.db.select().from(encounters).all(),
      orders: t.db.select().from(orders).all(),
    };
    await expect(openEncounter({ patientId, kind: 'outpatient', admittedAt: new Date(NaN) })).rejects.toThrow();
    await expect(updateEncounter(id, { admittedAt: new Date(NaN) })).rejects.toThrow();
    await expect(
      dischargeEncounter(id, { dischargedAt: new Date(NaN), dischargeType: 'improved', nextStatus: 'discharged' }),
    ).rejects.toThrow();
    expect({
      patient: t.db.select().from(patients).get(),
      encounters: t.db.select().from(encounters).all(),
      orders: t.db.select().from(orders).all(),
    }).toEqual(before);
  });

  it.each(['open', 'edit', 'discharge', 'delete'] as const)(
    'rolls back the whole %s operation when the patient write fails',
    async (operation) => {
      const id = await openEncounter({ patientId, kind: 'admission', ward: 'Original' });
      // Delete is allowed only for an empty episode. The discharge case also
      // checks rollback of orders that were ended before the failed status write.
      if (operation === 'discharge') await createOrder({ patientId, kind: 'drug', name: 'Synthetic medication' });
      const before = {
        patient: t.db.select().from(patients).get(),
        encounters: t.db.select().from(encounters).all(),
        orders: t.db.select().from(orders).all(),
      };
      t.sqlite.exec(
        "CREATE TRIGGER fail_patient BEFORE UPDATE ON patients BEGIN SELECT RAISE(ABORT, 'synthetic failure'); END;",
      );
      const action = () => {
        switch (operation) {
          case 'open':
            return openEncounter({ patientId, kind: 'outpatient' });
          case 'edit':
            return updateEncounter(id, { kind: 'outpatient' });
          case 'discharge':
            return dischargeEncounter(id, {
              dischargedAt: new Date(),
              dischargeType: 'improved',
              nextStatus: 'followup',
            });
          case 'delete':
            return deleteEncounter(id);
        }
      };
      await expect(action()).rejects.toThrow('synthetic failure');
      expect({
        patient: t.db.select().from(patients).get(),
        encounters: t.db.select().from(encounters).all(),
        orders: t.db.select().from(orders).all(),
      }).toEqual(before);
      expect(t.db.select().from(auditLog).all()).toEqual([]);
      t.sqlite.exec('DROP TRIGGER fail_patient');
      await action();
      expect(t.db.select().from(patients).get()?.status).toBe(operation === 'discharge' ? 'followup' : 'outpatient');
    },
  );
});

describe('notes', () => {
  it('rebuilds the search index from the whole note on a partial edit', async () => {
    const id = await createNote({ patientId, type: 'progress', subjective: 'fever', plan: 'ceftriaxone' });
    await updateNote(id, { assessment: 'pyelonephritis' });
    const [note] = await t.db.select().from(notes);
    expect(note?.searchText).toContain('fever');
    expect(note?.searchText).toContain('ceftriaxone');
    expect(note?.searchText).toContain('pyelonephritis');
  });
});

describe('labs', () => {
  it('stores the text as typed, the number it means, and a flag against the row’s range', async () => {
    await createLabPanel({
      patientId,
      collectedAt: new Date(2025, 0, 1),
      source: 'manual',
      values: [
        { analyte: 'WBC', value: '7,500', refLow: 4000, refHigh: 10000 },
        { analyte: 'K', value: '۵٫۸', unit: 'mEq/L', refLow: 3.5, refHigh: 5.1 },
        { analyte: 'Nitrite', value: 'Positive' },
        { analyte: 'Na', value: '' },
      ],
    });
    const rows = await t.db.select().from(labValues).orderBy(labValues.sortOrder);
    expect(rows.map((r) => [r.analyte, r.value, r.valueNum, r.flag])).toEqual([
      ['WBC', '7,500', 7500, 'normal'],
      ['K', '۵٫۸', 5.8, 'high'],
      ['Nitrite', 'Positive', null, null],
    ]);
  });

  /*
   * A flag is worked out once and stored, so a change to the rule leaves
   * earlier rows carrying the old verdict. On a lab table that reads as a
   * fact, not as an old build's opinion.
   */
  it('works stored flags out again when the rule that sets them changes', async () => {
    await createLabPanel({
      patientId,
      collectedAt: new Date(2025, 0, 1),
      source: 'manual',
      values: [
        { analyte: 'ESR', value: '>=100', refLow: 0, refHigh: 100 },
        { analyte: 'K', value: '5.8', refLow: 3.5, refHigh: 5.1 },
      ],
    });
    // What an older build wrote: the bound read as if it were the number.
    await t.db.update(labValues).set({ flag: 'high' }).where(eq(labValues.analyte, 'ESR'));

    await reflagLabValuesIfNeeded();

    const flags = async () =>
      (await t.db.select().from(labValues).orderBy(labValues.sortOrder)).map((r) => [r.analyte, r.flag]);
    // `>=100` may be exactly 100, which is in range: no flag, rather than a wrong one.
    expect(await flags()).toEqual([
      ['ESR', null],
      ['K', 'high'],
    ]);

    // And it is a one-off: the version is recorded, so nothing is rewritten again.
    await t.db.update(labValues).set({ flag: 'low' }).where(eq(labValues.analyte, 'ESR'));
    await reflagLabValuesIfNeeded();
    expect((await flags())[0]).toEqual(['ESR', 'low']);
  });

  it('keeps the old values when a panel is edited, and plots only the live ones', async () => {
    const panelId = await createLabPanel({
      patientId,
      collectedAt: new Date(2025, 0, 1),
      source: 'manual',
      values: [{ analyte: 'Cr', value: '1.1' }],
    });
    await createLabPanel({
      patientId,
      collectedAt: new Date(2025, 0, 3),
      source: 'manual',
      values: [{ analyte: 'cr', value: '1.9' }],
    });
    await updateLabPanel(panelId, {
      collectedAt: new Date(2025, 0, 1),
      source: 'manual',
      values: [{ analyte: 'Cr', value: '1.2' }],
    });

    expect(await t.db.select().from(labValues)).toHaveLength(3);
    const series = await analyteSeriesQuery(patientId, 'CR');
    expect(series.map((s) => s.value.valueNum)).toEqual([1.2, 1.9]);
  });
});

describe('kardex', () => {
  it('freezes the day count when an order stops and thaws it when resumed', async () => {
    const id = await createOrder({ patientId, kind: 'drug', name: 'Ceftriaxone', dose: '1 g' });
    await setOrderStatus(id, 'discontinued');
    expect((await t.db.select().from(orders))[0]?.endAt).toBeInstanceOf(Date);
    await setOrderStatus(id, 'active');
    expect((await t.db.select().from(orders))[0]?.endAt).toBeNull();
  });

  // The bug this replaces: every order the patient ever had came back on the
  // kardex of the new admission, still "active", still counting days.
  it('shows this admission’s orders plus standing ones, never the previous admission’s', async () => {
    const standing = await createOrder({ patientId, kind: 'drug', name: 'Levothyroxine', dose: '100 mcg' });

    const first = await openEncounter({ patientId, kind: 'admission' });
    const old = await createOrder({ patientId, kind: 'drug', name: 'Ceftriaxone', dose: '1 g' });
    await dischargeEncounter(first, {
      dischargedAt: new Date(),
      dischargeType: 'improved',
      nextStatus: 'discharged',
    });

    const second = await openEncounter({ patientId, kind: 'admission' });
    const current = await createOrder({ patientId, kind: 'drug', name: 'Vancomycin', dose: '1 g' });

    const onKardex = (await patientOrdersQuery(patientId, second)).map((o) => o.id);
    expect(onKardex).toContain(current);
    expect(onKardex).toContain(standing);
    expect(onKardex).not.toContain(old);

    // And the old admission's kardex still reads as it did.
    expect((await patientOrdersQuery(patientId, first)).map((o) => o.id)).toContain(old);
  });

  it('ends the admission’s running orders at discharge, leaving standing ones alone', async () => {
    const standing = await createOrder({ patientId, kind: 'drug', name: 'Levothyroxine' });
    const encounterId = await openEncounter({ patientId, kind: 'admission' });
    const running = await createOrder({ patientId, kind: 'drug', name: 'Ceftriaxone' });
    const held = await createOrder({ patientId, kind: 'drug', name: 'Enoxaparin' });
    await setOrderStatus(held, 'held');
    const stopped = await createOrder({ patientId, kind: 'drug', name: 'Metronidazole' });
    await setOrderStatus(stopped, 'discontinued');

    const dischargedAt = new Date();
    await dischargeEncounter(encounterId, { dischargedAt, dischargeType: 'improved', nextStatus: 'discharged' });

    const byId = Object.fromEntries((await t.db.select().from(orders)).map((o) => [o.id, o]));
    expect(byId[running]?.status).toBe('completed');
    expect(byId[running]?.endAt).toEqual(dischargedAt);
    expect(byId[held]?.status).toBe('completed');
    // Already stopped: its own end date is not moved to the discharge date.
    expect(byId[stopped]?.status).toBe('discontinued');
    // A standing order belongs to no admission and keeps running.
    expect(byId[standing]?.status).toBe('active');
  });

  it('suggests names the user has typed before, most used first, matching the prefix literally', async () => {
    for (const name of ['Ceftriaxone', 'Ceftriaxone', 'Cefazolin', 'C%ount']) {
      await createOrder({ patientId, kind: 'drug', name });
    }
    expect(await suggestOrderNames('Cef')).toEqual(['Ceftriaxone', 'Cefazolin']);
    expect(await suggestOrderNames('C%')).toEqual(['C%ount']);
    expect(await suggestOrderNames('C')).toEqual([]);
  });
});

describe('places and extensions', () => {
  it('finds an extension by department and hospital, and follows a hospital rename', async () => {
    const central = await createPlace({ name: 'بیمارستان مرکزی', kind: 'hospital' });
    const other = await createPlace({ name: 'بیمارستان شمال', kind: 'hospital' });
    await createExtension({ placeId: central, department: 'سونوگرافی', extension: '2345' });
    await createExtension({ placeId: other, department: 'سونوگرافی', extension: '6789' });

    expect(await extensionsQuery({ search: 'سونوگرافی' })).toHaveLength(2);
    expect((await extensionsQuery({ search: 'مرکزی سونو' })).map((r) => r.extension.extension)).toEqual(['2345']);

    await updatePlace(central, { name: 'بیمارستان امید' });
    expect((await extensionsQuery({ search: 'امید سونو' })).map((r) => r.extension.extension)).toEqual(['2345']);
    expect(await extensionsQuery({ search: 'مرکزی سونو' })).toEqual([]);
  });
});

describe('deleting an episode', () => {
  /*
   * A deleted admission that leaves the patient "admitted" keeps a bed on the
   * ward list that nothing points at.
   */
  it('takes the patient off the ward when the active one is deleted', async () => {
    const id = await openEncounter({ patientId, kind: 'admission' });
    expect(await patientStatus()).toBe('admitted');

    await deleteEncounter(id);

    expect(await patientStatus()).toBe('outpatient');
    const row = (await t.db.select().from(encounters)).find((e) => e.id === id);
    expect(row?.deletedAt).toBeInstanceOf(Date);
    expect(row?.isActive).toBe(false);
  });

  /*
   * Deleting is for an episode entered by mistake. One with a note or an
   * order under it is real: deleting it would drop those from the kardex and
   * the episode's lists, so it has to be discharged or edited instead.
   */
  it('refuses an episode that has records filed under it', async () => {
    const id = await openEncounter({ patientId, kind: 'admission' });
    expect(encounterRecordCount(id)).toBe(0);
    await createNote({ patientId, type: 'progress', body: 'Seen on the ward' });
    await createOrder({ patientId, kind: 'lab', name: 'CBC' });
    expect(encounterRecordCount(id)).toBe(2);

    await expect(deleteEncounter(id)).rejects.toBeInstanceOf(EncounterNotEmptyError);

    expect(await patientStatus()).toBe('admitted');
    expect((await t.db.select().from(encounters)).find((e) => e.id === id)?.deletedAt).toBeNull();
  });

  it('leaves the status alone when a closed episode is deleted', async () => {
    const id = await openEncounter({ patientId, kind: 'admission' });
    await dischargeEncounter(id, { dischargedAt: new Date(), dischargeType: 'improved', nextStatus: 'followup' });
    const second = await openEncounter({ patientId, kind: 'admission' });

    await deleteEncounter(id);

    // The one the patient is actually in still decides.
    expect(await patientStatus()).toBe('admitted');
    expect((await t.db.select().from(encounters)).find((e) => e.id === second)?.isActive).toBe(true);
  });

  // A discharge used to be written to the audit log as a deletion, and a real
  // deletion was not written at all.
  it('audits a discharge as a discharge and a deletion as a deletion', async () => {
    const discharged = await openEncounter({ patientId, kind: 'admission' });
    await dischargeEncounter(discharged, {
      dischargedAt: new Date(),
      dischargeType: 'improved',
      nextStatus: 'followup',
    });
    const mistaken = await openEncounter({ patientId, kind: 'admission' });
    await deleteEncounter(mistaken);

    const entries = await t.db.select().from(auditLog);
    expect(entries.map((e) => [e.action, e.entityId])).toEqual([
      ['encounter.discharged', discharged],
      ['encounter.deleted', mistaken],
    ]);
  });
});

describe('who decides that a patient is on a ward', () => {
  it('uses the newest live active episode once without deleting imported duplicates', async () => {
    const older = await openEncounter({ patientId, kind: 'admission', admittedAt: new Date(2025, 0, 1) });
    const newest = await openEncounter({ patientId, kind: 'outpatient', admittedAt: new Date(2025, 0, 2) });
    // An older/imported dataset may contain more than one active episode.
    t.db.update(encounters).set({ isActive: true }).where(eq(encounters.id, older)).run();
    t.db.update(patients).set({ status: 'admitted' }).where(eq(patients.id, patientId)).run();
    const before = t.db.select().from(encounters).all();
    expect(await reconcileAllPatientStatuses()).toBe(1);
    expect(await patientStatus()).toBe('outpatient');
    expect(t.db.select().from(encounters).all()).toEqual(before);
    expect(t.db.select().from(encounters).where(eq(encounters.id, newest)).get()?.isActive).toBe(true);
    expect(await reconcileAllPatientStatuses()).toBe(0);
  });

  it('rolls back a failed startup repair and retries without partially corrected patients', async () => {
    const other = await createPatient({ firstName: 'Second', lastName: 'Synthetic' });
    await openEncounter({ patientId, kind: 'admission' });
    await openEncounter({ patientId: other, kind: 'admission' });
    t.db.update(patients).set({ status: 'outpatient' }).run();
    const before = t.db.select().from(patients).all();
    t.sqlite.exec(
      "CREATE TRIGGER fail_repair BEFORE UPDATE ON patients WHEN OLD.first_name = 'Second' BEGIN SELECT RAISE(ABORT, 'synthetic failure'); END;",
    );
    await expect(reconcileAllPatientStatuses()).rejects.toThrow('synthetic failure');
    expect(t.db.select().from(patients).all()).toEqual(before);
    t.sqlite.exec('DROP TRIGGER fail_repair');
    expect(await reconcileAllPatientStatuses()).toBe(2);
    expect(
      t.db
        .select()
        .from(patients)
        .all()
        .map((p) => p.status),
    ).toEqual(['admitted', 'admitted']);
    await deletePatient(other);
    const deleted = t.db.select().from(patients).where(eq(patients.id, other)).get();
    expect(await reconcilePatientStatus(other)).toBeNull();
    expect(t.db.select().from(patients).where(eq(patients.id, other)).get()).toEqual(deleted);
  });

  it.each(['patient', 'startup'] as const)('does not overwrite a discharge from a stale %s repair', async (scope) => {
    const id = await openEncounter({ patientId, kind: 'admission' });
    t.db.update(patients).set({ status: 'outpatient' }).where(eq(patients.id, patientId)).run();
    const repairing = scope === 'patient' ? reconcilePatientStatus(patientId) : reconcileAllPatientStatuses();
    // The old per-patient function awaited two reads; the startup pass awaited
    // its list. Both could write an obsolete inference after a clinical change.
    for (let step = 0; step < (scope === 'patient' ? 4 : 1); step++) await Promise.resolve();
    await dischargeEncounter(id, {
      dischargedAt: new Date(),
      dischargeType: 'improved',
      nextStatus: 'followup',
    });
    await repairing;
    expect(await patientStatus()).toBe('followup');
  });

  /*
   * The status used to be writable from the patient form, so a patient could
   * be "admitted" with no admission behind them — on the ward list with no
   * bed, no ward and no kardex.
   */
  it('refuses to make a patient admitted without an episode', async () => {
    const id = await createPatient({ firstName: 'مریم', lastName: 'کریمی', status: 'admitted' });
    expect((await t.db.select().from(patients)).find((p) => p.id === id)?.status).toBe('outpatient');

    await updatePatient(id, { status: 'admitted' });
    expect((await t.db.select().from(patients)).find((p) => p.id === id)?.status).toBe('outpatient');
  });

  it('keeps an admitted patient admitted when the form says otherwise', async () => {
    await openEncounter({ patientId, kind: 'admission' });
    await updatePatient(patientId, { status: 'discharged' });
    // The episode is still open; only discharging it can end the stay.
    expect(await patientStatus()).toBe('admitted');
  });

  it('puts a drifted status back in step at startup', async () => {
    await openEncounter({ patientId, kind: 'admission' });
    // What an older build could leave behind: no open episode, still admitted.
    await t.db.update(encounters).set({ isActive: false }).where(eq(encounters.patientId, patientId));

    expect(await reconcileAllPatientStatuses()).toBe(1);
    expect(await patientStatus()).toBe('outpatient');
    // And it is a no-op the second time.
    expect(await reconcileAllPatientStatuses()).toBe(0);
  });

  it('survives deleting the same episode twice', async () => {
    const id = await openEncounter({ patientId, kind: 'admission' });
    await deleteEncounter(id);
    await updatePatient(patientId, { status: 'followup' });

    await deleteEncounter(id);

    // The second delete must not rewrite the status of a patient who moved on.
    expect(await patientStatus()).toBe('followup');
  });
});
