import { and, asc, desc, eq, getTableColumns, inArray, isNull, or, sql } from 'drizzle-orm';

import { auditInTransaction } from '@/db/audit';
import { db, type Database } from '@/db/client';
import { encounters, orders, patients, type Order } from '@/db/schema';
import { startsWith } from '@/db/search';
import { currentEncounterQuery, resolveActiveEncounterId } from '@/features/encounters/queries';
import { activeEncounterIdQuery } from '@/features/encounters/status';
import { datasetGeneration, withDatasetWrite } from '@/lib/dataset-write';
import { newId, softDelete, stamps, touch } from '@/lib/ids';

import { endAtForStatus } from './logic';

const alive = isNull(orders.deletedAt);

/**
 * The kardex of one admission, plus the patient's standing orders (those
 * belonging to no encounter). Scoping to the encounter is what keeps a drug
 * from a previous admission out of today's list; without it an old order shows
 * as running, counting days, next to the current ones.
 */
export function patientOrdersQuery(patientId: string, encounterId: string | null) {
  return db
    .select()
    .from(orders)
    .where(
      and(
        alive,
        eq(orders.patientId, patientId),
        encounterId !== null
          ? or(eq(orders.encounterId, encounterId), isNull(orders.encounterId))
          : isNull(orders.encounterId),
      ),
    )
    .orderBy(asc(orders.sortOrder), desc(orders.startAt));
}

/**
 * Resolve the current episode and its orders in one SQLite read. A separate
 * awaited encounter read can fail or leave the previous episode's orders cached.
 * The real encounter join also lets useLive watch changes to episode ownership.
 */
export function patientCurrentOrdersQuery(patientId: string) {
  const current = currentEncounterQuery(patientId).as('snapshot_encounter');
  const currentId = db.select({ id: current.id }).from(current);
  return db
    .select(getTableColumns(orders))
    .from(orders)
    .innerJoin(patients, eq(patients.id, orders.patientId))
    .leftJoin(encounters, inArray(encounters.id, currentId))
    .where(
      and(
        alive,
        isNull(patients.deletedAt),
        eq(orders.patientId, patientId),
        or(eq(orders.encounterId, encounters.id), isNull(orders.encounterId)),
      ),
    )
    .orderBy(asc(orders.sortOrder), desc(orders.startAt));
}

export function orderQuery(id: string, patientId?: string) {
  return db
    .select(getTableColumns(orders))
    .from(orders)
    .innerJoin(patients, eq(patients.id, orders.patientId))
    .where(
      and(
        alive,
        isNull(patients.deletedAt),
        eq(orders.id, id),
        patientId !== undefined ? eq(orders.patientId, patientId) : undefined,
      ),
    )
    .limit(1);
}

export type OrderCreationContext = { patientId: string; encounterId: string | null };

