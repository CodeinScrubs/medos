import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { eq } from 'drizzle-orm';

import { imagingFormDrafts, imagingStudies } from '@/db/schema';
import { openEncounter } from '@/features/encounters/queries';
import { createPatient, deletePatient } from '@/features/patients/queries';
import { datasetGeneration, DatasetChangedError } from '@/lib/dataset-write';
import { databaseRows, snapshotDataset } from '@/test/dataset-snapshot';
import { useTestDatabase } from '@/test/db-client';
import { createTestDatabase, type TestDatabase } from '@/test/sqljs';

import { decodeImagingForm, initialImagingForm, ImagingFormConflict } from './form-draft';
import {
  commitImagingFormDraft,
  discardImagingFormDraft,
  imagingFormQuery,
  inspectImagingForm,
  replaceImagingFormDraft,
  saveImagingFormDraft,
} from './form-draft-queries';
import { createImagingStudy, updateImagingStudy } from './queries';

jest.mock('@/db/client', () => jest.requireActual('@/test/db-client'));
jest.mock('@/platform/notifications', () => jest.requireActual('@/test/mocks/notifications'));
let t: TestDatabase;
let patientId: string;
const now = new Date('2026-10-08T12:00:00Z');
const draft = () => t.db.select().from(imagingFormDrafts).get()!;
const studies = () => t.db.select().from(imagingStudies).all();
beforeEach(async () => {
  t = useTestDatabase(await createTestDatabase());
  patientId = await createPatient({ firstName: 'Synthetic', lastName: 'Imaging' });
});
describe('imaging raw durability and explicit publication', () => {
  it('retains invalid exact raw text without creating a clinical imaging result', async () => {
    const document = initialImagingForm(null, null, now);
    document.fields.date = { dateText: '۱۴۰۵/۱۲/۳۰', clockText: '2:', customOpen: true };
    document.fields.reportText = '  English / فارسی\n unfinished  ';
    await saveImagingFormDraft('draft', patientId, null, document, 0);
    expect(decodeImagingForm(draft().body)).toEqual(document);
    await expect(commitImagingFormDraft('draft', patientId, null, 1, now)).rejects.toThrow('تاریخ');
    expect(studies()).toEqual([]);
    expect(draft().deletedAt).toBeNull();
  });
  it('preserves captured null admission after a later admission and replays exactly once', async () => {
    const document = initialImagingForm(null, null, now);
    document.fields.impression = '  Synthetic result  ';
    await saveImagingFormDraft('draft', patientId, null, document, 0);
    await openEncounter({ patientId, kind: 'admission', admittedAt: now });
    const id = await commitImagingFormDraft('draft', patientId, null, 1, now);
    const after = databaseRows(t);
    expect(await commitImagingFormDraft('draft', patientId, null, 1, now)).toBe(id);
    expect(databaseRows(t)).toEqual(after);
    expect(studies()).toMatchObject([{ id, encounterId: null, impression: 'Synthetic result' }]);
  });
  it('rolls back the whole publication when retiring the draft fails', async () => {
    await saveImagingFormDraft('draft', patientId, null, initialImagingForm(null, null, now), 0);
    const before = databaseRows(t);
    t.sqlite.exec(
      "CREATE TRIGGER fail_retire BEFORE UPDATE ON imaging_form_drafts BEGIN SELECT RAISE(ABORT, 'synthetic'); END",
    );
    await expect(commitImagingFormDraft('draft', patientId, null, 1, now)).rejects.toThrow();
    expect(databaseRows(t)).toEqual(before);
    t.sqlite.exec('DROP TRIGGER fail_retire');
    await commitImagingFormDraft('draft', patientId, null, 1, now);
    expect(studies()).toHaveLength(1);
  });
  it('keeps raw drafts on deleted parents but refuses publication and direct writes', async () => {
    await deletePatient(patientId);
    await saveImagingFormDraft('draft', patientId, null, initialImagingForm(null, null, now), 0);
    const before = databaseRows(t);
    await expect(commitImagingFormDraft('draft', patientId, null, 1, now)).rejects.toThrow();
    await expect(createImagingStudy({ patientId, modality: 'ct', status: 'done' })).rejects.toThrow();
    expect(databaseRows(t)).toEqual(before);
  });
  it('preserves untouched exact text and timestamp while merging independent edits', async () => {
    const timestamp = new Date('2026-10-01T12:34:56.789Z');
    const id = await createImagingStudy({
      patientId,
      modality: 'ct',
      status: 'done',
      studyDate: timestamp,
      reportText: '  source\n  ',
      impression: 'Source',
    });
    const row = (await imagingFormQuery(patientId, id))[0]!;
    const document = initialImagingForm(row.study, null, now);
    document.fields.impression = 'Local';
    await saveImagingFormDraft('draft', patientId, id, document, 0);
    await updateImagingStudy(id, { storageLocation: 'Independent', notes: 'Retain non-editable' });
    await commitImagingFormDraft('draft', patientId, id, 1, now);
    expect(studies()[0]).toMatchObject({
      reportText: '  source\n  ',
      studyDate: timestamp,
      impression: 'Local',
      storageLocation: 'Independent',
      notes: 'Retain non-editable',
    });
  });
  it('refuses same-field changes and third writes after comparison, rebase keeps independent fields', async () => {
    const id = await createImagingStudy({ patientId, modality: 'ct', status: 'done', impression: 'Source' });
    const document = initialImagingForm(studies()[0]!, null, now);
    document.fields.impression = 'Local';
    await saveImagingFormDraft('draft', patientId, id, document, 0);
    await updateImagingStudy(id, { impression: 'Other', storageLocation: 'Independent' });
    await expect(commitImagingFormDraft('draft', patientId, id, 1, now)).rejects.toThrow(ImagingFormConflict);
    const shown = await inspectImagingForm('draft', patientId, id);
    await updateImagingStudy(id, { impression: 'Third' });
    await expect(replaceImagingFormDraft('draft', patientId, id, document, shown, now)).rejects.toThrow(
      ImagingFormConflict,
    );
    const next = await replaceImagingFormDraft(
      'draft',
      patientId,
      id,
      document,
      await inspectImagingForm('draft', patientId, id),
      now,
    );
    await commitImagingFormDraft(next.id, patientId, id, next.revision, now);
    expect(studies()[0]).toMatchObject({ impression: 'Local', storageLocation: 'Independent' });
  });
  it('refuses stale callbacks after actual dataset replacement without touching any table', async () => {
    const generation = datasetGeneration();
    const document = initialImagingForm(null, null, now);
    await saveImagingFormDraft('draft', patientId, null, document, 0);
    snapshotDataset(t)();
    const before = databaseRows(t);
    await expect(commitImagingFormDraft('draft', patientId, null, 1, now, generation)).rejects.toThrow(
      DatasetChangedError,
    );
    await expect(discardImagingFormDraft('draft', patientId, null, 1, generation)).rejects.toThrow(DatasetChangedError);
    expect(databaseRows(t)).toEqual(before);
  });
  it('soft discards exact acknowledged draft only and rejects wrong/stale input', async () => {
    await saveImagingFormDraft('draft', patientId, null, initialImagingForm(null, null, now), 0);
    await expect(discardImagingFormDraft('draft', patientId, null, 0)).rejects.toThrow(ImagingFormConflict);
    await discardImagingFormDraft('draft', patientId, null, 1);
    expect(draft().deletedAt).not.toBeNull();
    expect(studies()).toHaveLength(0);
    const once = t.db.select().from(imagingFormDrafts).where(eq(imagingFormDrafts.id, 'draft')).get();
    await discardImagingFormDraft('draft', patientId, null, 1);
    expect(draft()).toEqual(once);
  });
});
