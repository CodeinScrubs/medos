import { Directory, File, Paths } from 'expo-file-system';

import { newId } from '@/lib/ids';

import { sqlite } from './client';
import { sqlPath } from './files';

/**
 * Plain local copies of the database, taken automatically before anything that
 * rewrites it wholesale: a restore, or a schema migration after an app update.
 *
 * They stay in app-private storage (they are not backups — they die with the
 * phone) and exist so that a bad restore or a bad migration is recoverable on
 * the spot. Only the newest few of each kind are kept.
 */

export const SNAPSHOT_DIR = 'backups';

export type SnapshotKind = 'pre-restore' | 'pre-migration';

/**
 * VACUUM INTO writes a compacted, transactionally consistent copy even while
 * the app is writing — a byte copy of a WAL-mode database file is not safe.
 */
export function snapshotDatabase(kind: SnapshotKind, keep = 3, now = Date.now()): File {
  if (!Number.isInteger(keep) || keep < 1) throw new Error('Invalid safety-snapshot retention.');
  const dir = new Directory(Paths.document, SNAPSHOT_DIR);
  if (!dir.exists) dir.create({ intermediates: true });

  const existing = dir
    .list()
    .filter((e): e is File => e instanceof File && e.name.startsWith(`${kind}-`))
    .sort((a, b) => b.name.localeCompare(a.name));
  // Reserve a unique name even after a clock rollback or two calls in one ms.
  // Old snapshots remain valid inputs to retention; no filename migration.
  const target = new File(dir, `${kind}-${now}-${newId()}.db`);
  try {
    sqlite.execSync(`VACUUM INTO '${sqlPath(target.uri)}'`);
    if (!target.exists || (target.size ?? 0) <= 0) throw new Error('نسخهٔ ایمنی ساخته نشد.');
  } catch (e) {
    // A failed VACUUM can leave a partial destination. Never prune good copies
    // to make room for it, and never remove anything except this reserved file.
    try {
      if (target.exists) target.delete();
    } catch {
      // A partial leftover costs space; the earlier safety copies stay intact.
    }
    throw e;
  }

  // Retain this completed snapshot regardless of the clock. Failed cleanup
  // costs space but must not turn a completed safety copy into a failed one.
  for (const old of existing.slice(keep - 1)) {
    try {
      old.delete();
    } catch {
      // Retry retention on the next successful snapshot.
    }
  }
  return target;
}
