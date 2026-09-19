import { addDatabaseChangeListener } from 'expo-sqlite';
import { useEffect, useState, type DependencyList } from 'react';

import { tablesOf } from './query-tables';

/**
 * A reactive query hook, used instead of drizzle's `useLiveQuery` everywhere.
 *
 * drizzle's hook has three behaviours that bite in this app:
 *
 * 1. It only watches the table in `FROM`. A query that joins `lab_panels`
 *    never refreshes when a panel is deleted, and the Today screen keeps
 *    showing follow-ups of a patient who was just deleted.
 * 2. It re-runs on every single row event. A restore inserts thousands of
 *    rows, which would trigger thousands of re-queries on every mounted screen.
 * 3. Its initial `data` is `[]`, indistinguishable from "no rows", so screens
 *    flash "not found" before the first result lands.
 *
 * This hook watches every table the query touches (FROM plus joins), coalesces
 * bursts of change events into one re-run, and reports `data: undefined`
 * until the first result, so `loading` is real.
 */

type Thenable<T> = { then: Promise<T>['then'] };

const BURST_WINDOW_MS = 60;

export function useLive<T>(
  query: Thenable<T[]>,
  deps: DependencyList = [],
): { data: T[] | undefined; error: Error | undefined; loading: boolean } {
  const [data, setData] = useState<T[] | undefined>(undefined);
  const [error, setError] = useState<Error | undefined>(undefined);

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let inFlight = false;
    let rerunRequested = false;

    const run = () => {
      if (inFlight) {
        // Coalesce: one more run after the current one, however many events arrived.
        rerunRequested = true;
        return;
      }
      inFlight = true;
      query
        .then(
          (rows) => {
            if (alive) {
              setData(rows);
              setError(undefined);
            }
          },
          (e: unknown) => {
            if (alive) setError(e instanceof Error ? e : new Error(String(e)));
          },
        )
        .then(() => {
          inFlight = false;
          if (alive && rerunRequested) {
            rerunRequested = false;
            run();
          }
        });
    };

    run();

    const watched = new Set(tablesOf(query));
    const sub = addDatabaseChangeListener(({ tableName }) => {
      if (!watched.has(tableName)) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(run, BURST_WINDOW_MS);
    });

    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
      sub.remove();
    };
    // `deps` is the caller's contract, exactly as with useLiveQuery: the query
    // object is rebuilt on every render, so it cannot be a dependency itself.
    // The one built when `deps` last changed is equivalent to any later one.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { data, error, loading: data === undefined && error === undefined };
}
