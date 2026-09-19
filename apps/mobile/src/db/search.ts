import { sql, type AnyColumn, type SQL } from 'drizzle-orm';

import { searchTerms } from '@/lib/persian';

/*
 * Text search over the pre-normalised `searchText` columns.
 *
 * `%` and `_` are wildcards in SQL LIKE. Whatever the user types is matched
 * literally, so both are escaped — with `!`, which unlike a backslash needs no
 * escaping of its own in JavaScript or SQL.
 */

const escapeLike = (text: string) => text.replace(/[!%_]/g, (c) => `!${c}`);

/** `column` contains `text` literally. */
export function contains(column: AnyColumn, text: string): SQL {
  return sql`${column} LIKE ${`%${escapeLike(text)}%`} ESCAPE '!'`;
}

/** `column` starts with `text` literally. */
export function startsWith(column: AnyColumn, text: string): SQL {
  return sql`${column} LIKE ${`${escapeLike(text)}%`} ESCAPE '!'`;
}

/**
 * One clause per search term: every term must appear somewhere in the row's
 * `searchText`, in any order. "رضایی علی" finds "علی رضایی", and a partial
 * national id or phone number works the same way. The query is normalised with
 * the same rules as the column, so "علي" finds "علی".
 */
export function matchesSearch(column: AnyColumn, query: string | null | undefined): SQL[] {
  return searchTerms(query ?? '').map((term) => contains(column, term));
}
