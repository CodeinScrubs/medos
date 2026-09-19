import { and, asc, desc, eq, isNull, sql } from 'drizzle-orm';

import { db } from '@/db/client';
import { orders, type Order } from '@/db/schema';
import { startsWith } from '@/db/search';
import { resolveActiveEncounterId } from '@/features/encounters/queries';
import { newId, softDelete, stamps, touch } from '@/lib/ids';

import { endAtForStatus } from './logic';

const alive = isNull(orders.deletedAt);

export function patientOrdersQuery(patientId: string) {
  return db
    .select()
    .from(orders)
    .where(and(alive, eq(orders.patientId, patientId)))
    .orderBy(asc(orders.sortOrder), desc(orders.startAt));
}

export function orderQuery(id: string) {
  return db.select().from(orders).where(eq(orders.id, id)).limit(1);
}

export type OrderInput = {
  patientId: string;
  kind: Order['kind'];
  name: string;
  brandName?: string | null;
  dose?: string | null;
  route?: string | null;
  frequency?: string | null;
  rate?: string | null;
  duration?: string | null;
  isPrn?: boolean;
  prnCondition?: string | null;
  startAt?: Date | null;
  indication?: string | null;
  notes?: string | null;
};

export async function createOrder(input: OrderInput): Promise<string> {
  const id = newId();
  await db.insert(orders).values({
    id,
    ...stamps(),
    patientId: input.patientId,
    encounterId: await resolveActiveEncounterId(input.patientId),
    kind: input.kind,
    name: input.name.trim(),
    brandName: input.brandName ?? null,
    dose: input.dose ?? null,
    route: input.route ?? null,
    frequency: input.frequency ?? null,
    rate: input.rate ?? null,
    duration: input.duration ?? null,
    isPrn: input.isPrn ?? false,
    prnCondition: input.prnCondition ?? null,
    startAt: input.startAt ?? new Date(),
    indication: input.indication ?? null,
    notes: input.notes ?? null,
    status: 'active',
  });
  return id;
}

export async function updateOrder(id: string, patch: Partial<Omit<OrderInput, 'patientId'>>): Promise<void> {
  await db
    .update(orders)
    .set({ ...patch, ...touch() })
    .where(eq(orders.id, id));
}

/**
 * Change status. Discontinuing or completing stamps `endAt` so the day count
 * freezes at the last day given; resuming clears it.
 */
export async function setOrderStatus(id: string, status: Order['status']): Promise<void> {
  await db
    .update(orders)
    .set({ status, endAt: endAtForStatus(status), ...touch() })
    .where(eq(orders.id, id));
}

export async function deleteOrder(id: string): Promise<void> {
  await db.update(orders).set(softDelete()).where(eq(orders.id, id));
}

/**
 * Names used before, most frequent first — the kardex autocomplete. Learned
 * from the user's own orders rather than a drug database, so it matches how
 * they actually spell things.
 */
export async function suggestOrderNames(prefix: string, limit = 8): Promise<string[]> {
  const term = prefix.trim();
  if (term.length < 2) return [];
  const rows = await db
    .select({ name: orders.name, uses: sql<number>`count(*)` })
    .from(orders)
    .where(and(alive, startsWith(orders.name, term)))
    .groupBy(orders.name)
    .orderBy(desc(sql`count(*)`))
    .limit(limit);
  return rows.map((r) => r.name);
}

/** The most recent full order with this name, to prefill dose/route/frequency. */
export async function lastOrderNamed(name: string): Promise<Order | null> {
  const rows = await db
    .select()
    .from(orders)
    .where(and(alive, eq(orders.name, name)))
    .orderBy(desc(orders.createdAt))
    .limit(1);
  return rows[0] ?? null;
}
