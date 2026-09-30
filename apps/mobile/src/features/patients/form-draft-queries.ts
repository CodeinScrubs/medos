import { and, eq, isNull } from 'drizzle-orm';

import { audit } from '@/db/audit';
import { db, type DbTransaction } from '@/db/client';
import { patientFormDrafts, patients, type Patient, type PatientFormDraft } from '@/db/schema';
import { softDelete, stamps, touch } from '@/lib/ids';

import {
  decodePatientForm,
  encodePatientForm,
  initialPatientFields,
  patientFormErrors,
  patientFormPatch,
  PatientFormConflict,
  patientFormValues,
  type PatientFormDocument,
} from './form-draft';
import { createPatientInTransaction, possibleDuplicatesQuery, updatePatientInTransaction } from './queries';

export { PatientFormConflict } from './form-draft';
const scopeKey = (patientId: string | null) => (patientId ? `patient:${patientId}` : 'new');
const openScope = (patientId: string | null) =>
  and(eq(patientFormDrafts.scopeKey, scopeKey(patientId)), isNull(patientFormDrafts.deletedAt));
export function patientFormDraftQuery(patientId: string | null) {
  return db.select().from(patientFormDrafts).where(openScope(patientId)).limit(1);
}
function currentPatient(tx: DbTransaction, patientId: string): Patient {
  const patient = tx
    .select()
    .from(patients)
    .where(and(eq(patients.id, patientId), isNull(patients.deletedAt)))
    .get();
  if (!patient) throw new PatientFormConflict('پروندهٔ بیمار پیدا نشد؛ پیش‌نویس نگه داشته شد.');
  return patient;
}
export type PatientFormComparison = { draft: PatientFormDraft | null; patient: Patient | null };
export async function inspectPatientForm(patientId: string | null): Promise<PatientFormComparison> {
  return db.transaction((tx) => ({
    draft: tx.select().from(patientFormDrafts).where(openScope(patientId)).get() ?? null,
    patient: patientId ? currentPatient(tx, patientId) : null,
  }));
}

/** CAS checks precede writes. Autosave never publishes, validates clinical input or revives a patient. */
export async function savePatientFormDraft(
  id: string,
  patientId: string | null,
  document: PatientFormDocument,
  expectedRevision: number,
): Promise<number> {
  const body = encodePatientForm(document);
  if (Boolean(document.base) !== Boolean(patientId)) throw new PatientFormConflict();
  return db.transaction((tx) => {
    const current = tx.select().from(patientFormDrafts).where(eq(patientFormDrafts.id, id)).get();
    if (!current) {
      if (expectedRevision !== 0 || tx.select().from(patientFormDrafts).where(openScope(patientId)).get())
        throw new PatientFormConflict();
      // Untouched forms create neither drafts nor blank patients.
      if (JSON.stringify(document.fields) === JSON.stringify(document.base ?? initialPatientFields())) return 0;
      tx.insert(patientFormDrafts)
        .values({ id, ...stamps(), patientId, scopeKey: scopeKey(patientId), body, revision: 1 })
        .run();
      return 1;
    }
    if (
      current.deletedAt ||
      current.committedPatientId ||
      current.patientId !== patientId ||
      current.scopeKey !== scopeKey(patientId) ||
      current.revision !== expectedRevision
    )
      throw new PatientFormConflict();
    if (JSON.stringify(decodePatientForm(current.body).base) !== JSON.stringify(document.base))
      throw new PatientFormConflict();
    if (current.body === body) return current.revision;
    const revision = current.revision + 1;
    tx.update(patientFormDrafts)
      .set({ body, revision, ...touch() })
      .where(eq(patientFormDrafts.id, id))
      .run();
    return revision;
  });
}

export class PatientDuplicateWarning extends Error {
  constructor(public readonly patients: Patient[]) {
    super('بیمار مشابه پیدا شد.');
    this.name = 'PatientDuplicateWarning';
  }
}

