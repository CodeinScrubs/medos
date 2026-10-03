import { drizzle, type ExpoSQLiteDatabase } from 'drizzle-orm/expo-sqlite';
import * as SQLite from 'expo-sqlite';

import type { DatasetReplacement } from '@/lib/dataset-write';

import * as schema from './schema';
import { admittedConnection, admittedDriver, restrictDatabaseClient, writeAdmission } from './write-admission';

export const DATABASE_NAME = 'medos.db';

/**
 * The single SQLite connection for the whole app.
 *
 * Opened synchronously at module scope so it exists before the first screen
 * renders. The file lives in the app's private storage, which Android encrypts
 * at rest and no other app can read.
 *
 * `enableChangeListener` powers `useLive` (src/db/use-live.ts): a write
 * anywhere re-renders every screen observing that table, with no cache to
 * invalidate by hand.
 */
const nativeDatabase = SQLite.openDatabaseSync(DATABASE_NAME, { enableChangeListener: true });

/*
 * Connection settings, applied the moment the database opens — before
 * migrations, seeds or any query can run.
 *
 * - `foreign_keys` is off by default in SQLite; without it the schema's
 *   `ON DELETE CASCADE` rules silently do nothing.
 * - WAL keeps reads fast while a write is in flight (a photo import running
 *   behind the patient list).
 * - `busy_timeout` makes a briefly locked database wait instead of failing.
 * - `synchronous = FULL` is set explicitly rather than left to whatever the
 *   bundled SQLite was compiled with. In WAL mode the usual default is
 *   NORMAL, which keeps the database consistent across a power cut but may
 *   lose the last committed transactions — and the last committed transaction
 *   here is the sentence someone just typed into a note. FULL costs an fsync
 *   per commit; a phone that dies mid-shift costs more.
 */
nativeDatabase.execSync('PRAGMA journal_mode = WAL;');
nativeDatabase.execSync('PRAGMA synchronous = FULL;');
nativeDatabase.execSync('PRAGMA foreign_keys = ON;');
nativeDatabase.execSync('PRAGMA busy_timeout = 5000;');

export const sqlite =
  admittedConnection<
    Pick<SQLite.SQLiteDatabase, 'execSync' | 'getAllSync' | 'getFirstSync' | 'withTransactionSync' | 'databasePath'>
  >(nativeDatabase);
export const db: ExpoSQLiteDatabase<typeof schema> & { readonly $client: typeof sqlite } = restrictDatabaseClient(
  drizzle(admittedDriver(nativeDatabase), { schema, logger: writeAdmission() }),
  sqlite,
);

/** Only the restore engine owns this revocable authority; never ambient across awaits. */
export function restoreDatabase(replacement: DatasetReplacement) {
  replacement.authorize();
  const connection = admittedConnection<typeof sqlite>(nativeDatabase, replacement.authorize);
  return {
    db: restrictDatabaseClient(
      drizzle(admittedDriver(nativeDatabase, replacement.authorize), {
        schema,
        logger: writeAdmission(replacement.authorize),
      }),
      connection,
    ),
    sqlite: connection,
  };
}

export type Database = typeof db;
/** Synchronous write context, shared by operations that must commit together. */
export type DbTransaction = Parameters<Parameters<Database['transaction']>[0]>[0];

export { schema };
