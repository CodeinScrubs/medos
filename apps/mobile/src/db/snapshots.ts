import { Directory, File, Paths } from 'expo-file-system';

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
export function snapshotDatabase(kind: SnapshotKind, keep = 3): File {
  const dir = new Directory(Paths.document, SNAPSHOT_DIR);
  if (!dir.exists) dir.create({ intermediates: true });

  const existing = dir
    .list()
    .filter((e): e is File => e instanceof File && e.name.startsWith(`${kind}-`))
    .sort((a, b) => b.name.localeCompare(a.name));
  // Make room first, so there are never more than `keep` after this call.
  for (const old of existing.slice(Math.max(keep - 1, 0))) old.delete();

  const target = new File(dir, `${kind}-${Date.now()}.db`);
  sqlite.execSync(`VACUUM INTO '${sqlPath(target.uri)}'`);
  return target;
}
