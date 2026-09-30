import type { FollowUp } from '@/db/schema';
import { endOfDay } from '@/lib/time';

export type FollowUpListMode = 'due' | 'upcoming';

export function followUpListMode(value: unknown): FollowUpListMode {
  return value === 'upcoming' ? 'upcoming' : 'due';
}

/** Pending rows come from the existing living-patient query; count before slicing. */
export function upcomingFollowUps<T extends { followUp: Pick<FollowUp, 'dueAt'> }>(rows: readonly T[], now: Date): T[] {
  const until = endOfDay(now).getTime();
  return rows.filter((row) => row.followUp.dueAt.getTime() > until);
}
