import { describe, expect, it } from '@jest/globals';

import migrations from '@/db/migrations/migrations';
import { createTestDatabase } from '@/test/sqljs';

import { pendingMigrationTags } from './migration-plan';

describe('bundled migrations', () => {
  it('apply cleanly to an empty database through the app migrator', async () => {
    const { conn } = await createTestDatabase();
    const tables = conn
      .getAllSync<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")
      .map((r) => r.name);
    expect(tables).toEqual(expect.arrayContaining(['patients', 'notes', 'lab_values', 'settings', 'audit_log']));
    const applied = conn.getFirstSync<{ n: number }>('SELECT count(*) AS n FROM __drizzle_migrations');
    expect(applied?.n).toBe(migrations.journal.entries.length);
  });

  it('leave foreign keys consistent', async () => {
    const { conn } = await createTestDatabase();
    expect(conn.getAllSync('PRAGMA foreign_key_check')).toEqual([]);
  });

  it('have one bundled SQL file per journal entry', () => {
    const bundled: Record<string, string | undefined> = migrations.migrations;
    for (const entry of migrations.journal.entries) {
      const key = `m${String(entry.idx).padStart(4, '0')}`;
      expect(typeof bundled[key]).toBe('string');
    }
  });
});

describe('pendingMigrationTags', () => {
  const journal = [
    { when: 100, tag: '0000_init' },
    { when: 200, tag: '0001_more' },
    { when: 300, tag: '0002_again' },
  ];

  it('treats a brand-new database as needing everything', () => {
    expect(pendingMigrationTags(journal, null)).toEqual(['0000_init', '0001_more', '0002_again']);
  });

  it('returns only migrations newer than the last applied one', () => {
    expect(pendingMigrationTags(journal, 200)).toEqual(['0002_again']);
  });

  it('returns nothing for an up-to-date database', () => {
    expect(pendingMigrationTags(journal, 300)).toEqual([]);
  });
});
