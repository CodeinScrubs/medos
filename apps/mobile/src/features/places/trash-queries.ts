import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js';
import { and, eq, getTableColumns, getTableName, isNull, sql, type SQL } from 'drizzle-orm';
import type { AnySQLiteColumn, SQLiteTable } from 'drizzle-orm/sqlite-core';

import { auditInTransaction } from '@/db/audit';
import { db } from '@/db/client';
import { auditLog, extensions, places } from '@/db/schema';
import { formBasis } from '@/lib/form-document';
import { softDelete, touch } from '@/lib/ids';

import { extensionSearchText, placeSearchText } from './logic';

export type PlaceTrashKind = 'place' | 'extension';
export type PlaceTrashCursor = { deletedAt: Date; kind: PlaceTrashKind; id: string };

function requireKind(kind: unknown): asserts kind is PlaceTrashKind {
  if (kind !== 'place' && kind !== 'extension') throw new Error('نوع مورد حذف‌شده معتبر نیست.');
}

/** This existing append-only id-only audit also distinguishes identical same-ms cycles. */
function lifecycle(kind: PlaceTrashKind, recordId: AnySQLiteColumn) {
  // Do not let Drizzle remove the outer qualifier: SQLite could bind the inner id.
  const ownerKey = sql`${sql.identifier(getTableName(recordId.table))}.${sql.identifier(recordId.name)}`;
  return sql`cast((select count(*) from ${auditLog} where ${auditLog.entityType} = ${kind} and ${auditLog.entityId} = ${ownerKey} and ${auditLog.action} in (${`${kind}.deleted`}, ${`${kind}.restored`})) as text)`;
}

/** Preserve exact SQLite storage values instead of passing int64/REAL through JSON numbers. */
function storedRow(table: SQLiteTable) {
  return sql`json_object(${sql.join(
    Object.entries(getTableColumns(table)).map(
      ([key, column]) =>
        sql`${key}, json_array(typeof(${column}), case typeof(${column}) when 'integer' then cast(${column} as text) when 'real' then printf('%!.26g', ${column}) else ${column} end)`,
    ),
    sql`, `,
  )})`;
}

function digest(raw: string): string {
  return bytesToHex(sha256(utf8ToBytes(formBasis(JSON.parse(raw)))));
}

export function placeActionBasis() {
  return sql<string>`json_object('kind', 'place', 'record', ${storedRow(places)}, 'lifecycle', ${lifecycle('place', places.id)})`.mapWith(
    digest,
  );
}

/** The displayed original parent identity is part of the child's retained choice. */
export function extensionActionBasis() {
  return sql<string>`json_object('kind', 'extension', 'record', ${storedRow(extensions)}, 'lifecycle', ${lifecycle('extension', extensions.id)}, 'parent', json_object('id', ${places.id}, 'name', ${places.name}, 'switchboard', ${places.switchboard}, 'deletedAt', cast(${places.deletedAt} as text), 'lifecycle', ${lifecycle('place', places.id)}))`.mapWith(
    digest,
  );
}

