import { toPersianDigits } from './persian';

/** Chrome-only playback/recording duration; independent of native audio modules. */
export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  return toPersianDigits(`${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`);
}
