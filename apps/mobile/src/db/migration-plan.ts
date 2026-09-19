export type JournalEntry = { when: number; tag: string };

/**
 * Journal entries not yet applied to this database, by drizzle's own rule: a
 * migration is pending when its timestamp is newer than the last one applied.
 * `lastAppliedAt` is null on a brand-new database.
 */
export function pendingMigrationTags(entries: readonly JournalEntry[], lastAppliedAt: number | null): string[] {
  return entries.filter((e) => lastAppliedAt == null || e.when > lastAppliedAt).map((e) => e.tag);
}
