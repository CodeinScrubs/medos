import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import { File, FileMode } from 'expo-file-system';

export type FileFingerprint = { checksum: string; sizeBytes: number };

/** Exact source/copy verification with bounded memory and no private paths in errors. */
export async function fingerprintFile(openFile: () => File): Promise<FileFingerprint> {
  try {
    const file = openFile();
    const handle = file.open(FileMode.ReadOnly);
    const hash = sha256.create();
    let sizeBytes = 0,
      nextYield = 1024 * 1024;
    try {
      for (;;) {
        const bytes = handle.readBytes(64 * 1024);
        if (!bytes.length) break;
        hash.update(bytes);
        sizeBytes += bytes.length;
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
    throw new Error('فایل کامل خوانده نشد؛ کپی برای بررسی حفظ شده است.');
  }
}
export function fingerprintSourceFile(uri: string): Promise<FileFingerprint> {
  return fingerprintFile(() => new File(uri));
}
