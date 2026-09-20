import { and, desc, eq, isNull } from 'drizzle-orm';

import { db } from '@/db/client';
import { scheduledMessages, type ScheduledMessage } from '@/db/schema';
import { newId, stamps } from '@/lib/ids';

/*
 * The log of greetings that were actually handed to a messenger.
 *
 * MedOS never sends anything itself, so "sent" here means the user tapped a
 * channel and the messenger opened with the text. That is still the useful
 * fact months later: whether this person was congratulated this year, and
 * what was written, so the next message does not repeat it word for word.
 */

const alive = isNull(scheduledMessages.deletedAt);

export function doctorMessagesQuery(doctorId: string) {
  return db
    .select()
    .from(scheduledMessages)
    .where(and(alive, eq(scheduledMessages.doctorId, doctorId)))
    .orderBy(desc(scheduledMessages.scheduledFor));
}

export async function logGreetingSent(input: {
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
    status: 'sent',
    sentAt: now,
  });
  return id;
}
