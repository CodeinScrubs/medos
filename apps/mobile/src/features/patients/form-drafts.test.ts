import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { eq } from 'drizzle-orm';

import { db } from '@/db/client';
import { auditLog, patientFormDrafts, patients } from '@/db/schema';
import { newId, softDelete } from '@/lib/ids';
import { useTestDatabase } from '@/test/db-client';
import { createTestDatabase, type TestDatabase } from '@/test/sqljs';

import {
  decodePatientForm,
  encodePatientForm,
  initialPatientFields,
  patientFormErrors,
  rebasePatientForm,
  type PatientFormDocument,
} from './form-draft';
import {
  commitPatientFormDraft,
  discardPatientFormDraft,
  inspectPatientForm,
  PatientDuplicateWarning,
  PatientFormConflict,
  patientFormDraftQuery,
  replacePatientFormDraft,
  savePatientFormDraft,
} from './form-draft-queries';
import { createPatient, patientListQuery, patientQuery, updatePatient } from './queries';

jest.mock('@/db/client', () => jest.requireActual('@/test/db-client'));
jest.mock('@/platform/notifications', () => jest.requireActual('@/test/mocks/notifications'));
let t: TestDatabase;
const now = new Date('2026-09-30T12:00:00Z');
beforeEach(async () => {
  t = useTestDatabase(await createTestDatabase());
});
const fresh = (): PatientFormDocument => ({ version: 1, base: null, fields: initialPatientFields() });
async function edit() {
  const patientId = await createPatient({
    firstName: 'Synthetic',
    lastName: 'Patient',
    summary: 'Original',
    phone: '123',
  });
  const patient = (await patientQuery(patientId))[0]!;
  return {
    patientId,
    document: {
      version: 1,
      base: initialPatientFields(patient),
      fields: initialPatientFields(patient),
    } as PatientFormDocument,
  };
}