/** Record and draft retirement commit together. Retrying this token cannot insert a second patient. */
export async function commitPatientFormDraft(
  id: string,
  patientId: string | null,
  expectedRevision: number,
  now: Date,
  allowDuplicate = false,
): Promise<string> {
  return db.transaction((tx) => {
    const row = tx.select().from(patientFormDrafts).where(eq(patientFormDrafts.id, id)).get();
    if (!row || row.patientId !== patientId || row.scopeKey !== scopeKey(patientId)) throw new PatientFormConflict();
    if (row.committedPatientId && row.revision === expectedRevision + 1) {
      currentPatient(tx, row.committedPatientId);
      return row.committedPatientId;
    }
    if (row.deletedAt || row.revision !== expectedRevision) throw new PatientFormConflict();
    const document = decodePatientForm(row.body);
    if (Boolean(document.base) !== Boolean(patientId)) throw new PatientFormConflict();
    const errors = patientFormErrors(document.fields, now);
    if (Object.keys(errors).length) throw new Error('اطلاعات فرم کامل یا معتبر نیست؛ پیش‌نویس نگه داشته شد.');
    let result: string;
    if (patientId) {
      const patch = patientFormPatch(document, currentPatient(tx, patientId));
      updatePatientInTransaction(tx, patientId, patch);
      result = patientId;
    } else {
      const input = patientFormValues(document.fields);
      const duplicates = possibleDuplicatesQuery(input.firstName, input.lastName, input.nationalId, tx).all();
      if (duplicates.length && !allowDuplicate) throw new PatientDuplicateWarning(duplicates);
      result = createPatientInTransaction(tx, input);
    }
    tx.update(patientFormDrafts)
      .set({ committedPatientId: result, revision: row.revision + 1, ...softDelete(now) })
      .where(eq(patientFormDrafts.id, id))
      .run();
    return result;
  });
}

/** Explicit conflict resolution replaces only the displayed draft and chart snapshot. */
export async function replacePatientFormDraft(
  id: string,
  patientId: string | null,
  document: PatientFormDocument,
  comparison: PatientFormComparison,
): Promise<number> {
  const body = encodePatientForm(document);
  if (Boolean(document.base) !== Boolean(patientId)) throw new PatientFormConflict();
  return db.transaction((tx) => {
    const live = tx.select().from(patientFormDrafts).where(openScope(patientId)).get() ?? null;
    if (live?.id !== comparison.draft?.id || live?.revision !== comparison.draft?.revision)
      throw new PatientFormConflict();
    if (
      patientId &&
      JSON.stringify(initialPatientFields(currentPatient(tx, patientId))) !==
        JSON.stringify(initialPatientFields(comparison.patient ?? undefined))
    )
      throw new PatientFormConflict();
    if (
      patientId &&
      JSON.stringify(document.base) !== JSON.stringify(initialPatientFields(comparison.patient ?? undefined))
    )
      throw new PatientFormConflict();
    if (live) {
      decodePatientForm(live.body);
      const revision = live.revision + 1;
      tx.update(patientFormDrafts)
        .set({ body, revision, ...touch() })
        .where(eq(patientFormDrafts.id, live.id))
        .run();
      return revision;
    }
    if (tx.select().from(patientFormDrafts).where(eq(patientFormDrafts.id, id)).get()) throw new PatientFormConflict();
    tx.insert(patientFormDrafts)
      .values({ id, ...stamps(), patientId, scopeKey: scopeKey(patientId), body, revision: 1 })
      .run();
    return 1;
  });
}

export async function discardPatientFormDraft(
  id: string,
  patientId: string | null,
  expectedRevision: number,
): Promise<void> {
  db.transaction((tx) => {
    const row = tx.select().from(patientFormDrafts).where(eq(patientFormDrafts.id, id)).get();
    if (!row && expectedRevision === 0) return;
    if (
      !row ||
      row.deletedAt ||
      row.patientId !== patientId ||
      row.scopeKey !== scopeKey(patientId) ||
      row.revision !== expectedRevision
    )
      throw new PatientFormConflict();
    tx.update(patientFormDrafts)
      .set({ ...softDelete(), revision: row.revision + 1 })
      .where(eq(patientFormDrafts.id, id))
      .run();
  });
  await audit('patient.draftDiscarded', { entityType: 'patient_form_draft', entityId: id });
}
