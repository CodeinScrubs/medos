import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { eq } from 'drizzle-orm';

import { auditLog, encounters, orders, patients, type Order } from '@/db/schema';
import { openEncounter } from '@/features/encounters/queries';
import { createPatient } from '@/features/patients/queries';
import { datasetGeneration, DatasetChangedError, reserveDatasetReplacement } from '@/lib/dataset-write';
import { softDelete, stamps } from '@/lib/ids';
import { useTestDatabase } from '@/test/db-client';
import { createTestDatabase, type TestDatabase } from '@/test/sqljs';

import {
  createOrder,
  deleteOrder,
  orderQuery,
  patientCurrentOrdersQuery,
  setOrderStatus,
  updateOrder,
} from './queries';

jest.mock('@/db/client', () => jest.requireActual('@/test/db-client'));
jest.mock('@/platform/notifications', () => jest.requireActual('@/test/mocks/notifications'));

let t: TestDatabase, patientId: string;
const at = new Date('2025-01-01T12:00:00.123Z');
const later = new Date('2025-01-03T12:00:00.456Z');
const row = (id: string) => t.db.select().from(orders).where(eq(orders.id, id)).get()!;
const audits = () =>
  t.db
    .select()
    .from(auditLog)
    .all()
    .filter((item) => item.entityType === 'order');
const tracked = () => ({ rows: t.db.select().from(orders).all(), audits: audits() });
async function add() {
  return createOrder({ patientId, kind: 'drug', name: 'Synthetic order', dose: '1 g', startAt: at });
}
async function mutate(action: 'status' | 'delete', id: string, expected?: Order) {
  if (action === 'status') await setOrderStatus(id, 'completed', { expected, now: later });
  else await deleteOrder(id, { expected, now: later });
}
beforeEach(async () => {
  t = useTestDatabase(await createTestDatabase());
  patientId = await createPatient({ firstName: 'Synthetic', lastName: 'Order ownership' });
});

