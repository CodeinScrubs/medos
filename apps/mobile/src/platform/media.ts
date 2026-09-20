import { Directory, File, Paths } from 'expo-file-system';
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
  { move = false }: { move?: boolean } = {},
): Promise<StoredFile> {
  const folder = datedFolder();
  ensureFolder(folder);

  const relativePath = `${folder}/${newId()}.${extension}`;
  const source = new File(sourceUri);
  const dest = mediaFile(relativePath);

  if (move) await source.move(dest);
  else await source.copy(dest);

  const stored = mediaFile(relativePath);
  return { relativePath, sizeBytes: stored.exists ? stored.size : null };
}

export type StoredPhoto = StoredFile & {
  thumbnailPath: string;
  /** The untouched file, when the setting asks for it to be kept. */
  originalPath: string | null;
  width: number;
  height: number;
  mimeType: 'image/jpeg';
};

function fitWithin(width: number, height: number, maxEdge: number) {
  const longEdge = Math.max(width, height);
  if (!longEdge || longEdge <= maxEdge) return null;
  return width >= height ? { width: maxEdge } : { height: maxEdge };
}

async function renderJpeg(uri: string, width: number, height: number, maxEdge: number, quality: number) {
  const context = ImageManipulator.manipulate(uri);
  const resize = fitWithin(width, height, maxEdge);
  if (resize) context.resize(resize);
  const image = await context.renderAsync();
  try {
    return await image.saveAsync({ compress: quality, format: SaveFormat.JPEG });
  } finally {
    image.release();
    context.release();
  }
}

/**
 * Store a photo: a compressed full-size copy, a small thumbnail, and — when
 * asked — the file exactly as it arrived.
 *
 * A modern phone camera produces 4-12 MB per shot. Over a few years of
 * clinical photos that is tens of gigabytes; at 2400px / 85% JPEG the same
 * photos are roughly a tenth of that, which also keeps backups practical. That
 * trade is right for a photo of a lab sheet and wrong for a lesion being
 * followed over weeks or two ECGs being compared, so keeping the original is a
 * setting rather than a rule — and when it is on, the original is stored
 * first: an original that exists only until the re-encode succeeds is not a
 * preserved original.
 */
export async function storePhoto(
  source: { uri: string; width: number; height: number },
  { keepOriginal = false }: { keepOriginal?: boolean } = {},
): Promise<StoredPhoto> {
  const original = keepOriginal ? await storeFile(source.uri, extensionOf(source.uri, 'jpg')) : null;

  const full = await renderJpeg(source.uri, source.width, source.height, PHOTO_MAX_EDGE, PHOTO_QUALITY);
  const thumb = await renderJpeg(source.uri, source.width, source.height, THUMB_MAX_EDGE, THUMB_QUALITY);

  const stored = await storeFile(full.uri, 'jpg', { move: true });
  const storedThumb = await storeFile(thumb.uri, 'jpg', { move: true });

  return {
    ...stored,
    thumbnailPath: storedThumb.relativePath,
    originalPath: original?.relativePath ?? null,
    width: full.width,
    height: full.height,
    mimeType: 'image/jpeg',
  };
}

/** Total bytes under the media folder, for the storage line in settings. */
export function mediaFolderSize(): number {
  const dir = new Directory(Paths.document, MEDIA_ROOT);
  if (!dir.exists) return 0;
  return dir.size ?? 0;
}
