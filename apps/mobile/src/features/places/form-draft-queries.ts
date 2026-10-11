import { and, eq, sql } from 'drizzle-orm';

import { db } from '@/db/client';
import { extensions, places, workspaceFormDrafts, type Extension, type Place } from '@/db/schema';
import { openFormScope } from '@/features/workspace-forms/queries';
import type { FormPort } from '@/features/workspace-forms/types';
import { formScope } from '@/lib/form-document';

import {
  extensionFormCodec,
  extensionFormInput,
  initialExtensionFields,
  initialPlaceFields,
  placeFormCodec,
  placeFormInput,
  type ExtensionFormFields,
  type PlaceFormFields,
} from './form-draft';
import { PLACE_KIND_LABELS } from './labels';
import {
  createExtensionInTransaction,
  createPlaceInTransaction,
  updateExtensionInTransaction,
  updatePlaceInTransaction,
} from './queries';

export function placeFormQuery(recordId: string | null, draftId: string | null = null) {
  return db
    .select({ scope: sql<string>`${formScope(recordId)}`, record: places, draft: workspaceFormDrafts })
    .from(sql`(select 1) as workspace_seed`)
    .leftJoin(places, recordId === null ? sql`0` : eq(places.id, recordId))
    .leftJoin(
      workspaceFormDrafts,
      draftId === null
        ? openFormScope('place', recordId)
        : and(
            eq(workspaceFormDrafts.id, draftId),
            eq(workspaceFormDrafts.kind, 'place'),
            eq(workspaceFormDrafts.scope, formScope(recordId)),
          ),
    )
    .limit(1);
}

export function extensionFormQuery(recordId: string | null, draftId: string | null = null) {
  return db
    .select({ scope: sql<string>`${formScope(recordId)}`, record: extensions, draft: workspaceFormDrafts })
    .from(sql`(select 1) as workspace_seed`)
    .leftJoin(extensions, recordId === null ? sql`0` : eq(extensions.id, recordId))
    .leftJoin(
      workspaceFormDrafts,
      draftId === null
        ? openFormScope('extension', recordId)
        : and(
            eq(workspaceFormDrafts.id, draftId),
            eq(workspaceFormDrafts.kind, 'extension'),
            eq(workspaceFormDrafts.scope, formScope(recordId)),
          ),
    )
    .limit(1);
}

export const placeFormPort: FormPort<Place, PlaceFormFields> = {
  codec: placeFormCodec,
  query: placeFormQuery,
  read: (tx, id) => tx.select().from(places).where(eq(places.id, id)).get() ?? null,
  initial: initialPlaceFields,
  publish(tx, id, fields, now) {
    const input = placeFormInput(fields);
    if (id === null) return createPlaceInTransaction(tx, input, now);
    updatePlaceInTransaction(tx, id, input, now);
    return id;
  },
  describeRecord: (row) => describePlace(initialPlaceFields(row)),
  describeFields: describePlace,
};

function describePlace(fields: PlaceFormFields) {
  return [
    `نام: ${fields.name} · نوع: ${PLACE_KIND_LABELS[fields.kind]}`,
    `شهر: ${fields.city}`,
    `آدرس: ${fields.address}`,
    `تلفن: ${fields.phone} · تلفنخانه: ${fields.switchboard}`,
    `نقشه: ${fields.mapUrl}`,
    `مختصات: ${fields.lat}، ${fields.lng}`,
    `یادداشت: ${fields.notes}`,
  ].join('\n');
}

/** The place is editable raw input; the notebook itself has no fixed parent. */
export function extensionFormPort(initialPlaceId: string | null = null): FormPort<Extension, ExtensionFormFields> {
  return {
    codec: extensionFormCodec,
    query: extensionFormQuery,
    read: (tx, id) => tx.select().from(extensions).where(eq(extensions.id, id)).get() ?? null,
    initial: (row) => initialExtensionFields(row, initialPlaceId),
    publish(tx, id, fields, now) {
      const input = extensionFormInput(fields);
      if (id === null) return createExtensionInTransaction(tx, input, now);
      updateExtensionInTransaction(tx, id, input, now);
      return id;
    },
    describeRecord: (row) => describeExtension(initialExtensionFields(row)),
    describeFields: describeExtension,
  };
}

export function describeExtension(fields: ExtensionFormFields, placeName?: string) {
  return [
    `بیمارستان: ${fields.placeId === null ? 'انتخاب نشده' : (placeName ?? 'نام در دسترس نیست')}`,
    `بخش: ${fields.department} · داخلی: ${fields.extension}`,
    `خط مستقیم: ${fields.directLine} · طبقه: ${fields.floor}`,
    `مسئول / فرد رابط: ${fields.contactPerson}`,
    `یادداشت: ${fields.notes}`,
  ].join('\n');
}
