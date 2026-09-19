import type { Database } from '@/db/client';
import * as schema from '@/db/schema';
import type { SqlConnection } from '@/features/backup/import';

import type { TestDatabase } from './sqljs';

/**
 * Stand-in for `@/db/client` in data-layer tests, with the same exports:
 *
 *   jest.mock('@/db/client', () => jest.requireActual('@/test/db-client'));
 *
 * `db` and `sqlite` forward to whichever test database is current, so each
 * test can start from a fresh one with `useTestDatabase(await createTestDatabase())`.
 * jest.mock replaces the module by its resolved path, so imports of it
 * through `./client` inside src/db see the stand-in too.
 */
let current: TestDatabase | null = null;

export function useTestDatabase(database: TestDatabase): TestDatabase {
  current = database;
  return database;
}

function need(): TestDatabase {
  if (!current) throw new Error('No test database: call useTestDatabase() in beforeEach.');
  return current;
}

/** A stable object whose every property is read from the current test database at call time. */
function forward<T extends object>(target: () => T): T {
  return new Proxy({} as T, {
    get(_, prop) {
      const actual = target();
      const value: unknown = Reflect.get(actual, prop);
      return typeof value === 'function' ? value.bind(actual) : value;
    },
  });
}

export const DATABASE_NAME = 'test.db';
export { schema };
export const db: Database = forward(() => need().db);
export const sqlite: SqlConnection = forward(() => need().conn);
export type { Database };