function deletedSource(kind?: PlaceTrashKind, cursor: PlaceTrashCursor | null = null): SQL {
  if (kind !== undefined) requireKind(kind);
  if (cursor) {
    requireKind(cursor.kind);
    if (
      !(cursor.deletedAt instanceof Date) ||
      !Number.isFinite(cursor.deletedAt.getTime()) ||
      typeof cursor.id !== 'string'
    )
      throw new Error('صفحهٔ موارد حذف‌شده معتبر نیست.');
  }
  const after = (rowKind: PlaceTrashKind, table: typeof places | typeof extensions) =>
    cursor
      ? sql`(${table.deletedAt} < ${cursor.deletedAt.getTime()} or (${table.deletedAt} = ${cursor.deletedAt.getTime()} and (${rowKind} > ${cursor.kind} or (${rowKind} = ${cursor.kind} and ${table.id} > ${cursor.id}))))`
      : undefined;
  const placeRows = db
    .select({
      id: sql<string>`${places.id}`.as('id'),
      kind: sql<PlaceTrashKind>`'place'`.as('kind'),
      title: sql<string>`substr(${places.name}, 1, 160)`.as('title'),
      parentId: sql<string | null>`null`.as('parent_id'),
      parentName: sql<string | null>`null`.as('parent_name'),
      deletedAt: sql<number>`${places.deletedAt}`.as('deleted_at'),
    })
    .from(places)
    .where(and(sql`${places.deletedAt} is not null`, after('place', places)))
    .getSQL();
  const extensionRows = db
    .select({
      id: sql<string>`${extensions.id}`.as('id'),
      kind: sql<PlaceTrashKind>`'extension'`.as('kind'),
      title: sql<string>`substr(${extensions.department} || ' · ' || ${extensions.extension}, 1, 160)`.as('title'),
      parentId: sql<string>`${extensions.placeId}`.as('parent_id'),
      parentName: sql<string | null>`substr(${places.name}, 1, 160)`.as('parent_name'),
      deletedAt: sql<number>`${extensions.deletedAt}`.as('deleted_at'),
    })
    .from(extensions)
    .leftJoin(places, eq(extensions.placeId, places.id))
    .where(and(sql`${extensions.deletedAt} is not null`, after('extension', extensions)))
    .getSQL();
  return sql`(${sql.join(kind === 'place' ? [placeRows] : kind === 'extension' ? [extensionRows] : [placeRows, extensionRows], sql` union all `)}) as deleted_places`;
}

export function deletedPlacesCountQuery(kind?: PlaceTrashKind) {
  // Live extensions hidden by a deleted parent are not tombstones.
  return db.select({ count: sql<number>`count(*)`.mapWith(Number) }).from(deletedSource(kind));
}

export function deletedPlacesQuery(kind?: PlaceTrashKind, cursor: PlaceTrashCursor | null = null, limit = 20) {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) throw new Error('اندازهٔ صفحه معتبر نیست.');
  const page = db
    .select({
      id: sql<string>`deleted_places.id`.as('id'),
      kind: sql<PlaceTrashKind>`deleted_places.kind`.as('kind'),
      title: sql<string>`deleted_places.title`.as('title'),
      parentId: sql<string | null>`deleted_places.parent_id`.as('parent_id'),
      parentName: sql<string | null>`deleted_places.parent_name`.as('parent_name'),
      deletedAt: sql<number>`deleted_places.deleted_at`.as('deleted_at'),
    })
    .from(deletedSource(kind, cursor))
    .orderBy(sql`deleted_places.deleted_at desc, deleted_places.kind asc, deleted_places.id asc`)
    .limit(limit + 1)
    .as('place_trash_page');
  // Only the bounded page reads full rows by primary key. Count/sort never load notes.
  // Outer single-source SELECT rewrites Column chunks, including those nested
  // inside scalar subqueries. Keep this page identity an explicit identifier.
  const pageId = sql`${sql.identifier('place_trash_page')}.${sql.identifier('id')}`;
  const placeBasis = db.select({ value: placeActionBasis() }).from(places).where(eq(places.id, pageId)).limit(1);
  const extensionBasis = db
    .select({ value: extensionActionBasis() })
    .from(extensions)
    .leftJoin(places, eq(extensions.placeId, places.id))
    .where(eq(extensions.id, pageId))
    .limit(1);
  return db
    .select({
      id: page.id,
      kind: page.kind,
      title: page.title,
      parentId: page.parentId,
      parentName: page.parentName,
      deletedAt: sql<Date>`${page.deletedAt}`.mapWith((value: number) => new Date(value)),
      expectedBasis:
        sql<string>`case ${page.kind} when 'place' then (${placeBasis.getSQL()}) else (${extensionBasis.getSQL()}) end`.mapWith(
          digest,
        ),
    })
    .from(page)
    .orderBy(sql`${page.deletedAt} desc, ${page.kind} asc, ${page.id} asc`);
}

function requireChoice(id: string, expectedBasis: string, now: Date) {
  if (typeof id !== 'string' || typeof expectedBasis !== 'string' || !/^[a-f0-9]{64}$/.test(expectedBasis))
    throw new Error('انتخاب معتبر نیست؛ فهرست را دوباره بخوانید.');
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) throw new Error('زمان ثبت معتبر نیست.');
}

