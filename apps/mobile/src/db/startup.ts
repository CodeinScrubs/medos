import { migrate } from 'drizzle-orm/expo-sqlite/migrator';

import { audit } from './audit';
import { sqlite, db } from './client';
import { pendingMigrationTags } from './migration-plan';
import migrations from './migrations/migrations';
import { runSeeds } from './seed';
import { snapshotDatabase } from './snapshots';

/** Timestamp of the newest applied migration, or null on a fresh install. */
function lastAppliedMigration(): number | null {
  const table = sqlite.getFirstSync<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name = '__drizzle_migrations'",
  );
  if (!table) return null;
  const row = sqlite.getFirstSync<{ created_at: number | string | null }>(
    'SELECT created_at FROM __drizzle_migrations ORDER BY created_at DESC LIMIT 1',
  );
  return row?.created_at == null ? null : Number(row.created_at);
}

/**
 * Bring the database to the schema this build expects.
 *
 * When an app update brings new migrations to a database that already holds
 * data, a snapshot is taken first. drizzle applies all pending migrations in
 * one transaction, so a migration that *fails* rolls back cleanly — the
 * snapshot is for the worse case, a migration that succeeds but reshapes data
 * wrongly.
 */
export async function startDatabase(): Promise<void> {
  const lastAppliedAt = lastAppliedMigration();
  const pending = pendingMigrationTags(migrations.journal.entries, lastAppliedAt);

  if (pending.length > 0 && lastAppliedAt != null) {
    snapshotDatabase('pre-migration');
  }

  await migrate(db, migrations);
  await runSeeds();

  if (pending.length > 0 && lastAppliedAt != null) {
    await audit('db.migrated', { summary: pending.join(', '), detail: { migrations: pending } });
  }
}
