import type { Order } from '@/db/schema';
import { daysBetween } from '@/lib/jalali';

/**
 * Day of therapy, counting the start day as D1 — "D5 of Ceftriaxone".
 * Frozen at `endAt` once the order is stopped.
 */
export function therapyDay(order: Pick<Order, 'startAt' | 'endAt'>, now: Date = new Date()): number | null {
  if (!order.startAt) return null;
  const until = order.endAt ?? now;
  const diff = daysBetween(until, order.startAt);
  return diff == null ? null : diff + 1;
}

/** `1 g IV Q12H` — the one-line sig, in the order it is written on a kardex. */
export function orderSig(
  order: Pick<Order, 'dose' | 'route' | 'frequency' | 'rate' | 'isPrn' | 'prnCondition'>,
): string {
  const parts = [order.dose, order.route, order.frequency, order.rate].filter(Boolean);
  if (order.isPrn) parts.push(order.prnCondition ? `PRN (${order.prnCondition})` : 'PRN');
  return parts.join(' ');
}

/** Stopping an order freezes its day count; restarting it thaws it. */
export function endAtForStatus(status: Order['status'], now: Date = new Date()): Date | null {
  return status === 'discontinued' || status === 'completed' ? now : null;
}

export function isRunning(order: Pick<Order, 'status'>): boolean {
  return order.status === 'active' || order.status === 'held';
}
