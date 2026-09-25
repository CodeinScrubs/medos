import { streamsMatch } from './format';

export type CopyCheck = 'bytes' | 'size' | 'failed';
export type CopyReader = { readBytes(length: number): Uint8Array; close(): void };
export type CopyFile = {
  readonly size: number | null;
  /**
   * A digest of the whole file computed natively (MD5 from expo-file-system),
   * or null when the platform cannot give one. Integrity against a flaky
   * provider, not against an attacker — the archive itself is authenticated.
   */
  readonly digest?: string | null;
  open(): CopyReader;
};

/** Which step of the check gave up. A step name only: no path, no file name, no content. */
export type CopyFailure =
  'copy-not-found' | 'source-size-unknown' | 'size-differs' | 'digest-differs' | 'bytes-differ' | 'unreadable';

/** Check provider evidence; only an exact comparison permits pruning older backups. */
export function checkBackupCopy(
  source: CopyFile,
  findCopy: () => CopyFile | undefined,
  prune: () => void,
  onProgress?: (fraction: number) => void,
  onFailure?: (why: CopyFailure) => void,
): CopyCheck {
  const result = compareCopy(source, findCopy, onProgress);
  if (result.check === 'failed') onFailure?.(result.why);
  if (result.check === 'bytes') {
    try {
      prune();
    } catch {
      // Retention is best effort. Failure to list/delete old files does not undo a verified copy.
    }
  }
  return result.check;
}

type Outcome = { check: 'bytes' | 'size' } | { check: 'failed'; why: CopyFailure };
const failed = (why: CopyFailure): Outcome => ({ check: 'failed', why });

function compareCopy(
  source: CopyFile,
  findCopy: () => CopyFile | undefined,
  onProgress?: (fraction: number) => void,
): Outcome {
  let read: CopyReader | undefined;
  let written: CopyReader | undefined;
  try {
    const copied = findCopy();
    if (!copied) return failed('copy-not-found');
    const expected = source.size;
    if (expected == null || !Number.isSafeInteger(expected) || expected <= 0) return failed('source-size-unknown');
    const size = copied.size;
    if (size != null && size !== expected) return failed('size-differs');

    /*
     * A native digest of both files is the first choice. Reading a copy in a
     * user-chosen (SAF) folder back through a file handle failed on the phone
     * for a 19 MB backup whose bytes were intact, and a false failure keeps
     * every old backup and tells the owner the backup did not work.
     */
    const sourceDigest = source.digest;
    const copiedDigest = sourceDigest ? copied.digest : null;
    if (sourceDigest && copiedDigest) {
      onProgress?.(1);
      return sourceDigest === copiedDigest ? { check: 'bytes' } : failed('digest-differs');
    }

    // A source read failure cannot be blamed on a SAF destination provider.
    read = source.open();
    try {
      written = copied.open();
    } catch {
      // Known equal length is weaker evidence, never permission to prune.
      return size === expected ? { check: 'size' } : failed('unreadable');
    }
    // Unknown size can still be verified by reading exactly the expected bytes and EOF.
    return streamsMatch(
      { read: (n) => read!.readBytes(n) },
      { read: (n) => written!.readBytes(n) },
      expected,
      undefined,
      onProgress,
    )
      ? { check: 'bytes' }
      : failed('bytes-differ');
  } catch {
    // Missing metadata, listing failure or an interrupted read provides no completed check.
    return failed('unreadable');
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
