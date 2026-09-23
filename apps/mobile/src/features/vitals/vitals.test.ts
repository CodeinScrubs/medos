import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import { auditLog } from '@/db/schema';
import { useTestDatabase } from '@/test/db-client';
import { createTestDatabase, type TestDatabase } from '@/test/sqljs';

import {
  formatBloodPressureInput,
  hasAnyVital,
  parseBloodPressure,
  parseVitalForm,
  vitalChips,
  type VitalForm,
} from './logic';
import { deleteVital, patientVitalsQuery, recordVital, updateVital, vitalQuery, vitalSeries } from './queries';
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

describe('reading a blood pressure', () => {
  it('takes it the way it is written', () => {
    expect(parseBloodPressure('120/80')).toEqual({ systolic: 120, diastolic: 80 });
  });

  /*
   * A Persian keyboard emits ۰-۹, and the record stores Latin digits. Typing
   * on the phone must not produce a different number from typing on a laptop.
   */
  it('accepts Persian digits and stores Latin ones', () => {
    expect(parseBloodPressure('۱۲۰/۸۰')).toEqual({ systolic: 120, diastolic: 80 });
    expect(parseBloodPressure('۹۰/۶۰')).toEqual({ systolic: 90, diastolic: 60 });
  });

  it('refuses anything that is not two whole numbers', () => {
    expect(parseBloodPressure('120')).toBeNull();
    expect(parseBloodPressure('120/')).toEqual({ systolic: 120, diastolic: null });
    expect(parseBloodPressure('/80')).toEqual({ systolic: null, diastolic: 80 });
    expect(parseBloodPressure('120٫80')).toBeNull();
    expect(parseBloodPressure('/')).toBeNull();
    expect(parseBloodPressure('120/80/40')).toBeNull();
    expect(parseBloodPressure('abc/80')).toBeNull();
    expect(parseBloodPressure('120.5/80')).toBeNull();
    expect(parseBloodPressure('0/80')).toBeNull();
    expect(parseBloodPressure('')).toBeNull();
    expect(parseBloodPressure(null)).toBeNull();
  });

  it('comes back out in the same shape for editing', () => {
    expect(formatBloodPressureInput(120, 80)).toBe('120/80');
    expect(formatBloodPressureInput(120, null)).toBe('120/');
    expect(formatBloodPressureInput(null, null)).toBe('');
  });
});

describe('a set of observations', () => {
  it('is not a reading when nothing was measured', () => {
    expect(hasAnyVital({})).toBe(false);
    expect(hasAnyVital({ systolic: null, heartRate: null, urineOutput: '   ' })).toBe(false);
    expect(hasAnyVital({ heartRate: 88 })).toBe(true);
    expect(hasAnyVital({ urineOutput: '1200 mL' })).toBe(true);
  });

  /*
   * A blank is "not taken", which is a different fact from a number. Showing a
   * dash for it would make a missed observation look like a recorded one.
   */
  it('shows only what was actually taken', () => {
    const chips = vitalChips({ systolic: 120, diastolic: 80, heartRate: 88, temperature: null });
    expect(chips.map((c) => c.key)).toEqual(['bp', 'hr']);
    expect(chips[0]?.value).toBe('120/80');
  });

  it('keeps a partial blood pressure visible with its own label', () => {
    expect(vitalChips({ systolic: 120, diastolic: null })).toEqual([
      { key: 'systolic', label: 'فشار سیستول', value: '120' },
    ]);
  });
});

