/**
 * drizzle reports a failed query as "Failed query: … params: <values>", and
 * those values can be a patient's name or national id. Anything that leaves
 * the database layer as text — the on-phone error log, an alert, a copied
 * error report — goes through this first.
 */
export function redactErrorText(text: string): string {
  return text.replace(/params\s*:[^\n]*/gi, 'params: [redacted]');
}
