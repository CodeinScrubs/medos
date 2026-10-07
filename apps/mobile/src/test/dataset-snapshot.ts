import { restoreDatabase } from '@/db/client';
import { importTables } from '@/features/backup/import';
import { reserveDatasetReplacement } from '@/lib/dataset-write';
import { newId } from '@/lib/ids';

import type { TestDatabase } from './sqljs';

/** Real SQL replacement, including unchanged ids/revisions; no mocked write results. */
export function snapshotDataset(t: TestDatabase): () => void {
  const path = `/intent-${newId()}.db`;
  t.sqlite.exec(`VACUUM INTO '${path}'`);
  return () => {
    const replacement = reserveDatasetReplacement();
    const trusted = restoreDatabase(replacement);
    try {
      trusted.sqlite.execSync('PRAGMA foreign_keys = OFF');
      trusted.sqlite.execSync(`ATTACH DATABASE '${path}' AS restore_src`);
      try {
        importTables(trusted.sqlite);
      } finally {
        trusted.sqlite.execSync('DETACH DATABASE restore_src');
        trusted.sqlite.execSync('PRAGMA foreign_keys = ON');
      }
      replacement.committed();
    } finally {
      replacement.release();
    }
  };
}

/** Compare every table, including history, drafts and audit, independent of row order. */
export function databaseRows(t: TestDatabase) {
  const tables = t.conn.getAllSync<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
  );
  return Object.fromEntries(
    tables.map(({ name }) => {
      if (!/^[a-z_]+$/.test(name)) throw new Error('Unexpected test table');
      const rows = t.conn.getAllSync<Record<string, unknown>>(`SELECT * FROM "${name}"`);
      rows.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
      return [name, rows];
    }),
  );
}

/** A probe always releases unexpected admission so a failing witness cannot poison another test. */
export function replacementFailure(): unknown {
  try {
    const replacement = reserveDatasetReplacement();
    replacement.release();
    return null;
  } catch (error) {
    return error;
  }
}
