import { and, asc, desc, eq, inArray, isNull, sql } from 'drizzle-orm';

import { audit } from '@/db/audit';
import { db, type DbTransaction } from '@/db/client';
import { consultations, doctors, patients, type Consultation } from '@/db/schema';
import { resolveActiveEncounterId } from '@/features/encounters/queries';
import { newId, softDelete, stamps, touch } from '@/lib/ids';
import { buildSearchText } from '@/lib/persian';

import { ConsultDraftConflict, type AnswerDraft } from './answer-drafts';

/*
 * Consults, as a thing that can be outstanding.
 *
 * A consult note says what the specialist wrote. It cannot say that an answer
 * is still owed — that is an absence, and an absence is what nobody notices on
 * a busy night. So the request is its own row with its own state, and the
 * state only ever moves because someone said it did: written down, asked,
 * answered. Nothing here infers that a consult happened because a note exists.
 */

const alive = isNull(consultations.deletedAt);

/** Still waiting on somebody. */
export const OPEN_STATUSES: Consultation['status'][] = ['pending', 'requested'];

export function consultSearchText(
  consult: Pick<Consultation, 'specialty' | 'reason' | 'response' | 'followUpInstruction'>,
): string {
  return buildSearchText(consult.specialty, consult.reason, consult.response, consult.followUpInstruction);
}

export function patientConsultsQuery(patientId: string) {
  return db
    .select({ consult: consultations, doctor: doctors })
    .from(consultations)
    .leftJoin(doctors, and(eq(consultations.doctorId, doctors.id), isNull(doctors.deletedAt)))
    .where(and(alive, eq(consultations.patientId, patientId)))
    .orderBy(asc(consultations.status), desc(consultations.createdAt));
}

/** Everything still owed an answer, across patients — for Today. */
export function openConsultsQuery(limit = 20) {
  return db
    .select({ consult: consultations, patient: patients, doctor: doctors })
    .from(consultations)
    .innerJoin(patients, eq(consultations.patientId, patients.id))
    .leftJoin(doctors, and(eq(consultations.doctorId, doctors.id), isNull(doctors.deletedAt)))
    .where(and(alive, isNull(patients.deletedAt), inArray(consultations.status, OPEN_STATUSES)))
    .orderBy(
      asc(sql`CASE ${consultations.urgency} WHEN 'emergency' THEN 0 WHEN 'urgent' THEN 1 ELSE 2 END`),
      asc(consultations.createdAt),
      asc(consultations.id),
    )
    .limit(limit);
}

export function consultQuery(id: string, includeDeleted = false) {
  return db
    .select()
    .from(consultations)
    .where(and(includeDeleted ? undefined : alive, eq(consultations.id, id)))
    .limit(1);
}

export type ConsultInput = {
  patientId: string;
  encounterId?: string | null;
  specialty?: string | null;
  doctorId?: string | null;
  reason: string;
  urgency?: Consultation['urgency'];
  status?: Consultation['status'];
  requestedAt?: Date | null;
  noteId?: string | null;
};

export async function createConsult(input: ConsultInput): Promise<string> {
  if (!input.reason.trim()) throw new Error('A consult needs a question');
  const id = newId();
  const row = {
    patientId: input.patientId,
    // Undefined means "whatever admission is active"; null means explicitly none.
    encounterId: input.encounterId !== undefined ? input.encounterId : await resolveActiveEncounterId(input.patientId),
    specialty: input.specialty?.trim() || null,
    doctorId: input.doctorId ?? null,
    reason: input.reason.trim(),
    urgency: input.urgency ?? ('routine' as const),
    status: input.status ?? ('pending' as const),
    requestedAt: input.requestedAt ?? null,
    noteId: input.noteId ?? null,
  };
  await db.insert(consultations).values({
    id,
    ...stamps(),
    ...row,
    searchText: consultSearchText({ ...row, response: null, followUpInstruction: null }),
  });
  return id;
}

/** It has actually been asked now. */
export async function markConsultRequested(id: string, requestedAt: Date = new Date()): Promise<void> {
  if (!Number.isFinite(requestedAt.getTime())) throw new Error('Invalid consult date');
  const changed = db.transaction((tx) => {
    const current = consultForWrite(tx, id);
    if (current.status === 'requested') return false;
    requireOpen(current);
    tx.update(consultations)
      .set({ status: 'requested', requestedAt, ...touch() })
      .where(eq(consultations.id, id))
      .run();
    return true;
  });
  if (changed)
    await audit('consult.statusChanged', { entityType: 'consult', entityId: id, detail: { status: 'requested' } });
}

