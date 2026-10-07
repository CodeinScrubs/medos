import { and, desc, eq, isNull } from 'drizzle-orm';

import { audit } from '@/db/audit';
import { db } from '@/db/client';
import { doctors, occasions, scheduledMessages, type ScheduledMessage } from '@/db/schema';
import { datasetGeneration, withDatasetWrite } from '@/lib/dataset-write';
import { newId, stamps, touch } from '@/lib/ids';

/*
 * The log of greetings.
 *
 * MedOS never sends anything itself, and a messenger opening is not a message
 * arriving — the user can still close it without pressing send. So a handed
 * over text is recorded as `ready`, and only the user's own confirmation makes
 * it `sent`. Months later the honest answer to "did I congratulate them?" is
 * worth more than a cheerful one.
 */

const alive = isNull(scheduledMessages.deletedAt);

export function doctorMessagesQuery(doctorId: string) {
  return db
    .select()
    .from(scheduledMessages)
    .where(and(alive, eq(scheduledMessages.doctorId, doctorId)))
    .orderBy(desc(scheduledMessages.scheduledFor), desc(scheduledMessages.createdAt), desc(scheduledMessages.id));
}

export type GreetingInput = {
  doctorId: string;
  occasionId?: string | null;
  channel: ScheduledMessage['channel'];
  body: string;
};

/** Also called before opening an external messenger from a delayed dialog. */
export function assertGreetingContext(input: GreetingInput): void {
  if (!input.body.trim()) throw new Error('متن پیام خالی است.');
  if (
    !db
      .select({ id: doctors.id })
      .from(doctors)
      .where(and(eq(doctors.id, input.doctorId), isNull(doctors.deletedAt)))
      .get()
  )
    throw new Error('پزشک پیدا نشد یا حذف شده است.');
  if (
    input.occasionId &&
    !db
      .select({ id: occasions.id })
      .from(occasions)
      .where(
        and(eq(occasions.id, input.occasionId), eq(occasions.doctorId, input.doctorId), isNull(occasions.deletedAt)),
      )
      .get()
  )
    throw new Error('مناسبت پیدا نشد یا متعلق به این پزشک نیست.');
}

/** The text was handed to a messenger. Whether it left is not known yet. */
export async function logGreetingPrepared(input: GreetingInput, generation = datasetGeneration()): Promise<string> {
  return withDatasetWrite(generation, async () => {
    const id = newId();
    const now = new Date();
    db.transaction((tx) => {
      assertGreetingContext(input);
      tx.insert(scheduledMessages)
        .values({
          id,
          ...stamps(now),
          doctorId: input.doctorId,
          occasionId: input.occasionId ?? null,
          channel: input.channel,
          body: input.body,
          scheduledFor: now,
          status: 'ready',
        })
        .run();
    });
    return id;
  });
}

/** The user says they sent it. Only this writes `sentAt`. */
export async function confirmGreetingSent(id: string, generation = datasetGeneration()): Promise<void> {
  await withDatasetWrite(generation, async () => {
    const changed = db.transaction((tx) => {
      const current = tx
        .select()
        .from(scheduledMessages)
        .where(and(alive, eq(scheduledMessages.id, id)))
        .get();
      if (!current) throw new Error('پیام پیدا نشد یا حذف شده است.');
      if (current.status === 'sent' && current.sentAt) return false;
      if (current.status !== 'ready') throw new Error('این پیام در انتظار تأیید ارسال نیست.');
      const now = new Date();
      tx.update(scheduledMessages)
        .set({ status: 'sent', sentAt: now, ...touch(now) })
        .where(and(alive, eq(scheduledMessages.id, id), eq(scheduledMessages.status, 'ready')))
        .run();
      return true;
    });
    if (changed) await audit('greeting.sentConfirmed', { entityType: 'message', entityId: id });
  });
}

/** The user says they did not. */
export async function markGreetingSkipped(id: string, generation = datasetGeneration()): Promise<void> {
  await withDatasetWrite(generation, async () => {
    const changed = db.transaction((tx) => {
      const current = tx
        .select()
        .from(scheduledMessages)
        .where(and(alive, eq(scheduledMessages.id, id)))
        .get();
      if (!current) throw new Error('پیام پیدا نشد یا حذف شده است.');
      if (current.status === 'skipped') return false;
      if (current.status !== 'ready' || current.sentAt)
        throw new Error('فقط پیام آمادهٔ ارسال را می‌توان نفرستاده ثبت کرد.');
      tx.update(scheduledMessages)
        .set({ status: 'skipped', sentAt: null, ...touch() })
        .where(and(alive, eq(scheduledMessages.id, id), eq(scheduledMessages.status, 'ready')))
        .run();
      return true;
    });
    if (changed) await audit('greeting.skipped', { entityType: 'message', entityId: id });
  });
}
