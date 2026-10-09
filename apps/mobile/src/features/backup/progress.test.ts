import { describe, expect, it, jest } from '@jest/globals';

import { createProgressReporter } from './progress';

type Report = Parameters<typeof createProgressReporter>[0];

describe('backup progress display does not enqueue every KDF callback', () => {
  it('bounds the actual N=2^15 callback cadence while retaining initial and final progress', () => {
    const report = jest.fn<Report>();
    const publish = createProgressReporter(report);
    publish({ phase: 'key', fraction: 0 });
    // The installed noble implementation reports each sixth block mix at this cost.
    const total = 2 * 2 ** 15;
    const every = Math.floor(total / 10_000);
    for (let mix = 1; mix <= total; mix++)
      if (mix % every === 0 || mix === total) publish({ phase: 'key', fraction: mix / total });
    expect(report).toHaveBeenCalledTimes(101);
    expect(report.mock.calls[0]).toEqual([{ phase: 'key', fraction: 0 }]);
    expect(report.mock.calls.at(-1)).toEqual([{ phase: 'key', fraction: 1 }]);
    expect(report.mock.calls.every(([progress]) => progress.fraction >= 0 && progress.fraction <= 1)).toBe(true);
  });
  it('delivers phase changes immediately even when the percentage is unchanged', () => {
    const report = jest.fn<Report>();
    const publish = createProgressReporter(report);
    for (const phase of ['snapshot', 'encrypt', 'copy', 'done']) publish({ phase, fraction: 0 });
    expect(report.mock.calls.map(([progress]) => progress.phase)).toEqual(['snapshot', 'encrypt', 'copy', 'done']);
  });
  it('retains the actual reported fraction, including backward progress and completion', () => {
    const report = jest.fn<Report>();
    const publish = createProgressReporter(report);
    publish({ phase: 'files', fraction: 0.204 });
    publish({ phase: 'files', fraction: 0.209 });
    publish({ phase: 'files', fraction: 0.19 });
    publish({ phase: 'files', fraction: 1 });
    expect(report.mock.calls).toEqual([
      [{ phase: 'files', fraction: 0.204 }],
      [{ phase: 'files', fraction: 0.19 }],
      [{ phase: 'files', fraction: 1 }],
    ]);
  });
  it('does not claim completion and gives each operation a fresh progress identity', () => {
    const report = jest.fn<Report>();
    createProgressReporter(report)({ phase: 'key', fraction: 0.1 });
    createProgressReporter(report)({ phase: 'key', fraction: 0.1 });
    expect(report).toHaveBeenCalledTimes(2);
    expect(report.mock.calls.every(([progress]) => progress.phase !== 'done' && progress.fraction !== 1)).toBe(true);
  });
  it('does not swallow a failed display callback or acknowledge that emission', () => {
    const report = jest.fn<Report>().mockImplementationOnce(() => {
      throw new Error('Synthetic display failure');
    });
    const publish = createProgressReporter(report);
    const progress = { phase: 'key', fraction: 0.5 };
    expect(() => publish(progress)).toThrow('Synthetic display failure');
    publish(progress);
    expect(report).toHaveBeenCalledTimes(2);
  });
});
