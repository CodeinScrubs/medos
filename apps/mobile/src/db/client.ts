import { drizzle } from 'drizzle-orm/expo-sqlite';
import * as SQLite from 'expo-sqlite';

import * as schema from './schema';

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
export const sqlite = SQLite.openDatabaseSync(DATABASE_NAME, { enableChangeListener: true });

/*
 * Connection settings, applied the moment the database opens — before
 * migrations, seeds or any query can run.
 *
 * - `foreign_keys` is off by default in SQLite; without it the schema's
 *   `ON DELETE CASCADE` rules silently do nothing.
 * - WAL keeps reads fast while a write is in flight (a photo import running
 *   behind the patient list).
 * - `busy_timeout` makes a briefly locked database wait instead of failing.
 */
sqlite.execSync('PRAGMA journal_mode = WAL;');
sqlite.execSync('PRAGMA foreign_keys = ON;');
sqlite.execSync('PRAGMA busy_timeout = 5000;');

export const db = drizzle(sqlite, { schema });

export type Database = typeof db;

export { schema };