/** Capture the active episode once, including an explicit outpatient null, before typing. */
export function orderCreationContextQuery(patientId: string) {
  const activeId = activeEncounterIdQuery(patientId);
  return db
    .select({ patientId: patients.id, encounterId: encounters.id })
    .from(patients)
    .leftJoin(encounters, inArray(encounters.id, activeId))
    .where(and(eq(patients.id, patientId), isNull(patients.deletedAt)))
    .limit(1);
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

export async function createOrder(
  input: OrderInput,
  generation = datasetGeneration(),
  originalContext?: OrderCreationContext,
): Promise<string> {
  return withDatasetWrite(generation, async () => {
    return db.transaction((tx) => {
      // Immediate callers may resolve now; mounted forms must pass their original snapshot.
      // A captured null is meaningful and must never fall back to a later admission.
      const context = originalContext ?? {
        patientId: input.patientId,
        encounterId: resolveActiveEncounterId(input.patientId, tx),
      };
      if (context.patientId !== input.patientId) throw new Error('مسیر بیمار تغییر کرده است.');
      requireOrderContext(tx, context);
      const id = newId(),
        now = new Date();
      tx.insert(orders)
        .values({
          id,
          ...stamps(now),
          patientId: input.patientId,
          encounterId: context.encounterId,
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
          startAt: input.startAt === undefined ? now : input.startAt,
          indication: input.indication ?? null,
          notes: input.notes ?? null,
          status: 'active',
        })
        .run();
      return id;
    });
  });
}

export async function updateOrder(
  id: string,
  patch: Partial<Omit<OrderInput, 'patientId'>>,
  generation = datasetGeneration(),
  expected?: Order,
): Promise<void> {
  await withDatasetWrite(generation, async () => {
    db.transaction((tx) => {
      const current = requireOrderBasis(tx.select().from(orders).where(eq(orders.id, id)).get(), expected);
      if (current.deletedAt) throw new Error('این دستور حذف شده است.');
      requireOrderContext(tx, current);
      tx.update(orders)
        .set({ ...patch, ...touch() })
        .where(eq(orders.id, id))
        .run();
    });
  });
}

export type OrderMutationOptions = {
  /** Exact row shown when the action or confirmation was opened. */
  expected?: Order;
  /** Current-card actions also verify the episode, even before useLive refreshes. */
  currentPatientId?: string;
  generation?: number;
  now?: Date;
};

function requireOrderBasis(current: Order | undefined, expected?: Order): Order {
  if (!current) throw new Error('این دستور در دسترس نیست.');
  if (
    expected &&
    (Object.keys(current) as (keyof Order)[]).some((key) => {
      const a = current[key],
        b = expected[key];
      return a instanceof Date || b instanceof Date
        ? !(a instanceof Date && b instanceof Date && a.getTime() === b.getTime())
        : a !== b;
    })
  )
    throw new Error('این دستور تغییر کرده است؛ کاردکس را دوباره بخوانید و نسخهٔ جدید را بررسی کنید.');
  return current;
}

function requireOrderPatient(reader: Pick<Database, 'select'>, patientId: string): void {
  const patient = reader
    .select({ id: patients.id })
    .from(patients)
    .where(and(eq(patients.id, patientId), isNull(patients.deletedAt)))
    .get();
  if (!patient) throw new Error('پروندهٔ بیمار در دسترس نیست.');
}

function requireOrderContext(
  reader: Pick<Database, 'select'>,
  order: OrderCreationContext,
  currentPatientId?: string,
): void {
  requireOrderPatient(reader, order.patientId);
  // SQLite permits an imported empty-string key. Only null means no episode;
  // every stored reference must still belong to this live patient.
  if (order.encounterId !== null) {
    const encounter = reader
      .select({ id: encounters.id })
      .from(encounters)
      .where(
        and(
          eq(encounters.id, order.encounterId),
          eq(encounters.patientId, order.patientId),
          isNull(encounters.deletedAt),
        ),
      )
      .get();
    if (!encounter) throw new Error('نوبت مربوط به این دستور در دسترس نیست.');
  }
  if (
    currentPatientId !== undefined &&
    (order.patientId !== currentPatientId ||
      (order.encounterId !== null && currentEncounterQuery(currentPatientId, reader).get()?.id !== order.encounterId))
  )
    throw new Error('نوبت جاری تغییر کرده است؛ کاردکس را دوباره بخوانید.');
}

/** Freeze the therapy count once, after validating the original row and episode. */
export async function setOrderStatus(
  id: string,
  status: Order['status'],
  options: OrderMutationOptions = {},
): Promise<void> {
  await withDatasetWrite(options.generation ?? datasetGeneration(), async () =>
    db.transaction((tx) => {
      const current = requireOrderBasis(tx.select().from(orders).where(eq(orders.id, id)).get(), options.expected);
      if (current.deletedAt) throw new Error('این دستور حذف شده است.');
      requireOrderContext(tx, current, options.currentPatientId);
      if (current.status === status) return;
      const now = options.now ?? new Date();
      tx.update(orders)
        .set({ status, endAt: endAtForStatus(status, now), ...touch(now) })
        .where(eq(orders.id, id))
        .run();
      auditInTransaction(tx, 'order.statusChanged', { entityType: 'order', entityId: id }, now);
    }),
  );
}

export async function deleteOrder(id: string, options: OrderMutationOptions = {}): Promise<void> {
  await withDatasetWrite(options.generation ?? datasetGeneration(), async () =>
    db.transaction((tx) => {
      const current = requireOrderBasis(tx.select().from(orders).where(eq(orders.id, id)).get(), options.expected);
      // A direct replay is harmless. A held confirmation first compares its live basis.
      if (current.deletedAt) return;
      requireOrderContext(tx, current, options.currentPatientId);
      const now = options.now ?? new Date();
      tx.update(orders).set(softDelete(now)).where(eq(orders.id, id)).run();
      auditInTransaction(tx, 'order.deleted', { entityType: 'order', entityId: id }, now);
    }),
  );
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
