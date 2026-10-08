import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { eq } from 'drizzle-orm';

import { vitals } from '@/db/schema';
import { createPatient } from '@/features/patients/queries';
import { databaseRows } from '@/test/dataset-snapshot';
import { useTestDatabase } from '@/test/db-client';
import { createTestDatabase, type TestDatabase } from '@/test/sqljs';

import { decodeVitalForm, EMPTY_VITAL_FORM, encodeVitalForm, initialVitalForm, parseVitalDocument } from './form-draft';
import {
  commitVitalFormDraft,
  inspectVitalForm,
  replaceVitalFormDraft,
  saveVitalFormDraft,
} from './form-draft-queries';
import { parseVitalForm, vitalChips } from './logic';
import { patientVitalsQuery, recordVital, updateVital, vitalQuery, vitalSeries } from './queries';

jest.mock('@/db/client', () => jest.requireActual('@/test/db-client'));
jest.mock('@/platform/notifications', () => jest.requireActual('@/test/mocks/notifications'));
let t: TestDatabase, patientId: string;
const now = new Date('2026-10-09T08:00:00Z');
beforeEach(async () => {
  t = useTestDatabase(await createTestDatabase());
  patientId = await createPatient({ firstName: 'Synthetic', lastName: 'Glucose units' });
});
async function legacy(value = 125.5) {
  const id = await recordVital({ patientId, heartRate: 80 }, now);
  // A row produced before the additive unit migration, not a new unit-free write.
  t.db.update(vitals).set({ bloodSugar: value, bloodSugarUnit: null }).where(eq(vitals.id, id)).run();
  return (await vitalQuery(id))[0]!;
}

