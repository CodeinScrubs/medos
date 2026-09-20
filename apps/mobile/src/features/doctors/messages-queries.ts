import { and, desc, eq, isNull } from 'drizzle-orm';

import { db } from '@/db/client';
import { scheduledMessages, type ScheduledMessage } from '@/db/schema';
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
    .orderBy(desc(scheduledMessages.scheduledFor));
}

/** The text was handed to a messenger. Whether it left is not known yet. */
export async function logGreetingPrepared(input: {
  doctorId: string;
  occasionId?: string | null;
  channel: ScheduledMessage['channel'];
  body: string;
}): Promise<string> {
  const id = newId();
  const now = new Date();
  await db.insert(scheduledMessages).values({
    id,
    ...stamps(now),
    doctorId: input.doctorId,
    occasionId: input.occasionId ?? null,
    channel: input.channel,
    body: input.body,
    scheduledFor: now,
    status: 'ready',
  });
  return id;
}

/** The user says they sent it. Only this writes `sentAt`. */
export async function confirmGreetingSent(id: string): Promise<void> {
  const now = new Date();
  await db
    .update(scheduledMessages)
    .set({ status: 'sent', sentAt: now, ...touch(now) })
    .where(eq(scheduledMessages.id, id));
}

/** The user says they did not. */
export async function markGreetingSkipped(id: string): Promise<void> {
  await db
    .update(scheduledMessages)
    .set({ status: 'skipped', ...touch() })
    .where(eq(scheduledMessages.id, id));
}
