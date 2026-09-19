import { z } from 'zod';

import type { FollowUp } from '@/db/schema';
import { daysBetween } from '@/lib/jalali';
import { addDays, startOfDay } from '@/lib/time';

/**
 * Push a follow-up back by `days`. Something already overdue is postponed
 * from today, not from the day it was missed — "in 3 days" means three days
 * from now. The clock time of the original reminder is kept.
 */
export function postponedDueDate(dueAt: Date, days: number, now: Date = new Date()): Date {
  const base = dueAt.getTime() < now.getTime() ? now : dueAt;
  const shifted = addDays(startOfDay(base), days);
  return new Date(shifted.getFullYear(), shifted.getMonth(), shifted.getDate(), dueAt.getHours(), dueAt.getMinutes());
}

export type Urgency = 'overdue' | 'today' | 'upcoming' | 'closed';

export function urgencyOf(followUp: Pick<FollowUp, 'status' | 'dueAt'>, now: Date = new Date()): Urgency {
  if (followUp.status !== 'pending') return 'closed';
  const diff = daysBetween(followUp.dueAt, now) ?? 0;
  if (diff < 0) return 'overdue';
  if (diff === 0) return 'today';
  return 'upcoming';
}

/** Default due time for a new follow-up: a week from today at 10:00. */
export function defaultDueDate(now: Date = new Date()): Date {
  const d = addDays(now, 7);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 10, 0);
}

/**
 * The data a follow-up reminder carries, validated when the notification is
 * tapped: it arrives from the OS, so it is checked before it drives navigation.
 */
export const reminderPayload = z.object({
  kind: z.literal('follow-up'),
  patientId: z.string().min(1),
  followUpId: z.string().min(1),
});

export type ReminderPayload = z.infer<typeof reminderPayload>;

export function parseReminderPayload(data: unknown): ReminderPayload | null {
  const result = reminderPayload.safeParse(data);
  return result.success ? result.data : null;
}
