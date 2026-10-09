import { and, asc, eq, isNull } from 'drizzle-orm';

import { audit } from '@/db/audit';
import { db, type DbTransaction } from '@/db/client';
import { attachments, encounters, labFormDrafts, labPanels, labValues, patients, type LabFormDraft } from '@/db/schema';
import { activeEncounterIdQuery } from '@/features/encounters/status';
import { datasetGeneration, withDatasetWrite } from '@/lib/dataset-write';
import { softDelete, stamps, touch } from '@/lib/ids';

import {
  decodeLabForm,
  encodeLabForm,
  labFormBase,
  LabFormConflict,
  labFormValues,
  type LabFormDocument,
} from './form-draft';
import { createLabPanelInTransaction, updateLabPanelInTransaction } from './queries';

const openTarget = (patientId: string, panelId: string | null) =>
  and(
    eq(labFormDrafts.patientId, patientId),
    eq(labFormDrafts.formKey, panelId ?? 'new'),
    isNull(labFormDrafts.deletedAt),
  );
/** Identity, panel, values, captured admission and draft come from one SQL snapshot. */
export function labFormQuery(patientId: string, panelId: string | null, reader: Pick<typeof db, 'select'> = db) {
  const active = activeEncounterIdQuery(patientId, reader);
  return reader
    .select({ patient: patients, panel: labPanels, value: labValues, draft: labFormDrafts, active: encounters })
    .from(patients)
    .leftJoin(
      labPanels,
      and(eq(labPanels.id, panelId ?? ''), eq(labPanels.patientId, patients.id), isNull(labPanels.deletedAt)),
    )
    .leftJoin(labValues, and(eq(labValues.panelId, labPanels.id), isNull(labValues.deletedAt)))
    .leftJoin(labFormDrafts, openTarget(patientId, panelId))
    .leftJoin(encounters, eq(encounters.id, active))
    .where(and(eq(patients.id, patientId), isNull(patients.deletedAt), panelId ? eq(labPanels.id, panelId) : undefined))
    .orderBy(asc(labValues.sortOrder), asc(labValues.id));
}
export type LabFormRows = Awaited<ReturnType<typeof labFormQuery>>;
export type LabFormComparison = { rows: LabFormRows; original: LabFormDraft | null };
export function labFormBasis(rows: LabFormRows) {
  if (!rows[0] || rows.some((r) => r.value && r.value.patientId !== rows[0]!.patient.id)) throw new LabFormConflict();
  return rows[0].panel
    ? labFormBase(
        rows[0].panel,
        rows.flatMap((r) => (r.value ? [r.value] : [])),
      )
    : null;
}
function context(draft: LabFormDraft, patientId: string, panelId: string | null) {
  if (draft.patientId !== patientId || draft.panelId !== panelId || draft.formKey !== (panelId ?? 'new'))
    throw new LabFormConflict();
}
function documentContext(document: LabFormDocument, patientId: string, panelId: string | null) {
  if (
    panelId
      ? document.base?.id !== panelId ||
        document.base.patientId !== patientId ||
        document.base.encounterId !== document.encounterId
      : document.base !== null
  )
    throw new LabFormConflict();
}
function exists(tx: DbTransaction, patientId: string, panelId: string | null) {
  // Preserve input on a deleted parent without reviving it. Publication requires it live.
  if (
    !tx.select({ id: patients.id }).from(patients).where(eq(patients.id, patientId)).get() ||
    (panelId &&
      !tx
        .select({ id: labPanels.id })
        .from(labPanels)
        .where(and(eq(labPanels.id, panelId), eq(labPanels.patientId, patientId)))
        .get())
  )
    throw new LabFormConflict();
}
export async function saveLabFormDraft(
  id: string,
  patientId: string,
  panelId: string | null,
  document: LabFormDocument,
  expectedRevision: number,
  generation = datasetGeneration(),
): Promise<number> {
  return withDatasetWrite(generation, async () =>
    db.transaction((tx) => {
      const body = encodeLabForm(document);
      documentContext(document, patientId, panelId);
      exists(tx, patientId, panelId);
      const current = tx.select().from(labFormDrafts).where(eq(labFormDrafts.id, id)).get();
      if (!current) {
        if (expectedRevision !== 0 || tx.select().from(labFormDrafts).where(openTarget(patientId, panelId)).get())
          throw new LabFormConflict();
        tx.insert(labFormDrafts)
          .values({
            id,
            patientId,
            panelId,
            formKey: panelId ?? 'new',
            encounterId: document.encounterId,
            body,
            revision: 1,
            ...stamps(),
          })
          .run();
        return 1;
      }
      context(current, patientId, panelId);
      if (
        current.deletedAt ||
        current.committedPanelId ||
        current.revision !== expectedRevision ||
        current.encounterId !== document.encounterId
      )
        throw new LabFormConflict();
      const previous = decodeLabForm(current.body);
      if (
        JSON.stringify(previous.initial) !== JSON.stringify(document.initial) ||
        JSON.stringify(previous.base) !== JSON.stringify(document.base)
      )
        throw new LabFormConflict();
      if (current.body === body) return current.revision;
      const revision = current.revision + 1;
      tx.update(labFormDrafts)
        .set({ body, revision, ...touch() })
        .where(eq(labFormDrafts.id, id))
        .run();
      return revision;
    }),
  );
}
/** Clinical publication and retirement are one synchronous transaction, including edit history. */
export async function commitLabFormDraft(
  id: string,
  patientId: string,
  panelId: string | null,
  expectedRevision: number,
  now: Date,
  generation = datasetGeneration(),
): Promise<string> {
  return withDatasetWrite(generation, async () =>
    db.transaction((tx) => {
      const draft = tx.select().from(labFormDrafts).where(eq(labFormDrafts.id, id)).get();
      if (!draft) throw new LabFormConflict();
      context(draft, patientId, panelId);
      const rows = labFormQuery(patientId, panelId, tx).all();
      if (!rows[0]) throw new LabFormConflict();
      if (draft.committedPanelId && draft.revision === expectedRevision + 1) {
        if (
          !tx
            .select({ id: labPanels.id })
            .from(labPanels)
            .where(
              and(
                eq(labPanels.id, draft.committedPanelId),
                eq(labPanels.patientId, patientId),
                isNull(labPanels.deletedAt),
              ),
            )
            .get()
        )
          throw new LabFormConflict();
        return draft.committedPanelId;
      }
      if (draft.deletedAt || draft.revision !== expectedRevision) throw new LabFormConflict();
      const document = decodeLabForm(draft.body);
      documentContext(document, patientId, panelId);
      if (
        document.encounterId !== draft.encounterId ||
        JSON.stringify(labFormBasis(rows)) !== JSON.stringify(document.base)
      )
        throw new LabFormConflict();
      // A historical draw keeps the captured admission even if it has since closed.
      if (
        draft.encounterId &&
        !tx
          .select({ id: encounters.id })
          .from(encounters)
          .where(
            and(
              eq(encounters.id, draft.encounterId),
              eq(encounters.patientId, patientId),
              isNull(encounters.deletedAt),
            ),
          )
          .get()
      )
        throw new LabFormConflict();
      const hasPhoto = !!(
        panelId &&
        tx
          .select({ id: attachments.id })
          .from(attachments)
          .where(
            and(
              eq(attachments.entityType, 'lab_panel'),
              eq(attachments.entityId, panelId),
              isNull(attachments.deletedAt),
            ),
          )
          .get()
      );
      const payload = labFormValues(document, now, hasPhoto);
      if (panelId) updateLabPanelInTransaction(tx, panelId, payload, now);
      const result = panelId ?? createLabPanelInTransaction(tx, { patientId, ...payload }, now, draft.encounterId);
      tx.update(labFormDrafts)
        .set({ committedPanelId: result, revision: draft.revision + 1, ...softDelete(now) })
        .where(eq(labFormDrafts.id, id))
        .run();
      return result;
    }),
  );
}
export async function inspectLabForm(
  id: string,
  patientId: string,
  panelId: string | null,
  generation = datasetGeneration(),
): Promise<LabFormComparison> {
  return withDatasetWrite(generation, async () =>
    db.transaction((tx) => {
      const rows = labFormQuery(patientId, panelId, tx).all();
      labFormBasis(rows);
      const original = tx.select().from(labFormDrafts).where(eq(labFormDrafts.id, id)).get() ?? null;
      if (original) context(original, patientId, panelId);
      return { rows, original };
    }),
  );
}
/** Explicit whole-panel overwrite after comparison; no automatic merge. */
export async function replaceLabFormDraft(
  id: string,
  patientId: string,
  panelId: string | null,
  document: LabFormDocument,
  shown: LabFormComparison,
  generation = datasetGeneration(),
) {
  return withDatasetWrite(generation, async () =>
    db.transaction((tx) => {
      const original = tx.select().from(labFormDrafts).where(eq(labFormDrafts.id, id)).get();
      if (original) {
        context(original, patientId, panelId);
        if (original.deletedAt || original.committedPanelId) throw new LabFormConflict();
      }
      const rows = labFormQuery(patientId, panelId, tx).all();
      const base = labFormBasis(rows);
      const live = rows[0]!.draft;
      if (
        shown.rows[0]?.patient.id !== patientId ||
        live?.id !== shown.rows[0]?.draft?.id ||
        live?.revision !== shown.rows[0]?.draft?.revision ||
        JSON.stringify(base) !== JSON.stringify(labFormBasis(shown.rows))
      )
        throw new LabFormConflict();
      const encounterId = panelId ? base!.encounterId : document.encounterId;
      const next: LabFormDocument = {
        ...document,
        base,
        encounterId,
        initial: live ? decodeLabForm(live.body).initial : document.initial,
      };
      documentContext(next, patientId, panelId);
      const body = encodeLabForm(next);
      if (!live) {
        if (original) throw new LabFormConflict();
        tx.insert(labFormDrafts)
          .values({ id, patientId, panelId, formKey: panelId ?? 'new', encounterId, body, revision: 1, ...stamps() })
          .run();
        return { id, revision: 1, document: next };
      }
      const revision = live.revision + 1;
      tx.update(labFormDrafts)
        .set({ body, encounterId, revision, ...touch() })
        .where(eq(labFormDrafts.id, live.id))
        .run();
      return { id: live.id, revision, document: next };
    }),
  );
}
export async function discardLabFormDraft(
  id: string,
  patientId: string,
  panelId: string | null,
  expectedRevision: number,
  generation = datasetGeneration(),
): Promise<void> {
  await withDatasetWrite(generation, async () => {
    db.transaction((tx) => {
      const row = tx.select().from(labFormDrafts).where(eq(labFormDrafts.id, id)).get();
      if (!row && expectedRevision === 0) return;
      if (!row) throw new LabFormConflict();
      context(row, patientId, panelId);
      if (row.deletedAt || row.committedPanelId || row.revision !== expectedRevision) throw new LabFormConflict();
      tx.update(labFormDrafts)
        .set({ revision: row.revision + 1, ...softDelete() })
        .where(eq(labFormDrafts.id, id))
        .run();
    });
    await audit('lab.draftDiscarded', { entityType: 'labFormDraft', entityId: id });
  });
}
