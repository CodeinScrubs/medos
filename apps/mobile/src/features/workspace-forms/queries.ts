import { and, desc, eq, isNull, lt, or, sql } from 'drizzle-orm';

import { auditInTransaction } from '@/db/audit';
import { db, type DbTransaction } from '@/db/client';
import { workspaceFormDrafts, type WorkspaceFormDraft } from '@/db/schema';
import { withDatasetWrite } from '@/lib/dataset-write';
import {
  formBasis,
  FormDraftConflict,
  formScope,
  type FormDocument,
  type WorkspaceFormKind,
} from '@/lib/form-document';
import { softDelete, stamps, touch } from '@/lib/ids';

import type { FormComparison, FormPort, FormRecord, FormRow, FormSeed } from './types';

export const openFormScope = (kind: WorkspaceFormKind, recordId: string | null, parentId: string | null = null) =>
  and(
    eq(workspaceFormDrafts.kind, kind),
    eq(workspaceFormDrafts.scope, formScope(recordId, parentId)),
    isNull(workspaceFormDrafts.deletedAt),
  );

export type WorkspaceDraftCursor = { id: string; updatedAt: Date };
export function workspaceDraftsQuery(kind: WorkspaceFormKind, cursor: WorkspaceDraftCursor | null = null) {
  return db
    .select({
      id: workspaceFormDrafts.id,
      recordId: workspaceFormDrafts.recordId,
      updatedAt: workspaceFormDrafts.updatedAt,
      title: sql<
        string | null
      >`case when json_valid(${workspaceFormDrafts.body}) then case when json_type(${workspaceFormDrafts.body}, '$.fields.title') = 'text' then substr(json_extract(${workspaceFormDrafts.body}, '$.fields.title'), 1, 100) end end`,
    })
    .from(workspaceFormDrafts)
    .where(
      and(
        eq(workspaceFormDrafts.kind, kind),
        isNull(workspaceFormDrafts.deletedAt),
        cursor
          ? or(
              lt(workspaceFormDrafts.updatedAt, cursor.updatedAt),
              and(eq(workspaceFormDrafts.updatedAt, cursor.updatedAt), lt(workspaceFormDrafts.id, cursor.id)),
            )
          : undefined,
      ),
    )
    .orderBy(desc(workspaceFormDrafts.updatedAt), desc(workspaceFormDrafts.id))
    .limit(4);
}
function context(row: WorkspaceFormDraft, kind: WorkspaceFormKind, recordId: string | null, parentId: string | null) {
  if (
    row.kind !== kind ||
    row.recordId !== recordId ||
    row.parentId !== parentId ||
    row.scope !== formScope(recordId, parentId)
  )
    throw new FormDraftConflict();
}
function validRevision(revision: number) {
  if (!Number.isSafeInteger(revision) || revision < 0) throw new FormDraftConflict();
}
function nextRevision(revision: number) {
  validRevision(revision);
  validRevision(revision + 1);
  return revision + 1;
}
function documentContext<F>(
  document: FormDocument<F>,
  kind: WorkspaceFormKind,
  recordId: string | null,
  parentId: string | null,
) {
  if (
    document.kind !== kind ||
    document.recordId !== recordId ||
    document.parentId !== parentId ||
    document.scope !== formScope(recordId, parentId)
  )
    throw new FormDraftConflict();
}
export function workspaceFormSeed<R extends FormRecord, F>(
  port: FormPort<R, F>,
  row: FormRow<R>,
  recordId: string | null,
  now: Date,
): FormSeed<R, F> {
  const parentId = port.parentId ?? null;
  if (row.scope !== formScope(recordId, parentId) || (row.record && row.record.id !== recordId))
    throw new FormDraftConflict();
  if (row.draft) {
    context(row.draft, port.codec.kind, recordId, parentId);
    validRevision(row.draft.revision);
    if (row.draft.deletedAt || row.draft.committedId) throw new FormDraftConflict();
    const document = port.codec.decode(row.draft.body);
    documentContext(document, port.codec.kind, recordId, parentId);
    return { ...row, document };
  }
  if (recordId !== null && (!row.record || row.record.deletedAt)) throw new FormDraftConflict();
  return {
    ...row,
    document: port.codec.create({
      recordId,
      parentId,
      basis: row.record ? formBasis(row.record) : null,
      fields: port.initial(row.record, now),
    }),
  };
}
function inspect<R extends FormRecord, F>(
  tx: DbTransaction,
  port: FormPort<R, F>,
  id: string,
  recordId: string | null,
): FormComparison<R> {
  const original = tx.select().from(workspaceFormDrafts).where(eq(workspaceFormDrafts.id, id)).get() ?? null;
  if (original) context(original, port.codec.kind, recordId, port.parentId ?? null);
  return {
    scope: formScope(recordId, port.parentId ?? null),
    record: recordId === null ? null : port.read(tx, recordId),
    draft:
      tx
        .select()
        .from(workspaceFormDrafts)
        .where(openFormScope(port.codec.kind, recordId, port.parentId ?? null))
        .get() ?? null,
    original,
  };
}
export function sameFormComparison<R>(left: FormComparison<R>, right: FormComparison<R>) {
  return formBasis(left) === formBasis(right);
}

