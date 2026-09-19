import { desc, eq } from 'drizzle-orm';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import { Directory, File, FileMode, Paths, type FileHandle } from 'expo-file-system';

import { audit } from '@/db/audit';
import { db, sqlite } from '@/db/client';
import { sqlPath } from '@/db/files';
import { backupRuns } from '@/db/schema';
import { runSeeds } from '@/db/seed';
import { readSetting, writeSetting } from '@/db/settings';
import { snapshotDatabase } from '@/db/snapshots';
import { rescheduleAllReminders } from '@/features/reminders/reschedule';
import { reindexSearchIfNeeded } from '@/features/search/reindex';
import { deriveKey } from '@/lib/crypto';
import { newId, stamps, touch } from '@/lib/ids';
import { MEDIA_ROOT } from '@/platform/media';

import {
  archiveEnd,
  archiveStart,
  buildHeader,
  CHUNK_BYTES,
  decodeJson,
  DecryptingReader,
  encodeJson,
  EncryptingWriter,
  ENTRY_FILE,
  ENTRY_MANIFEST,
  entryHeader,
  HEADER_BYTES,
  MAX_MANIFEST_BYTES,
  parseHeader,
  readArchiveStart,
  readEntryHeader,
} from './format';
import { importTables } from './import';
import { hasBackupKey, loadBackupKey, storeBackupKey } from './keys';
import { isBackupDue } from './logic';
import { parseManifest, type BackupManifest } from './manifest';
import { BACKUP_FILE_RE, backupFileName, restoreTargetPath } from './paths';
import {
  backupAutoEnabled,
  backupAutoIncludeMedia,
  backupFolderUri,
  backupIntervalHours,
  backupLastSuccessAt,
} from './settings';

/* -------------------------------------------------------------------------- */
/*  Configuration                                                               */
/* -------------------------------------------------------------------------- */

/** How many of each kind to keep in the backup folder. */
const KEEP_FULL = 3;
const KEEP_DB_ONLY = 7;

export type BackupConfig = {
  folderUri: string | null;
  autoEnabled: boolean;
  autoIncludeMedia: boolean;
  intervalHours: number;
  lastSuccessAt: number | null;
};

export async function getBackupConfig(): Promise<BackupConfig> {
  return {
    folderUri: await readSetting(backupFolderUri),
    autoEnabled: await readSetting(backupAutoEnabled),
    autoIncludeMedia: await readSetting(backupAutoIncludeMedia),
    intervalHours: await readSetting(backupIntervalHours),
    lastSuccessAt: await readSetting(backupLastSuccessAt),
  };
}

/* -------------------------------------------------------------------------- */
/*  Folder                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Ask the user for a folder through Android's own picker. The grant is
 * persistable, so automatic backups can keep writing there after restarts.
 * A folder that a sync app watches (Drive, OneDrive, Syncthing) turns every
 * backup into an off-phone copy with no further work.
 */
export async function chooseBackupFolder(): Promise<string | null> {
  try {
    const dir = await Directory.pickDirectoryAsync();
    await writeSetting(backupFolderUri, dir.uri);
    return dir.uri;
  } catch {
    return null;
  }
}

/** The configured folder if it is still reachable; a restored phone has lost the old grant. */
export function openBackupFolder(uri: string | null): Directory | null {
  if (!uri) return null;
  try {
    const dir = new Directory(uri);
    return dir.exists ? dir : null;
  } catch {
    return null;
  }
}

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                     */
/* -------------------------------------------------------------------------- */

/** A fresh, empty scratch folder in the app cache. */
function workDir(name: string): Directory {
  const dir = new Directory(Paths.cache, name);
  if (dir.exists) dir.delete();
  dir.create({ intermediates: true });
  return dir;
}

/**
 * Scratch folders hold plaintext — a database snapshot, unpacked media — so
 * they are removed on every exit path, success or failure.
 */
function removeQuietly(entry: Directory | File | null): void {
  try {
    if (entry?.exists) entry.delete();
  } catch {
    // Leftovers are cleared the next time the folder is used.
  }
}

function listMediaFiles(): { file: File; path: string }[] {
  const root = new Directory(Paths.document, MEDIA_ROOT);
  const out: { file: File; path: string }[] = [];
  if (!root.exists) return out;
  const walk = (dir: Directory, prefix: string) => {
    for (const entry of dir.list()) {
      if (entry instanceof Directory) walk(entry, `${prefix}/${entry.name}`);
      else out.push({ file: entry, path: `${prefix}/${entry.name}` });
    }
  };
  walk(root, MEDIA_ROOT);
  return out;
}

