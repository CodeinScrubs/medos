import type { LabValue } from '@/db/schema';
import { parseDecimal, toLatinDigits } from '@/lib/persian';

export type LabFlag = NonNullable<LabValue['flag']>;

/** How a result is qualified when the lab cannot give an exact number. */
export type Comparator = '<' | '<=' | '>' | '>=';

export type LabNumber = { value: number; comparator: Comparator | null };

const COMPARATOR_RE = /^(<=|>=|<|>|≤|≥)\s*/;

const COMPARATORS: Record<string, Comparator> = {
  '<': '<',
  '<=': '<=',
  '≤': '<=',
  '>': '>',
  '>=': '>=',
  '≥': '>=',
};

/**
 * Parse a typed result, keeping the comparator it came with.
 *
 * "<0.01" and ">100" are not the numbers 0.01 and 100 — they are bounds, and
 * dropping the sign is how a troponin of ">100" against an upper limit of 100
 * ends up flagged normal. Accepts Persian digits and separators (see
 * `parseDecimal`); a thousands separator is read as one, so "7,500" is 7500.
 * Whatever was typed is what gets displayed; this is for flags and plots.
 */
export function parseLabValue(raw: string | null | undefined): LabNumber | null {
  if (raw == null) return null;
  const text = toLatinDigits(raw).trim();
  const match = COMPARATOR_RE.exec(text);
  const value = parseDecimal(match ? text.slice(match[0].length) : text);
  if (value == null) return null;
  return { value, comparator: match ? (COMPARATORS[match[1]!] ?? null) : null };
}

/** Just the number, for storing and plotting. */
export function parseLabNumber(raw: string | null | undefined): number | null {
  return parseLabValue(raw)?.value ?? null;
}

/**
 * Out-of-range flag against the row's own reference range: H, L or normal.
 *
 * The reference interval is inclusive — a value exactly on a limit is normal —
 * and a bounded result is flagged only when **every** value it allows falls on
 * the same side. Anything else gets no flag at all, because on a lab table an
 * absent flag reads as "not judged" while a wrong one reads as a fact:
 *
 * - `>100` against 3–100 is high: every value above 100 is out of range.
 * - `>=100` is **not**: the result may be exactly 100, which is normal.
 * - `<3` is low, `<=3` is not (3 itself is allowed).
 * - `<5` against 3–100 proves nothing: the true value may be 2 or 4.
 * - With no lower limit at all, `<0.01` under an upper limit of 0.04 really is
 *   normal — there is nothing below to fall out of.
 *
 * There is deliberately no automatic "critical" flag. Critical thresholds are
 * analyte-specific and nothing like a multiple of the normal range — a rule
 * loose enough to be generic would show K 7.0 as a plain yellow "H", which
 * under-signals exactly the values that matter. How abnormal is abnormal is
 * the physician's call; the schema's critical_* values are reserved for a
 * future per-analyte threshold the user sets themselves.
 */
export function computeFlag(
  parsed: LabNumber | number | null,
  refLow: number | null | undefined,
  refHigh: number | null | undefined,
): LabFlag | null {
  if (parsed == null) return null;
  if (refLow == null && refHigh == null) return null;
  const { value, comparator } = typeof parsed === 'number' ? { value: parsed, comparator: null } : parsed;

  // A lower bound: the true value is above `value` (or at it, for `>=`).
  if (comparator === '>' || comparator === '>=') {
    if (refHigh != null) {
      const allAbove = comparator === '>' ? value >= refHigh : value > refHigh;
      return allAbove ? 'high' : null;
    }
    // No upper limit: everything from the lower limit up is normal.
    return refLow != null && value >= refLow ? 'normal' : null;
  }

  // An upper bound: the true value is below `value` (or at it, for `<=`).
  if (comparator === '<' || comparator === '<=') {
    if (refLow != null) {
      const allBelow = comparator === '<' ? value <= refLow : value < refLow;
      return allBelow ? 'low' : null;
    }
    // No lower limit: everything up to the upper limit is normal.
    return refHigh != null && value <= refHigh ? 'normal' : null;
  }

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