/** Saving partial input never changes its original published basis or publishes a record. */
export async function saveWorkspaceDraft<R extends FormRecord, F>(
  port: FormPort<R, F>,
  id: string,
  document: FormDocument<F>,
  revision: number,
  generation: number,
): Promise<number> {
  return withDatasetWrite(generation, async () =>
    db.transaction((tx) => {
      validRevision(revision);
      const body = port.codec.encode(document);
      documentContext(document, port.codec.kind, document.recordId, port.parentId ?? null);
      const current = tx.select().from(workspaceFormDrafts).where(eq(workspaceFormDrafts.id, id)).get();
      if (!current) {
        if (
          revision !== 0 ||
          tx
            .select()
            .from(workspaceFormDrafts)
            .where(openFormScope(port.codec.kind, document.recordId, port.parentId ?? null))
            .get()
        )
          throw new FormDraftConflict();
        tx.insert(workspaceFormDrafts)
          .values({
            id,
            ...stamps(),
            kind: port.codec.kind,
            parentId: document.parentId,
            recordId: document.recordId,
            scope: document.scope,
            body,
            revision: 1,
          })
          .run();
        return 1;
      }
      context(current, port.codec.kind, document.recordId, port.parentId ?? null);
      const stored = port.codec.decode(current.body);
      documentContext(stored, port.codec.kind, document.recordId, port.parentId ?? null);
      if (current.deletedAt || current.committedId || current.revision !== revision || stored.basis !== document.basis)
        throw new FormDraftConflict();
      if (port.codec.encode(port.codec.decode(current.body)) === body) return revision;
      const next = nextRevision(revision);
      tx.update(workspaceFormDrafts)
        .set({ body, revision: next, ...touch() })
        .where(eq(workspaceFormDrafts.id, id))
        .run();
      return next;
    }),
  );
}

export async function publishWorkspaceDraft<R extends FormRecord, F>(
  port: FormPort<R, F>,
  id: string,
  recordId: string | null,
  revision: number,
  now: Date,
  generation: number,
): Promise<string> {
  return withDatasetWrite(generation, async () =>
    db.transaction((tx) => {
      validRevision(revision);
      const row = tx.select().from(workspaceFormDrafts).where(eq(workspaceFormDrafts.id, id)).get();
      if (!row) throw new FormDraftConflict();
      context(row, port.codec.kind, recordId, port.parentId ?? null);
      validRevision(row.revision);
      const document = port.codec.decode(row.body);
      documentContext(document, port.codec.kind, recordId, port.parentId ?? null);
      if (row.committedId && row.revision === revision + 1) {
        const prior = port.read(tx, row.committedId);
        if (!row.deletedAt || !prior || prior.deletedAt || (recordId !== null && prior.id !== recordId))
          throw new FormDraftConflict();
        return prior.id;
      }
      if (row.deletedAt || row.committedId || row.revision !== revision) throw new FormDraftConflict();
      const next = nextRevision(revision);
      const current = recordId === null ? null : port.read(tx, recordId);
      if (recordId !== null && (!current || current.deletedAt || formBasis(current) !== document.basis))
        throw new FormDraftConflict();
      const destination = port.publish(tx, recordId, document.fields, now);
      if (typeof destination !== 'string' || !destination || (recordId !== null && destination !== recordId))
        throw new FormDraftConflict();
      tx.update(workspaceFormDrafts)
        .set({ committedId: destination, revision: next, ...softDelete(now) })
        .where(eq(workspaceFormDrafts.id, id))
        .run();
      auditInTransaction(tx, 'workspace.formPublished', { entityType: port.codec.kind, entityId: destination }, now);
      return destination;
    }),
  );
}

