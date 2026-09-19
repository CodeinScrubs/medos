/**
 * Copying a restored database into the live one.
 *
 * Written against a minimal synchronous SQL interface rather than expo-sqlite
 * directly, so the exact logic that runs on the phone is also exercised by the
 * test suite against a real SQLite.
 */

export type SqlConnection = {
  execSync(sql: string): void;
  getAllSync<T>(sql: string): T[];
  getFirstSync<T>(sql: string): T | null;
  withTransactionSync(task: () => void): void;
};

/**
 * Tables that describe this phone rather than the clinical record, and so are
 * never overwritten by a restore:
 *
 * - `__drizzle_migrations`: the live schema's own history.
 * - `backup_runs`: this phone's backup log. The snapshot inside a backup holds
 *   its own run still marked "running", which would otherwise reappear here
 *   as a phantom failure.
 */
export const DEVICE_LOCAL_TABLES: ReadonlySet<string> = new Set(['__drizzle_migrations', 'backup_runs']);

/**
 * Rows inside shared tables that describe this phone, as SQL conditions. The
 * backup configuration — the folder grant, the schedule, the time of the last
 * success — belongs to the phone doing the restoring; the folder grant of the
 * phone that made the backup would not even work here.
 */
export const DEVICE_LOCAL_ROWS: Readonly<Record<string, string>> = {
  settings: "key LIKE 'backup.%'",
};

/**
 * Append-only history, merged rather than replaced: what happened on this
 * phone before the restore stays on record next to what the backup brings.
 */
export const MERGED_TABLES: ReadonlySet<string> = new Set(['audit_log']);

const quoteIdent = (name: string) => `"${name.replace(/"/g, '""')}"`;

/**
 * Replace every clinical table in `main` with the contents of the same table
 * in the attached `source` schema, in one transaction.
 *
 * Only columns present on both sides are copied. That keeps a backup made by
 * an older build restorable after later migrations added columns — which, per
 * the project rules, are always nullable or defaulted. A table missing from
 * the backup ends up empty, which is what "restore this backup" means.
 *
 * Foreign keys are not enforced statement by statement during the copy (the
 * tables are briefly inconsistent while they are emptied and refilled), so the
 * whole result is checked before the transaction commits: a backup with a row
 * pointing at something that is not there rolls back instead of landing as a
 * broken record.
 *
 * Throws, leaving `main` untouched, if any table cannot be copied.
 */
export function importTables(conn: SqlConnection, source = 'restore_src'): { tables: number; rows: number } {
  const src = quoteIdent(source);
  const liveTables = conn
    .getAllSync<{ name: string }>(
      "SELECT name FROM main.sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'",
    )
    .map((r) => r.name)
    .filter((name) => !DEVICE_LOCAL_TABLES.has(name));

  const sourceTables = new Set(
    conn.getAllSync<{ name: string }>(`SELECT name FROM ${src}.sqlite_master WHERE type = 'table'`).map((r) => r.name),
  );

  let tables = 0;
  let rows = 0;

  conn.withTransactionSync(() => {
    for (const table of liveTables) {
      const t = quoteIdent(table);
      const localRows = DEVICE_LOCAL_ROWS[table];
      const onlyShared = localRows ? ` WHERE NOT (${localRows})` : '';
      const merge = MERGED_TABLES.has(table);

      if (!merge) conn.execSync(`DELETE FROM main.${t}${onlyShared}`);
      if (!sourceTables.has(table)) continue;

      const liveCols = conn.getAllSync<{ name: string }>(`PRAGMA main.table_info(${t})`).map((c) => c.name);
      const sourceCols = new Set(
        conn.getAllSync<{ name: string }>(`PRAGMA ${src}.table_info(${t})`).map((c) => c.name),
      );
      const cols = liveCols
        .filter((c) => sourceCols.has(c))
        .map(quoteIdent)
        .join(', ');
      if (!cols) continue;

      conn.execSync(
        `INSERT ${merge ? 'OR IGNORE ' : ''}INTO main.${t} (${cols}) SELECT ${cols} FROM ${src}.${t}${onlyShared}`,
      );
      rows += conn.getFirstSync<{ n: number }>('SELECT changes() AS n')?.n ?? 0;
      tables += 1;
    }

    const broken = conn.getAllSync<{ table: string }>('PRAGMA main.foreign_key_check');
    if (broken.length > 0) {
      const where = [...new Set(broken.map((r) => r.table))].join(', ');
      throw new Error(`بکاپ ناقص است: ارجاع‌های نادرست در ${where}`);
    }
  });

  return { tables, rows };
}
