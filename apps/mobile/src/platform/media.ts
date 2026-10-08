import { Directory, File, Paths } from 'expo-file-system';
import { copyAsync } from 'expo-file-system/legacy';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

import { newId } from '@/lib/ids';

/**
 * On-device storage for photos, voice notes and documents.
 *
 * Everything lives under `<documents>/media/YYYY/MM/`, and the database stores
 * only the path *relative* to the documents directory. The absolute path of
 * the documents directory changes when the app is reinstalled or restored
 * onto a new phone; relative paths survive that, so a restore only has to put
 * the files back in the same relative place.
 */

export const MEDIA_ROOT = 'media';

/** Long edge of a stored photo. Enough for a skin lesion or a lab sheet to stay legible. */
const PHOTO_MAX_EDGE = 2400;
const PHOTO_QUALITY = 0.85;

/** Long edge of a gallery thumbnail. */
const THUMB_MAX_EDGE = 360;
const THUMB_QUALITY = 0.7;

export function mediaFile(relativePath: string): File {
  return new File(Paths.document, relativePath);
}

/** Absolute `file://` URI for a stored relative path, for `<Image source>` and players. */
export function mediaUri(relativePath: string | null | undefined): string | null {
  if (!relativePath) return null;
  return mediaFile(relativePath).uri;
}

export function mediaExists(relativePath: string | null | undefined): boolean {
  if (!relativePath) return false;
  return mediaFile(relativePath).exists;
}

function datedFolder(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  return `${MEDIA_ROOT}/${y}/${m}`;
}

function ensureFolder(relative: string): void {
  const dir = new Directory(Paths.document, relative);
  if (!dir.exists) dir.create({ intermediates: true });
}

