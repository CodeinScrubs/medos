/**
 * drizzle reports a failed query as "Failed query: … params: <values>", and
 * those values can be a patient's name, a national id, or a whole note. Since
 * a parameter may itself contain newlines, everything from `params:` to the
 * end of the message goes — not just the rest of that line. Anything that
 * leaves the database layer as text (the on-phone error log, an alert, a
 * copied error report) goes through this first.
 */
export function redactErrorText(text: string): string {
  return text.replace(/params\s*:[\s\S]*/i, 'params: [redacted]');
}
