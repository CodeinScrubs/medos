import { streamsMatch } from './format';

export type CopyCheck = 'bytes' | 'size' | 'failed';
export type CopyReader = { readBytes(length: number): Uint8Array; close(): void };
export type CopyFile = { readonly size: number | null; open(): CopyReader };

/** Check provider evidence; only an exact read-back permits pruning older backups. */
export function checkBackupCopy(
  source: CopyFile,
  findCopy: () => CopyFile | undefined,
  prune: () => void,
  onProgress?: (fraction: number) => void,
): CopyCheck {
  const result = compareCopy(source, findCopy, onProgress);
  if (result === 'bytes') {
    try {
      prune();
    } catch {
      // Retention is best effort. Failure to list/delete old files does not undo a verified copy.
    }
  }
  return result;
}

function compareCopy(
  source: CopyFile,
  findCopy: () => CopyFile | undefined,
  onProgress?: (fraction: number) => void,
): CopyCheck {
  let read: CopyReader | undefined;
  let written: CopyReader | undefined;
  try {
    const copied = findCopy();
    if (!copied) return 'failed';
    const expected = source.size;
    if (expected == null || !Number.isSafeInteger(expected) || expected <= 0) return 'failed';
    const size = copied.size;
    if (size != null && size !== expected) return 'failed';

    // A source read failure cannot be blamed on a SAF destination provider.
    read = source.open();
    try {
      written = copied.open();
    } catch {
      // Known equal length is weaker evidence, never permission to prune.
      return size === expected ? 'size' : 'failed';
    }
    // Unknown size can still be verified by reading exactly the expected bytes and EOF.
    return streamsMatch(
      { read: (n) => read!.readBytes(n) },
      { read: (n) => written!.readBytes(n) },
      expected,
      undefined,
      onProgress,
    )
      ? 'bytes'
      : 'failed';
  } catch {
    // Missing metadata, listing failure or an interrupted read provides no completed check.
    return 'failed';
  } finally {
    for (const handle of [read, written]) {
      try {
        handle?.close();
      } catch {
        /* Read-only handle cleanup must not change the evidence. */
      }
    }
  }
}