async function streamFileInto(writer: EncryptingWriter, file: File): Promise<void> {
  const handle = file.open(FileMode.ReadOnly);
  try {
    for (;;) {
      const bytes = handle.readBytes(CHUNK_BYTES);
      if (bytes.length === 0) break;
      await writer.write(bytes);
    }
  } finally {
    handle.close();
  }
}

/** How many migrations the live database has applied — its schema version. */
function migrationCount(): number {
  try {
    return sqlite.getFirstSync<{ n: number }>('SELECT count(*) AS n FROM __drizzle_migrations')?.n ?? 0;
  } catch {
    return 0;
  }
}

const COUNTED_TABLES = ['patients', 'notes', 'orders', 'lab_panels', 'attachments', 'doctors', 'topics', 'follow_ups'];

function rowCounts(): Record<string, number> {
  const out: Record<string, number> = {};
  for (const t of COUNTED_TABLES) {
    out[t] = sqlite.getFirstSync<{ n: number }>(`SELECT count(*) AS n FROM "${t}" WHERE deleted_at IS NULL`)?.n ?? 0;
  }
  return out;
}

/* -------------------------------------------------------------------------- */
/*  Create                                                                      */
/* -------------------------------------------------------------------------- */

export type BackupProgress = {
  phase: 'snapshot' | 'encrypt' | 'copy' | 'done';
  fraction: number;
};

export type BackupResult = {
  file: File;
  fileName: string;
  sizeBytes: number;
  savedTo: string | null;
  manifest: BackupManifest;
};

/** One backup or restore at a time; both read and rewrite the same files. */
let running = false;

/**
 * Build an encrypted backup in the app cache, then copy it to the configured
 * folder if there is one. The cache copy is returned so the caller can also
 * hand it to the share sheet.
 */
export async function createBackup({
  includeMedia,
  trigger,
  copyToFolder = true,
  onProgress,
}: {
  includeMedia: boolean;
  trigger: 'auto' | 'manual';
  copyToFolder?: boolean;
  onProgress?: (p: BackupProgress) => void;
}): Promise<BackupResult> {
  if (running) throw new Error('یک بکاپ دیگر در حال انجام است.');
  running = true;

  const runId = newId();
  const startedAt = new Date();
  let snapshot: File | null = null;

  try {
    await db.insert(backupRuns).values({
      id: runId,
      ...stamps(startedAt),
      startedAt,
      trigger,
      status: 'running',
      includesMedia: includeMedia,
      isEncrypted: true,
    });

    const stored = await loadBackupKey();
    if (!stored) throw new Error('رمز بکاپ تنظیم نشده است.');

    onProgress?.({ phase: 'snapshot', fraction: 0 });
    const work = workDir('backup-work');

    // VACUUM INTO gives a consistent, compacted copy even while the app is
    // writing, which a raw file copy of a WAL-mode database does not.
    snapshot = new File(work, 'medos.db');
    sqlite.execSync(`VACUUM INTO '${sqlPath(snapshot.uri)}'`);

    const media = includeMedia ? listMediaFiles() : [];
    const mediaBytes = media.reduce((sum, m) => sum + (m.file.size ?? 0), 0);
    const totalBytes = (snapshot.size ?? 0) + mediaBytes;

    const manifest: BackupManifest = {
      app: 'MedOS',
      appVersion: Constants.expoConfig?.version ?? null,
      createdAt: startedAt.toISOString(),
      schemaMigrations: migrationCount(),
      includesMedia: includeMedia,
      counts: rowCounts(),
      mediaFiles: media.length,
      mediaBytes,
      device: Device.modelName ?? null,
    };

    const fileName = backupFileName(startedAt, includeMedia);
    const out = new File(work, fileName);
    out.create({ overwrite: true });
    const handle = out.open(FileMode.Truncate);

    try {
      const writer = await EncryptingWriter.open(handle, stored.key, buildHeader(stored.kdf, stored.salt));
      const report = () =>
        onProgress?.({ phase: 'encrypt', fraction: totalBytes ? Math.min(writer.bytesIn / totalBytes, 1) : 1 });

      await writer.write(archiveStart());
      const manifestBytes = encodeJson(manifest);
      await writer.write(entryHeader(ENTRY_MANIFEST, 'manifest.json', manifestBytes.length));
      await writer.write(manifestBytes);

      await writer.write(entryHeader(ENTRY_FILE, 'db/medos.db', snapshot.size ?? 0));
      await streamFileInto(writer, snapshot);
      report();

      for (const m of media) {
        await writer.write(entryHeader(ENTRY_FILE, m.path, m.file.size ?? 0));
        await streamFileInto(writer, m.file);
        report();
      }

      await writer.write(archiveEnd());
      await writer.finish();
    } finally {
      handle.close();
    }
    removeQuietly(snapshot);

    let savedTo: string | null = null;
    if (copyToFolder) {
      const folder = openBackupFolder(await readSetting(backupFolderUri));
      if (folder) {
        onProgress?.({ phase: 'copy', fraction: 0 });
        await out.copy(folder, { overwrite: true });
        savedTo = folder.uri;
        rotateBackups(folder);
      } else if (trigger === 'auto') {
        throw new Error('پوشه‌ی بکاپ در دسترس نیست. از صفحه‌ی بکاپ دوباره انتخابش کنید.');
      }
    }

    const sizeBytes = out.size ?? 0;
    await db
      .update(backupRuns)
      .set({
        status: 'success',
        finishedAt: new Date(),
        destination: savedTo ?? 'cache',
        fileName,
        sizeBytes,
        rowCounts: manifest.counts,
        schemaVersion: manifest.schemaMigrations,
        ...touch(),
      })
      .where(eq(backupRuns.id, runId));
    await writeSetting(backupLastSuccessAt, Date.now());
    await audit('backup.created', { summary: fileName, detail: { trigger, includeMedia, sizeBytes } });

    onProgress?.({ phase: 'done', fraction: 1 });
    return { file: out, fileName, sizeBytes, savedTo, manifest };
  } catch (e) {
    await db
      .update(backupRuns)
      .set({
        status: 'failed',
        finishedAt: new Date(),
        errorText: e instanceof Error ? e.message : String(e),
        ...touch(),
      })
      .where(eq(backupRuns.id, runId))
      .catch(() => undefined);
    throw e;
  } finally {
    removeQuietly(snapshot);
    running = false;
  }
}