describe('glucose observations retain their recorded units', () => {
  it.each(['mg/dL', 'mmol/L'] as const)('preserves fractional %s through the real SQLite query', async (unit) => {
    const id = await recordVital({ patientId, bloodSugar: 2.5, bloodSugarUnit: unit }, now);
    expect((await vitalQuery(id))[0]).toMatchObject({ bloodSugar: 2.5, bloodSugarUnit: unit });
    expect(t.sqlite.exec('SELECT typeof(blood_sugar) storage FROM vitals')[0]?.values).toEqual([['real']]);
    expect(vitalChips((await vitalQuery(id))[0]!)).toEqual([{ key: 'bs', label: 'قند', value: `2.5 ${unit}` }]);
  });
  it('accepts a decimal in either digit system without a unit-free physiological cutoff', () => {
    expect(parseVitalForm({ ...EMPTY_VITAL_FORM, bloodSugar: '۲٫۵', bloodSugarUnit: 'mmol/L' })).toMatchObject({
      ok: true,
      values: { bloodSugar: 2.5, bloodSugarUnit: 'mmol/L' },
    });
    expect(parseVitalForm({ ...EMPTY_VITAL_FORM, bloodSugar: '0.5', bloodSugarUnit: 'mg/dL' })).toMatchObject({
      ok: true,
      values: { bloodSugar: 0.5, bloodSugarUnit: 'mg/dL' },
    });
  });
  it.each([null, undefined, 'g/L'])('refuses a new observation with unit %s without writing anything', async (unit) => {
    const before = databaseRows(t);
    await expect(recordVital({ patientId, bloodSugar: 125, bloodSugarUnit: unit as null }, now)).rejects.toThrow();
    expect(databaseRows(t)).toEqual(before);
  });
  it.each([-1, NaN, Infinity])('refuses an invalid numeric observation %s', async (value) => {
    const before = databaseRows(t);
    await expect(recordVital({ patientId, bloodSugar: value, bloodSugarUnit: 'mg/dL' }, now)).rejects.toThrow();
    expect(databaseRows(t)).toEqual(before);
  });
  it('does not turn an explicitly recorded zero into a missing observation', async () => {
    const id = await recordVital({ patientId, bloodSugar: 0, bloodSugarUnit: 'mg/dL' }, now);
    expect((await vitalQuery(id))[0]).toMatchObject({ bloodSugar: 0, bloodSugarUnit: 'mg/dL' });
  });
  it('never stores a unit without its observation and clears the pair together', async () => {
    await expect(recordVital({ patientId, heartRate: 80, bloodSugarUnit: 'mg/dL' }, now)).rejects.toThrow();
    const id = await recordVital({ patientId, heartRate: 80, bloodSugar: 100, bloodSugarUnit: 'mg/dL' }, now);
    await updateVital(id, { bloodSugar: null }, now);
    expect((await vitalQuery(id))[0]).toMatchObject({ heartRate: 80, bloodSugar: null, bloodSugarUnit: null });
  });
  it('preserves an unknown legacy unit during an unrelated correction', async () => {
    const row = await legacy();
    await updateVital(row.id, { heartRate: 81 }, now);
    expect((await vitalQuery(row.id))[0]).toMatchObject({ heartRate: 81, bloodSugar: 125.5, bloodSugarUnit: null });
    expect(vitalChips(row).find((chip) => chip.key === 'bs')).toEqual({
      key: 'bs',
      label: 'قند · واحد ثبت نشده',
      value: '125.5',
    });
    const before = databaseRows(t);
    await expect(updateVital(row.id, { bloodSugar: 126 }, now)).rejects.toThrow();
    expect(databaseRows(t)).toEqual(before);
    await updateVital(row.id, { bloodSugar: 126, bloodSugarUnit: 'mg/dL' }, now);
    expect((await vitalQuery(row.id))[0]).toMatchObject({ bloodSugar: 126, bloodSugarUnit: 'mg/dL' });
  });
  it.each(['number', 'unit'] as const)('refuses a stale pair after another writer changes its %s', async (kind) => {
    const id = await recordVital({ patientId, bloodSugar: 100, bloodSugarUnit: 'mg/dL' }, now);
    const original = (await vitalQuery(id))[0]!;
    await updateVital(id, kind === 'number' ? { bloodSugar: 110 } : { bloodSugarUnit: 'mmol/L' }, now);
    const before = databaseRows(t);
    await expect(
      updateVital(id, kind === 'number' ? { bloodSugarUnit: 'mmol/L' } : { bloodSugar: 120 }, now, original),
    ).rejects.toThrow();
    expect(databaseRows(t)).toEqual(before);
  });
  it('never combines known units or plots unknown/invalid units as a continuous series', async () => {
    await legacy(999);
    for (const [value, unit] of [
      [100, 'mg/dL'],
      [110, 'mg/dL'],
      [2.5, 'mmol/L'],
      [3.5, 'mmol/L'],
    ] as const)
      await recordVital({ patientId, bloodSugar: value, bloodSugarUnit: unit }, new Date(now.getTime() + value * 1000));
    const bad = await recordVital({ patientId, bloodSugar: 888, bloodSugarUnit: 'mg/dL' }, now);
    t.sqlite.exec(`UPDATE vitals SET blood_sugar_unit='invalid' WHERE id='${bad}'`);
    const rows = await patientVitalsQuery(patientId);
    expect(vitalSeries(rows, 'bloodSugar')).toEqual([]);
    expect(vitalSeries(rows, 'bloodSugar', 'mg/dL').map((p) => p.value)).toEqual([100, 110]);
    expect(vitalSeries(rows, 'bloodSugar', 'mmol/L').map((p) => p.value)).toEqual([2.5, 3.5]);
    expect(vitalChips((await vitalQuery(bad))[0]!).find((chip) => chip.key === 'bs')?.label).toBe('قند · واحد نامعتبر');
  });
});

