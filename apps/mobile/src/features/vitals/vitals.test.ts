import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { eq } from 'drizzle-orm';

import { auditLog, encounters, vitals } from '@/db/schema';
import { softDelete } from '@/lib/ids';
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
import { createPatient, deletePatient } from '../patients/queries';

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

  /*
   * An SpO2 of 150 was stored without a word. These are the limits of what can
   * be measured at all — typo catching — and every value inside them is still
   * stored without comment.
   */
  it('refuses a value that cannot be a measurement', () => {
    const blank = {
      bp: '',
      heartRate: '',
      respRate: '',
      temperature: '',
      spo2: '',
      bloodSugar: '',
      weightKg: '',
      heightCm: '',
      painScore: '',
      urineOutput: '',
      notes: '',
    };
    const spo2 = parseVitalForm({ ...blank, spo2: '150' });
    expect(spo2.ok).toBe(false);
    expect(!spo2.ok && spo2.errors.spo2).toMatch(/0 تا 100/);
    expect(parseVitalForm({ ...blank, temperature: '385' }).ok).toBe(false);
    expect(parseVitalForm({ ...blank, painScore: '12' }).ok).toBe(false);
    expect(parseVitalForm({ ...blank, bp: '80/120' }).ok).toBe(false);
    expect(parseVitalForm({ ...blank, bp: '400/80' }).ok).toBe(false);
    // Abnormal is not impossible.
    expect(parseVitalForm({ ...blank, spo2: '72', temperature: '41.2', bp: '70/40', heartRate: '180' }).ok).toBe(true);
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

describe('observation ownership and transaction boundaries', () => {
  it('refuses new readings for a soft-deleted patient', async () => {
    await deletePatient(patientId);
    await expect(recordVital({ patientId, heartRate: 80 })).rejects.toThrow();
    expect(t.db.select().from(vitals).all()).toEqual([]);
  });

  it('refuses a correction after the patient was deleted, preserving the reading', async () => {
    const id = await recordVital({ patientId, heartRate: 80, temperature: 37 });
    const before = t.db.select().from(vitals).where(eq(vitals.id, id)).get();
    await deletePatient(patientId);
    await expect(updateVital(id, { heartRate: 90 })).rejects.toThrow();
    expect(t.db.select().from(vitals).where(eq(vitals.id, id)).get()).toEqual(before);
    expect(
      t.db
        .select()
        .from(auditLog)
        .all()
        .some((entry) => entry.action === 'vital.updated'),
    ).toBe(false);
  });

  async function invalidEncounter(kind: 'foreign' | 'deleted' | 'missing') {
    const owner = kind === 'foreign' ? await createPatient({ firstName: 'Synthetic', lastName: 'Other' }) : patientId;
    const id = await openEncounter({ patientId: owner, kind: 'admission' });
    if (kind === 'deleted') t.db.update(encounters).set(softDelete()).where(eq(encounters.id, id)).run();
    return kind === 'missing' ? 'missing-synthetic-encounter' : id;
  }

  it.each(['foreign', 'deleted', 'missing'] as const)('refuses a %s encounter on creation', async (kind) => {
    const encounterId = await invalidEncounter(kind);
    await expect(recordVital({ patientId, encounterId, heartRate: 80 })).rejects.toThrow();
    expect(t.db.select().from(vitals).all()).toEqual([]);
  });

  it.each(['foreign', 'deleted', 'missing'] as const)(
    'refuses a %s encounter in a correction atomically',
    async (kind) => {
      const id = await recordVital({ patientId, encounterId: null, heartRate: 80, temperature: 37 });
      const before = t.db.select().from(vitals).where(eq(vitals.id, id)).get();
      const encounterId = await invalidEncounter(kind);
      await expect(updateVital(id, { encounterId, heartRate: 90 })).rejects.toThrow();
      expect(t.db.select().from(vitals).where(eq(vitals.id, id)).get()).toEqual(before);
    },
  );

  it('validates simultaneous clears against the latest row so they cannot leave an empty reading', async () => {
    const id = await recordVital({ patientId, encounterId: null, heartRate: 80, temperature: 37 });
    const results = await Promise.allSettled([
      updateVital(id, { heartRate: null }),
      updateVital(id, { temperature: null }),
    ]);
    expect(results.map((result) => result.status)).toEqual(['fulfilled', 'rejected']);
    const row = (await vitalQuery(id))[0]!;
    expect(row.heartRate).toBeNull();
    expect(row.temperature).toBe(37);
    expect(hasAnyVital(row)).toBe(true);
  });

  it('allows an explicit owned historical encounter and preserves an explicit no-encounter choice', async () => {
    const encounterId = await openEncounter({ patientId, kind: 'admission' });
    t.db.update(encounters).set({ isActive: false }).where(eq(encounters.id, encounterId)).run();
    const historical = await recordVital({ patientId, encounterId, heartRate: 80 });
    await openEncounter({ patientId, kind: 'admission' });
    const unattached = await recordVital({ patientId, encounterId: null, heartRate: 81 });
    expect((await vitalQuery(historical))[0]?.encounterId).toBe(encounterId);
    expect((await vitalQuery(unattached))[0]?.encounterId).toBeNull();
  });

  it('rejects a stale changed field without overwriting a newer correction', async () => {
    const id = await recordVital({ patientId, heartRate: 80, temperature: 37 });
    const basis = (await vitalQuery(id))[0]!;
    await updateVital(id, { heartRate: 82 });
    const current = (await vitalQuery(id))[0]!;
    await expect(updateVital(id, { heartRate: 90 }, new Date(), basis)).rejects.toThrow();
    expect((await vitalQuery(id))[0]).toEqual(current);
  });

  it('merges a changed field while preserving a newer unrelated correction', async () => {
    const id = await recordVital({ patientId, heartRate: 80, temperature: 37 });
    const basis = (await vitalQuery(id))[0]!;
    await updateVital(id, { temperature: 38 });
    await updateVital(id, { heartRate: 90 }, new Date(), basis);
    expect((await vitalQuery(id))[0]).toMatchObject({ heartRate: 90, temperature: 38 });
  });

  it('refuses a foreign edit basis instead of using it to approve a correction', async () => {
    const first = await recordVital({ patientId, heartRate: 80 });
    const second = await recordVital({ patientId, heartRate: 80 });
    const basis = (await vitalQuery(first))[0]!;
    await expect(updateVital(second, { heartRate: 90 }, new Date(), basis)).rejects.toThrow();
    expect((await vitalQuery(second))[0]?.heartRate).toBe(80);
  });

  it('refuses an unexpected patient identity field from an untyped caller', async () => {
    const id = await recordVital({ patientId, heartRate: 80 });
    const other = await createPatient({ firstName: 'Synthetic', lastName: 'Other' });
    const before = (await vitalQuery(id))[0]!;
    const patch = { patientId: other, heartRate: 90 } as unknown as Parameters<typeof updateVital>[1];
    await expect(updateVital(id, patch)).rejects.toThrow();
    expect((await vitalQuery(id))[0]).toEqual(before);
  });

  it('does not audit an unchanged correction or a repeated deletion as a new action', async () => {
    const id = await recordVital({ patientId, heartRate: 80 });
    const before = (await vitalQuery(id))[0]!;
    await updateVital(id, { heartRate: undefined });
    expect((await vitalQuery(id))[0]).toEqual(before);
    await deleteVital(id);
    await deleteVital(id);
    expect(
      t.db
        .select()
        .from(auditLog)
        .all()
        .map((row) => row.action),
    ).toEqual(['vital.deleted']);
  });

  it.each(['measuredAt', 'encounterId'] as const)(
    'refuses a correction after the original %s context changed',
    async (key) => {
      const id = await recordVital({ patientId, encounterId: null, heartRate: 80 });
      const basis = (await vitalQuery(id))[0]!;
      const change =
        key === 'measuredAt'
          ? { measuredAt: new Date('2026-10-01T08:00:00Z') }
          : { encounterId: await openEncounter({ patientId, kind: 'admission' }) };
      await updateVital(id, change);
      const current = (await vitalQuery(id))[0]!;
      await expect(updateVital(id, { heartRate: 90 }, new Date(), basis)).rejects.toThrow();
      expect((await vitalQuery(id))[0]).toEqual(current);
    },
  );
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
