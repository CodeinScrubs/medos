import { and, asc, desc, eq, inArray, isNull } from 'drizzle-orm';

import { db } from '@/db/client';
import { consultations, doctors, patients, type Consultation } from '@/db/schema';
import { resolveActiveEncounterId } from '@/features/encounters/queries';
import { newId, softDelete, stamps, touch } from '@/lib/ids';
import { buildSearchText } from '@/lib/persian';

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
    .leftJoin(doctors, eq(consultations.doctorId, doctors.id))
    .where(and(alive, eq(consultations.patientId, patientId)))
    .orderBy(asc(consultations.status), desc(consultations.createdAt));
}

/** Everything still owed an answer, across patients — for Today. */
export function openConsultsQuery(limit = 20) {
  return db
    .select({ consult: consultations, patient: patients, doctor: doctors })
    .from(consultations)
    .innerJoin(patients, eq(consultations.patientId, patients.id))
    .leftJoin(doctors, eq(consultations.doctorId, doctors.id))
    .where(and(alive, isNull(patients.deletedAt), inArray(consultations.status, OPEN_STATUSES)))
    .orderBy(desc(consultations.urgency), asc(consultations.createdAt))
    .limit(limit);
}

export function consultQuery(id: string) {
  return db
    .select()
    .from(consultations)
    .where(and(alive, eq(consultations.id, id)))
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

export async function updateConsult(id: string, patch: Partial<ConsultInput>): Promise<void> {
  const current = (await consultQuery(id))[0];
  if (!current) throw new Error(`Consult ${id} not found`);
  const merged = { ...current, ...patch };
  await db
    .update(consultations)
    .set({
      ...patch,
      reason: patch.reason === undefined ? undefined : patch.reason.trim(),
      specialty: patch.specialty === undefined ? undefined : patch.specialty?.trim() || null,
      searchText: consultSearchText(merged),
      ...touch(),
    })
    .where(and(alive, eq(consultations.id, id)));
}

/** It has actually been asked now. */
export async function markConsultRequested(id: string, requestedAt: Date = new Date()): Promise<void> {
  await db
    .update(consultations)
    .set({ status: 'requested', requestedAt, ...touch() })
    .where(and(alive, eq(consultations.id, id)));
}

/**
 * Record the answer.
 *
 * The reply and what to do about it are kept apart: "EF 35%" and "start an ACE
 * inhibitor tomorrow" are different sentences, and mixing them is how an
 * instruction ends up buried in a paragraph nobody rereads.
 */
export async function answerConsult(
  id: string,
  answer: { response: string; followUpInstruction?: string | null; respondedAt?: Date; noteId?: string | null },
): Promise<void> {
  const current = (await consultQuery(id))[0];
  if (!current) throw new Error(`Consult ${id} not found`);
  const merged = {
    ...current,
    response: answer.response.trim(),
    followUpInstruction: answer.followUpInstruction?.trim() || null,
  };
  await db
    .update(consultations)
    .set({
      status: 'answered',
      response: merged.response,
      followUpInstruction: merged.followUpInstruction,
      respondedAt: answer.respondedAt ?? new Date(),
      noteId: answer.noteId === undefined ? undefined : answer.noteId,
      searchText: consultSearchText(merged),
      ...touch(),
    })
    .where(and(alive, eq(consultations.id, id)));
}

export async function cancelConsult(id: string): Promise<void> {
  await db
    .update(consultations)
    .set({ status: 'cancelled', ...touch() })
    .where(and(alive, eq(consultations.id, id)));
}

export async function deleteConsult(id: string): Promise<void> {
  await db
    .update(consultations)
    .set(softDelete())
    .where(and(alive, eq(consultations.id, id)));
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
