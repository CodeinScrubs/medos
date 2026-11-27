/**
 * drizzle reports a failed query as "Failed query: … params: <values>", and
 * those values can be a patient's name, a national id, or a whole note. Since
 * a parameter may itself contain newlines, everything from `params:` to the
 * end of the message goes — not just the rest of that line. Anything that
 * contains that suffix can use this narrow legacy helper. It does not make
 * arbitrary text safe. Default persisted/displayed/copied/shared diagnostics
 * use the closed projection in error-diagnostic.ts instead.
 */
export function redactErrorText(text: string): string {
  return text.replace(/params\s*:[\s\S]*/i, 'params: [redacted]');
}