describe('versioned raw glucose input and atomic publication', () => {
  it('acknowledges successive number/unit edits without replacing the original basis', async () => {
    const document = initialVitalForm(null, null, now);
    const initial = structuredClone(document.initial);
    document.fields.bloodSugar = '2.5';
    expect(await saveVitalFormDraft('raw', patientId, null, document, 0)).toBe(1);
    document.fields.bloodSugarUnit = 'mmol/L';
    expect(await saveVitalFormDraft('raw', patientId, null, document, 1)).toBe(2);
    document.fields.bloodSugar = '3.5';
    expect(await saveVitalFormDraft('raw', patientId, null, document, 2)).toBe(3);
    const id = await commitVitalFormDraft('raw', patientId, null, 3, now);
    expect((await vitalQuery(id))[0]).toMatchObject({ bloodSugar: 3.5, bloodSugarUnit: 'mmol/L' });
    expect(document.initial).toEqual(initial);
  });
  it('decodes old raw input without inferring a unit or rewriting its exact text', async () => {
    const row = await legacy();
    const old = JSON.parse(encodeVitalForm(initialVitalForm(row, null, now)));
    old.version = 1;
    delete old.fields.bloodSugarUnit;
    delete old.initial.bloodSugarUnit;
    delete old.base.bloodSugarUnit;
    old.fields.notes = '  English / فارسی\n unfinished  ';
    const upgraded = decodeVitalForm(JSON.stringify(old));
    expect(upgraded).toMatchObject({
      version: 2,
      fields: { bloodSugar: '125.5', bloodSugarUnit: '', notes: old.fields.notes },
      base: { bloodSugarUnit: null },
    });
    expect(parseVitalDocument(upgraded)).toMatchObject({
      ok: true,
      values: { bloodSugar: 125.5, bloodSugarUnit: null },
    });
    upgraded.fields.heartRate = '81';
    await saveVitalFormDraft('raw', patientId, row.id, upgraded, 0);
    await commitVitalFormDraft('raw', patientId, row.id, 1, now);
    expect((await vitalQuery(row.id))[0]).toMatchObject({ heartRate: 81, bloodSugar: 125.5, bloodSugarUnit: null });
  });
  it('retains an old new-entry draft but requires a unit before publication', async () => {
    const old = JSON.parse(encodeVitalForm(initialVitalForm(null, null, now)));
    old.version = 1;
    delete old.fields.bloodSugarUnit;
    delete old.initial.bloodSugarUnit;
    old.fields.bloodSugar = '2.5';
    const document = decodeVitalForm(JSON.stringify(old));
    await saveVitalFormDraft('raw', patientId, null, document, 0);
    const before = databaseRows(t);
    await expect(commitVitalFormDraft('raw', patientId, null, 1, now)).rejects.toThrow();
    expect(databaseRows(t)).toEqual(before);
    document.fields.bloodSugarUnit = 'mmol/L';
    await saveVitalFormDraft('raw', patientId, null, document, 1);
    const id = await commitVitalFormDraft('raw', patientId, null, 2, now);
    expect((await vitalQuery(id))[0]).toMatchObject({ bloodSugar: 2.5, bloodSugarUnit: 'mmol/L' });
  });
  it('refuses a changed legacy raw value until its unit is explicit', async () => {
    const row = await legacy();
    const document = initialVitalForm(row, null, now);
    document.fields.bloodSugar = '125.50';
    expect(parseVitalDocument(document)).toMatchObject({ ok: false, errors: { bloodSugarUnit: expect.any(String) } });
  });
  it('refuses mixed-writer number/unit publication and rebases the whole pair only on explicit Keep mine', async () => {
    const id = await recordVital({ patientId, bloodSugar: 100, bloodSugarUnit: 'mg/dL', heartRate: 80 }, now);
    const document = initialVitalForm((await vitalQuery(id))[0]!, null, now);
    document.fields.bloodSugarUnit = 'mmol/L';
    await saveVitalFormDraft('raw', patientId, id, document, 0);
    await updateVital(id, { bloodSugar: 110, heartRate: 82 }, now);
    const before = databaseRows(t);
    await expect(commitVitalFormDraft('raw', patientId, id, 1, now)).rejects.toThrow();
    expect(databaseRows(t)).toEqual(before);
    const shown = await inspectVitalForm('raw', patientId, id);
    const kept = await replaceVitalFormDraft('raw', patientId, id, document, shown, now);
    expect(kept.document.fields).toMatchObject({ bloodSugar: '100', bloodSugarUnit: 'mmol/L', heartRate: '82' });
    await commitVitalFormDraft('raw', patientId, id, kept.revision, now);
    expect((await vitalQuery(id))[0]).toMatchObject({ bloodSugar: 100, bloodSugarUnit: 'mmol/L', heartRate: 82 });
  });
});
