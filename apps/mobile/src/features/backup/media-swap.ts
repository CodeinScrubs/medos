/*
 * Putting a backup's media files into place, reversibly.
 *
 * A restore replaces files before it replaces the database, because the
 * database import is the step that can still fail and roll back — and a
 * rolled-back database expects the files it knew. So whatever is being
 * replaced is moved aside first and only abandoned once the new database is
 * committed.
 *
 * Two rules the first attempt at this got wrong, both of which end in a lost
 * file:
 *
 * - The files moved aside must not live in the scratch folder, which is
 *   deleted on the way out of a restore whether it succeeded or not. A move
 *   that fails halfway is exactly the case where they are the only copy left.
 * - A file that cannot be put back is not an incident to log and forget. It
 *   stays where it was moved to, and the caller is told, so nothing deletes
 *   the folder holding it.
 *
 * The file system is a parameter so this can be tested at all: the real one is
 * expo-file-system, and the tests give it a map.
 */

export type MediaFileSystem = {
  exists(path: string): boolean;
  /** Create the folder a file is about to be written into. */
  ensureParent(path: string): void;
  move(from: string, to: string, options?: { overwrite?: boolean }): void;
};

/** Where the media paths of a restore resolve to on this phone. */
export type MediaPaths = {
  /** The live location of `path`, the one the database points at. */
  target(path: string): string;
  /** Where the file currently at `path` is kept while the restore runs. */
  displaced(path: string): string;
};

export type StagedMedia = { stagedPath: string; path: string };
export type DisplacedMedia = { savedPath: string; path: string };

/**
 * A restore that could not finish putting things back.
 *
 * `notPutBack` is the honest part: those files exist only at `savedPath` now,
 * so the caller must keep that folder and say so.
 */
export class MediaRestoreError extends Error {
  readonly notPutBack: DisplacedMedia[];

  constructor(cause: unknown, notPutBack: DisplacedMedia[]) {
    const detail = cause instanceof Error ? cause.message : String(cause);
    super(
      notPutBack.length > 0
        ? `فایل‌ها سر جایشان برنگشتند (${notPutBack.length} فایل کنار گذاشته شده). هیچ چیزی را پاک نکنید. خطا: ${detail}`
        : `فایل‌های بکاپ جابه‌جا نشدند و همه چیز به حالت قبل برگشت. خطا: ${detail}`,
    );
    this.name = 'MediaRestoreError';
    this.cause = cause;
    this.notPutBack = notPutBack;
  }
}

/**
 * Move every unpacked file into place, keeping whatever it replaces.
 *
 * Returns what was displaced, for the caller to abandon once the database is
 * committed. On any failure the moves already made are undone and a
 * `MediaRestoreError` is thrown — the live files are then either back where
 * they were, or listed in `notPutBack`.
 */
export function placeRestoredMedia(fs: MediaFileSystem, paths: MediaPaths, media: StagedMedia[]): DisplacedMedia[] {
  const displaced: DisplacedMedia[] = [];
  try {
    for (const item of media) {
      const target = paths.target(item.path);
      fs.ensureParent(target);
      if (fs.exists(target)) {
        const saved = paths.displaced(item.path);
        fs.ensureParent(saved);
        fs.move(target, saved);
        displaced.push({ savedPath: saved, path: item.path });
      }
      fs.move(item.stagedPath, target, { overwrite: true });
    }
    return displaced;
  } catch (e) {
    throw new MediaRestoreError(e, putBackDisplacedMedia(fs, paths, displaced));
  }
}

/**
 * Undo `placeRestoredMedia` after a failed import: the database is the one
 * that was already there, so the files it points at must be the ones it knew.
 *
 * Returns the files it could not put back — never empty-handed silence.
 */
export function putBackDisplacedMedia(
  fs: MediaFileSystem,
  paths: MediaPaths,
  displaced: DisplacedMedia[],
): DisplacedMedia[] {
  const failed: DisplacedMedia[] = [];
  for (const item of displaced) {
    try {
      fs.move(item.savedPath, paths.target(item.path), { overwrite: true });
    } catch {
      failed.push(item);
    }
  }
  return failed;
}