/** The caller retains its original dataset admission; no fresh token is acquired here. */
export async function deletePlace(id: string, expectedBasis: string, now: Date): Promise<void> {
  requireChoice(id, expectedBasis, now);
  db.transaction((tx) => {
    const current = tx
      .select({ deletedAt: places.deletedAt, basis: placeActionBasis() })
      .from(places)
      .where(eq(places.id, id))
      .get();
    if (!current || current.deletedAt !== null || current.basis !== expectedBasis)
      throw new Error('مکان تغییر کرده یا در دسترس نیست؛ فهرست را دوباره بخوانید.');
    tx.update(places)
      .set(softDelete(now))
      .where(and(eq(places.id, id), isNull(places.deletedAt)))
      .run();
    // Children remain exactly as they were: live ones are only hidden by their parent.
    auditInTransaction(tx, 'place.deleted', { entityType: 'place', entityId: id }, now);
  });
}

export async function deleteExtension(id: string, expectedBasis: string, now: Date): Promise<void> {
  requireChoice(id, expectedBasis, now);
  db.transaction((tx) => {
    const current = tx
      .select({
        deletedAt: extensions.deletedAt,
        parentId: places.id,
        parentDeletedAt: places.deletedAt,
        basis: extensionActionBasis(),
      })
      .from(extensions)
      .leftJoin(places, eq(extensions.placeId, places.id))
      .where(eq(extensions.id, id))
      .get();
    if (!current || current.deletedAt !== null || current.basis !== expectedBasis)
      throw new Error('داخلی تغییر کرده یا در دسترس نیست؛ فهرست را دوباره بخوانید.');
    if (current.parentId === null || current.parentDeletedAt !== null)
      throw new Error('مکان اصلی در دسترس نیست؛ داخلی تغییر نکرد.');
    tx.update(extensions)
      .set(softDelete(now))
      .where(and(eq(extensions.id, id), isNull(extensions.deletedAt)))
      .run();
    auditInTransaction(tx, 'extension.deleted', { entityType: 'extension', entityId: id }, now);
  });
}

export async function restorePlace(id: string, expectedBasis: string, now: Date): Promise<void> {
  requireChoice(id, expectedBasis, now);
  db.transaction((tx) => {
    const current = tx.select().from(places).where(eq(places.id, id)).get();
    const basis = tx.select({ value: placeActionBasis() }).from(places).where(eq(places.id, id)).get();
    if (!current || current.deletedAt === null || basis?.value !== expectedBasis)
      throw new Error('مکان حذف‌شده تغییر کرده یا در دسترس نیست؛ فهرست را دوباره بخوانید.');
    tx.update(places)
      .set({ deletedAt: null, ...touch(now), searchText: placeSearchText(current) })
      .where(eq(places.id, id))
      .run();
    auditInTransaction(tx, 'place.restored', { entityType: 'place', entityId: id }, now);
  });
}

export async function restoreExtension(id: string, expectedBasis: string, now: Date): Promise<void> {
  requireChoice(id, expectedBasis, now);
  db.transaction((tx) => {
    const current = tx
      .select({
        extension: extensions,
        parentId: places.id,
        parentName: places.name,
        parentDeletedAt: places.deletedAt,
        basis: extensionActionBasis(),
      })
      .from(extensions)
      .leftJoin(places, eq(extensions.placeId, places.id))
      .where(eq(extensions.id, id))
      .get();
    if (!current || current.extension.deletedAt === null || current.basis !== expectedBasis)
      throw new Error('داخلی حذف‌شده تغییر کرده یا در دسترس نیست؛ فهرست را دوباره بخوانید.');
    if (current.parentId === null || current.parentDeletedAt !== null)
      throw new Error('مکان اصلی در دسترس نیست؛ ابتدا آن را بازیابی کنید.');
    tx.update(extensions)
      .set({ deletedAt: null, ...touch(now), searchText: extensionSearchText(current.extension, current.parentName) })
      .where(eq(extensions.id, id))
      .run();
    auditInTransaction(tx, 'extension.restored', { entityType: 'extension', entityId: id }, now);
  });
}
