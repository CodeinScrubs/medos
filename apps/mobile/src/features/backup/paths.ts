import { toJalali } from '@/lib/jalali';

/**
 * `MedOS-1404-06-28_083015-full.medosbak` — Jalali, so it reads naturally in a
 * file manager. New backups include the run UUID so repeated/changed clocks do
 * not overwrite an older copy. The optional argument preserves legacy callers.
 */
export function backupFileName(now: Date, full: boolean, runId?: string): string {
  const { jy, jm, jd } = toJalali(now);
  const pad = (n: number) => String(n).padStart(2, '0');
  const time = `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  if (runId != null && !/^[0-9a-f-]{36}$/.test(runId)) throw new Error('Invalid backup run ID');
  return `MedOS-${jy}-${pad(jm)}-${pad(jd)}_${time}${runId ? `-${runId}` : ''}-${full ? 'full' : 'db'}.medosbak`;
}

/** Matches the names `backupFileName` produces, and those of earlier builds. */
export const BACKUP_FILE_RE = /^MedOS-\d{4}-\d{2}-\d{2}_\d{4,6}(?:-[0-9a-f-]{36})?-(full|db)\.medosbak$/;

/** Only app-created names, with the just-verified copy protected against clock rollback. */
export function backupNamesToPrune(names: string[], verifiedName: string): Set<string> {
  if (!BACKUP_FILE_RE.test(verifiedName) || !names.includes(verifiedName)) return new Set();
  const sorted = [...new Set(names)]
    .filter((name) => BACKUP_FILE_RE.test(name))
    .sort((a, b) => {
      if (a === verifiedName) return -1;
      if (b === verifiedName) return 1;
      return b.localeCompare(a);
    });
  const full = sorted.filter((name) => name.endsWith('-full.medosbak'));
  const dbOnly = sorted.filter((name) => name.endsWith('-db.medosbak'));
  return new Set([...full.slice(3), ...dbOnly.slice(7)]);
}

/**
 * Where an archive entry may be written, or null to skip it. Only the
 * database and files under media/ are accepted: a damaged or crafted backup
 * must not be able to write anywhere else in the app's storage.
 */
export function restoreTargetPath(path: string): 'database' | 'media' | null {
  if (path === 'db/medos.db') return 'database';
  const segments = path.split('/');
  const safe =
    /^media\/[A-Za-z0-9._\-/]+$/.test(path) && segments.every((seg) => seg !== '' && seg !== '.' && seg !== '..');
  return safe ? 'media' : null;
}
