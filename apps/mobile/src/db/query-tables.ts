import { Column, getTableName, is, SQL, Subquery, Table } from 'drizzle-orm';

/**
 * Every table a drizzle select reads, including nested projections and unions.
 *
 * This reads drizzle's query config, which is not a documented public API. It
 * has tests in data.test.ts precisely so a drizzle upgrade that changes
 * the shape fails loudly there, instead of quietly making screens stop
 * refreshing when a joined table changes.
 */
export function tablesOf(query: unknown): string[] {
  const config = (query as { config?: { table?: unknown; joins?: { table: unknown }[] } }).config;
  const candidates = [config?.table, ...(config?.joins ?? []).map((j) => j.table)];
  const names = new Set<string>();
  const fromTables = new Set<string>();
  const projections = new Set<string>();
  for (const t of candidates) {
    if (t && is(t, Table)) {
      names.add(getTableName(t));
      fromTables.add(getTableName(t));
    }
  }
  // A limited/windowed subquery can be the outer FROM. Its underlying tables
  // still need subscriptions, as do tables in predicates or union branches.
  // Preserve the existing FROM/join order before inspecting the public SQL tree.
  const seen = new Set<unknown>();
  const visit = (value: unknown): void => {
    if (!value || seen.has(value)) return;
    seen.add(value);
    if (is(value, Table)) {
      names.add(getTableName(value));
      fromTables.add(getTableName(value));
    } else if (is(value, Column)) names.add(getTableName(value.table));
    else if (is(value, SQL)) value.queryChunks.forEach(visit);
    else if (is(value, SQL.Aliased)) visit(value.sql);
    else if (is(value, Subquery)) {
      projections.add(value._.alias);
      visit(value._.sql);
    } else if (Array.isArray(value)) value.forEach(visit);
    else if (typeof (value as { getSQL?: unknown }).getSQL === 'function')
      visit((value as { getSQL: () => unknown }).getSQL());
  };
  const wrapper = query as { getSQL?: () => unknown };
  if (typeof wrapper?.getSQL === 'function') visit(wrapper.getSQL());
  // Selected columns have a synthetic table bearing the projection alias. It
  // emits no SQLite events. A real FROM table with the same name still counts.
  return [...names].filter((name) => !projections.has(name) || fromTables.has(name));
}
