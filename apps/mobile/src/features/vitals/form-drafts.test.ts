import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { eq } from 'drizzle-orm';

import { encounters, vitalFormDrafts, vitals } from '@/db/schema';
import { openEncounter } from '@/features/encounters/queries';
import { createPatient, deletePatient } from '@/features/patients/queries';
import { datasetGeneration, DatasetChangedError } from '@/lib/dataset-write';
import { databaseRows, snapshotDataset } from '@/test/dataset-snapshot';
import { useTestDatabase } from '@/test/db-client';
import { createTestDatabase, type TestDatabase } from '@/test/sqljs';

import { decodeVitalForm, initialVitalForm, vitalFormValues, VitalFormConflict } from './form-draft';
import {
  commitVitalFormDraft,
  discardVitalFormDraft,
  inspectVitalForm,
  replaceVitalFormDraft,
  saveVitalFormDraft,
  vitalFormQuery,
} from './form-draft-queries';
import { deleteVital, recordVital, updateVital, vitalQuery } from './queries';

jest.mock('@/db/client', () => jest.requireActual('@/test/db-client'));
jest.mock('@/platform/notifications', () => jest.requireActual('@/test/mocks/notifications'));
let t: TestDatabase, patientId: string;
const now = new Date('2026-10-09T10:00:00Z');
const draft = () => t.db.select().from(vitalFormDrafts).get()!;
const readings = () => t.db.select().from(vitals).all();
const newDocument = () => {
  const document = initialVitalForm(null, null, now);
  document.fields.heartRate = '80';
  return document;
};
beforeEach(async () => {
  t = useTestDatabase(await createTestDatabase());
  patientId = await createPatient({ firstName: 'Synthetic', lastName: 'Raw observations' });
});
describe('raw observation persistence and clinical publication', () => {
  it('retains exact invalid numbers, date, clock and text without inventing observations', async () => {
    const document = newDocument();
    document.fields.bp = '  120/x  ';
    document.fields.temperature = '۳۸,';
    document.fields.date = { dateText: '۱۴۰۵/۱۲/۳۰', clockText: '2:', customOpen: true };
    document.fields.notes = '  English / فارسی\n unfinished  ';
    await saveVitalFormDraft('raw', patientId, null, document, 0);
    expect(decodeVitalForm(draft().body)).toEqual(document);
    const before = databaseRows(t);
    await expect(commitVitalFormDraft('raw', patientId, null, 1, now)).rejects.toThrow();
    expect(databaseRows(t)).toEqual(before);
    expect(readings()).toEqual([]);
  });
  it.each([
    ['invalid date', '1400/12/30', '09:30'],
    ['invalid clock', '1405/07/17', '25:00'],
    ['incomplete date', '1405/0', '09:30'],
    ['ambiguous pulse', '1405/07/17', '09:30'],
  ])('refuses %s while keeping the acknowledged raw bytes', async (kind, dateText, clockText) => {
    const document = newDocument();
    document.fields.date = { dateText, clockText, customOpen: true };
    if (kind === 'ambiguous pulse') document.fields.heartRate = '8,0';
    await saveVitalFormDraft('raw', patientId, null, document, 0);
    const before = databaseRows(t);
    await expect(commitVitalFormDraft('raw', patientId, null, 1, now)).rejects.toThrow();
    expect(databaseRows(t)).toEqual(before);
  });
  it('captures null admission and replays one publication without adding history or audit rows', async () => {
    await saveVitalFormDraft('raw', patientId, null, newDocument(), 0);
    await openEncounter({ patientId, kind: 'admission', admittedAt: now });
    const id = await commitVitalFormDraft('raw', patientId, null, 1, now);
    expect(readings()).toMatchObject([
      { id, encounterId: null, heartRate: 80, temperature: null, systolic: null, diastolic: null },
    ]);
    const after = databaseRows(t);
    expect(await commitVitalFormDraft('raw', patientId, null, 1, now)).toBe(id);
    expect(databaseRows(t)).toEqual(after);
  });
  it('retains the first admission after it closes and a different one becomes active', async () => {
    const encounterId = await openEncounter({ patientId, kind: 'admission', admittedAt: now });
    const row = (await vitalFormQuery(patientId, null))[0]!;
    const document = initialVitalForm(null, row.active!.id, now);
    document.fields.heartRate = '80';
    await saveVitalFormDraft('raw', patientId, null, document, 0);
    t.db.update(encounters).set({ isActive: false, dischargedAt: now }).where(eq(encounters.id, encounterId)).run();
    await openEncounter({ patientId, kind: 'admission', admittedAt: new Date(now.getTime() + 1000) });
    await commitVitalFormDraft('raw', patientId, null, 1, now);
    expect(readings()[0]?.encounterId).toBe(encounterId);
  });
  it.each(['new', 'edit'])('rolls back %s publication when draft retirement fails', async (kind) => {
    const id = kind === 'edit' ? await recordVital({ patientId, heartRate: 70 }, now) : null;
    const document = initialVitalForm(id ? readings()[0]! : null, null, now);
    document.fields.heartRate = '80';
    await saveVitalFormDraft('raw', patientId, id, document, 0);
    const before = databaseRows(t);
    t.sqlite.exec(
      "CREATE TRIGGER fail_retire BEFORE UPDATE ON vital_form_drafts BEGIN SELECT RAISE(ABORT, 'synthetic'); END",
    );
    await expect(commitVitalFormDraft('raw', patientId, id, 1, now)).rejects.toThrow();
    expect(databaseRows(t)).toEqual(before);
    t.sqlite.exec('DROP TRIGGER fail_retire');
    await commitVitalFormDraft('raw', patientId, id, 1, now);
    expect(readings()).toHaveLength(1);
    expect(readings()[0]?.heartRate).toBe(80);
  });
  it('keeps raw input on a deleted parent but never publishes it', async () => {
    await deletePatient(patientId);
    await saveVitalFormDraft('raw', patientId, null, newDocument(), 0);
    const before = databaseRows(t);
    await expect(commitVitalFormDraft('raw', patientId, null, 1, now)).rejects.toThrow();
    expect(databaseRows(t)).toEqual(before);
  });
  it('never revives a deleted reading or its retired publication', async () => {
    await saveVitalFormDraft('raw', patientId, null, newDocument(), 0);
    const id = await commitVitalFormDraft('raw', patientId, null, 1, now);
    await deleteVital(id, now);
    const before = databaseRows(t);
    await expect(commitVitalFormDraft('raw', patientId, null, 1, now)).rejects.toThrow(VitalFormConflict);
    expect(databaseRows(t)).toEqual(before);
  });
  it('preserves sub-minute time, exact untouched text and a separate correction', async () => {
    const time = new Date('2026-10-01T12:34:56.789Z');
    const id = await recordVital({ patientId, heartRate: 70, temperature: 37, measuredAt: time }, now);
    t.db.update(vitals).set({ notes: '  Exact note\n  ' }).where(eq(vitals.id, id)).run();
    const document = initialVitalForm(readings()[0]!, null, now);
    document.fields.heartRate = '80';
    await saveVitalFormDraft('raw', patientId, id, document, 0);
    await updateVital(id, { temperature: 38 }, now);
    await commitVitalFormDraft('raw', patientId, id, 1, now);
    expect(readings()[0]).toMatchObject({
      heartRate: 80,
      temperature: 38,
      notes: '  Exact note\n  ',
      measuredAt: time,
    });
  });
  it('refuses mixed-writer BP even when only one local half was corrected', async () => {
    const id = await recordVital({ patientId, systolic: 120, diastolic: 80 }, now);
    const document = initialVitalForm(readings()[0]!, null, now);
    document.fields.bp = '100/80';
    await saveVitalFormDraft('raw', patientId, id, document, 0);
    await updateVital(id, { diastolic: 110 }, now);
    const before = databaseRows(t);
    await expect(commitVitalFormDraft('raw', patientId, id, 1, now)).rejects.toThrow(VitalFormConflict);
    expect(databaseRows(t)).toEqual(before);
  });
  it('rechecks the compared snapshot and keeps only locally changed fields on explicit rebase', async () => {
    const id = await recordVital({ patientId, heartRate: 70, temperature: 37 }, now);
    const document = initialVitalForm(readings()[0]!, null, now);
    document.fields.heartRate = '80';
    await saveVitalFormDraft('raw', patientId, id, document, 0);
    await updateVital(id, { heartRate: 75, temperature: 38 }, now);
    await expect(commitVitalFormDraft('raw', patientId, id, 1, now)).rejects.toThrow(VitalFormConflict);
    const shown = await inspectVitalForm('raw', patientId, id);
    await updateVital(id, { heartRate: 76 }, now);
    const before = databaseRows(t);
    await expect(replaceVitalFormDraft('raw', patientId, id, document, shown, now)).rejects.toThrow(VitalFormConflict);
    expect(databaseRows(t)).toEqual(before);
    const next = await replaceVitalFormDraft(
      'raw',
      patientId,
      id,
      document,
      await inspectVitalForm('raw', patientId, id),
      now,
    );
    next.document.fields.notes = '  Continue after rebase  ';
    const revision = await saveVitalFormDraft(next.id, patientId, id, next.document, next.revision);
    await commitVitalFormDraft(next.id, patientId, id, revision, now);
    expect(readings()[0]).toMatchObject({ heartRate: 80, temperature: 38, notes: 'Continue after rebase' });
  });
  it('does not turn merely opening the date control into an intentional time change on rebase', async () => {
    const id = await recordVital({ patientId, heartRate: 70, measuredAt: new Date('2026-10-01T08:00:10.123Z') }, now);
    const document = initialVitalForm(readings()[0]!, null, now);
    document.fields.heartRate = '80';
    document.fields.date.customOpen = true;
    await saveVitalFormDraft('raw', patientId, id, document, 0);
    const time = new Date('2026-10-02T09:00:20.456Z');
    await updateVital(id, { measuredAt: time }, now);
    await expect(commitVitalFormDraft('raw', patientId, id, 1, now)).rejects.toThrow(VitalFormConflict);
    const next = await replaceVitalFormDraft(
      'raw',
      patientId,
      id,
      document,
      await inspectVitalForm('raw', patientId, id),
      now,
    );
    expect(vitalFormValues(next.document, now).measuredAt).toEqual(time);
    await commitVitalFormDraft(next.id, patientId, id, next.revision, now);
    expect(readings()[0]).toMatchObject({ measuredAt: time, heartRate: 80 });
  });
  it('refuses stale and competing draft writes without replacing either raw value', async () => {
    const document = newDocument();
    await saveVitalFormDraft('raw', patientId, null, document, 0);
    document.fields.heartRate = '81';
    const before = databaseRows(t);
    await expect(saveVitalFormDraft('other', patientId, null, document, 0)).rejects.toThrow(VitalFormConflict);
    await expect(saveVitalFormDraft('raw', patientId, null, document, 0)).rejects.toThrow(VitalFormConflict);
    expect(databaseRows(t)).toEqual(before);
  });
  it('preserves unreadable draft bytes rather than treating them as a blank form', async () => {
    await saveVitalFormDraft('raw', patientId, null, newDocument(), 0);
    t.db.update(vitalFormDrafts).set({ body: '{unsupported' }).run();
    const before = databaseRows(t);
    expect(() => decodeVitalForm(draft().body)).toThrow('قابل خواندن نیست');
    await expect(commitVitalFormDraft('raw', patientId, null, 1, now)).rejects.toThrow();
    expect(databaseRows(t)).toEqual(before);
  });
  it('fences every stale mutation and comparison after actual same-ID dataset replacement', async () => {
    const generation = datasetGeneration(),
      document = newDocument();
    await saveVitalFormDraft('raw', patientId, null, document, 0);
    const shown = await inspectVitalForm('raw', patientId, null);
    snapshotDataset(t)();
    const before = databaseRows(t);
    const actions = [
      () => saveVitalFormDraft('raw', patientId, null, document, 1, generation),
      () => commitVitalFormDraft('raw', patientId, null, 1, now, generation),
      () => inspectVitalForm('raw', patientId, null, generation),
      () => replaceVitalFormDraft('raw', patientId, null, document, shown, now, generation),
      () => discardVitalFormDraft('raw', patientId, null, 1, generation),
    ];
    for (const action of actions) await expect(action()).rejects.toThrow(DatasetChangedError);
    expect(databaseRows(t)).toEqual(before);
  });
  it('soft discards only the acknowledged draft and never erases its clinical basis', async () => {
    const id = await recordVital({ patientId, heartRate: 70 }, now);
    const document = initialVitalForm(readings()[0]!, null, now);
    document.fields.heartRate = '80';
    await saveVitalFormDraft('raw', patientId, id, document, 0);
    await expect(discardVitalFormDraft('raw', patientId, id, 0)).rejects.toThrow(VitalFormConflict);
    await discardVitalFormDraft('raw', patientId, id, 1);
    expect(draft().deletedAt).not.toBeNull();
    expect((await vitalQuery(id))[0]?.heartRate).toBe(70);
    expect(decodeVitalForm(draft().body).fields.heartRate).toBe('80');
  });
});
