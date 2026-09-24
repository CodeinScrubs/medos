import { and, asc, eq, isNull, lte, sql } from 'drizzle-orm';

import { audit } from '@/db/audit';
import { db, type DbTransaction } from '@/db/client';
import { followUps, patients, type FollowUp } from '@/db/schema';
import { resolveActiveEncounterId } from '@/features/encounters/queries';
import { newId, softDelete, stamps, touch } from '@/lib/ids';
import { endOfDay } from '@/lib/time';

import { reconcileFollowUpReminder, repairFollowUpReminders } from './reminder-queries';

const alive = isNull(followUps.deletedAt);

// Status and priority are text enums; sorting them alphabetically would put
// "pending" last and "high" between "low" and "normal". Rank them explicitly.
const statusRank = sql`case ${followUps.status} when 'pending' then 0 when 'missed' then 1 when 'done' then 2 else 3 end`;
const priorityRank = sql`case ${followUps.priority} when 'high' then 0 when 'normal' then 1 else 2 end`;

export function patientFollowUpsQuery(patientId: string) {
  return db
    .select()
    .from(followUps)
    .where(and(alive, eq(followUps.patientId, patientId)))
    .orderBy(statusRank, asc(followUps.dueAt));
}

/** Pending follow-ups due today or already overdue, with the patient row, for the Today screen. */
export function dueFollowUpsQuery(until: Date = endOfDay()) {
  return db
    .select({ followUp: followUps, patient: patients })
    .from(followUps)
    .innerJoin(patients, eq(followUps.patientId, patients.id))
    .where(and(alive, isNull(patients.deletedAt), eq(followUps.status, 'pending'), lte(followUps.dueAt, until)))
    .orderBy(priorityRank, asc(followUps.dueAt));
}

/** Everything still pending, soonest first. */
export function pendingFollowUpsQuery() {
  return db
    .select({ followUp: followUps, patient: patients })
    .from(followUps)
    .innerJoin(patients, eq(followUps.patientId, patients.id))
    .where(and(alive, isNull(patients.deletedAt), eq(followUps.status, 'pending')))
    .orderBy(asc(followUps.dueAt));
}

export type FollowUpInput = {
  patientId: string;
  dueAt: Date;
  reason: string;
  channel: FollowUp['channel'];
  priority: FollowUp['priority'];
};

export async function createFollowUp(input: FollowUpInput): Promise<string> {
  validate(input);
  const id = newId();
  db.transaction((tx) => {
    requirePatient(tx, input.patientId);
    tx.insert(followUps)
      .values({
        id,
        ...stamps(),
        patientId: input.patientId,
        encounterId: resolveActiveEncounterId(input.patientId, tx),
        dueAt: input.dueAt,
        reason: input.reason.trim(),
        channel: input.channel,
        priority: input.priority,
        status: 'pending',
      })
      .run();
  });
  // The record is durable before Android is touched. Native failures are retriable
  // side effects, not a reason to tell the user their clinical save failed.
  await reconcileFollowUpReminder(id, true);
  return id;
}

export async function updateFollowUp(id: string, patch: Partial<Omit<FollowUpInput, 'patientId'>>): Promise<void> {
  db.transaction((tx) => {
    const current = requireFollowUp(tx, id);
    const merged = {
      ...current,
      reason: patch.reason ?? current.reason,
      dueAt: patch.dueAt ?? current.dueAt,
      channel: patch.channel ?? current.channel,
      priority: patch.priority ?? current.priority,
    };
    validate(merged);
    tx.update(followUps)
      .set({
        reason: merged.reason.trim(),
        dueAt: merged.dueAt,
        channel: merged.channel,
        priority: merged.priority,
        reminderRevision: current.reminderRevision + 1,
        ...touch(),
      })
      .where(eq(followUps.id, id))
      .run();
  });
  await reconcileFollowUpReminder(id);
}

function requirePatient(tx: DbTransaction, patientId: string): void {
  if (
    !tx
      .select({ id: patients.id })
      .from(patients)
      .where(and(eq(patients.id, patientId), isNull(patients.deletedAt)))
      .get()
  ) {
    throw new Error('پروندهٔ بیمار در دسترس نیست.');
  }
}

function requireFollowUp(tx: DbTransaction, id: string): FollowUp {
  const row = tx
    .select()
    .from(followUps)
    .where(and(alive, eq(followUps.id, id)))
    .get();
  if (!row) throw new Error('پیگیری در دسترس نیست.');
  requirePatient(tx, row.patientId);
  return row;
}

function validate(input: Pick<FollowUpInput, 'reason' | 'dueAt'>): void {
  if (!input.reason.trim()) throw new Error('دلیل پیگیری را بنویسید.');
  if (!Number.isFinite(input.dueAt.getTime())) throw new Error('تاریخ پیگیری معتبر نیست.');
}

export async function completeFollowUp(id: string, outcome: string | null, now = new Date()): Promise<void> {
  await changeStatus(id, 'done', now, outcome?.trim() || null);
}

export async function setFollowUpStatus(
  id: string,
  status: 'missed' | 'cancelled' | 'pending',
  now = new Date(),
): Promise<void> {
  await changeStatus(id, status, now);
}

async function changeStatus(id: string, status: FollowUp['status'], now: Date, outcome?: string | null): Promise<void> {
  db.transaction((tx) => {
    const current = requireFollowUp(tx, id);
    tx.update(followUps)
      .set({
        status,
        ...(outcome !== undefined ? { outcome } : {}),
        completedAt: status === 'pending' ? null : now,
        reminderRevision: current.reminderRevision + 1,
        ...touch(now),
      })
      .where(eq(followUps.id, id))
      .run();
  });
  await audit('followup.statusChanged', { entityType: 'followUp', entityId: id, detail: { status } });
  await reconcileFollowUpReminder(id);
}

export async function deleteFollowUp(id: string): Promise<void> {
  db.transaction((tx) => {
    const current = requireFollowUp(tx, id);
    tx.update(followUps)
      .set({ ...softDelete(), reminderRevision: current.reminderRevision + 1 })
      .where(eq(followUps.id, id))
      .run();
  });
  await audit('followup.deleted', { entityType: 'followUp', entityId: id });
  await reconcileFollowUpReminder(id);
}

/** Parent deletion is already durable; repair reads the parent's current state. */
export async function cancelPatientReminders(patientId: string): Promise<void> {
  await repairFollowUpReminders({ patientId });
}

/** Re-arm future reminders after restoring a patient or a backup. */
export async function rescheduleReminders(filter: { patientId?: string } = {}): Promise<number> {
  return repairFollowUpReminders(filter);
}
