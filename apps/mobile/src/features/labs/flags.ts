import type { LabValue } from '@/db/schema';
import { parseDecimal, toLatinDigits } from '@/lib/persian';

export type LabFlag = NonNullable<LabValue['flag']>;

/**
 * Parse a typed result into a number, or null when it is not numeric.
 *
 * Accepts Persian digits and separators (see `parseDecimal`), and reads a
 * comparator-prefixed value ("<0.01", ">1000") as its bound — good enough to
 * plot, while the original text is always what gets displayed. A thousands
 * separator is read as one: "7,500" is 7500, never 7.5.
 */
export function parseLabNumber(raw: string | null | undefined): number | null {
  if (raw == null) return null;
  return parseDecimal(toLatinDigits(raw).trim().replace(COMPARATOR_RE, ''));
}

const COMPARATOR_RE = /^(?:<=?|>=?|≤|≥)\s*/;

/**
 * Out-of-range flag against the row's own reference range: H, L or normal.
 *
 * There is deliberately no automatic "critical" flag. Critical thresholds are
 * analyte-specific and nothing like a multiple of the normal range — a rule
 * loose enough to be generic would show K 7.0 as a plain yellow "H", which
 * under-signals exactly the values that matter. How abnormal is abnormal is
 * the physician's call; the schema's critical_* values are reserved for a
 * future per-analyte threshold the user sets themselves.
 */
export function computeFlag(
  value: number | null,
  refLow: number | null | undefined,
  refHigh: number | null | undefined,
): LabFlag | null {
  if (value == null) return null;
  if (refLow == null && refHigh == null) return null;
  if (refHigh != null && value > refHigh) return 'high';
  if (refLow != null && value < refLow) return 'low';
  return 'normal';
}

export const FLAG_LABEL: Record<LabFlag, string> = {
  normal: '',
  high: 'H',
  low: 'L',
  critical_high: 'HH',
  critical_low: 'LL',
};

export function flagTone(flag: LabFlag | null | undefined): 'danger' | 'warning' | 'info' | null {
  switch (flag) {
    case 'critical_high':
    case 'critical_low':
      return 'danger';
    case 'high':
      return 'warning';
    case 'low':
      return 'info';
    default:
      return null;
  }
}

/** "135–145", "< 1.2", "> 3.5" — Latin digits, since it sits next to clinical values. */
export function formatRange(low: number | null | undefined, high: number | null | undefined): string {
  if (low != null && high != null) return `${low}–${high}`;
  if (high != null) return `< ${high}`;
  if (low != null) return `> ${low}`;
  return '';
}

/**
 * "135 - 145", "135–145", "<5", ">40", "-2 to +2" typed by hand -> a range.
 * Empty text means "no range"; anything unreadable, or a range whose low end
 * is above its high end, is null so the caller can ask again.
 */
export function parseRangeInput(raw: string): { low: number | null; high: number | null } | null {
  const s = toLatinDigits(raw).trim();
  if (!s) return { low: null, high: null };

  const upper = /^(?:<=?|≤)\s*(\S+)$/.exec(s);
  if (upper) {
    const high = parseDecimal(upper[1]);
    return high == null ? null : { low: null, high };
  }
  const lower = /^(?:>=?|≥)\s*(\S+)$/.exec(s);
  if (lower) {
    const low = parseDecimal(lower[1]);
    return low == null ? null : { low, high: null };
  }
  const between = /^([-+]?[\d.,\u060C]+)\s*(?:-|–|—|~|to|\u062A\u0627)\s*([-+]?[\d.,\u060C]+)$/i.exec(s);
  if (between) {
    const low = parseDecimal(between[1]);
    const high = parseDecimal(between[2]);
    return low == null || high == null || low > high ? null : { low, high };
  }
  return null;
}
