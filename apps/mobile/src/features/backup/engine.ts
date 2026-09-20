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
import { reflagLabValuesIfNeeded } from '@/features/labs/reflag';
import { rescheduleAllReminders } from '@/features/reminders/reschedule';
import { reindexSearchIfNeeded } from '@/features/search/reindex';
import { deriveKey } from '@/lib/crypto';
import { newId, stamps, touch } from '@/lib/ids';
import { logError } from '@/platform/error-log';
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
  streamsMatch,
} from './format';
import { importTables } from './import';
import { hasBackupKey, loadBackupKey, storeBackupKey } from './keys';
import { isBackupDue } from './logic';
import { parseManifest, type BackupManifest } from './manifest';
import {
  MediaRestoreError,
  placeRestoredMedia,
  putBackDisplacedMedia,
  type DisplacedMedia,
  type MediaFileSystem,
  type MediaPaths,
} from './media-swap';
import { BACKUP_FILE_RE, backupFileName, restoreTargetPath } from './paths';
import {
  backupAutoEnabled,
  backupAutoIncludeMedia,
  backupFolderUri,
  backupIntervalHours,
  backupLastSuccessAt,
  restoreInFlight,
} from './settings';

/* -------------------------------------------------------------------------- */
/*  Configuration                                                               */
/* -------------------------------------------------------------------------- */

/** How many of each kind to keep in the backup folder. */
const KEEP_FULL = 3;
const KEEP_DB_ONLY = 7;

/** Where a restore keeps the files it replaces, under the document folder. */
const DISPLACED_ROOT = 'restore-displaced';

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
        /*
         * Read the destination back before anything is deleted. A copy onto a
         * storage provider can come back without throwing and still leave a
         * short, missing or wrong file; rotating on that word alone would
         * delete good older backups to make room for a broken one.
         */
        const written = verifyCopy(out, folder, (f) => onProgress?.({ phase: 'copy', fraction: f }));
        if (!written) throw new Error('بکاپ در پوشه‌ی مقصد کامل نوشته نشد. پوشه را دوباره انتخاب کنید.');
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
    // "Last backup" means a copy that left the app. A file sitting in the
    // cache is not a backup: Android clears that folder, and the phone it is
    // on is the thing being backed up. Sharing it marks it delivered.
    if (savedTo) await writeSetting(backupLastSuccessAt, Date.now());
    await audit('backup.created', { summary: fileName, detail: { trigger, includeMedia, sizeBytes, savedTo } });

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

/**
 * The real file system, for `media-swap`.
 *
 * `moveSync` repoints the instance it is called on, so every destination is
 * built again from its path rather than a `File` being reused.
 */
const mediaFs: MediaFileSystem = {
  exists: (path) => new File(path).exists,
  ensureParent: (path) => new File(path).parentDirectory.create({ intermediates: true, idempotent: true }),
  move: (from, to, options) => new File(from).moveSync(new File(to), options),
};

/**
 * Where a restore keeps the files it is replacing.
 *
 * In the document folder, not the cache scratch: the scratch is deleted on the
 * way out of every restore, and these are the only copy of files the live
 * database still points at. One folder per restore, so an earlier run that
 * could not put everything back is not cleared away by the next one.
 */
function displacedDir(runId: string): Directory {
  const dir = new Directory(Paths.document, `${DISPLACED_ROOT}/${runId}`);
  dir.create({ intermediates: true, idempotent: true });
  return dir;
}

/** Every file kept in a displaced folder, by the path it came from. */
function listDisplaced(dir: Directory): DisplacedMedia[] {
  const out: DisplacedMedia[] = [];
  const walk = (folder: Directory, prefix: string) => {
    for (const entry of folder.list()) {
      const path = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry instanceof Directory) walk(entry, path);
      else out.push({ savedPath: entry.uri, path });
    }
  };
  if (dir.exists) walk(dir, '');
  return out;
}

const livePaths: MediaPaths = {
  target: (path) => new File(Paths.document, path).uri,
  // Unused on the way back: a file being put back is not displaced again.
  displaced: () => {
    throw new Error('unreachable');
  },
};

