import { and, asc, desc, eq, isNull } from 'drizzle-orm';

import { audit } from '@/db/audit';
import { db, type DbTransaction } from '@/db/client';
import { encounters, imagingFormDrafts, imagingStudies, patients, type ImagingFormDraft } from '@/db/schema';
import { datasetGeneration, withDatasetWrite } from '@/lib/dataset-write';
import { softDelete, stamps, touch } from '@/lib/ids';

import {
  decodeImagingForm,
  encodeImagingForm,
  imagingBase,
  imagingFormPatch,
  imagingFormValues,
  initialImagingForm,
  ImagingFormConflict,
  type ImagingFormDocument,
} from './form-draft';
import { createImagingInTransaction, updateImagingInTransaction } from './queries';

const open = (patientId: string, studyId: string | null) =>
  and(
    eq(imagingFormDrafts.patientId, patientId),
    eq(imagingFormDrafts.scope, studyId ?? 'new'),
    isNull(imagingFormDrafts.deletedAt),
  );
export function imagingFormQuery(patientId: string, studyId: string | null, reader: Pick<typeof db, 'select'> = db) {
  const active = reader
    .select({ id: encounters.id })
    .from(encounters)
    .where(and(eq(encounters.patientId, patientId), eq(encounters.isActive, true), isNull(encounters.deletedAt)))
    .orderBy(desc(encounters.admittedAt), asc(encounters.id))
    .limit(1);
  return reader
    .select({ patient: patients, study: imagingStudies, draft: imagingFormDrafts, active: encounters })
    .from(patients)
    .leftJoin(imagingStudies, and(eq(imagingStudies.id, studyId ?? ''), eq(imagingStudies.patientId, patients.id)))
    .leftJoin(imagingFormDrafts, open(patientId, studyId))
    .leftJoin(encounters, eq(encounters.id, active))
    .where(and(eq(patients.id, patientId), studyId ? eq(imagingStudies.id, studyId) : undefined))
    .limit(1);
}
export type ImagingFormRow = Awaited<ReturnType<typeof imagingFormQuery>>[number];
export type ImagingFormComparison = { row: ImagingFormRow; original: ImagingFormDraft | null };
function context(row: ImagingFormDraft, patientId: string, studyId: string | null) {
  if (row.patientId !== patientId || row.studyId !== studyId || row.scope !== (studyId ?? 'new'))
    throw new ImagingFormConflict();
}
function documentContext(document: ImagingFormDocument, patientId: string, studyId: string | null) {
  if (
    studyId
      ? document.base?.id !== studyId ||
        document.base.patientId !== patientId ||
        document.base.encounterId !== document.encounterId
      : document.base !== null
  )
    throw new ImagingFormConflict();
}
function exists(tx: DbTransaction, patientId: string, studyId: string | null) {
  if (!imagingFormQuery(patientId, studyId, tx).get()) throw new ImagingFormConflict();
}
export async function saveImagingFormDraft(
  id: string,
  patientId: string,
  studyId: string | null,
  document: ImagingFormDocument,
  revision: number,
  generation = datasetGeneration(),
) {
  return withDatasetWrite(generation, async () =>
    db.transaction((tx) => {
      const body = encodeImagingForm(document);
      documentContext(document, patientId, studyId);
      exists(tx, patientId, studyId);
      const current = tx.select().from(imagingFormDrafts).where(eq(imagingFormDrafts.id, id)).get();
      if (!current) {
        if (revision !== 0 || tx.select().from(imagingFormDrafts).where(open(patientId, studyId)).get())
          throw new ImagingFormConflict();
        tx.insert(imagingFormDrafts)
          .values({
            id,
            patientId,
            studyId,
            scope: studyId ?? 'new',
            encounterId: document.encounterId,
            body,
            revision: 1,
            ...stamps(),
          })
          .run();
        return 1;
      }
      context(current, patientId, studyId);
      if (
        current.deletedAt ||
        current.committedStudyId ||
        current.revision !== revision ||
        current.encounterId !== document.encounterId
      )
        throw new ImagingFormConflict();
      const prior = decodeImagingForm(current.body);
      if (
        JSON.stringify(prior.base) !== JSON.stringify(document.base) ||
        JSON.stringify(prior.initial) !== JSON.stringify(document.initial) ||
        prior.initialDate !== document.initialDate
      )
        throw new ImagingFormConflict();
      if (current.body === body) return revision;
      tx.update(imagingFormDrafts)
        .set({ body, revision: revision + 1, ...touch() })
        .where(eq(imagingFormDrafts.id, id))
        .run();
      return revision + 1;
    }),
  );
}
export async function commitImagingFormDraft(
  id: string,
  patientId: string,
  studyId: string | null,
  revision: number,
  now: Date,
  generation = datasetGeneration(),
) {
  return withDatasetWrite(generation, async () =>
    db.transaction((tx) => {
      const row = tx.select().from(imagingFormDrafts).where(eq(imagingFormDrafts.id, id)).get();
      if (!row) throw new ImagingFormConflict();
      context(row, patientId, studyId);
      const current = imagingFormQuery(patientId, studyId, tx).get();
      if (!current || current.patient.deletedAt || current.study?.deletedAt) throw new ImagingFormConflict();
      if (row.committedStudyId && row.revision === revision + 1) {
        const prior = tx.select().from(imagingStudies).where(eq(imagingStudies.id, row.committedStudyId)).get();
        if (!prior || prior.deletedAt || prior.patientId !== patientId || prior.encounterId !== row.encounterId)
          throw new ImagingFormConflict();
        return prior.id;
      }
      if (row.deletedAt || row.committedStudyId || row.revision !== revision) throw new ImagingFormConflict();
      const document = decodeImagingForm(row.body);
      documentContext(document, patientId, studyId);
      if (document.encounterId !== row.encounterId) throw new ImagingFormConflict();
      if (
        row.encounterId &&
        !tx
          .select({ id: encounters.id })
          .from(encounters)
          .where(
            and(eq(encounters.id, row.encounterId), eq(encounters.patientId, patientId), isNull(encounters.deletedAt)),
          )
          .get()
      )
        throw new ImagingFormConflict();
      let destination: string;
      if (current.study) {
        updateImagingInTransaction(tx, current.study.id, imagingFormPatch(document, current.study, now));
        destination = current.study.id;
      } else
        destination = createImagingInTransaction(
          tx,
          { patientId, ...imagingFormValues(document, now) },
          row.encounterId,
        );
      tx.update(imagingFormDrafts)
        .set({ committedStudyId: destination, revision: revision + 1, ...softDelete() })
        .where(eq(imagingFormDrafts.id, id))
        .run();
      return destination;
    }),
  );
}
export async function inspectImagingForm(
  id: string,
  patientId: string,
  studyId: string | null,
  generation = datasetGeneration(),
): Promise<ImagingFormComparison> {
  return withDatasetWrite(generation, async () =>
    db.transaction((tx) => {
      const row = imagingFormQuery(patientId, studyId, tx).get();
      if (!row) throw new ImagingFormConflict();
      const original = tx.select().from(imagingFormDrafts).where(eq(imagingFormDrafts.id, id)).get() ?? null;
      if (original) context(original, patientId, studyId);
      return { row, original };
    }),
  );
}
export async function replaceImagingFormDraft(
  id: string,
  patientId: string,
  studyId: string | null,
  document: ImagingFormDocument,
  shown: ImagingFormComparison,
  now: Date,
  generation = datasetGeneration(),
) {
  return withDatasetWrite(generation, async () =>
    db.transaction((tx) => {
      const live = imagingFormQuery(patientId, studyId, tx).get();
      if (
        !live ||
        live.draft?.id !== shown.row.draft?.id ||
        live.draft?.revision !== shown.row.draft?.revision ||
        JSON.stringify(live.study ? imagingBase(live.study) : null) !==
          JSON.stringify(shown.row.study ? imagingBase(shown.row.study) : null)
      )
        throw new ImagingFormConflict();
      const original = tx.select().from(imagingFormDrafts).where(eq(imagingFormDrafts.id, id)).get();
      if (original) {
        context(original, patientId, studyId);
        if (original.deletedAt || original.committedStudyId) throw new ImagingFormConflict();
      }
      if (live.draft) decodeImagingForm(live.draft.body);
      documentContext(document, patientId, studyId);
      // Rebase only locally edited fields, keeping the original admission binding.
      let next = document;
      if (live.study) {
        if (live.study.encounterId !== document.encounterId) throw new ImagingFormConflict();
        const fresh = initialImagingForm(live.study, document.encounterId, now);
        for (const key of Object.keys(document.fields) as (keyof typeof document.fields)[]) {
          const changed =
            key === 'date'
              ? document.fields.date.dateText !== document.initial.date.dateText ||
                document.fields.date.clockText !== document.initial.date.clockText
              : document.fields[key] !== document.initial[key];
          if (changed) Object.assign(fresh.fields, { [key]: document.fields[key] });
        }
        next = fresh;
      }
      const nextId = live.draft?.id ?? id;
      const revision = (live.draft?.revision ?? 0) + 1;
      if (live.draft) {
        if (live.draft.encounterId !== document.encounterId) throw new ImagingFormConflict();
        tx.update(imagingFormDrafts)
          .set({ body: encodeImagingForm(next), revision, ...touch() })
          .where(eq(imagingFormDrafts.id, nextId))
          .run();
      } else {
        if (original) throw new ImagingFormConflict();
        tx.insert(imagingFormDrafts)
          .values({
            id: nextId,
            patientId,
            studyId,
            scope: studyId ?? 'new',
            encounterId: document.encounterId,
            body: encodeImagingForm(next),
            revision,
            ...stamps(),
          })
          .run();
      }
      return { id: nextId, revision, document: next };
    }),
  );
}
export async function discardImagingFormDraft(
  id: string,
  patientId: string,
  studyId: string | null,
  revision: number,
  generation = datasetGeneration(),
) {
  return withDatasetWrite(generation, async () => {
    db.transaction((tx) => {
      const row = tx.select().from(imagingFormDrafts).where(eq(imagingFormDrafts.id, id)).get();
      if (!row) {
        if (revision !== 0 || tx.select().from(imagingFormDrafts).where(open(patientId, studyId)).get())
          throw new ImagingFormConflict();
        return;
      }
      context(row, patientId, studyId);
      if (row.deletedAt && !row.committedStudyId && row.revision === revision + 1) return;
      if (row.deletedAt || row.committedStudyId || row.revision !== revision) throw new ImagingFormConflict();
      tx.update(imagingFormDrafts)
        .set({ revision: revision + 1, ...softDelete() })
        .where(eq(imagingFormDrafts.id, id))
        .run();
    });
    await audit('imaging.draftDiscarded', { entityType: 'imaging_form_draft', entityId: id });
  });
}
