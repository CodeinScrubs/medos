import { and, asc, desc, eq, isNull } from 'drizzle-orm';

import { audit } from '@/db/audit';
import { db } from '@/db/client';
import { encounters, patients, vitalFormDrafts, vitals, type VitalFormDraft } from '@/db/schema';
import { datasetGeneration, withDatasetWrite } from '@/lib/dataset-write';
import { softDelete, stamps, touch } from '@/lib/ids';

import {
  decodeVitalForm,
  encodeVitalForm,
  rebaseVitalForm,
  vitalBase,
  vitalFormPatch,
  vitalFormValues,
  VitalFormConflict,
  type VitalFormDocument,
} from './form-draft';
import { recordVitalInTransaction, updateVitalInTransaction } from './queries';

const open = (patientId: string, vitalId: string | null) =>
  and(
    eq(vitalFormDrafts.patientId, patientId),
    eq(vitalFormDrafts.scope, vitalId ?? 'new'),
    isNull(vitalFormDrafts.deletedAt),
  );
/** One snapshot supplies the raw draft, clinical basis and original admission. */
export function vitalFormQuery(patientId: string, vitalId: string | null, reader: Pick<typeof db, 'select'> = db) {
  const active = reader
    .select({ id: encounters.id })
    .from(encounters)
    .where(and(eq(encounters.patientId, patientId), eq(encounters.isActive, true), isNull(encounters.deletedAt)))
    .orderBy(desc(encounters.admittedAt), asc(encounters.id))
    .limit(1);
  return reader
    .select({ patient: patients, vital: vitals, draft: vitalFormDrafts, active: encounters })
    .from(patients)
    .leftJoin(vitals, and(eq(vitals.id, vitalId ?? ''), eq(vitals.patientId, patients.id)))
    .leftJoin(vitalFormDrafts, open(patientId, vitalId))
    .leftJoin(encounters, eq(encounters.id, active))
    .where(and(eq(patients.id, patientId), vitalId ? eq(vitals.id, vitalId) : undefined))
    .limit(1);
}
export function patientVitalDraftsQuery(patientId: string) {
  return db
    .select({ id: vitalFormDrafts.id, vitalId: vitalFormDrafts.vitalId, updatedAt: vitalFormDrafts.updatedAt })
    .from(vitalFormDrafts)
    .where(and(eq(vitalFormDrafts.patientId, patientId), isNull(vitalFormDrafts.deletedAt)))
    .orderBy(desc(vitalFormDrafts.updatedAt), asc(vitalFormDrafts.id));
}
export type VitalFormRow = Awaited<ReturnType<typeof vitalFormQuery>>[number];
export type VitalFormComparison = { row: VitalFormRow; original: VitalFormDraft | null };
function context(row: VitalFormDraft, patientId: string, vitalId: string | null) {
  if (row.patientId !== patientId || row.vitalId !== vitalId || row.scope !== (vitalId ?? 'new'))
    throw new VitalFormConflict();
}
function documentContext(document: VitalFormDocument, patientId: string, vitalId: string | null) {
  if (
    vitalId
      ? document.base?.id !== vitalId ||
        document.base.patientId !== patientId ||
        document.base.encounterId !== document.encounterId ||
        document.base.measuredAt !== document.initialDate
      : document.base !== null
  )
    throw new VitalFormConflict();
}
function sameBasis(left: VitalFormDocument, right: VitalFormDocument) {
  return (
    JSON.stringify(left.base) === JSON.stringify(right.base) &&
    JSON.stringify(left.initial) === JSON.stringify(right.initial) &&
    left.initialDate === right.initialDate &&
    left.encounterId === right.encounterId
  );
}
export async function saveVitalFormDraft(
  id: string,
  patientId: string,
  vitalId: string | null,
  document: VitalFormDocument,
  revision: number,
  generation = datasetGeneration(),
) {
  return withDatasetWrite(generation, async () =>
    db.transaction((tx) => {
      const body = encodeVitalForm(document);
      documentContext(document, patientId, vitalId);
      if (!vitalFormQuery(patientId, vitalId, tx).get()) throw new VitalFormConflict();
      const current = tx.select().from(vitalFormDrafts).where(eq(vitalFormDrafts.id, id)).get();
      if (!current) {
        if (revision !== 0 || tx.select().from(vitalFormDrafts).where(open(patientId, vitalId)).get())
          throw new VitalFormConflict();
        tx.insert(vitalFormDrafts)
          .values({
            id,
            patientId,
            vitalId,
            scope: vitalId ?? 'new',
            encounterId: document.encounterId,
            body,
            revision: 1,
            ...stamps(),
          })
          .run();
        return 1;
      }
      context(current, patientId, vitalId);
      if (
        current.deletedAt ||
        current.committedVitalId ||
        current.revision !== revision ||
        current.encounterId !== document.encounterId ||
        !sameBasis(decodeVitalForm(current.body), document)
      )
        throw new VitalFormConflict();
      if (current.body === body) return revision;
      tx.update(vitalFormDrafts)
        .set({ body, revision: revision + 1, ...touch() })
        .where(eq(vitalFormDrafts.id, id))
        .run();
      return revision + 1;
    }),
  );
}
export async function commitVitalFormDraft(
  id: string,
  patientId: string,
  vitalId: string | null,
  revision: number,
  now: Date,
  generation = datasetGeneration(),
): Promise<string> {
  return withDatasetWrite(generation, async () => {
    const result = db.transaction((tx) => {
      const draft = tx.select().from(vitalFormDrafts).where(eq(vitalFormDrafts.id, id)).get();
      if (!draft) throw new VitalFormConflict();
      context(draft, patientId, vitalId);
      const current = vitalFormQuery(patientId, vitalId, tx).get();
      if (!current || current.patient.deletedAt || current.vital?.deletedAt) throw new VitalFormConflict();
      if (draft.committedVitalId && draft.revision === revision + 1) {
        const prior = tx.select().from(vitals).where(eq(vitals.id, draft.committedVitalId)).get();
        if (!prior || prior.deletedAt || prior.patientId !== patientId || prior.encounterId !== draft.encounterId)
          throw new VitalFormConflict();
        return { id: prior.id, changed: false };
      }
      if (draft.deletedAt || draft.committedVitalId || draft.revision !== revision) throw new VitalFormConflict();
      const document = decodeVitalForm(draft.body);
      documentContext(document, patientId, vitalId);
      if (document.encounterId !== draft.encounterId) throw new VitalFormConflict();
      let destination: string,
        changed = false;
      if (current.vital) {
        changed = updateVitalInTransaction(tx, current.vital.id, vitalFormPatch(document, current.vital, now), now);
        destination = current.vital.id;
      } else
        destination = recordVitalInTransaction(
          tx,
          { patientId, encounterId: draft.encounterId, ...vitalFormValues(document, now) },
          now,
        );
      tx.update(vitalFormDrafts)
        .set({ committedVitalId: destination, revision: revision + 1, ...softDelete(now) })
        .where(eq(vitalFormDrafts.id, id))
        .run();
      return { id: destination, changed };
    });
    if (result.changed) await audit('vital.updated', { entityType: 'vital', entityId: result.id });
    return result.id;
  });
}
export async function inspectVitalForm(
  id: string,
  patientId: string,
  vitalId: string | null,
  generation = datasetGeneration(),
): Promise<VitalFormComparison> {
  return withDatasetWrite(generation, async () =>
    db.transaction((tx) => {
      const row = vitalFormQuery(patientId, vitalId, tx).get();
      if (!row) throw new VitalFormConflict();
      const original = tx.select().from(vitalFormDrafts).where(eq(vitalFormDrafts.id, id)).get() ?? null;
      if (original) context(original, patientId, vitalId);
      return { row, original };
    }),
  );
}
const clinicalBasis = (row: VitalFormRow) => (row.vital ? vitalBase(row.vital) : null);
/** A comparison is permission to replace that exact version, not a future writer's version. */
export function sameVitalComparison(left: VitalFormComparison, right: VitalFormComparison): boolean {
  return (
    JSON.stringify(left.row.draft) === JSON.stringify(right.row.draft) &&
    JSON.stringify(left.original) === JSON.stringify(right.original) &&
    JSON.stringify(clinicalBasis(left.row)) === JSON.stringify(clinicalBasis(right.row))
  );
}
export async function replaceVitalFormDraft(
  id: string,
  patientId: string,
  vitalId: string | null,
  document: VitalFormDocument,
  shown: VitalFormComparison,
  now: Date,
  generation = datasetGeneration(),
) {
  return withDatasetWrite(generation, async () =>
    db.transaction((tx) => {
      const live = vitalFormQuery(patientId, vitalId, tx).get();
      const original = tx.select().from(vitalFormDrafts).where(eq(vitalFormDrafts.id, id)).get() ?? null;
      if (!live || !sameVitalComparison({ row: live, original }, shown)) throw new VitalFormConflict();
      if (original) {
        context(original, patientId, vitalId);
        if (original.deletedAt || original.committedVitalId) throw new VitalFormConflict();
      }
      if (live.draft) {
        context(live.draft, patientId, vitalId);
        decodeVitalForm(live.draft.body);
      }
      documentContext(document, patientId, vitalId);
      const next = live.vital ? rebaseVitalForm(document, live.vital, now) : document;
      const nextId = live.draft?.id ?? id;
      const revision = (live.draft?.revision ?? 0) + 1;
      if (live.draft) {
        if (live.draft.encounterId !== document.encounterId) throw new VitalFormConflict();
        tx.update(vitalFormDrafts)
          .set({ body: encodeVitalForm(next), revision, ...touch(now) })
          .where(eq(vitalFormDrafts.id, nextId))
          .run();
      } else {
        if (original) throw new VitalFormConflict();
        tx.insert(vitalFormDrafts)
          .values({
            id: nextId,
            patientId,
            vitalId,
            scope: vitalId ?? 'new',
            encounterId: document.encounterId,
            body: encodeVitalForm(next),
            revision,
            ...stamps(now),
          })
          .run();
      }
      return { id: nextId, revision, document: next };
    }),
  );
}
export async function discardVitalFormDraft(
  id: string,
  patientId: string,
  vitalId: string | null,
  revision: number,
  generation = datasetGeneration(),
) {
  return withDatasetWrite(generation, async () => {
    db.transaction((tx) => {
      const row = tx.select().from(vitalFormDrafts).where(eq(vitalFormDrafts.id, id)).get();
      if (!row) {
        if (revision !== 0 || tx.select().from(vitalFormDrafts).where(open(patientId, vitalId)).get())
          throw new VitalFormConflict();
        return;
      }
      context(row, patientId, vitalId);
      if (row.deletedAt && !row.committedVitalId && row.revision === revision + 1) return;
      if (row.deletedAt || row.committedVitalId || row.revision !== revision) throw new VitalFormConflict();
      tx.update(vitalFormDrafts)
        .set({ revision: revision + 1, ...softDelete() })
        .where(eq(vitalFormDrafts.id, id))
        .run();
    });
    await audit('vital.draftDiscarded', { entityType: 'vital_form_draft', entityId: id });
  });
}
