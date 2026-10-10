import { and, desc, eq, isNull, lt, or, sql } from 'drizzle-orm';

import { db, type DbTransaction } from '@/db/client';
import { encounters, orders, patients, workspaceFormDrafts, type Order } from '@/db/schema';
import { activeEncounterIdQuery } from '@/features/encounters/status';
import { openFormScope } from '@/features/workspace-forms/queries';
import type { WorkspaceDraftCursor } from '@/features/workspace-forms/queries';
import type { FormPort } from '@/features/workspace-forms/types';
import { formScope } from '@/lib/form-document';

import {
  initialOrderFields,
  orderFormCodec,
  orderFormInput,
  orderFormParent,
  type OrderFormFields,
} from './form-draft';
import { ORDER_KIND_LABELS } from './labels';
import { createOrderInTransaction, updateOrderInTransaction, type OrderCreationContext } from './queries';

const recordClause = (recordId: string | null) =>
  recordId === null ? isNull(workspaceFormDrafts.recordId) : eq(workspaceFormDrafts.recordId, recordId);
const patientDraftClause = (patientId: string) =>
  sql`case when json_valid(${workspaceFormDrafts.parentId}) then json_extract(${workspaceFormDrafts.parentId}, '$[0]') end = ${patientId}`;
const episodeClause = (encounterId: string | null) =>
  encounterId === null ? isNull(orders.encounterId) : eq(orders.encounterId, encounterId);

/** Resolve a selected recovery context before mounting an editor; never replace its intent later. */
export function orderFormIntentQuery(patientId: string, recordId: string | null, draftId: string | null) {
  const active = activeEncounterIdQuery(patientId);
  return db
    .select({ record: orders, patient: patients, activeEpisode: encounters.id, draft: workspaceFormDrafts })
    .from(sql`(select 1) as order_intent`)
    .leftJoin(orders, recordId === null ? sql`0` : and(eq(orders.id, recordId), eq(orders.patientId, patientId)))
    .leftJoin(patients, eq(patients.id, patientId))
    .leftJoin(encounters, sql`${encounters.id} in (${active})`)
    .leftJoin(
      workspaceFormDrafts,
      and(
        eq(workspaceFormDrafts.kind, 'order'),
        recordClause(recordId),
        patientDraftClause(patientId),
        draftId !== null
          ? eq(workspaceFormDrafts.id, draftId)
          : and(
              isNull(workspaceFormDrafts.deletedAt),
              recordId === null
                ? sql`${workspaceFormDrafts.parentId} = json_array(${patientId}, ${encounters.id})`
                : undefined,
            ),
      ),
    )
    .orderBy(desc(workspaceFormDrafts.updatedAt), desc(workspaceFormDrafts.id))
    .limit(1);
}

export function orderFormQuery(context: OrderCreationContext, recordId: string | null, draftId: string | null = null) {
  const parentId = orderFormParent(context);
  return db
    .select({ scope: sql<string>`${formScope(recordId, parentId)}`, record: orders, draft: workspaceFormDrafts })
    .from(sql`(select 1) as order_seed`)
    .leftJoin(
      orders,
      recordId === null
        ? sql`0`
        : and(eq(orders.id, recordId), eq(orders.patientId, context.patientId), episodeClause(context.encounterId)),
    )
    .leftJoin(
      workspaceFormDrafts,
      draftId === null
        ? openFormScope('order', recordId, parentId)
        : and(
            eq(workspaceFormDrafts.id, draftId),
            eq(workspaceFormDrafts.kind, 'order'),
            eq(workspaceFormDrafts.scope, formScope(recordId, parentId)),
          ),
    )
    .limit(1);
}

export function orderContextLabelQuery(context: OrderCreationContext) {
  return db
    .select({ admittedAt: encounters.admittedAt, ward: encounters.ward })
    .from(encounters)
    .where(
      and(
        context.encounterId === null ? sql`0` : eq(encounters.id, context.encounterId),
        eq(encounters.patientId, context.patientId),
        isNull(encounters.deletedAt),
      ),
    )
    .limit(1);
}

/** Scope remains patient + original episode, including explicit null and imported empty keys. */
export function orderFormPort(context: OrderCreationContext): FormPort<Order, OrderFormFields> {
  const original = { ...context };
  const read = (tx: DbTransaction, id: string) =>
    tx
      .select()
      .from(orders)
      .where(and(eq(orders.id, id), eq(orders.patientId, original.patientId), episodeClause(original.encounterId)))
      .get() ?? null;
  return {
    parentId: orderFormParent(original),
    codec: orderFormCodec,
    query: (id, draftId) => orderFormQuery(original, id, draftId),
    read,
    initial: initialOrderFields,
    publish(tx, id, fields, now) {
      const input = orderFormInput(fields, now);
      if (id === null) return createOrderInTransaction(tx, { patientId: original.patientId, ...input }, original, now);
      const current = read(tx, id);
      if (!current || current.deletedAt) throw new Error('دستور یا نوبت اصلی در دسترس نیست.');
      updateOrderInTransaction(tx, id, input, now, current);
      return id;
    },
    describeRecord: (row) => describeOrder(initialOrderFields(row, new Date(0))),
    describeFields: describeOrder,
  };
}
function describeOrder(fields: OrderFormFields) {
  return [
    ORDER_KIND_LABELS[fields.kind],
    fields.name,
    fields.dose,
    fields.route,
    fields.frequency,
    fields.rate,
    fields.isPrn ? `PRN ${fields.prnCondition}` : '',
    fields.hasStart ? fields.date.dateText : 'زمان شروع ثبت نشده',
    fields.indication,
    fields.notes,
  ]
    .filter(Boolean)
    .join('\n');
}

/** Recovery links include older episodes but never another patient or clinical record. */
export function orderDraftsQuery(patientId: string, cursor: WorkspaceDraftCursor | null = null) {
  return db
    .select({
      id: workspaceFormDrafts.id,
      recordId: workspaceFormDrafts.recordId,
      updatedAt: workspaceFormDrafts.updatedAt,
      title: sql<
        string | null
      >`case when json_valid(${workspaceFormDrafts.body}) then case when json_type(${workspaceFormDrafts.body}, '$.fields.name') = 'text' then substr(json_extract(${workspaceFormDrafts.body}, '$.fields.name'), 1, 100) end end`,
    })
    .from(workspaceFormDrafts)
    .where(
      and(
        eq(workspaceFormDrafts.kind, 'order'),
        isNull(workspaceFormDrafts.deletedAt),
        patientDraftClause(patientId),
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
