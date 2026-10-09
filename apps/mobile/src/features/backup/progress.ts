type DisplayProgress = { phase: string; fraction: number };

/** Display percent-sized changes; keep the underlying operation and KDF unchanged. */
export function createProgressReporter(report: (progress: DisplayProgress) => void) {
  let previous: { phase: string; percent: number } | undefined;
  return (progress: DisplayProgress) => {
    const percent = Math.floor(progress.fraction * 100);
    if (previous?.phase === progress.phase && previous.percent === percent) return;
    report(progress);
    previous = { phase: progress.phase, percent };
  };
}
