import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { eq } from 'drizzle-orm';

import { tablesOf } from '@/db/query-tables';
import { encounters, orders, patients } from '@/db/schema';
import { openEncounter } from '@/features/encounters/queries';
import { createPatient } from '@/features/patients/queries';
import { datasetGeneration, DatasetChangedError, reserveDatasetReplacement } from '@/lib/dataset-write';
import { softDelete, stamps } from '@/lib/ids';
import { useTestDatabase } from '@/test/db-client';
import { createTestDatabase, type TestDatabase } from '@/test/sqljs';

import { createOrder, orderCreationContextQuery, type OrderCreationContext } from './queries';

jest.mock('@/db/client', () => jest.requireActual('@/test/db-client'));
jest.mock('@/platform/notifications', () => jest.requireActual('@/test/mocks/notifications'));

let t: TestDatabase, patientId: string;
const at = new Date('2025-01-01T12:00:00.123Z');
const rows = () => t.db.select().from(orders).all();
const input = () => ({ patientId, name: 'Synthetic context order', kind: 'drug' as const, startAt: null });
beforeEach(async () => {
  t = useTestDatabase(await createTestDatabase());
  patientId = await createPatient({ firstName: 'Synthetic', lastName: 'Creation context' });
});

describe('a mounted order creation intent retains its clinical association', () => {
  it('an inactive historical episode is not an active creation context', async () => {
    const encounterId = await openEncounter({ patientId, kind: 'admission', admittedAt: at });
    t.db.update(encounters).set({ isActive: false }).where(eq(encounters.id, encounterId)).run();
    const context = (await orderCreationContextQuery(patientId))[0]!;
    expect(context).toEqual({ patientId, encounterId: null });
    await openEncounter({ patientId, kind: 'admission', admittedAt: new Date('2025-01-03T12:00:00Z') });
    await createOrder(input(), datasetGeneration(), context);
    expect(rows()).toHaveLength(1);
    expect(rows()[0]).toMatchObject({ patientId, encounterId: null, startAt: null });
  });

  it('a later admission does not redirect a previously captured active episode', async () => {
    const encounterId = await openEncounter({ patientId, kind: 'admission', admittedAt: at });
    const context = (await orderCreationContextQuery(patientId))[0]!;
    expect(context).toEqual({ patientId, encounterId });
    await openEncounter({ patientId, kind: 'admission', admittedAt: new Date('2025-01-03T12:00:00Z') });
    await createOrder(input(), datasetGeneration(), context);
    expect(rows()[0]).toMatchObject({ patientId, encounterId, startAt: null });
  });

  it('duplicate active episodes use the established stable fallback without changing records', async () => {
    for (const id of ['synthetic-z', 'synthetic-a'])
      t.db
        .insert(encounters)
        .values({ id, patientId, ...stamps(at), admittedAt: at, isActive: true })
        .run();
    const before = t.db.select().from(encounters).all();
    expect(await orderCreationContextQuery(patientId)).toEqual([{ patientId, encounterId: 'synthetic-a' }]);
    expect(t.db.select().from(encounters).all()).toEqual(before);
    expect(tablesOf(orderCreationContextQuery(patientId))).toEqual(expect.arrayContaining(['patients', 'encounters']));
  });

  it.each(['', 'synthetic-missing'])('missing patient scope %s cannot provide a creation context', async (id) => {
    expect(await orderCreationContextQuery(id)).toEqual([]);
  });

  it('a deleted patient cannot supply or consume a captured context', async () => {
    const context = (await orderCreationContextQuery(patientId))[0]!;
    t.db.update(patients).set(softDelete(at)).where(eq(patients.id, patientId)).run();
    expect(await orderCreationContextQuery(patientId)).toEqual([]);
    await expect(createOrder(input(), datasetGeneration(), context)).rejects.toThrow('بیمار');
    expect(rows()).toEqual([]);
  });

  it.each(['missing', 'deleted', 'foreign'] as const)(
    'rejects a %s original episode without inserting',
    async (kind) => {
      const owner = kind === 'foreign' ? await createPatient({ firstName: 'Synthetic', lastName: 'Other' }) : patientId;
      const encounterId =
        kind === 'missing'
          ? 'synthetic-missing'
          : await openEncounter({ patientId: owner, kind: 'admission', admittedAt: at });
      if (kind === 'deleted') t.db.update(encounters).set(softDelete(at)).where(eq(encounters.id, encounterId)).run();
      await expect(createOrder(input(), datasetGeneration(), { patientId, encounterId })).rejects.toThrow('نوبت');
      expect(rows()).toEqual([]);
    },
  );

  it('a captured patient ID cannot authorize a different target patient', async () => {
    const context: OrderCreationContext = { patientId: 'synthetic-other', encounterId: null };
    await expect(createOrder(input(), datasetGeneration(), context)).rejects.toThrow('مسیر بیمار');
    expect(rows()).toEqual([]);
  });

  it.each(['missing', 'deleted', 'foreign'] as const)(
    'an empty imported key cannot bypass a %s original episode check',
    async (kind) => {
      if (kind !== 'missing') {
        const owner =
          kind === 'foreign' ? await createPatient({ firstName: 'Synthetic', lastName: 'Other' }) : patientId;
        t.db
          .insert(encounters)
          .values({ id: '', patientId: owner, ...stamps(at), ...(kind === 'deleted' ? softDelete(at) : {}) })
          .run();
      }
      await expect(createOrder(input(), datasetGeneration(), { patientId, encounterId: '' })).rejects.toThrow('نوبت');
      expect(rows()).toEqual([]);
    },
  );

  it('checks an empty imported key without treating its live owned episode as null', async () => {
    t.db
      .insert(encounters)
      .values({ id: '', patientId, ...stamps(at), admittedAt: at, isActive: true })
      .run();
    const context = (await orderCreationContextQuery(patientId))[0]!;
    expect(context).toEqual({ patientId, encounterId: '' });
    await createOrder(input(), datasetGeneration(), context);
    expect(rows()[0]).toMatchObject({ patientId, encounterId: '', startAt: null });
  });

  it('same-ID rows cannot make an old dataset context fresh', async () => {
    const generation = datasetGeneration(),
      context = (await orderCreationContextQuery(patientId))[0]!;
    const replacement = reserveDatasetReplacement();
    replacement.committed();
    replacement.release();
    await expect(createOrder(input(), generation, context)).rejects.toBeInstanceOf(DatasetChangedError);
    expect(rows()).toEqual([]);
  });
});