describe('order mutation acknowledgment is bounded to its shown row and clinical context', () => {
  it.each(['status', 'delete'] as const)('rejects a same-timestamp dose correction before %s', async (action) => {
    const id = await add();
    const expected = row(id);
    t.db.update(orders).set({ dose: '2 g' }).where(eq(orders.id, id)).run();
    expect(row(id).updatedAt).toEqual(expected.updatedAt);
    const before = tracked();
    await expect(mutate(action, id, expected)).rejects.toThrow('تغییر کرده');
    expect(tracked()).toEqual(before);
  });

  it.each(['status', 'delete'] as const)('rejects a deleted patient before %s', async (action) => {
    const id = await add();
    t.db.update(patients).set(softDelete(at)).where(eq(patients.id, patientId)).run();
    const before = tracked();
    await expect(mutate(action, id, row(id))).rejects.toThrow('بیمار');
    expect(tracked()).toEqual(before);
    expect(await orderQuery(id, patientId)).toEqual([]);
    expect(await patientCurrentOrdersQuery(patientId)).toEqual([]);
  });

  it.each(['status', 'delete'] as const)('rejects a deleted encounter before %s', async (action) => {
    const encounterId = await openEncounter({ patientId, kind: 'admission', admittedAt: at });
    const id = await add();
    t.db.update(encounters).set(softDelete(at)).where(eq(encounters.id, encounterId)).run();
    const before = tracked();
    await expect(mutate(action, id, row(id))).rejects.toThrow('نوبت');
    expect(tracked()).toEqual(before);
  });

  it.each(['status', 'delete'] as const)('rejects a foreign encounter before %s', async (action) => {
    const other = await createPatient({ firstName: 'Synthetic', lastName: 'Other' });
    const foreign = await openEncounter({ patientId: other, kind: 'admission' });
    const id = await add();
    t.db.update(orders).set({ encounterId: foreign }).where(eq(orders.id, id)).run();
    const before = tracked();
    await expect(mutate(action, id, row(id))).rejects.toThrow('نوبت');
    expect(tracked()).toEqual(before);
  });

  describe.each(['foreign', 'deleted'] as const)('an empty imported %s episode reference', (kind) => {
    it.each(['edit', 'status', 'delete'] as const)('refuses %s without changing the order or audit', async (action) => {
      const owner = kind === 'foreign' ? await createPatient({ firstName: 'Synthetic', lastName: 'Other' }) : patientId;
      t.db
        .insert(encounters)
        .values({ id: '', patientId: owner, ...stamps(at), ...(kind === 'deleted' ? softDelete(at) : {}) })
        .run();
      const id = await add();
      t.db.update(orders).set({ encounterId: '' }).where(eq(orders.id, id)).run();
      const expected = row(id),
        before = tracked();
      const operation =
        action === 'edit'
          ? updateOrder(id, { notes: 'Synthetic unpublished correction' }, datasetGeneration(), expected)
          : mutate(action, id, expected);
      await expect(operation).rejects.toThrow('نوبت');
      expect(tracked()).toEqual(before);
    });
  });

  it.each(['status', 'delete'] as const)('rejects a missing order without acknowledging %s', async (action) => {
    await expect(mutate(action, 'synthetic-missing')).rejects.toThrow('دسترس');
    expect(tracked()).toEqual({ rows: [], audits: [] });
  });

  it('a direct repeated terminal status preserves its first time and audit', async () => {
    const id = await add();
    await setOrderStatus(id, 'completed', { now: at });
    const first = tracked();
    await setOrderStatus(id, 'completed', { now: later });
    expect(tracked()).toEqual(first);
    expect(row(id).endAt).toEqual(at);
    expect(audits()).toHaveLength(1);
    expect(audits()[0]).toMatchObject({ action: 'order.statusChanged', entityId: id, summary: null, detail: null });
  });

  it('an expected stale terminal status is rejected even when the target status already matches', async () => {
    const id = await add();
    const expected = row(id);
    await setOrderStatus(id, 'completed', { now: at });
    const before = tracked();
    await expect(setOrderStatus(id, 'completed', { expected, now: later })).rejects.toThrow('تغییر کرده');
    expect(tracked()).toEqual(before);
  });

  it('direct deletion replay preserves the tombstone, while an old live confirmation is refused', async () => {
    const id = await add();
    const expected = row(id);
    await deleteOrder(id, { expected, now: at });
    const before = tracked();
    await deleteOrder(id, { now: later });
    expect(tracked()).toEqual(before);
    await expect(deleteOrder(id, { expected, now: later })).rejects.toThrow('تغییر کرده');
    await expect(setOrderStatus(id, 'active', { now: later })).rejects.toThrow('حذف');
    expect(tracked()).toEqual(before);
    expect(audits()).toHaveLength(1);
    expect(audits()[0]).toMatchObject({ action: 'order.deleted', entityId: id, summary: null, detail: null });
  });

  it('refuses an unchanged old card after a new episode opens, but permits explicit historical correction', async () => {
    await openEncounter({ patientId, kind: 'admission', admittedAt: at });
    const id = await add();
    await setOrderStatus(id, 'completed', { now: at });
    const expected = row(id);
    await openEncounter({ patientId, kind: 'admission', admittedAt: later });
    expect(row(id)).toEqual(expected);
    const before = tracked();
    await expect(deleteOrder(id, { expected, currentPatientId: patientId })).rejects.toThrow('نوبت جاری');
    expect(tracked()).toEqual(before);
    await setOrderStatus(id, 'held', { expected, now: later });
    expect(row(id)).toMatchObject({ status: 'held', endAt: null, encounterId: expected.encounterId });
  });

  it('standing orders retain null ownership despite a new episode and cannot act as another patient', async () => {
    const id = await add();
    await openEncounter({ patientId, kind: 'admission', admittedAt: later });
    const expected = row(id);
    await expect(setOrderStatus(id, 'held', { expected, currentPatientId: 'synthetic-other' })).rejects.toThrow(
      'نوبت جاری',
    );
    await setOrderStatus(id, 'held', { expected, currentPatientId: patientId, now: at });
    expect(row(id)).toMatchObject({ status: 'held', encounterId: null });
  });

  it.each(['status', 'delete'] as const)('rolls back %s if its audit insert fails in real SQLite', async (action) => {
    const id = await add();
    const before = tracked();
    t.sqlite.exec(`CREATE TEMP TRIGGER deny_order_audit BEFORE INSERT ON audit_log
      WHEN NEW.entity_type = 'order' BEGIN SELECT RAISE(ABORT, 'Synthetic audit failure'); END;`);
    await expect(mutate(action, id, row(id))).rejects.toThrow();
    expect(tracked()).toEqual(before);
    t.sqlite.exec('DROP TRIGGER deny_order_audit');
    await mutate(action, id, row(id));
    expect(audits()).toHaveLength(1);
  });

  it.each(['status', 'delete'] as const)('refuses original-generation %s after replacement', async (action) => {
    const id = await add();
    const generation = datasetGeneration();
    const replacement = reserveDatasetReplacement();
    replacement.committed();
    replacement.release();
    const before = tracked();
    const work = action === 'status' ? setOrderStatus(id, 'held', { generation }) : deleteOrder(id, { generation });
    await expect(work).rejects.toBeInstanceOf(DatasetChangedError);
    expect(tracked()).toEqual(before);
  });

  it('scoped reads reject a foreign or empty route and accept only the exact patient', async () => {
    const id = await add();
    expect(await orderQuery(id, 'synthetic-other')).toEqual([]);
    expect(await orderQuery(id, '')).toEqual([]);
    expect(await orderQuery(id, patientId)).toEqual([row(id)]);
  });

  it('does not create an invisible order beneath a deleted patient', async () => {
    t.db.update(patients).set(softDelete(at)).where(eq(patients.id, patientId)).run();
    await expect(add()).rejects.toThrow('بیمار');
    expect(tracked()).toEqual({ rows: [], audits: [] });
  });

  it('preserves an explicitly unknown start instead of inventing the current time', async () => {
    const id = await createOrder({ patientId, kind: 'other', name: 'Synthetic unknown start', startAt: null });
    expect(row(id).startAt).toBeNull();
  });

  it('editing requires the original full order, not only its latest id or timestamp', async () => {
    const id = await add();
    const expected = row(id);
    t.db.update(orders).set({ dose: '2 g' }).where(eq(orders.id, id)).run();
    const before = tracked();
    await expect(updateOrder(id, { notes: 'Synthetic edit' }, datasetGeneration(), expected)).rejects.toThrow(
      'تغییر کرده',
    );
    expect(tracked()).toEqual(before);
  });

  it('editing a deleted order refuses zero-row success', async () => {
    const id = await add();
    await deleteOrder(id);
    const before = tracked();
    await expect(updateOrder(id, { dose: '2 g' })).rejects.toThrow('حذف');
    expect(tracked()).toEqual(before);
  });
});