describe('recording observations', () => {
  it('audits correction and deletion without logging the measurements', async () => {
    const id = await recordVital({ patientId, heartRate: 80 });
    await updateVital(id, { heartRate: 82 });
    await deleteVital(id);
    const logs = t.db.select().from(auditLog).all();
    expect(logs.map((entry) => entry.action)).toEqual(['vital.updated', 'vital.deleted']);
    expect(logs.every((entry) => entry.entityId === id && entry.detail == null && entry.summary == null)).toBe(true);
  });
  it('rejects nonfinite measurements without altering the previous reading', async () => {
    const id = await recordVital({ patientId, heartRate: 80, temperature: 37 });
    await expect(updateVital(id, { heartRate: NaN, temperature: 38 })).rejects.toThrow();
    expect((await vitalQuery(id))[0]?.heartRate).toBe(80);
    expect((await vitalQuery(id))[0]?.temperature).toBe(37);
    await expect(recordVital({ patientId, spo2: Infinity })).rejects.toThrow();
    await expect(recordVital({ patientId })).rejects.toThrow();
  });

  it('rejects an invalid form before writing and preserves an existing partial BP on valid edits', async () => {
    const id = await recordVital({ patientId, systolic: 120, heartRate: 80, temperature: 37 });
    const blank: VitalForm = {
      bp: '120/',
      heartRate: '12,5',
      temperature: '38',
      respRate: '',
      spo2: '',
      bloodSugar: '',
      weightKg: '',
      heightCm: '',
      painScore: '',
      urineOutput: '',
      notes: '',
    };
    const invalid = parseVitalForm(blank);
    expect(invalid.ok).toBe(false);
    if (invalid.ok) await updateVital(id, invalid.values);
    expect((await vitalQuery(id))[0]?.heartRate).toBe(80);
    expect((await vitalQuery(id))[0]?.temperature).toBe(37);
    const valid = parseVitalForm({ ...blank, heartRate: '۸۰', temperature: '۳۸٫۵' });
    expect(valid.ok).toBe(true);
    if (valid.ok) await updateVital(id, valid.values);
    const [row] = await vitalQuery(id);
    expect(row?.systolic).toBe(120);
    expect(row?.diastolic).toBeNull();
    expect(row?.temperature).toBe(38.5);
  });

  it('preserves the stated observation time and rejects an invalid timestamp', async () => {
    const measuredAt = new Date('2026-08-01T07:31:00Z');
    const id = await recordVital({ patientId, heartRate: 80, measuredAt });
    await updateVital(id, { temperature: 37.5 });
    expect((await vitalQuery(id))[0]?.measuredAt).toEqual(measuredAt);
    await expect(updateVital(id, { measuredAt: new Date('invalid') })).rejects.toThrow();
  });
  it('attaches itself to the open admission', async () => {
    const encounterId = await openEncounter({ patientId, kind: 'admission' });
    const id = await recordVital({ patientId, systolic: 120, diastolic: 80, heartRate: 88 });

    const [row] = await vitalQuery(id);
    expect(row?.encounterId).toBe(encounterId);
    expect(row?.systolic).toBe(120);
    expect(row?.respRate).toBeNull();
  });

  /*
   * Correcting one value must not quietly drop the ones taken with it.
   */
  it('leaves untouched fields alone when one is corrected', async () => {
    const id = await recordVital({ patientId, systolic: 120, diastolic: 80, temperature: 37.2 });
    await updateVital(id, { systolic: 130, diastolic: 85 });

    const [row] = await vitalQuery(id);
    expect(row?.systolic).toBe(130);
    expect(row?.temperature).toBe(37.2);
  });

  it('clears a value only when asked to', async () => {
    const id = await recordVital({ patientId, heartRate: 88, temperature: 37.2 });
    await updateVital(id, { temperature: null });

    const [row] = await vitalQuery(id);
    expect(row?.temperature).toBeNull();
    expect(row?.heartRate).toBe(88);
  });

  it('is soft-deleted like everything else', async () => {
    const id = await recordVital({ patientId, heartRate: 88 });
    await deleteVital(id);
    expect(await vitalQuery(id)).toHaveLength(0);
    expect(await patientVitalsQuery(patientId)).toHaveLength(0);
  });

  it('lists newest first', async () => {
    const older = await recordVital({ patientId, heartRate: 70, measuredAt: new Date('2026-09-20T06:00:00Z') });
    const newer = await recordVital({ patientId, heartRate: 92, measuredAt: new Date('2026-09-21T06:00:00Z') });
    expect((await patientVitalsQuery(patientId)).map((r) => r.id)).toEqual([newer, older]);
  });
});

describe('a series over time', () => {
  /*
   * A reading where that measurement was not taken is not a zero and not a
   * repeat of the last one — it is simply not a point on the line.
   */
  it('skips the readings where the measurement was not taken', async () => {
    await recordVital({ patientId, heartRate: 70, measuredAt: new Date('2026-09-19T06:00:00Z') });
    await recordVital({ patientId, systolic: 120, diastolic: 80, measuredAt: new Date('2026-09-20T06:00:00Z') });
    await recordVital({ patientId, heartRate: 92, measuredAt: new Date('2026-09-21T06:00:00Z') });

    const rows = await patientVitalsQuery(patientId);
    const series = vitalSeries(rows, 'heartRate');
    expect(series.map((p) => p.value)).toEqual([70, 92]);
  });

  it('runs oldest to newest, whatever order the rows arrived in', async () => {
    await recordVital({ patientId, spo2: 97, measuredAt: new Date('2026-09-21T06:00:00Z') });
    await recordVital({ patientId, spo2: 93, measuredAt: new Date('2026-09-19T06:00:00Z') });

    const series = vitalSeries(await patientVitalsQuery(patientId), 'spo2');
    expect(series.map((p) => p.value)).toEqual([93, 97]);
  });
});