/** Keep the newest few of each kind; never let daily DB-only backups push out the last full one. */
function rotateBackups(folder: Directory): void {
  const ours = folder
    .list()
    .filter((e): e is File => e instanceof File && BACKUP_FILE_RE.test(e.name))
    .sort((a, b) => b.name.localeCompare(a.name));

  const full = ours.filter((f) => f.name.endsWith('-full.medosbak'));
  const dbOnly = ours.filter((f) => f.name.endsWith('-db.medosbak'));
  for (const f of [...full.slice(KEEP_FULL), ...dbOnly.slice(KEEP_DB_ONLY)]) {
    try {
      f.delete();
    } catch {
      // A file we cannot delete is only wasted space; never fail a backup over it.
    }
  }
}

export function backupHistoryQuery(limit = 10) {
  return db.select().from(backupRuns).orderBy(desc(backupRuns.startedAt)).limit(limit);
}

/** A run left "running" by a killed app would otherwise look in progress forever. */
export async function markStaleRunsFailed(): Promise<void> {
  if (running) return;
  await db
    .update(backupRuns)
    .set({ status: 'failed', errorText: 'اپ در میانه‌ی بکاپ بسته شد', finishedAt: new Date(), ...touch() })
    .where(eq(backupRuns.status, 'running'));
}

/* -------------------------------------------------------------------------- */
/*  Automatic                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Run a backup if one is due. Called on launch and whenever the app comes to
 * the foreground; does nothing unless a passphrase and a folder are set up.
 */
export async function runAutoBackupIfDue(): Promise<'skipped' | 'done' | 'failed'> {
  if (running) return 'skipped';
  const cfg = await getBackupConfig();
  if (!cfg.autoEnabled || !cfg.folderUri || !(await hasBackupKey())) return 'skipped';
  if (!isBackupDue(cfg.lastSuccessAt, cfg.intervalHours, Date.now())) return 'skipped';
  try {
    await createBackup({ includeMedia: cfg.autoIncludeMedia, trigger: 'auto' });
    return 'done';
  } catch {
    // The failure is recorded in backup_runs and shown on the backup screen.
    return 'failed';
  }
}

/* -------------------------------------------------------------------------- */
/*  Restore                                                                     */
/* -------------------------------------------------------------------------- */

export type RestoreProgress = { phase: 'key' | 'files' | 'database' | 'done'; fraction: number };

export type RestoreResult = {
  manifest: BackupManifest;
  tables: number;
  rows: number;
  files: number;
  reminders: number;
};

/** Attach the restored snapshot and copy it into the live database. */
function importDatabase(snapshot: File): { tables: number; rows: number } {
  // Foreign keys are enforced per statement; while tables are emptied and
  // refilled one by one they are briefly inconsistent, so enforcement pauses.
  sqlite.execSync('PRAGMA foreign_keys = OFF');
  try {
    sqlite.execSync(`ATTACH DATABASE '${sqlPath(snapshot.uri)}' AS restore_src`);
    try {
      return importTables(sqlite);
    } finally {
      sqlite.execSync('DETACH DATABASE restore_src');
    }
  } finally {
    sqlite.execSync('PRAGMA foreign_keys = ON');
  }
}

