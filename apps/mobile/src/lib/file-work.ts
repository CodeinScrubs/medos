/**
 * In-process exclusion for complete call-file jobs and backup/restore/recovery.
 * Independent imports may run together. Maintenance reserves before yielding,
 * and refuses an active job rather than snapshotting its partial bytes or
 * replacing its dataset. This is not a lock on ordinary clinical writes.
 */
let jobs = 0;
let maintenance = false;

export class FileWorkBusyError extends Error {
  constructor() {
    super('ورود فایل یا بکاپ و بازگردانی در حال انجام است؛ بعد از پایان دوباره تلاش کنید.');
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

/** Callers release in finally, covering journal, copy, verification and commit. */
export async function withFileJob<T>(work: () => Promise<T>): Promise<T> {
  assertFileWorkAvailable();
  jobs += 1;
  try {
    return await work();
  } finally {
    jobs -= 1;
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
