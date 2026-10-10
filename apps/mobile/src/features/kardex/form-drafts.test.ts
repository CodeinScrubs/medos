import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { eq } from 'drizzle-orm';

import { tablesOf } from '@/db/query-tables';
import { auditLog, encounters, orders, patients, workspaceFormDrafts } from '@/db/schema';
import { openEncounter } from '@/features/encounters/queries';
import { createPatient } from '@/features/patients/queries';
import {
  discardWorkspaceDraft,
  inspectWorkspaceForm,
  publishWorkspaceDraft,
  replaceWorkspaceDraft,
  saveWorkspaceDraft,
  workspaceFormSeed,
} from '@/features/workspace-forms/queries';
import { datasetGeneration, DatasetChangedError, reserveDatasetReplacement } from '@/lib/dataset-write';
import { FormDraftConflict, UnsupportedFormDraft } from '@/lib/form-document';
import { softDelete, stamps } from '@/lib/ids';
import { useTestDatabase } from '@/test/db-client';
import { createTestDatabase, type TestDatabase } from '@/test/sqljs';

import { initialOrderFields, orderFormCodec, orderFormContext, orderFormParent } from './form-draft';
import { orderDraftsQuery, orderFormIntentQuery, orderFormPort, orderFormQuery } from './form-draft-queries';
import { createOrder, type OrderCreationContext } from './queries';

jest.mock('@/db/client', () => jest.requireActual('@/test/db-client'));
jest.mock('@/platform/notifications', () => jest.requireActual('@/test/mocks/notifications'));
let t: TestDatabase, patientId: string, generation: number;
const now = new Date('2026-01-02T10:00:00.123Z');
beforeEach(async () => {
  t = useTestDatabase(await createTestDatabase());
  generation = datasetGeneration();
  patientId = await createPatient({ firstName: 'Synthetic', lastName: 'Raw order' });
});
const rawRow = (id = 'raw') => t.db.select().from(workspaceFormDrafts).where(eq(workspaceFormDrafts.id, id)).get()!;
const state = () => ({
  orders: t.db.select().from(orders).all(),
  drafts: t.db.select().from(workspaceFormDrafts).all(),
  audit: t.db.select().from(auditLog).all(),
});
async function seed(context: OrderCreationContext, recordId: string | null = null) {
  const port = orderFormPort(context);
  return {
    port,
    document: workspaceFormSeed(port, (await orderFormQuery(context, recordId))[0]!, recordId, now).document,
  };
}