/**
 * Restore a backup file over the current data.
 *
 * The order is what makes this safe:
 *
 * 1. The whole file is decrypted into a scratch folder. Every chunk is
 *    authenticated and the end of the stream is checked, so a wrong
 *    passphrase, a damaged file or a foreign file fails here — before a
 *    single byte of the live data has changed.
 * 2. A plain snapshot of the current database is kept, so even a successful
 *    restore of the wrong backup can be undone.
 * 3. Media files are moved into place. A photo the old database does not
 *    reference is harmless; a database row whose photo is missing is not.
 * 4. The database is replaced in one transaction.
 */
export async function restoreBackup({
  fileUri,
  passphrase,
  onProgress,
}: {
  fileUri: string;
  passphrase: string;
  onProgress?: (p: RestoreProgress) => void;
}): Promise<RestoreResult> {
  if (running) throw new Error('یک بکاپ در حال انجام است؛ چند لحظه بعد دوباره امتحان کنید.');
  running = true;

  let handle: FileHandle | null = null;
  let work: Directory | null = null;
  try {
    const source = new File(fileUri);
    handle = source.open(FileMode.ReadOnly);
    const header = parseHeader(handle.readBytes(HEADER_BYTES));
    const key = await deriveKey(passphrase, header.salt, header.kdf, (f) =>
      onProgress?.({ phase: 'key', fraction: f }),
    );
    const reader = await DecryptingReader.open(handle, key, header, source.size ?? 0);

    await readArchiveStart(reader);
    const first = await readEntryHeader(reader);
    if (!first || first.type !== ENTRY_MANIFEST || first.size > MAX_MANIFEST_BYTES) {
      throw new Error('فهرست محتوای بکاپ پیدا نشد.');
    }
    const manifest = parseManifest(decodeJson(await reader.readExactly(first.size)));
    if (manifest.schemaMigrations > migrationCount()) {
      // Its newer columns and tables would be silently dropped on the way in.
      throw new Error('این بکاپ با نسخه‌ی جدیدتری از MedOS ساخته شده است. اول اپ را به‌روز کنید، بعد بازگردانی کنید.');
    }

    // 1. Unpack everything into the scratch folder.
    work = workDir('restore-work');
    let dbFile: File | null = null;
    const media: { staged: File; path: string }[] = [];
    for (;;) {
      const entry = await readEntryHeader(reader);
      if (!entry) break;
      const kind = entry.type === ENTRY_FILE ? restoreTargetPath(entry.path) : null;
      if (!kind) {
        // Unknown entries are skipped, so a newer format can add some.
        await reader.pipe(entry.size, () => {});
        continue;
      }
      const staged = kind === 'database' ? new File(work, 'medos.db') : new File(work, entry.path);
      staged.create({ intermediates: true, overwrite: true });
      const out = staged.open(FileMode.Truncate);
      try {
        await reader.pipe(entry.size, (bytes) => out.writeBytes(bytes));
      } finally {
        out.close();
      }
      if (kind === 'database') dbFile = staged;
      else media.push({ staged, path: entry.path });
      onProgress?.({ phase: 'files', fraction: reader.progress });
    }
    await reader.finish();
    if (!dbFile) throw new Error('دیتابیس داخل این بکاپ نبود.');

    // 2. Keep a way back.
    snapshotDatabase('pre-restore');

    // 3. Media into place.
    for (const m of media) {
      const target = new File(Paths.document, m.path);
      target.parentDirectory.create({ intermediates: true, idempotent: true });
      m.staged.moveSync(target, { overwrite: true });
    }

    // 4. The database.
    onProgress?.({ phase: 'database', fraction: 0 });
    const imported = importDatabase(dbFile);
    await runSeeds();
    await reindexSearchIfNeeded();

    // The reminders the OS holds belong to the data just replaced, and the ids
    // in the backup to the phone that made it: start over from the rows.
    const { followUps: reminders } = await rescheduleAllReminders();

    // Keep backing up with the same passphrase on this phone from now on.
    await storeBackupKey({ key, salt: header.salt, kdf: header.kdf });
    await audit('backup.restored', {
      summary: manifest.createdAt,
      detail: { tables: imported.tables, rows: imported.rows, files: media.length, device: manifest.device },
    });

    onProgress?.({ phase: 'done', fraction: 1 });
    return { manifest, ...imported, files: media.length, reminders };
  } finally {
    handle?.close();
    removeQuietly(work);
    running = false;
  }
}