function consultForWrite(tx: DbTransaction, id: string): Consultation {
  const current = tx
    .select()
    .from(consultations)
    .where(and(alive, eq(consultations.id, id)))
    .get();
  if (!current) throw new ConsultDraftConflict('کانسالت پیدا نشد؛ نوشتهٔ روی صفحه ذخیره نشد.');
  const patient = tx
    .select({ id: patients.id })
    .from(patients)
    .where(and(eq(patients.id, current.patientId), isNull(patients.deletedAt)))
    .get();
  if (!patient) throw new ConsultDraftConflict('پروندهٔ بیمار حذف شده است.');
  return current;
}

function requireOpen(current: Consultation): void {
  if (!OPEN_STATUSES.includes(current.status)) throw new ConsultDraftConflict('این کانسالت دیگر منتظر پاسخ نیست.');
}

/** The two fields are one versioned document; a stale editor cannot replace it. */
export async function saveConsultAnswerDraft(
  id: string,
  draft: AnswerDraft,
  expectedRevision: number,
): Promise<number> {
  return db.transaction((tx) => {
    const current = consultForWrite(tx, id);
    requireOpen(current);
    if (current.draftRevision !== expectedRevision) throw new ConsultDraftConflict();
    if (current.draftResponse === draft.response && current.draftInstruction === draft.instruction)
      return current.draftRevision;
    const revision = current.draftRevision + 1;
    tx.update(consultations)
      .set({
        draftResponse: draft.response,
        draftInstruction: draft.instruction,
        draftRevision: revision,
        ...touch(),
      })
      .where(eq(consultations.id, id))
      .run();
    return revision;
  });
}

/** Publish exactly the persisted draft the editor flushed, and retire it atomically. */
export async function commitConsultAnswerDraft(
  id: string,
  expectedRevision: number,
  respondedAt = new Date(),
): Promise<void> {
  if (!Number.isFinite(respondedAt.getTime())) throw new Error('Invalid consult date');
  const changed = db.transaction((tx) => {
    const current = consultForWrite(tx, id);
    // Retrying a completed publish cannot create another event or change its timestamp.
    if (
      current.status === 'answered' &&
      current.draftRevision === expectedRevision + 1 &&
      !current.draftResponse &&
      !current.draftInstruction
    )
      return false;
    requireOpen(current);
    if (current.draftRevision !== expectedRevision) throw new ConsultDraftConflict();
    const response = current.draftResponse.trim();
    if (!response) throw new Error('پاسخ کانسالت را بنویسید.');
    const followUpInstruction = current.draftInstruction.trim() || null;
    tx.update(consultations)
      .set({
        status: 'answered',
        response,
        followUpInstruction,
        respondedAt,
        draftResponse: '',
        draftInstruction: '',
        draftRevision: current.draftRevision + 1,
        searchText: consultSearchText({ ...current, response, followUpInstruction }),
        ...touch(),
      })
      .where(eq(consultations.id, id))
      .run();
    return true;
  });
  if (changed)
    await audit('consult.statusChanged', { entityType: 'consult', entityId: id, detail: { status: 'answered' } });
}

export async function cancelConsult(id: string): Promise<void> {
  const changed = db.transaction((tx) => {
    const current = consultForWrite(tx, id);
    if (current.status === 'cancelled') return false;
    requireOpen(current);
    // Keep any unsubmitted draft, including through cancellation/deletion.
    tx.update(consultations)
      .set({ status: 'cancelled', ...touch() })
      .where(eq(consultations.id, id))
      .run();
    return true;
  });
  if (changed)
    await audit('consult.statusChanged', { entityType: 'consult', entityId: id, detail: { status: 'cancelled' } });
}

export async function deleteConsult(id: string): Promise<void> {
  const changed = await db
    .update(consultations)
    .set(softDelete())
    .where(and(alive, eq(consultations.id, id)))
    .returning({ id: consultations.id });
  if (!changed.length) throw new Error('Consult not found');
  await audit('consult.deleted', { entityType: 'consult', entityId: id });
}

export async function reindexConsults(): Promise<number> {
  const rows = await db.select().from(consultations);
  let changed = 0;
  db.transaction((tx) => {
    for (const row of rows) {
      const next = consultSearchText(row);
      if (next === row.searchText) continue;
      tx.update(consultations).set({ searchText: next }).where(eq(consultations.id, row.id)).run();
      changed += 1;
    }
  });
  return changed;
}
