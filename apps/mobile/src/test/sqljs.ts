import { migrate } from 'drizzle-orm/expo-sqlite/migrator';
import { drizzle } from 'drizzle-orm/sql-js';
import initSqlJs, { type Database as SqlJsDatabase, type SqlJsStatic } from 'sql.js';

import type { Database } from '@/db/client';
import migrations from '@/db/migrations/migrations';
import * as schema from '@/db/schema';
import type { SqlConnection } from '@/features/backup/import';

/**
 * An in-memory SQLite with the app's real migrations applied, for tests.
 *
 * The migrations are the exact bundle the app ships (`db/migrations/
 * migrations.js`), applied by drizzle's own expo migrator — so a test database
 * goes through the same startup path as the one on the phone.
 *
 * The drizzle instance is typed as the app's `Database`: the sql.js and
 * expo-sqlite drivers expose the same query builder and the same synchronous
 * transaction semantics, which is exactly what the data layer relies on.
 */
export type TestDatabase = {
  sqlite: SqlJsDatabase;
  db: Database;
  conn: SqlConnection;
};

let SQL: SqlJsStatic | null = null;

export async function createTestDatabase(): Promise<TestDatabase> {
  SQL ??= await initSqlJs();
  const sqlite = new SQL.Database();
  sqlite.exec('PRAGMA foreign_keys = ON;');
  const db = drizzle(sqlite, { schema }) as unknown as Database;
  await migrate(db, migrations);
  return { sqlite, db, conn: sqlJsConnection(sqlite) };
}

/** The minimal synchronous interface the restore code is written against. */
export function sqlJsConnection(sqlite: SqlJsDatabase): SqlConnection {
  const all = <T>(sql: string): T[] => {
    const stmt = sqlite.prepare(sql);
    const rows: T[] = [];
    try {
      while (stmt.step()) rows.push(stmt.getAsObject() as T);
    } finally {
      stmt.free();
    }
    return rows;
  };
  return {
    execSync: (sql) => {
      sqlite.exec(sql);
    },
    getAllSync: all,
    getFirstSync: <T>(sql: string) => all<T>(sql)[0] ?? null,
    withTransactionSync: (task) => {
      sqlite.exec('BEGIN');
      try {
        task();
        sqlite.exec('COMMIT');
      } catch (e) {
        sqlite.exec('ROLLBACK');
        throw e;
      }
    },
  };
}
