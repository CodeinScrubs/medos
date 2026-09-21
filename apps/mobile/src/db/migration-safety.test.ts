import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from '@jest/globals';

/*
 * What a later migration is allowed to do to an older backup.
 *
 * A restore copies the columns the live schema and the backup have in common.
 * A column added after that backup was made is simply not in the SELECT, so
 * SQLite has to fill it: it can only do that from a DEFAULT. `NOT NULL` with
 * no DEFAULT therefore does not fail at migration time — it fails months
 * later, when someone restores a backup made before the column existed, and
 * the whole restore rolls back.
 *
 * Drizzle's `.$default()` is a JavaScript default: it fills the value on
 * insert and emits nothing in the DDL. For a new `NOT NULL` column the schema
 * needs `.default(...)`, which does.
 */
const dir = join(__dirname, 'migrations');

describe('migrations after the first', () => {
  const files = readdirSync(dir)
    .filter((f) => f.endsWith('.sql') && !f.startsWith('0000'))
    .sort();

  it.each(files)('%s adds no NOT NULL column without a default', (file) => {
    const sql = readFileSync(join(dir, file), 'utf8');
    const added = sql.match(/ADD\s+(?:COLUMN\s+)?[^;]+/gi) ?? [];
    for (const statement of added) {
      if (!/NOT\s+NULL/i.test(statement)) continue;
      expect(statement).toMatch(/DEFAULT/i);
    }
  });

  it('has migrations to check', () => {
    expect(files.length).toBeGreaterThan(0);
  });
});
