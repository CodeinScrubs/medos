import { and, asc, eq, isNull, lte, sql } from 'drizzle-orm';

import { db } from '@/db/client';
import { followUps, patients, type FollowUp } from '@/db/schema';
import { resolveActiveEncounterId } from '@/features/encounters/queries';
import { newId, softDelete, stamps, touch } from '@/lib/ids';
import { endOfDay } from '@/lib/time';
import { CHANNELS, cancelReminder, scheduleReminder } from '@/platform/notifications';

import { FOLLOWUP_CHANNEL_LABELS } from './labels';
import type { ReminderPayload } from './logic';

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

async function patientName(patientId: string): Promise<string> {
  const row = (
    await db
      .select({ firstName: patients.firstName, lastName: patients.lastName })
      .from(patients)
      .where(eq(patients.id, patientId))
      .limit(1)
  )[0];
  return row ? `${row.firstName} ${row.lastName}` : 'بیمار';
}

async function scheduleFor(followUp: {
  id: string;
  patientId: string;
  dueAt: Date;
  reason: string;
  channel: FollowUp['channel'];
}): Promise<string | null> {
  return scheduleReminder({
    at: followUp.dueAt,
    title: `پیگیری: ${await patientName(followUp.patientId)}`,
    body: `${FOLLOWUP_CHANNEL_LABELS[followUp.channel]} — ${followUp.reason}`,
    channelId: CHANNELS.followUps,
    data: { kind: 'follow-up', patientId: followUp.patientId, followUpId: followUp.id } satisfies ReminderPayload,
  });
}

export type FollowUpInput = {
  patientId: string;
  dueAt: Date;
  reason: string;
  channel: FollowUp['channel'];
  priority: FollowUp['priority'];
};

export async function createFollowUp(input: FollowUpInput): Promise<string> {
  const id = newId();
  const encounterId = await resolveActiveEncounterId(input.patientId);
  const notificationId = await scheduleFor({ id, ...input });
  try {
    await db.insert(followUps).values({
      id,
      ...stamps(),
      patientId: input.patientId,
      encounterId,
      dueAt: input.dueAt,
      reason: input.reason.trim(),
      channel: input.channel,
      priority: input.priority,
      status: 'pending',
      notificationId,
    });
  } catch (e) {
    // No row, no reminder: one that fires for nothing is worse than none.
    await cancelReminder(notificationId);
    throw e;
  }
  return id;
}

export async function updateFollowUp(id: string, patch: Partial<Omit<FollowUpInput, 'patientId'>>): Promise<void> {
  const current = (await db.select().from(followUps).where(eq(followUps.id, id)).limit(1))[0];
  if (!current) throw new Error(`Follow-up ${id} not found`);

  const merged = { ...current, ...patch };
  // Any change to when/what/how means the old reminder is wrong; replace it.
  await cancelReminder(current.notificationId);
  const notificationId = merged.status === 'pending' ? await scheduleFor(merged) : null;

  await db
    .update(followUps)
    .set({ ...patch, notificationId, ...touch() })
    .where(eq(followUps.id, id));
}

export async function completeFollowUp(id: string, outcome: string | null): Promise<void> {
  const current = (await db.select().from(followUps).where(eq(followUps.id, id)).limit(1))[0];
  if (!current) return;
  await cancelReminder(current.notificationId);
  await db
    .update(followUps)
    .set({ status: 'done', outcome, completedAt: new Date(), notificationId: null, ...touch() })
    .where(eq(followUps.id, id));
}

export async function setFollowUpStatus(id: string, status: 'missed' | 'cancelled' | 'pending'): Promise<void> {
  const current = (await db.select().from(followUps).where(eq(followUps.id, id)).limit(1))[0];
  if (!current) return;
  await cancelReminder(current.notificationId);
  const notificationId = status === 'pending' ? await scheduleFor(current) : null;
  await db
    .update(followUps)
    .set({ status, notificationId, completedAt: status === 'pending' ? null : new Date(), ...touch() })
    .where(eq(followUps.id, id));
}

export async function deleteFollowUp(id: string): Promise<void> {
  const current = (await db.select().from(followUps).where(eq(followUps.id, id)).limit(1))[0];
  await cancelReminder(current?.notificationId);
  await db.update(followUps).set(softDelete()).where(eq(followUps.id, id));
}

/**
 * Silence a patient's pending reminders — used when the patient is deleted.
 * The follow-ups stay pending, so restoring the patient can bring the
 * reminders back.
 */
export async function cancelPatientReminders(patientId: string): Promise<void> {
  const rows = await db
    .select()
    .from(followUps)
    .where(and(alive, eq(followUps.patientId, patientId), eq(followUps.status, 'pending')));
  for (const f of rows) {
    await cancelReminder(f.notificationId);
    await db.update(followUps).set({ notificationId: null }).where(eq(followUps.id, f.id));
  }
}

/**
 * Re-create the OS reminder for every pending follow-up of living patients
 * (or of one patient). Needed after restoring a deleted patient, and after a
 * restore — where the caller first cancels everything the OS holds, since the
 * stored notification ids belong to the phone that made the backup. Returns
 * how many reminders were scheduled.
 */
export async function rescheduleReminders(filter: { patientId?: string } = {}): Promise<number> {
  const rows = await db
    .select({ followUp: followUps })
    .from(followUps)
    .innerJoin(patients, eq(followUps.patientId, patients.id))
    .where(
      and(
        alive,
        isNull(patients.deletedAt),
        eq(followUps.status, 'pending'),
        filter.patientId ? eq(followUps.patientId, filter.patientId) : undefined,
      ),
    );

  let scheduled = 0;
  for (const { followUp } of rows) {
    await cancelReminder(followUp.notificationId);
    const notificationId = await scheduleFor(followUp);
    if (notificationId) scheduled += 1;
    await db.update(followUps).set({ notificationId }).where(eq(followUps.id, followUp.id));
  }
  return scheduled;
}
