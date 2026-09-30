import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import { Directory, File, FileMode, Paths } from 'expo-file-system';
import { copyAsync } from 'expo-file-system/legacy';

import { mediaFile } from './media';

export type FileFingerprint = { checksum: string; sizeBytes: number };

/** Bounded memory, explicit EOF, no private path in errors. */
export async function fingerprintImportFile(path: string): Promise<FileFingerprint> {
  try {
    const file = mediaFile(path);
    const handle = file.open(FileMode.ReadOnly);
    const hash = sha256.create();
    let sizeBytes = 0;
    let nextYield = 1024 * 1024;
    try {
      for (;;) {
        const bytes = handle.readBytes(64 * 1024);
        if (!bytes.length) break;
        hash.update(bytes);
        sizeBytes += bytes.length;
        // Short native reads must not postpone yielding indefinitely.
        if (sizeBytes >= nextYield) {
          await new Promise((resolve) => setTimeout(resolve, 0));
          nextYield = sizeBytes + 1024 * 1024;
        }
      }
      if (!sizeBytes || (file.size != null && file.size !== sizeBytes)) throw new Error();
      return { checksum: bytesToHex(hash.digest()), sizeBytes };
    } finally {
      try {
        handle.close();
      } finally {
        hash.destroy();
      }
    }
  } catch {
    // Native errors can include a provider URI, filename or private path.
    throw new Error('فایل کامل خوانده نشد؛ کپی برای بررسی حفظ شده است.');
  }
}

/** The caller reserves this private destination in SQLite BEFORE copying. */
export async function copyImportFile(
  sourceUri: string,
  path: string,
  expectedSize: number | null,
): Promise<FileFingerprint> {
  try {
    const folder = new Directory(Paths.document, 'media/imports');
    if (!folder.exists) folder.create({ intermediates: true });
    const dest = mediaFile(path);
    // This is the request's unpublished partial copy, not an attachment.
    if (dest.exists) dest.delete();
    try {
      await new File(sourceUri).copy(dest);
    } catch {
      if (!sourceUri.startsWith('content://')) throw new Error();
      if (dest.exists) dest.delete();
      await copyAsync({ from: sourceUri, to: dest.uri });
    }
  } catch {
    throw new Error('فایل کپی نشد؛ فایل اصلی حفظ شده است.');
  }
  const fingerprint = await fingerprintImportFile(path);
  // Expo reports 0 when provider metadata is unreadable, even for readable content.
  // A genuinely empty copy was already rejected by fingerprintImportFile.
  if (expectedSize != null && expectedSize > 0 && fingerprint.sizeBytes !== expectedSize)
    throw new Error('اندازهٔ فایل کپی‌شده کامل نیست.');
  return fingerprint;
}
