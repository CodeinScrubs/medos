import { getTableName, is, Table } from 'drizzle-orm';

/**
 * The tables a drizzle select reads: its FROM table plus every joined table.
 *
 * This reads drizzle's query config, which is not a documented public API. It
 * has a test (query-tables.test.ts) precisely so a drizzle upgrade that changes
 * the shape fails loudly there, instead of quietly making screens stop
 * refreshing when a joined table changes.
 */
export function tablesOf(query: unknown): string[] {
  const config = (query as { config?: { table?: unknown; joins?: { table: unknown }[] } }).config;
  const candidates = [config?.table, ...(config?.joins ?? []).map((j) => j.table)];
  const names = new Set<string>();
  for (const t of candidates) {
    if (t && is(t, Table)) names.add(getTableName(t));
  }
  return [...names];
}
