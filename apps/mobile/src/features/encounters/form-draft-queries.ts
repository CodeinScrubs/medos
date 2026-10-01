import { and, asc, eq, isNull } from 'drizzle-orm';
import { alias } from 'drizzle-orm/sqlite-core';

import { audit } from '@/db/audit';
import { db, type DbTransaction } from '@/db/client';
import { encounterFormDrafts, encounters, patients, type EncounterFormDraft } from '@/db/schema';
import { softDelete, stamps, touch } from '@/lib/ids';

import {
  decodeEncounterForm,
  encodeEncounterForm,
  encounterFormDate,
  EncounterFormConflict,
  encounterFormScope,
  encounterSnapshot,
  initialEncounterDocument,
  type EncounterFormBasis,
  type EncounterFormDocument,
  type EncounterFormMode,
} from './form-draft';
import { dischargeEncounterInTransaction, openEncounterInTransaction, updateEncounterInTransaction } from './queries';

const target = alias(encounters, 'form_target');
const scope = (mode: EncounterFormMode, patientId: string, encounterId: string | null) =>
  and(
    eq(encounterFormDrafts.scopeKey, encounterFormScope(mode, patientId, encounterId)),
    isNull(encounterFormDrafts.deletedAt),
  );

function assertDraftContext(
  row: EncounterFormDraft,
  mode: EncounterFormMode,
  patientId: string,
  encounterId: string | null,
) {
  if (
    row.patientId !== patientId ||
    row.encounterId !== encounterId ||
    row.mode !== mode ||
    row.scopeKey !== encounterFormScope(mode, patientId, encounterId)
  )
    throw new EncounterFormConflict();
}

