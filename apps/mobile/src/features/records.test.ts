import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { eq } from 'drizzle-orm';

import { encounters, labValues, notes, orders, patients } from '@/db/schema';
import { useTestDatabase } from '@/test/db-client';
import { resetNotifications } from '@/test/mocks/notifications';
import { createTestDatabase, type TestDatabase } from '@/test/sqljs';

import { deleteEncounter, dischargeEncounter, openEncounter, updateEncounter } from './encounters/queries';
import { createOrder, patientOrdersQuery, setOrderStatus, suggestOrderNames } from './kardex/queries';
import { analyteSeriesQuery, createLabPanel, updateLabPanel } from './labs/queries';
import { reflagLabValuesIfNeeded } from './labs/reflag';
import { createNote, updateNote } from './notes/queries';
import { createPatient } from './patients/queries';
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

  it('leaves the status alone when a closed episode is deleted', async () => {
    const id = await openEncounter({ patientId, kind: 'admission' });
    await dischargeEncounter(id, { dischargedAt: new Date(), dischargeType: 'improved', nextStatus: 'followup' });
    const second = await openEncounter({ patientId, kind: 'admission' });

    await deleteEncounter(id);

    // The one the patient is actually in still decides.
    expect(await patientStatus()).toBe('admitted');
    expect((await t.db.select().from(encounters)).find((e) => e.id === second)?.isActive).toBe(true);
  });
});