describe('durable raw patient forms', () => {
  it('does not create a draft or patient merely by opening a new form', async () => {
    expect(await savePatientFormDraft(newId(), null, fresh(), 0)).toBe(0);
    expect(await db.select().from(patientFormDrafts)).toEqual([]);
    expect(await patientListQuery()).toEqual([]);
  });
  it('preserves incomplete raw names, Persian age and invalid date without publishing', async () => {
    const document = fresh();
    document.fields.firstName = '  Partial  ';
    document.fields.ageYears = '۲۴٫۵';
    document.fields.birthDateText = '۱۴۰۵/۰۷/';
    const id = newId();
    expect(await savePatientFormDraft(id, null, document, 0)).toBe(1);
    expect(decodePatientForm((await patientFormDraftQuery(null))[0]!.body)).toEqual(document);
    await expect(commitPatientFormDraft(id, null, 1, now)).rejects.toThrow('معتبر نیست');
    expect(await patientListQuery()).toEqual([]);
    expect(await patientFormDraftQuery(null)).toHaveLength(1);
    expect(patientFormErrors(document.fields, now)).toHaveProperty('ageYears');
    expect(patientFormErrors(document.fields, now)).toHaveProperty('birthDateText');
  });
  it.each(['1405/07/', '1499/01/01'])('refuses an invalid or future visible birth date %s', async (date) => {
    const document = fresh();
    Object.assign(document.fields, { firstName: 'Date', lastName: 'Test', birthDateText: date });
    const id = newId();
    await savePatientFormDraft(id, null, document, 0);
    await expect(commitPatientFormDraft(id, null, 1, now)).rejects.toThrow();
    expect(await patientListQuery()).toEqual([]);
  });
  it('publishes a corrected new patient once, atomically retiring its raw draft', async () => {
    const document = fresh();
    Object.assign(document.fields, {
      firstName: '  New  ',
      lastName: 'Patient',
      ageYears: '۲۴',
      birthDateText: '۱۳۸۰/۰۵/۱۲',
    });
    const id = newId();
    await savePatientFormDraft(id, null, document, 0);
    const patientId = await commitPatientFormDraft(id, null, 1, now);
    expect((await patientQuery(patientId))[0]).toMatchObject({
      firstName: 'New',
      ageYears: 24,
      birthDate: '2001-08-03',
    });
    expect(await patientFormDraftQuery(null)).toEqual([]);
    expect((await db.select().from(patientFormDrafts))[0]).toMatchObject({
      committedPatientId: patientId,
      revision: 2,
    });
    expect(await commitPatientFormDraft(id, null, 1, now)).toBe(patientId);
    expect(await patientListQuery()).toHaveLength(1);
  });
  it('rolls back insertion when draft retirement fails', async () => {
    const document = fresh();
    Object.assign(document.fields, { firstName: 'New', lastName: 'Patient' });
    const id = newId();
    await savePatientFormDraft(id, null, document, 0);
    t.conn.execSync(
      "CREATE TRIGGER fail_retire BEFORE UPDATE ON patient_form_drafts WHEN NEW.deleted_at IS NOT NULL BEGIN SELECT RAISE(ABORT, 'synthetic failure'); END",
    );
    await expect(commitPatientFormDraft(id, null, 1, now)).rejects.toThrow();
    expect(await patientListQuery()).toEqual([]);
    expect((await patientFormDraftQuery(null))[0]?.revision).toBe(1);
    t.conn.execSync('DROP TRIGGER fail_retire');
    await commitPatientFormDraft(id, null, 1, now);
    expect(await patientListQuery()).toHaveLength(1);
  });
  it('rolls back patient editing when draft retirement fails', async () => {
    const { patientId, document } = await edit();
    document.fields.summary = 'Changed';
    const id = newId();
    await savePatientFormDraft(id, patientId, document, 0);
    t.conn.execSync(
      "CREATE TRIGGER fail_retire BEFORE UPDATE ON patient_form_drafts BEGIN SELECT RAISE(ABORT, 'synthetic failure'); END",
    );
    await expect(commitPatientFormDraft(id, patientId, 1, now)).rejects.toThrow();
    expect((await patientQuery(patientId))[0]?.summary).toBe('Original');
    expect(await patientFormDraftQuery(patientId)).toHaveLength(1);
  });
  it('retains unrelated editable background fields, flags, tags and normalized search', async () => {
    const { patientId, document } = await edit();
    document.fields.summary = 'Local summary';
    const id = newId();
    await savePatientFormDraft(id, patientId, document, 0);
    await updatePatient(patientId, { phone: '456', starred: true, tags: ['External'], lastName: 'Renamed' });
    await commitPatientFormDraft(id, patientId, 1, now);
    expect((await patientQuery(patientId))[0]).toMatchObject({
      summary: 'Local summary',
      phone: '456',
      lastName: 'Renamed',
      starred: true,
      tags: ['External'],
    });
    expect(await patientListQuery({ search: 'Renamed Local External' })).toHaveLength(1);
    await updatePatient(patientId, { summary: 'After publication' });
    await commitPatientFormDraft(id, patientId, 1, now);
    expect((await patientQuery(patientId))[0]?.summary).toBe('After publication');
  });
  it('rejects conflicting edits to the same field without overwriting chart or draft', async () => {
    const { patientId, document } = await edit();
    document.fields.summary = 'Local';
    const id = newId();
    await savePatientFormDraft(id, patientId, document, 0);
    await updatePatient(patientId, { summary: 'External' });
    await expect(commitPatientFormDraft(id, patientId, 1, now)).rejects.toBeInstanceOf(PatientFormConflict);
    expect((await patientQuery(patientId))[0]?.summary).toBe('External');
    expect(decodePatientForm((await patientFormDraftQuery(patientId))[0]!.body).fields.summary).toBe('Local');
  });
  it('resolves only the displayed chart/draft revision; a further change conflicts again', async () => {
    const { patientId, document } = await edit();
    document.fields.summary = 'Local';
    const id = newId();
    await savePatientFormDraft(id, patientId, document, 0);
    await updatePatient(patientId, { summary: 'External', phone: '456' });
    const comparison = await inspectPatientForm(patientId);
    const rebased = rebasePatientForm(document, comparison.patient);
    expect(rebased.fields).toMatchObject({ summary: 'Local', phone: '456' });
    await updatePatient(patientId, { summary: 'New external' });
    await expect(replacePatientFormDraft(id, patientId, rebased, comparison)).rejects.toBeInstanceOf(
      PatientFormConflict,
    );
    const updatedComparison = await inspectPatientForm(patientId);
    const revision = await replacePatientFormDraft(
      id,
      patientId,
      rebasePatientForm(document, updatedComparison.patient),
      updatedComparison,
    );
    expect(revision).toBe(2);
    await commitPatientFormDraft(id, patientId, revision, now);
    expect((await patientQuery(patientId))[0]).toMatchObject({ summary: 'Local', phone: '456' });
  });
  it('competing editors cannot create two active drafts or overwrite a stale revision', async () => {
    const first = fresh();
    first.fields.firstName = 'First';
    const second = fresh();
    second.fields.firstName = 'Second';
    const id = newId();
    await savePatientFormDraft(id, null, first, 0);
    await expect(savePatientFormDraft(newId(), null, second, 0)).rejects.toBeInstanceOf(PatientFormConflict);
    await savePatientFormDraft(id, null, second, 1);
    await expect(savePatientFormDraft(id, null, first, 1)).rejects.toBeInstanceOf(PatientFormConflict);
    expect(decodePatientForm((await patientFormDraftQuery(null))[0]!.body).fields.firstName).toBe('Second');
  });
  it('requires duplicate confirmation at publication and reuses the same commit token', async () => {
    await createPatient({ firstName: 'Same', lastName: 'Name' });
    const document = fresh();
    Object.assign(document.fields, { firstName: 'Same', lastName: 'Name' });
    const id = newId();
    await savePatientFormDraft(id, null, document, 0);
    await expect(commitPatientFormDraft(id, null, 1, now)).rejects.toBeInstanceOf(PatientDuplicateWarning);
    expect(await patientListQuery()).toHaveLength(1);
    const result = await commitPatientFormDraft(id, null, 1, now, true);
    expect(await commitPatientFormDraft(id, null, 1, now, true)).toBe(result);
    expect(await patientListQuery()).toHaveLength(2);
  });
  it('keeps a final draft for a deleted target without reviving or editing the patient', async () => {
    const { patientId, document } = await edit();
    await db.update(patients).set(softDelete()).where(eq(patients.id, patientId));
    document.fields.summary = 'Final raw text';
    const id = newId();
    await savePatientFormDraft(id, patientId, document, 0);
    await expect(commitPatientFormDraft(id, patientId, 1, now)).rejects.toBeInstanceOf(PatientFormConflict);
    expect(await patientQuery(patientId)).toEqual([]);
    expect(decodePatientForm((await patientFormDraftQuery(patientId))[0]!.body).fields.summary).toBe('Final raw text');
  });
  it('rejects wrong scope, changed base and reuse of a retired draft', async () => {
    const { patientId, document } = await edit();
    document.fields.summary = 'Local';
    const id = newId();
    await savePatientFormDraft(id, patientId, document, 0);
    await expect(savePatientFormDraft(id, null, { ...document, base: null }, 1)).rejects.toBeInstanceOf(
      PatientFormConflict,
    );
    await expect(commitPatientFormDraft(id, null, 1, now)).rejects.toBeInstanceOf(PatientFormConflict);
    await expect(
      savePatientFormDraft(id, patientId, { ...document, base: { ...document.base!, phone: '99' } }, 1),
    ).rejects.toBeInstanceOf(PatientFormConflict);
    await discardPatientFormDraft(id, patientId, 1);
    expect(await patientFormDraftQuery(patientId)).toEqual([]);
    expect((await patientQuery(patientId))[0]?.summary).toBe('Original');
    expect((await db.select().from(auditLog))[0]).toMatchObject({
      action: 'patient.draftDiscarded',
      entityId: id,
      detail: null,
    });
    await expect(savePatientFormDraft(id, patientId, document, 2)).rejects.toBeInstanceOf(PatientFormConflict);
  });
  it('never discards or replaces a newer stored draft', async () => {
    const document = fresh();
    document.fields.firstName = 'First';
    const id = newId();
    await savePatientFormDraft(id, null, document, 0);
    const comparison = await inspectPatientForm(null);
    await savePatientFormDraft(id, null, { ...document, fields: { ...document.fields, firstName: 'Second' } }, 1);
    await expect(discardPatientFormDraft(id, null, 1)).rejects.toBeInstanceOf(PatientFormConflict);
    await expect(replacePatientFormDraft(id, null, document, comparison)).rejects.toBeInstanceOf(PatientFormConflict);
    expect(decodePatientForm((await patientFormDraftQuery(null))[0]!.body).fields.firstName).toBe('Second');
  });
  it('refuses unknown/malformed documents without exposing their contents or overwriting them', async () => {
    const document = fresh();
    document.fields.firstName = 'Private raw value';
    const body = JSON.stringify({ ...document, version: 99 });
    expect(() => decodePatientForm(body)).toThrow('قابل خواندن نیست');
    try {
      decodePatientForm(body);
    } catch (error) {
      expect(String(error)).not.toContain('Private raw value');
    }
    expect(() => encodePatientForm({ ...document, version: 99 } as unknown as PatientFormDocument)).toThrow();
    const id = newId();
    await savePatientFormDraft(id, null, document, 0);
    await db.update(patientFormDrafts).set({ body }).where(eq(patientFormDrafts.id, id));
    const comparison = await inspectPatientForm(null);
    await expect(replacePatientFormDraft(id, null, document, comparison)).rejects.toThrow();
    expect((await patientFormDraftQuery(null))[0]?.body).toBe(body);
  });
});
