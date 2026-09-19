import { toPersianDigits } from './persian';

/** `1.4 مگابایت` — Persian digits and units, for storage sizes. */
export function formatBytes(n: number | null | undefined): string {
  if (!n) return '۰';
  const units = ['بایت', 'کیلوبایت', 'مگابایت', 'گیگابایت'];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i += 1;
  }
  return `${toPersianDigits(v >= 10 || i === 0 ? Math.round(v) : v.toFixed(1))} ${units[i]}`;
}
