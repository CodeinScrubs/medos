import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import { encounters, labValues, notes, orders, patients } from '@/db/schema';
import { useTestDatabase } from '@/test/db-client';
import { resetNotifications } from '@/test/mocks/notifications';
import { createTestDatabase, type TestDatabase } from '@/test/sqljs';

import { dischargeEncounter, openEncounter } from './encounters/queries';
import { createOrder, setOrderStatus, suggestOrderNames } from './kardex/queries';
import { analyteSeriesQuery, createLabPanel, updateLabPanel } from './labs/queries';
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
