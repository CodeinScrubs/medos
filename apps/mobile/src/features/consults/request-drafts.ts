import { and, eq, isNull } from 'drizzle-orm';

import { db, type DbTransaction } from '@/db/client';
import { consultRequestDrafts, patients } from '@/db/schema';
import { resolveActiveEncounterId } from '@/features/encounters/queries';
import { softDelete, stamps, touch } from '@/lib/ids';

import { createConsultInTransaction } from './queries';

export type RequestDraftFields = { specialty: string; reason: string };
export class RequestDraftConflict extends Error {
  constructor(message = 'پیش‌نویس در صفحهٔ دیگری تغییر کرده است؛ نوشتهٔ شما جایگزین نشد.') {
    super(message);
    this.name = 'RequestDraftConflict';
  }
}
const openPatient = (patientId: string) =>
  and(eq(consultRequestDrafts.patientId, patientId), isNull(consultRequestDrafts.deletedAt));

export function requestDraftQuery(patientId: string) {
  return db.select().from(consultRequestDrafts).where(openPatient(patientId)).limit(1);
}

function requirePatient(tx: DbTransaction, patientId: string): void {
  if (
    !tx
      .select({ id: patients.id })
      .from(patients)
      .where(and(eq(patients.id, patientId), isNull(patients.deletedAt)))
      .get()
  )
    throw new RequestDraftConflict('پروندهٔ بیمار پیدا نشد.');
}

export async function saveRequestDraft(
  id: string,
  patientId: string,
  fields: RequestDraftFields,
  expectedRevision: number,
): Promise<number> {
  return db.transaction((tx) => {
    requirePatient(tx, patientId);
    const current = tx.select().from(consultRequestDrafts).where(eq(consultRequestDrafts.id, id)).get();
    if (!current) {
      if (
        expectedRevision !== 0 ||
        tx.select({ id: consultRequestDrafts.id }).from(consultRequestDrafts).where(openPatient(patientId)).get()
      )
        throw new RequestDraftConflict();
      if (!fields.reason && !fields.specialty) return 0;
      tx.insert(consultRequestDrafts)
        .values({
          id,
          ...stamps(),
          patientId,
          encounterId: resolveActiveEncounterId(patientId, tx),
          ...fields,
          revision: 1,
        })
        .run();
      return 1;
    }
    if (
      current.deletedAt ||
      current.consultId ||
      current.patientId !== patientId ||
      current.revision !== expectedRevision
    )
      throw new RequestDraftConflict();
    if (current.reason === fields.reason && current.specialty === fields.specialty) return current.revision;
    const revision = current.revision + 1;
    tx.update(consultRequestDrafts)
      .set({ ...fields, revision, ...touch() })
      .where(eq(consultRequestDrafts.id, id))
      .run();
    return revision;
  });
}

/** Only explicit publication creates a pending consult; it never implies a request was sent. */
export async function commitRequestDraft(id: string, expectedRevision: number): Promise<string> {
  return db.transaction((tx) => {
    const current = tx.select().from(consultRequestDrafts).where(eq(consultRequestDrafts.id, id)).get();
    if (!current) throw new Error('پیش‌نویس پیدا نشد.');
    if (current.consultId && current.revision === expectedRevision + 1) return current.consultId;
    requirePatient(tx, current.patientId);
    if (current.deletedAt || current.revision !== expectedRevision) throw new RequestDraftConflict();
    if (!current.reason.trim()) throw new Error('سؤال کانسالت را بنویسید.');
    const consultId = createConsultInTransaction(tx, {
      patientId: current.patientId,
      encounterId: current.encounterId,
      specialty: current.specialty,
      reason: current.reason,
    });
    tx.update(consultRequestDrafts)
      .set({ consultId, revision: current.revision + 1, ...softDelete() })
      .where(eq(consultRequestDrafts.id, id))
      .run();
    return consultId;
  });
}