/** All displayed identity, target, active context and raw draft come from one read. */
export function encounterFormQuery(
  mode: EncounterFormMode,
  patientId: string,
  encounterId: string | null,
  reader: Pick<typeof db, 'select'> = db,
) {
  return reader
    .select({ patient: patients, target, active: encounters, draft: encounterFormDrafts })
    .from(patients)
    .leftJoin(
      target,
      and(eq(target.id, encounterId ?? ''), eq(target.patientId, patients.id), isNull(target.deletedAt)),
    )
    .leftJoin(
      encounters,
      and(eq(encounters.patientId, patients.id), isNull(encounters.deletedAt), eq(encounters.isActive, true)),
    )
    .leftJoin(encounterFormDrafts, scope(mode, patientId, encounterId))
    .where(and(eq(patients.id, patientId), isNull(patients.deletedAt)))
    .orderBy(asc(encounters.id));
}
export type EncounterFormRows = Awaited<ReturnType<typeof encounterFormQuery>>;
export function encounterFormBasis(rows: EncounterFormRows, mode: EncounterFormMode): EncounterFormBasis {
  if (!rows[0] || (mode !== 'new' && !rows[0].target))
    throw new EncounterFormConflict('نوبت یا پرونده در دسترس نیست؛ نوشته نگه داشته شد.');
  return {
    target: rows[0].target ? encounterSnapshot(rows[0].target) : null,
    active: rows.flatMap((row) => (row.active ? [encounterSnapshot(row.active)] : [])),
  };
}
function assertDocument(
  mode: EncounterFormMode,
  patientId: string,
  encounterId: string | null,
  document: EncounterFormDocument,
) {
  encounterFormScope(mode, patientId, encounterId);
  if (
    document.mode !== mode ||
    (mode === 'new'
      ? document.basis.target !== null
      : document.basis.target?.id !== encounterId || document.basis.target.patientId !== patientId) ||
    document.basis.active.some((row) => row.patientId !== patientId)
  )
    throw new EncounterFormConflict();
}
function requireContext(tx: DbTransaction, patientId: string, encounterId: string | null) {
  // Soft-deleted rows may retain the loaded editor's last text; only publication
  // requires them live. This never changes their deletion/lifecycle state.
  if (!tx.select({ id: patients.id }).from(patients).where(eq(patients.id, patientId)).get())
    throw new EncounterFormConflict();
  if (
    encounterId &&
    !tx
      .select({ id: encounters.id })
      .from(encounters)
      .where(and(eq(encounters.id, encounterId), eq(encounters.patientId, patientId)))
      .get()
  )
    throw new EncounterFormConflict();
}
export async function saveEncounterFormDraft(
  id: string,
  mode: EncounterFormMode,
  patientId: string,
  encounterId: string | null,
  document: EncounterFormDocument,
  expectedRevision: number,
): Promise<number> {
  const body = encodeEncounterForm(document);
  assertDocument(mode, patientId, encounterId, document);
  return db.transaction((tx) => {
    const current = tx.select().from(encounterFormDrafts).where(eq(encounterFormDrafts.id, id)).get();
    if (!current) {
      if (
        expectedRevision !== 0 ||
        tx
          .select()
          .from(encounterFormDrafts)
          .where(scope(mode, patientId, encounterId))
          .get()
      )
        throw new EncounterFormConflict();
      if (JSON.stringify(document.fields) === JSON.stringify(document.initial)) return 0;
      requireContext(tx, patientId, encounterId);
      tx.insert(encounterFormDrafts)
        .values({
          id,
          ...stamps(),
          scopeKey: encounterFormScope(mode, patientId, encounterId),
          mode,
          patientId,
          encounterId,
          body,
          revision: 1,
        })
        .run();
      return 1;
    }
    assertDraftContext(current, mode, patientId, encounterId);
    if (current.deletedAt || current.committedEncounterId || current.revision !== expectedRevision)
      throw new EncounterFormConflict();
    const saved = decodeEncounterForm(current.body);
    if (
      JSON.stringify(saved.basis) !== JSON.stringify(document.basis) ||
      JSON.stringify(saved.initial) !== JSON.stringify(document.initial)
    )
      throw new EncounterFormConflict();
    if (body === current.body) return current.revision;
    const revision = current.revision + 1;
    tx.update(encounterFormDrafts)
      .set({ body, revision, ...touch() })
      .where(eq(encounterFormDrafts.id, id))
      .run();
    return revision;
  });
}
/** Explicit publication alone mutates clinical state; its retry token retires atomically. */
export async function commitEncounterFormDraft(
  id: string,
  mode: EncounterFormMode,
  patientId: string,
  encounterId: string | null,
  expectedRevision: number,
  document: EncounterFormDocument,
  now: Date,
): Promise<string> {
  assertDocument(mode, patientId, encounterId, document);
  const result = db.transaction((tx) => {
    const draft = tx.select().from(encounterFormDrafts).where(eq(encounterFormDrafts.id, id)).get();
    if (draft) assertDraftContext(draft, mode, patientId, encounterId);
    if (draft?.committedEncounterId && draft.revision === expectedRevision + 1) {
      if (draft.body !== encodeEncounterForm(document)) throw new EncounterFormConflict();
      const saved = tx
        .select({ id: encounters.id })
        .from(encounters)
        .innerJoin(patients, eq(patients.id, encounters.patientId))
        .where(
          and(
            eq(encounters.id, draft.committedEncounterId),
            eq(encounters.patientId, patientId),
            isNull(encounters.deletedAt),
            isNull(patients.deletedAt),
          ),
        )
        .get();
      if (!saved) throw new EncounterFormConflict('نوبت ثبت‌شده در دسترس نیست؛ دوباره ساخته نشد.');
      return { id: saved.id, replay: true };
    }
    if (
      draft
        ? draft.deletedAt || draft.revision !== expectedRevision
        : expectedRevision !== 0 ||
          tx
            .select()
            .from(encounterFormDrafts)
            .where(scope(mode, patientId, encounterId))
            .get()
    )
      throw new EncounterFormConflict();
    // An untouched valid form is still publishable on the explicit button;
    // it needs no blank autosave row. The token is inserted in this transaction.
    const stored = draft ? decodeEncounterForm(draft.body) : document;
    assertDocument(mode, patientId, encounterId, stored);
    if (encodeEncounterForm(stored) !== encodeEncounterForm(document)) throw new EncounterFormConflict();
    const current = encounterFormBasis(encounterFormQuery(mode, patientId, encounterId, tx).all(), mode);
    const expected = mode === 'new' ? stored.basis : { ...stored.basis, active: [] };
    const actual = mode === 'new' ? current : { ...current, active: [] };
    if (JSON.stringify(expected) !== JSON.stringify(actual)) throw new EncounterFormConflict();
    const at = encounterFormDate(stored, now);
    if (!draft)
      tx.insert(encounterFormDrafts)
        .values({
          id,
          ...stamps(now),
          scopeKey: encounterFormScope(mode, patientId, encounterId),
          mode,
          patientId,
          encounterId,
          body: encodeEncounterForm(stored),
          revision: 0,
        })
        .run();
    let publishedId: string;
    if (stored.mode === 'discharge') {
      dischargeEncounterInTransaction(
        tx,
        encounterId!,
        {
          dischargedAt: at,
          dischargeType: stored.fields.dischargeType,
          nextStatus: stored.fields.nextStatus,
          outcomeNotes: stored.fields.outcomeNotes.trim() || null,
        },
        now,
      );
      publishedId = encounterId!;
    } else {
      const fields = stored.fields;
      const input = {
        kind: fields.kind,
        placeId: fields.placeId,
        ward: fields.ward.trim() || null,
        bed: fields.bed.trim() || null,
        service: fields.service.trim() || null,
        attendingId: fields.attendingId,
        chiefComplaint: fields.chiefComplaint.trim() || null,
        admittedAt: at,
        admittedAtHasTime: fields.hourKnown,
      };
      if (stored.mode === 'new') publishedId = openEncounterInTransaction(tx, { patientId, ...input }, now);
      else {
        updateEncounterInTransaction(tx, encounterId!, input, now);
        publishedId = encounterId!;
      }
    }
    tx.update(encounterFormDrafts)
      .set({ committedEncounterId: publishedId, revision: expectedRevision + 1, ...softDelete(now) })
      .where(eq(encounterFormDrafts.id, id))
      .run();
    return { id: publishedId, replay: false };
  });
  if (mode === 'discharge' && !result.replay)
    await audit('encounter.discharged', { entityType: 'encounter', entityId: result.id });
  return result.id;
}
export async function inspectEncounterForm(
  mode: EncounterFormMode,
  patientId: string,
  encounterId: string | null,
  id: string,
  now: Date,
) {
  return db.transaction((tx) => {
    const rows = encounterFormQuery(mode, patientId, encounterId, tx).all();
    const base = encounterFormBasis(rows, mode);
    const original = tx.select().from(encounterFormDrafts).where(eq(encounterFormDrafts.id, id)).get() ?? null;
    if (original) assertDraftContext(original, mode, patientId, encounterId);
    if (rows[0]?.draft) assertDraftContext(rows[0].draft, mode, patientId, encounterId);
    return { rows, original, fresh: initialEncounterDocument(mode, base, now) };
  });
}
export type EncounterFormComparison = Awaited<ReturnType<typeof inspectEncounterForm>>;
export async function replaceEncounterFormDraft(
  id: string,
  mode: EncounterFormMode,
  patientId: string,
  encounterId: string | null,
  document: EncounterFormDocument,
  comparison: EncounterFormComparison,
): Promise<{ id: string; revision: number; document: EncounterFormDocument }> {
  assertDocument(mode, patientId, encounterId, document);
  return db.transaction((tx) => {
    const original = tx.select().from(encounterFormDrafts).where(eq(encounterFormDrafts.id, id)).get();
    if (original) assertDraftContext(original, mode, patientId, encounterId);
    if (original?.deletedAt || original?.committedEncounterId) throw new EncounterFormConflict();
    const rows = encounterFormQuery(mode, patientId, encounterId, tx).all();
    const current = encounterFormBasis(rows, mode);
    const live = rows[0]!.draft;
    if (live) {
      assertDraftContext(live, mode, patientId, encounterId);
      assertDocument(mode, patientId, encounterId, decodeEncounterForm(live.body));
    }
    const shown = comparison.rows[0]?.draft;
    if (
      comparison.fresh.mode !== mode ||
      comparison.rows[0]?.patient.id !== patientId ||
      live?.id !== shown?.id ||
      live?.revision !== shown?.revision ||
      JSON.stringify(current) !== JSON.stringify(comparison.fresh.basis)
    )
      throw new EncounterFormConflict();
    if (mode === 'discharge' && (!current.target?.isActive || current.active.length !== 1))
      throw new EncounterFormConflict('این نوبت برای ترخیص فعال نیست؛ نوشته نگه داشته شد.');
    const next = decodeEncounterForm(
      JSON.stringify({ ...document, basis: current, initial: comparison.fresh.initial }),
    );
    const revision = (live?.revision ?? 0) + 1;
    if (live)
      tx.update(encounterFormDrafts)
        .set({ body: encodeEncounterForm(next), revision, ...touch() })
        .where(eq(encounterFormDrafts.id, live.id))
        .run();
    else {
      if (original) throw new EncounterFormConflict();
      tx.insert(encounterFormDrafts)
        .values({
          id,
          ...stamps(),
          patientId,
          encounterId,
          mode,
          scopeKey: encounterFormScope(mode, patientId, encounterId),
          body: encodeEncounterForm(next),
          revision,
        })
        .run();
    }
    return { id: live?.id ?? id, revision, document: next };
  });
}
export async function discardEncounterFormDraft(
  id: string,
  mode: EncounterFormMode,
  patientId: string,
  encounterId: string | null,
  expectedRevision: number,
): Promise<void> {
  db.transaction((tx) => {
    const row = tx.select().from(encounterFormDrafts).where(eq(encounterFormDrafts.id, id)).get();
    if (!row && expectedRevision === 0) return;
    if (row) assertDraftContext(row, mode, patientId, encounterId);
    if (!row || row.deletedAt || row.committedEncounterId || row.revision !== expectedRevision)
      throw new EncounterFormConflict();
    tx.update(encounterFormDrafts)
      .set({ revision: row.revision + 1, ...softDelete() })
      .where(eq(encounterFormDrafts.id, id))
      .run();
  });
  await audit('encounter.draftDiscarded', { entityType: 'encounterFormDraft', entityId: id });
}

export function encounterFormSeed(
  rows: EncounterFormRows,
  mode: EncounterFormMode,
  encounterId: string | null,
  now: Date,
) {
  const basis = encounterFormBasis(rows, mode);
  const row = rows[0]!;
  const draft = row.draft;
  if (draft) assertDraftContext(draft, mode, row.patient.id, encounterId);
  if (draft?.deletedAt || draft?.committedEncounterId) throw new EncounterFormConflict();
  const document = draft ? decodeEncounterForm(draft.body) : initialEncounterDocument(mode, basis, now);
  assertDocument(mode, row.patient.id, encounterId, document);
  return {
    row,
    mode,
    encounterId,
    document,
  };
}
export type EncounterFormSeed = ReturnType<typeof encounterFormSeed>;