/** `file:///.../x.m4a?foo` -> `m4a`. */
export function extensionOf(uri: string, fallback: string): string {
  const clean = uri.split(/[?#]/)[0] ?? uri;
  const dot = clean.lastIndexOf('.');
  const slash = clean.lastIndexOf('/');
  if (dot <= slash) return fallback;
  const ext = clean.slice(dot + 1).toLowerCase();
  return /^[a-z0-9]{1,5}$/.test(ext) ? ext : fallback;
}

export type StoredFile = {
  relativePath: string;
  sizeBytes: number | null;
};

/**
 * Copy (or move) a local file into app storage under a fresh name.
 *
 * `move` is for temp files the app itself produced — a finished recording, a
 * manipulated photo — where leaving a copy in the cache would only waste space.
 * Files the user picked from their gallery are always copied, never moved.
 */
export async function storeFile(
  sourceUri: string,
  extension: string,
  { move = false, verifySize = false }: { move?: boolean; verifySize?: boolean } = {},
): Promise<StoredFile> {
  const folder = datedFolder();
  ensureFolder(folder);

  const relativePath = `${folder}/${newId()}.${extension}`;
  const source = new File(sourceUri);
  const dest = mediaFile(relativePath);
  const sourceSize = verifySize && source.exists ? source.size : null;
  if (verifySize && (sourceSize == null || !Number.isSafeInteger(sourceSize) || sourceSize <= 0))
    throw new Error('فایل اولیه کامل خوانده نشد؛ کپی ثبت نشد.');

  if (move) await source.move(dest);
  else await copyInto(source, sourceUri, dest);

  const stored = mediaFile(relativePath);
  const sizeBytes = stored.exists ? stored.size : null;
  if (verifySize && sizeBytes !== sourceSize) throw new Error('اندازهٔ کپی با فایل اولیه یکسان نیست؛ فایل ثبت نشد.');
  return { relativePath, sizeBytes };
}

/**
 * Copy a file into app storage. The file API copies only what it can open as
 * a file — a local path or a storage-access-framework document. A file shared
 * from another app (a call recorder's «اشتراک‌گذاری») is a plain content URI of
 * that app's provider, which it refuses ("Source must be a file"); for that the
 * legacy copy streams it through the content resolver instead.
 */
async function copyInto(source: File, sourceUri: string, dest: File): Promise<void> {
  try {
    await source.copy(dest);
  } catch (error) {
    if (!sourceUri.startsWith('content://')) throw error;
    // The URI exactly as it arrived: `File` normalises a content URI's path
    // ("primary%3ARecordings" → "primary:Recordings"), which its provider rejects.
    await copyAsync({ from: sourceUri, to: dest.uri });
  }
}

function fitWithin(width: number, height: number, maxEdge: number) {
  const longEdge = Math.max(width, height);
  if (!longEdge || longEdge <= maxEdge) return null;
  return width >= height ? { width: maxEdge } : { height: maxEdge };
}

async function renderJpeg(uri: string, width: number, height: number, maxEdge: number, quality: number) {
  const context = ImageManipulator.manipulate(uri);
  const resize = fitWithin(width, height, maxEdge);
  if (resize) context.resize(resize);
  try {
    const image = await context.renderAsync();
    try {
      return await image.saveAsync({ compress: quality, format: SaveFormat.JPEG });
    } finally {
      image.release();
    }
  } finally {
    context.release();
  }
}

/** The journal records this derivative's fingerprint/destination before copying it. */
export function renderPhotoDerivative(source: { uri: string; width: number; height: number }, thumbnail: boolean) {
  return renderJpeg(
    source.uri,
    source.width,
    source.height,
    thumbnail ? THUMB_MAX_EDGE : PHOTO_MAX_EDGE,
    thumbnail ? THUMB_QUALITY : PHOTO_QUALITY,
  );
}

/** A fresh journal-owned destination only; failed partial copies are never overwritten. */
export async function copyPhotoImportFile(sourceUri: string, relativePath: string): Promise<void> {
  if (!/^media\/imports\/photo-[a-f0-9-]+-\d+-(source|full|thumb)-[a-f0-9-]+\.[a-z0-9]{1,5}$/.test(relativePath))
    throw new Error('مسیر کپی عکس معتبر نیست.');
  ensureFolder(`${MEDIA_ROOT}/imports`);
  const destination = mediaFile(relativePath);
  if (destination.exists) throw new Error('مسیر کپی عکس قبلاً استفاده شده است؛ فایل جایگزین نشد.');
  try {
    await copyInto(new File(sourceUri), sourceUri, destination);
  } catch {
    throw new Error('کپی عکس انجام نشد؛ فایل اولیه و کپی ناتمام حفظ شده‌اند.');
  }
}

export type MediaInventoryFile = { path: string; sizeBytes: number | null };

/** Read-only inventory, including old/unreferenced bytes. Never reclaim files here. */
export function listStoredMedia(): MediaInventoryFile[] {
  const root = new Directory(Paths.document, MEDIA_ROOT);
  if (!root.exists) return [];
  const files: MediaInventoryFile[] = [];
  const walk = (directory: Directory, prefix: string) => {
    for (const entry of directory.list()) {
      if (!entry.name || entry.name.includes('/') || entry.name === '.' || entry.name === '..')
        throw new Error('فهرست فایل‌ها کامل خوانده نشد؛ هیچ فایلی تغییر نکرد.');
      const path = `${prefix}/${entry.name}`;
      if (entry instanceof Directory) walk(entry, path);
      else {
        const size = entry.size;
        files.push({ path, sizeBytes: size != null && Number.isSafeInteger(size) && size >= 0 ? size : null });
      }
    }
  };
  try {
    walk(root, MEDIA_ROOT);
    return files.sort((a, b) => a.path.localeCompare(b.path));
  } catch {
    throw new Error('فهرست فایل‌ها کامل خوانده نشد؛ هیچ فایلی تغییر نکرد.');
  }
}

/** Total bytes under the media folder, for the storage line in settings. */
export function mediaFolderSize(): number {
  const dir = new Directory(Paths.document, MEDIA_ROOT);
  if (!dir.exists) return 0;
  return dir.size ?? 0;
}
