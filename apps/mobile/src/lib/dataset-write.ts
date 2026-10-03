/** Process-local intent identity. A JS restart already removes every old editor. */
let generation = 0;
let writers = 0;
let replacing = false;
const listeners = new Set<() => void>();

export class DatasetChangedError extends Error {
  constructor() {
    super(
      'اطلاعات از بکاپ جایگزین شده است. نوشتهٔ این فرم باقی مانده، اما نمی‌تواند پروندهٔ بازگردانی‌شده را تغییر دهد.',
    );
    this.name = 'DatasetChangedError';
  }
}

export class DatasetBusyError extends Error {
  constructor() {
    super('بازگردانی یا ذخیرهٔ اطلاعات در حال انجام است؛ پس از پایان دوباره تلاش کنید.');
    this.name = 'DatasetBusyError';
  }
}

export const datasetGeneration = () => generation;
export function subscribeDataset(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function assertDatasetWrite(expected = generation): void {
  if (expected !== generation) throw new DatasetChangedError();
  if (replacing) throw new DatasetBusyError();
}

/** Retain admission across awaits, not just a button's initial check. */
export async function withDatasetWrite<T>(expected: number, work: () => Promise<T>): Promise<T> {
  assertDatasetWrite(expected);
  writers += 1;
  try {
    return await work();
  } finally {
    writers -= 1;
  }
}

export type DatasetReplacement = {
  /** Explicit authority for this restore's internal SQL, revoked on release. */
  authorize(): void;
  /** Called once, synchronously after SQL commits and before housekeeping. */
  committed(): void;
  release(): void;
};

export function reserveDatasetReplacement(): DatasetReplacement {
  if (replacing || writers > 0) throw new DatasetBusyError();
  replacing = true;
  let active = true;
  let committed = false;
  return {
    authorize() {
      if (!active) throw new DatasetBusyError();
    },
    committed() {
      if (!active || committed) throw new DatasetBusyError();
      committed = true;
      generation += 1;
      // New intents may write once the new database is live. Old intents keep
      // their original generation; housekeeping still owns the file lease.
      replacing = false;
      for (const listener of [...listeners]) {
        try {
          listener();
        } catch {
          // A subscriber must never turn a committed import into media rollback.
        }
      }
    },
    release() {
      if (!active) return;
      active = false;
      if (!committed) replacing = false;
    },
  };
}
