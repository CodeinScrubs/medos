import { useEffect, useState } from 'react';

/**
 * The current time, re-read every `intervalMs`. For anything on screen that
 * depends on "now" — "last backup three days ago", what counts as overdue — so
 * it stays true on a screen left open overnight, instead of freezing at the
 * moment the screen first rendered.
 */
export function useNow(intervalMs = 60_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}
