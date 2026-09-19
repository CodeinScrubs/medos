import { File } from 'expo-file-system';

import { sqlite } from './client';

/** `file:///data/...` -> `/data/...`, escaped for use inside an SQL string literal. */
export function sqlPath(uri: string): string {
  return decodeURIComponent(uri.replace(/^file:\/\//, '')).replace(/'/g, "''");
}

/** Bytes on disk: the database file plus its write-ahead log. */
export function databaseSizeBytes(): number {
  const path = sqlite.databasePath;
  const uri = path.startsWith('file://') ? path : `file://${path}`;
  let total = 0;
  for (const candidate of [uri, `${uri}-wal`]) {
    const file = new File(candidate);
    if (file.exists) total += file.size ?? 0;
  }
  return total;
}