describe('patient and episode owned raw order recovery', () => {
  it.each([null, '', 'new'])(
    'retains explicit episode %s through a later admission, publication and retry',
    async (encounterId) => {
      if (encounterId !== null)
        t.db
          .insert(encounters)
          .values({ id: encounterId, patientId, ...stamps(now), isActive: true })
          .run();
      const original = { patientId, encounterId };
      const { port, document } = await seed(original);
      document.fields.name = '  Synthetic original order  ';
      document.fields.dose = '  1 g  ';
      await saveWorkspaceDraft(port, 'raw', document, 0, generation);
      expect(orderFormContext(rawRow().parentId)).toEqual(original);
      expect((await orderFormIntentQuery(patientId, null, null))[0]!.draft?.id).toBe('raw');
      const later = await openEncounter({ patientId, kind: 'admission', admittedAt: now });
      const id = await publishWorkspaceDraft(port, 'raw', null, 1, now, generation);
      expect(t.db.select().from(orders).get()).toMatchObject({
        id,
        patientId,
        encounterId,
        name: 'Synthetic original order',
        dose: '1 g',
        startAt: now,
      });
      expect(t.db.select().from(orders).get()!.encounterId).not.toBe(later);
      const completed = state();
      expect(await publishWorkspaceDraft(port, 'raw', null, 1, now, generation)).toBe(id);
      await expect(saveWorkspaceDraft(port, 'raw', document, 1, generation)).rejects.toThrow(FormDraftConflict);
      expect(state()).toEqual(completed);
      expect(rawRow()).toMatchObject({ committedId: id, revision: 2, deletedAt: now });
    },
  );
  it.each(['', '  ', '1404/13/', '1404/12/30'])(
    'persists invalid/partial visible date %j without publishing the previous parsed date',
    async (dateText) => {
      const { port, document } = await seed({ patientId, encounterId: null });
      document.fields.name = 'Synthetic raw date';
      document.fields.date = { dateText, clockText: 'partial raw clock', customOpen: true };
      document.fields.notes = '  \nexact unfinished words\n  ';
      await saveWorkspaceDraft(port, 'raw', document, 0, generation);
      expect(orderFormCodec.decode(rawRow().body)).toEqual(document);
      const before = state();
      await expect(publishWorkspaceDraft(port, 'raw', null, 1, now, generation)).rejects.toThrow('تاریخ');
      expect(state()).toEqual(before);
    },
  );
  it('separates blank names from clinical publication and preserves an unknown start on edit', async () => {
    const context = { patientId, encounterId: null };
    const blank = await seed(context);
    blank.document.fields.name = '  ';
    await saveWorkspaceDraft(blank.port, 'blank', blank.document, 0, generation);
    await expect(publishWorkspaceDraft(blank.port, 'blank', null, 1, now, generation)).rejects.toThrow('نام');
    expect(t.db.select().from(orders).all()).toEqual([]);
    const id = await createOrder({ patientId, kind: 'drug', name: 'Synthetic unknown start', startAt: null });
    const editing = await seed(context, id);
    editing.document.fields.notes = 'Exact new note';
    await saveWorkspaceDraft(editing.port, 'editing', editing.document, 0, generation);
    await publishWorkspaceDraft(editing.port, 'editing', id, 1, now, generation);
    expect(t.db.select().from(orders).get()).toMatchObject({ startAt: null, notes: 'Exact new note' });
  });
  it('rejects moving a draft to another patient, episode or an unparented notebook port', async () => {
    const original = { patientId, encounterId: null };
    const { port, document } = await seed(original);
    await saveWorkspaceDraft(port, 'raw', document, 0, generation);
    const other = await createPatient({ firstName: 'Synthetic', lastName: 'Other raw owner' });
    const episode = await openEncounter({ patientId, kind: 'admission', admittedAt: now });
    const before = state();
    for (const wrong of [
      orderFormPort({ patientId: other, encounterId: null }),
      orderFormPort({ patientId, encounterId: episode }),
      { ...port, parentId: null },
    ]) {
      await expect(saveWorkspaceDraft(wrong, 'raw', document, 1, generation)).rejects.toThrow(FormDraftConflict);
      await expect(publishWorkspaceDraft(wrong, 'raw', null, 1, now, generation)).rejects.toThrow(FormDraftConflict);
      await expect(
        discardWorkspaceDraft('order', 'raw', null, 1, now, generation, wrong.parentId ?? null),
      ).rejects.toThrow(FormDraftConflict);
    }
    expect(state()).toEqual(before);
  });
  it.each(['foreign-episode', 'deleted-episode', 'deleted-patient'])(
    'publication refuses %s without retiring raw words',
    async (problem) => {
      const other = await createPatient({ firstName: 'Synthetic', lastName: 'Foreign episode owner' });
      const episode = await openEncounter({
        patientId: problem === 'foreign-episode' ? other : patientId,
        kind: 'admission',
        admittedAt: now,
      });
      const { port, document } = await seed({ patientId, encounterId: episode });
      document.fields.name = 'Synthetic held raw input';
      await saveWorkspaceDraft(port, 'raw', document, 0, generation);
      if (problem === 'deleted-episode')
        t.db.update(encounters).set(softDelete(now)).where(eq(encounters.id, episode)).run();
      if (problem === 'deleted-patient')
        t.db.update(patients).set(softDelete(now)).where(eq(patients.id, patientId)).run();
      const before = state();
      await expect(publishWorkspaceDraft(port, 'raw', null, 1, now, generation)).rejects.toThrow();
      expect(state()).toEqual(before);
    },
  );
  it('compares the complete existing row and requires exact shown-basis adoption before a separate Save', async () => {
    const context = { patientId, encounterId: null };
    const id = await createOrder({
      patientId,
      kind: 'drug',
      name: 'Synthetic concurrent order',
      dose: '1 g',
      startAt: now,
    });
    const { port, document } = await seed(context, id);
    document.fields.notes = 'Unpublished words';
    await saveWorkspaceDraft(port, 'raw', document, 0, generation);
    t.db.update(orders).set({ dose: '2 g' }).where(eq(orders.id, id)).run();
    const before = state();
    await expect(publishWorkspaceDraft(port, 'raw', id, 1, now, generation)).rejects.toThrow(FormDraftConflict);
    expect(state()).toEqual(before);
    const shown = await inspectWorkspaceForm(port, 'raw', id, generation);
    const adopted = await replaceWorkspaceDraft(port, 'raw', document, shown, now, generation);
    expect(t.db.select().from(orders).get()).toMatchObject({ dose: '2 g', notes: null });
    await publishWorkspaceDraft(port, 'raw', id, adopted.revision, now, generation);
    expect(t.db.select().from(orders).get()).toMatchObject({ dose: '1 g', notes: 'Unpublished words' });
  });
  it('rolls back record, receipt and audit together if the audit cannot commit', async () => {
    const { port, document } = await seed({ patientId, encounterId: null });
    document.fields.name = 'Synthetic atomic order';
    await saveWorkspaceDraft(port, 'raw', document, 0, generation);
    const before = state(),
      prepare = t.sqlite.prepare.bind(t.sqlite);
    const broken = jest.spyOn(t.sqlite, 'prepare').mockImplementation((query, params) => {
      if (query.startsWith('insert into "audit_log"')) throw new Error('Synthetic audit failure');
      return prepare(query, params);
    });
    try {
      await expect(publishWorkspaceDraft(port, 'raw', null, 1, now, generation)).rejects.toThrow();
    } finally {
      broken.mockRestore();
    }
    expect(state()).toEqual(before);
  });
  it('retains raw rows when old-dataset save, publish, compare, adoption or discard callbacks fire', async () => {
    const { port, document } = await seed({ patientId, encounterId: null });
    await saveWorkspaceDraft(port, 'raw', document, 0, generation);
    const shown = await inspectWorkspaceForm(port, 'raw', null, generation);
    const replacement = reserveDatasetReplacement();
    try {
      replacement.committed();
    } finally {
      replacement.release();
    }
    const before = state();
    await expect(saveWorkspaceDraft(port, 'raw', document, 1, generation)).rejects.toThrow(DatasetChangedError);
    await expect(publishWorkspaceDraft(port, 'raw', null, 1, now, generation)).rejects.toThrow(DatasetChangedError);
    await expect(inspectWorkspaceForm(port, 'raw', null, generation)).rejects.toThrow(DatasetChangedError);
    await expect(replaceWorkspaceDraft(port, 'raw', document, shown, now, generation)).rejects.toThrow(
      DatasetChangedError,
    );
    await expect(discardWorkspaceDraft('order', 'raw', null, 1, now, generation, port.parentId)).rejects.toThrow(
      DatasetChangedError,
    );
    expect(state()).toEqual(before);
  });
  it('selected and default recovery keep patient/episode ownership and watch all participating tables', async () => {
    const old = await openEncounter({ patientId, kind: 'admission', admittedAt: now });
    const original = await seed({ patientId, encounterId: old });
    original.document.fields.name = 'Synthetic old raw';
    await saveWorkspaceDraft(original.port, 'old', original.document, 0, generation);
    await openEncounter({ patientId, kind: 'admission', admittedAt: now });
    expect((await orderFormIntentQuery(patientId, null, null))[0]!.draft).toBeNull();
    expect((await orderFormIntentQuery(patientId, null, 'old'))[0]!.draft?.id).toBe('old');
    expect((await orderDraftsQuery(patientId)).map((row) => row.id)).toEqual(['old']);
    const other = await createPatient({ firstName: 'Synthetic', lastName: 'Different route' });
    expect((await orderFormIntentQuery(other, null, 'old'))[0]!.draft).toBeNull();
    expect(await orderDraftsQuery(other)).toEqual([]);
    expect(tablesOf(orderFormIntentQuery(patientId, null, null))).toEqual(
      expect.arrayContaining(['orders', 'patients', 'encounters', 'workspace_form_drafts']),
    );
  });
  it('does not interpret malformed parent keys or future codecs as a new clinical form', async () => {
    for (const key of [null, '', 'not JSON', '["patient"]', '["patient",0]', ' ["patient",null]'])
      expect(() => orderFormContext(key)).toThrow(UnsupportedFormDraft);
    const { port, document } = await seed({ patientId, encounterId: null });
    expect(orderFormParent(orderFormContext(document.parentId))).toBe(document.parentId);
    await saveWorkspaceDraft(port, 'raw', document, 0, generation);
    t.db
      .update(workspaceFormDrafts)
      .set({ body: JSON.stringify({ ...document, version: 2 }) })
      .where(eq(workspaceFormDrafts.id, 'raw'))
      .run();
    const before = state();
    await expect(publishWorkspaceDraft(port, 'raw', null, 1, now, generation)).rejects.toThrow(UnsupportedFormDraft);
    expect(state()).toEqual(before);
    expect(initialOrderFields(null, now).dateValue).toBe(now.getTime());
  });
});