/**
 * Finish undoing a restore that the app was killed in the middle of.
 *
 * Run before anything reads a media file. A marker in the database means the
 * files were replaced but the database was not: the dataset on this phone is
 * still the old one, so the files it points at have to be the old ones too.
 * Once the marker is gone the displaced copies are only clutter, and go.
 *
 * Returns the files it could not put back — those are kept where they are,
 * because they exist nowhere else.
 */
export async function recoverInterruptedRestore(): Promise<{ putBack: number; failed: DisplacedMedia[] }> {
  const marker = await readSetting(restoreInFlight);
  const root = new Directory(Paths.document, DISPLACED_ROOT);

  if (!marker) {
    // The restore committed (or none ran): whatever it set aside is obsolete.
    if (root.exists) removeQuietly(root);
    return { putBack: 0, failed: [] };
  }

  const dir = new Directory(Paths.document, `${DISPLACED_ROOT}/${marker.dir}`);
  const displaced = listDisplaced(dir);
  const failed = putBackDisplacedMedia(mediaFs, livePaths, displaced);
  if (failed.length === 0) {
    removeQuietly(dir);
    await writeSetting(restoreInFlight, null);
  } else {
    logError(new Error(`${failed.length} restored file(s) could not be put back`), {
      source: 'handled',
      context: `restore recovery: kept in ${DISPLACED_ROOT}/${marker.dir}`,
    });
  }
  await audit('backup.restoreRolledBack', {
    detail: { putBack: displaced.length - failed.length, kept: failed.length },
  });
  return { putBack: displaced.length - failed.length, failed };
}

/**
 * The user confirmed a shared backup really reached somewhere.
 *
 * Not called on the share sheet closing: `Sharing.shareAsync` resolves whether
 * the file was sent or the sheet was dismissed, so only the user can say.
 */
export async function markBackupDelivered(): Promise<void> {
  await writeSetting(backupLastSuccessAt, Date.now());
}

/**
 * Is the copy really there, with the same bytes in it?
 *
 * `copy` resolving is the provider's word; this is the destination's. The file
 * is opened and read back against the source rather than having its size
 * compared, because size is the provider's word too — a cloud-backed or USB
 * folder can report the length it was asked to write while holding something
 * else, and the next step deletes older backups to make room for this one.
 * Reading a few hundred megabytes back costs seconds; the alternative costs
 * the only copy of a record.
 */
