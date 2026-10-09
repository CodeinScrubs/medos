/** A restore acknowledges the exact tombstone shown, never a newer or alive row. */
export function requireDeletedRecord<T extends { id: string; deletedAt: Date | null }>(
  current: T | undefined,
  expected?: T,
): T {
  if (!current?.deletedAt) throw new Error('این مورد دیگر در سطل زباله نیست؛ فهرست را دوباره بخوانید.');
  if (
    expected &&
    (Object.keys(current) as (keyof T)[]).some((key) => JSON.stringify(current[key]) !== JSON.stringify(expected[key]))
  )
    throw new Error('این مورد تغییر کرده است؛ فهرست را دوباره بخوانید و نسخهٔ جدید را بررسی کنید.');
  return current;
}
