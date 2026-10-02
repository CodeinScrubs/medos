/**
 * In-process exclusion for imports/recordings and backup/restore/recovery.
 * Independent imports may run together. Maintenance reserves before yielding,
 * and refuses an active job rather than snapshotting its partial bytes or
 * replacing its dataset. This is not a lock on ordinary clinical writes.
 */
let jobs = 0;
let maintenance = false;

export class FileWorkBusyError extends Error {
  constructor() {
    super('ضبط یا ورود فایل، بکاپ یا بازگردانی در حال انجام است؛ بعد از پایان دوباره تلاش کنید.');
    this.name = 'FileWorkBusyError';
  }
}

export function assertFileWorkAvailable(): void {
  if (maintenance) throw new FileWorkBusyError();
}

/** Check again on acquisition; this hint alone does not reserve anything. */
export function fileJobsActive(): boolean {
  return jobs > 0;
}

/** Reserve before the first await; the owner releases after its entire operation. */
export function reserveFileJob(): () => void {
  assertFileWorkAvailable();
  jobs += 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    jobs -= 1;
  };
}

/** Callers release in finally, covering journal, copy, verification and commit. */
export async function withFileJob<T>(work: () => Promise<T>): Promise<T> {
  const release = reserveFileJob();
  try {
    return await work();
  } finally {
    release();
  }
}

/** Reserve synchronously, including the interval before the caller's first await. */
export function reserveFileMaintenance(): () => void {
  if (maintenance || jobs > 0) throw new FileWorkBusyError();
  maintenance = true;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    maintenance = false;
  };
}