function verifyCopy(source: File, folder: Directory, onProgress?: (fraction: number) => void): boolean {
  let read: FileHandle | null = null;
  let written: FileHandle | null = null;
  try {
    const copied = new File(folder, source.name);
    if (!copied.exists) return false;
    const expected = source.size ?? 0;
    if (expected === 0) return false;
    const size = copied.size;
    // A provider that does not report a size is not trusted either way; the
    // comparison below runs out of bytes if the file is short.
    if (size != null && size !== expected) return false;
    read = source.open(FileMode.ReadOnly);
    written = copied.open(FileMode.ReadOnly);
    return streamsMatch(
      { read: (n) => read!.readBytes(n) },
      { read: (n) => written!.readBytes(n) },
      expected,
      CHUNK_BYTES,
      onProgress,
    );
  } catch {
    return false;
  } finally {
    read?.close();
    written?.close();
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
  /** Steps that failed *after* the data was already back. Not a failed restore. */
  warnings: string[];
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
 * 3. Media files are moved into place, and any file they replace is kept in
 *    the scratch folder until the database is in. A photo the old database
 *    does not reference is harmless; a database row whose photo has been
 *    replaced by another dataset's bytes is not.
 * 4. The database is replaced in one transaction. If that fails, the replaced
 *    files are put back, so the rolled-back database still matches its media.
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
  // A restore that was cut short has to be undone before another one starts,
  // or its files would be put back on top of this one's.
  const unfinished = await recoverInterruptedRestore();
  if (unfinished.failed.length > 0) {
    throw new Error('بازگردانی قبلی ناتمام مانده و چند فایل سر جایشان برنگشته‌اند. اول با یک بکاپ سالم شروع کنید.');
  }
  running = true;

  let handle: FileHandle | null = null;
  let work: Directory | null = null;
  // Hoisted so the exit paths can decide whether to keep it: it holds the only
  // copy of every file this restore replaced.
  let kept: Directory | null = null;
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

    /*
     * 3. Media into place, keeping whatever was there.
     *
     * The database import can still fail and roll back, and a rolled-back
     * database expects the files it knew. Any file being replaced is moved
     * into a folder of its own — not the scratch folder, which is deleted on
     * the way out — and abandoned only once the new database is committed.
     */
    const keptDir = displacedDir(newId());
    kept = keptDir;
    // Written before the first file moves and wiped by the import itself: see
    // `restoreInFlight`. Between the two, a killed app is recoverable.
    await writeSetting(restoreInFlight, { dir: keptDir.name, at: Date.now() });
    const paths: MediaPaths = {
      target: (path) => new File(Paths.document, path).uri,
      displaced: (path) => new File(keptDir, path).uri,
    };
    const displaced: DisplacedMedia[] = placeRestoredMedia(
      mediaFs,
      paths,
      media.map((m) => ({ stagedPath: m.staged.uri, path: m.path })),
    );

    // 4. The database. Everything up to here can still fail cleanly.
    onProgress?.({ phase: 'database', fraction: 0 });
    let imported: { tables: number; rows: number };
    try {
      imported = importDatabase(dbFile);
    } catch (e) {
      throw new MediaRestoreError(e, putBackDisplacedMedia(mediaFs, paths, displaced));
    }

    // Committed: the files that were replaced are not coming back.
    removeQuietly(kept);

    /*
     * From this point the data is back, and the rest is housekeeping. A
     * failure here must not be reported as "restore failed" — the user would
     * think their records were untouched when in fact they were replaced.
     * Each step is collected as a warning instead.
     */
    const warnings: string[] = [];
    const housekeeping = async (what: string, step: () => Promise<unknown>) => {
      try {
        await step();
      } catch (e) {
        warnings.push(what);
        logError(e, { source: 'handled', context: `restore: ${what}` });
      }
    };

    await housekeeping('فهرست‌های پیش‌فرض', runSeeds);
    await housekeeping('بازسازی جست‌وجو', reindexSearchIfNeeded);
    // The restored rows were flagged by whichever build wrote them.
    await housekeeping('بازبینی پرچم آزمایش‌ها', reflagLabValuesIfNeeded);
    // The reminders the OS holds belong to the data just replaced, and the ids
    // in the backup to the phone that made it: start over from the rows.
    let reminders = 0;
    await housekeeping('یادآورها', async () => {
      reminders = (await rescheduleAllReminders()).followUps;
    });
    // Keep backing up with the same passphrase on this phone from now on.
    await housekeeping('ذخیره‌ی رمز بکاپ', () => storeBackupKey({ key, salt: header.salt, kdf: header.kdf }));
    await audit('backup.restored', {
      summary: manifest.createdAt,
      detail: {
        tables: imported.tables,
        rows: imported.rows,
        files: media.length,
        device: manifest.device,
        warnings,
      },
    });

    onProgress?.({ phase: 'done', fraction: 1 });
    return { manifest, ...imported, files: media.length, reminders, warnings };
  } catch (e) {
    // A file that could not be put back exists nowhere else. The folder stays,
    // and the error the user reads says so.
    if (e instanceof MediaRestoreError && e.notPutBack.length > 0) {
      // The marker stays too: those files are still the live database's.
      logError(e, {
        source: 'handled',
        context: `restore: ${e.notPutBack.length} file(s) left in ${DISPLACED_ROOT}/${kept?.name ?? '?'}`,
      });
    } else {
      removeQuietly(kept);
      await writeSetting(restoreInFlight, null).catch(() => undefined);
    }
    throw e;
  } finally {
    handle?.close();
    removeQuietly(work);
    running = false;
  }
}
