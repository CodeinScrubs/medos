/** Pure backup rules, shared by the engine and the screens that report on it. */

const HOUR = 3_600_000;

/** How old the newest backup may get before the app starts warning about it. */
export const BACKUP_STALE_AFTER_MS = 3 * 24 * HOUR;

/** Whether an automatic backup is due, given the last success and the interval. */
export function isBackupDue(lastSuccessAt: number | null, intervalHours: number, now: number): boolean {
  if (lastSuccessAt == null) return true;
  const age = now - lastSuccessAt;
  // A last success in the future means the clock was changed; back up rather
  // than wait for the clock to catch up.
  return age < 0 || age >= intervalHours * HOUR;
}

export type BackupFreshness = 'never' | 'stale' | 'fresh';

export type BackupDelivery = { at: number; strength: 'bytes' | 'size' | 'confirmed' };

/** Do not attach old evidence to a timestamp written by another app version. */
export function deliveryStrength(lastSuccessAt: number | null, delivery: BackupDelivery | null) {
  return delivery && delivery.at === lastSuccessAt ? delivery.strength : null;
}

/** For the status lines: never backed up, backed up too long ago, or fine. */
export function backupFreshness(lastSuccessAt: number | null, now: number): BackupFreshness {
  if (lastSuccessAt == null) return 'never';
  const age = now - lastSuccessAt;
  return age < 0 || age > BACKUP_STALE_AFTER_MS ? 'stale' : 'fresh';
}
