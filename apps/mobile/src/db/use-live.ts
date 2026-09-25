import { addDatabaseChangeListener } from 'expo-sqlite';
import { useCallback, useEffect, useRef, useState, type DependencyList } from 'react';

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
 * `retry` re-runs a failed read without requiring a write or navigation. A
 * failed refresh retains the last rows and its error until a read succeeds;
 * consumers must not present those rows as a complete, current result.
 *
 * When `deps` change, the previous rows stay on screen until the new query
 * lands — a few milliseconds against a local database. That is deliberate: a
 * patient list that emptied on every keystroke would flicker. Screens that
 * must never show another record's data get a fresh mount per record, which
 * the router already does for `/patient/[id]`.
 */

type Thenable<T> = { then: Promise<T>['then'] };

const BURST_WINDOW_MS = 60;

export function useLive<T>(
  query: Thenable<T[]>,
  deps: DependencyList = [],
): { data: T[] | undefined; error: Error | undefined; loading: boolean; retry: () => void } {
  const [data, setData] = useState<T[] | undefined>(undefined);
  const [error, setError] = useState<Error | undefined>(undefined);
  const retryRef = useRef<(() => void) | null>(null);
  const retry = useCallback(() => retryRef.current?.(), []);

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let inFlight = false;
    let rerunRequested = false;

    const run = () => {
      if (!alive) return;
      if (inFlight) {
        // Coalesce: one more run after the current one, however many events arrived.
        rerunRequested = true;
        return;
      }
      inFlight = true;
      Promise.resolve(query)
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

    retryRef.current = run;
    run();

    const watched = new Set(tablesOf(query));
    const sub = addDatabaseChangeListener(({ tableName }) => {
      if (!watched.has(tableName)) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(run, BURST_WINDOW_MS);
    });

    return () => {
      alive = false;
      if (retryRef.current === run) retryRef.current = null;
      if (timer) clearTimeout(timer);
      sub.remove();
    };
    // `deps` is the caller's contract, exactly as with useLiveQuery: the query
    // object is rebuilt on every render, so it cannot be a dependency itself.
    // The one built when `deps` last changed is equivalent to any later one.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { data, error, loading: data === undefined && error === undefined, retry };
}
