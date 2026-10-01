import { describe, expect, it } from '@jest/globals';

import { fileJobsActive, FileWorkBusyError, reserveFileMaintenance, withFileJob } from './file-work';

function deferred() {
  let finish!: () => void;
  const promise = new Promise<void>((resolve) => {
    finish = resolve;
  });
  return { promise, finish };
}

describe('file-job and maintenance exclusion', () => {
  it('reserves maintenance synchronously and refuses a new job without entering its callback', async () => {
    const release = reserveFileMaintenance();
    let entered = false;
    try {
      expect(() => reserveFileMaintenance()).toThrow(FileWorkBusyError);
      await expect(
        withFileJob(async () => {
          entered = true;
        }),
      ).rejects.toThrow(FileWorkBusyError);
      expect(entered).toBe(false);
      expect(fileJobsActive()).toBe(false);
    } finally {
      release();
    }
    await expect(withFileJob(async () => 'finished')).resolves.toBe('finished');
  });

  it('keeps independent jobs concurrent and excludes maintenance until both finish', async () => {
    const first = deferred();
    const second = deferred();
    const a = withFileJob(() => first.promise);
    const b = withFileJob(() => second.promise);
    try {
      expect(fileJobsActive()).toBe(true);
      expect(() => reserveFileMaintenance()).toThrow(FileWorkBusyError);
      first.finish();
      await a;
      expect(() => reserveFileMaintenance()).toThrow(FileWorkBusyError);
    } finally {
      first.finish();
      second.finish();
      await Promise.all([a, b]);
    }
    expect(fileJobsActive()).toBe(false);
    reserveFileMaintenance()();
  });

  it.each(['before await', 'after await'])(
    'releases a failed job %s and allows the next maintenance',
    async (phase) => {
      await expect(
        withFileJob(async () => {
          if (phase === 'after await') await Promise.resolve();
          throw new Error('synthetic failure');
        }),
      ).rejects.toThrow('synthetic failure');
      expect(fileJobsActive()).toBe(false);
      reserveFileMaintenance()();
    },
  );

  it('does not let a repeated old release unlock newer maintenance', async () => {
    const oldRelease = reserveFileMaintenance();
    oldRelease();
    const newRelease = reserveFileMaintenance();
    try {
      oldRelease();
      await expect(withFileJob(async () => {})).rejects.toThrow(FileWorkBusyError);
      expect(() => reserveFileMaintenance()).toThrow(FileWorkBusyError);
    } finally {
      newRelease();
    }
    await expect(withFileJob(async () => {})).resolves.toBeUndefined();
  });
});