export async function inspectWorkspaceForm<R extends FormRecord, F>(
  port: FormPort<R, F>,
  id: string,
  recordId: string | null,
  generation: number,
): Promise<FormComparison<R>> {
  return withDatasetWrite(generation, async () => db.transaction((tx) => inspect(tx, port, id, recordId)));
}

/** Explicitly adopt only the exact rows shown to the owner; final publication is separate. */
export async function replaceWorkspaceDraft<R extends FormRecord, F>(
  port: FormPort<R, F>,
  id: string,
  document: FormDocument<F>,
  shown: FormComparison<R>,
  now: Date,
  generation: number,
) {
  return withDatasetWrite(generation, async () =>
    db.transaction((tx) => {
      documentContext(document, port.codec.kind, document.recordId, port.parentId ?? null);
      const live = inspect(tx, port, id, document.recordId);
      if (!sameFormComparison(live, shown) || live.original?.deletedAt || live.original?.committedId)
        throw new FormDraftConflict();
      if (document.recordId !== null && (!live.record || live.record.deletedAt)) throw new FormDraftConflict();
      if (live.draft) {
        context(live.draft, port.codec.kind, document.recordId, port.parentId ?? null);
        validRevision(live.draft.revision);
        if (live.draft.committedId) throw new FormDraftConflict();
        documentContext(port.codec.decode(live.draft.body), port.codec.kind, document.recordId, port.parentId ?? null);
      }
      const next = port.codec.create({
        recordId: document.recordId,
        parentId: document.parentId,
        basis: live.record ? formBasis(live.record) : null,
        fields: document.fields,
      });
      const nextId = live.draft?.id ?? id;
      const revision = nextRevision(live.draft?.revision ?? 0);
      if (live.draft)
        tx.update(workspaceFormDrafts)
          .set({ body: port.codec.encode(next), revision, ...touch(now) })
          .where(eq(workspaceFormDrafts.id, nextId))
          .run();
      else
        tx.insert(workspaceFormDrafts)
          .values({
            id: nextId,
            ...stamps(now),
            kind: port.codec.kind,
            parentId: next.parentId,
            recordId: next.recordId,
            scope: next.scope,
            body: port.codec.encode(next),
            revision,
          })
          .run();
      auditInTransaction(tx, 'workspace.draftRebased', { entityType: port.codec.kind, entityId: nextId }, now);
      return { id: nextId, revision, document: next };
    }),
  );
}

export async function discardWorkspaceDraft(
  kind: WorkspaceFormKind,
  id: string,
  recordId: string | null,
  revision: number,
  now: Date,
  generation: number,
  parentId: string | null = null,
) {
  return withDatasetWrite(generation, async () =>
    db.transaction((tx) => {
      validRevision(revision);
      const row = tx.select().from(workspaceFormDrafts).where(eq(workspaceFormDrafts.id, id)).get();
      if (!row) throw new FormDraftConflict();
      context(row, kind, recordId, parentId);
      if (row.deletedAt || row.committedId || row.revision !== revision) throw new FormDraftConflict();
      tx.update(workspaceFormDrafts)
        .set({ revision: nextRevision(revision), ...softDelete(now) })
        .where(eq(workspaceFormDrafts.id, id))
        .run();
      auditInTransaction(tx, 'workspace.draftDiscarded', { entityType: kind, entityId: id }, now);
    }),
  );
}
