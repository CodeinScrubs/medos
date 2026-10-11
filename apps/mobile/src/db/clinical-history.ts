import { and, asc, desc, eq, getTableColumns, getTableName, isNull, or, sql, type SQL } from 'drizzle-orm';
import type { AnySQLiteColumn, SQLiteTable } from 'drizzle-orm/sqlite-core';

import {
  clinicalSnapshot,
  clinicalSnapshotContent,
  decodeClinicalSnapshot,
  encodeClinicalSnapshot,
  type ClinicalHistoryKind,
  type ClinicalSnapshot,
} from '@/lib/clinical-history';
import { newId, stamps } from '@/lib/ids';

import type { DbTransaction } from './client';
import {
  clinicalVersions,
  consultations,
  diagnoses,
  encounters,
  followUps,
  imagingStudies,
  labPanels,
  labValues,
  orders,
  patientContacts,
  patients,
  vitals,
  type ClinicalVersion,
} from './schema';

const clinicalTables = {
  patient: patients,
  contact: patientContacts,
  encounter: encounters,
  diagnosis: diagnoses,
  vital: vitals,
  lab: labPanels,
  imaging: imagingStudies,
  order: orders,
  consult: consultations,
  followup: followUps,
} as const;

/** A retained choice must distinguish even an identical same-millisecond edit cycle. */
export function clinicalHistorySequence(kind: ClinicalHistoryKind, recordId: string | AnySQLiteColumn): SQL<number> {
  // A single-table Drizzle SELECT strips column qualifiers inside SQL expressions.
  // Keep the outer key explicitly qualified or SQLite binds it to the inner id.
  // Both identifiers come from the schema, never from input.
  const ownerKey =
    typeof recordId === 'string'
      ? recordId
      : sql`${sql.identifier(getTableName(recordId.table))}.${sql.identifier(recordId.name)}`;
  return sql<number>`coalesce((select max(${clinicalVersions.sequence}) from ${clinicalVersions} where ${clinicalVersions.kind} = ${kind} and ${clinicalVersions.recordId} = ${ownerKey}), 0)`.mapWith(
    Number,
  );
}

/** Refuse a lossy imported row before Drizzle maps int64/booleans/dates into JS. */
function requireExactStoredRows(tx: DbTransaction, table: SQLiteTable, where: SQL) {
  const invalid = Object.values(getTableColumns(table)).flatMap((column) => {
    if (column.columnType === 'SQLiteBoolean')
      return [sql`${column} is not null and (typeof(${column}) != 'integer' or ${column} not in (0, 1))`];
    if (column.columnType !== 'SQLiteInteger' && column.columnType !== 'SQLiteTimestamp') return [];
    // SQLite INTEGER affinity can legitimately hold a REAL (fractional glucose
    // is supported by the existing schema). Its stored double is already exact
    // in JS; reject unsafe *stored integers*, not every numeric value of this column.
    if (column.columnType === 'SQLiteInteger')
      return [
        sql`${column} is not null and (typeof(${column}) not in ('integer', 'real') or (typeof(${column}) = 'integer' and (${column} < ${-Number.MAX_SAFE_INTEGER} or ${column} > ${Number.MAX_SAFE_INTEGER})))`,
      ];
    // Date clips out-of-range integers and truncates fractional timestamps.
    const limit = 8640000000000000;
    return [
      sql`${column} is not null and (typeof(${column}) != 'integer' or ${column} < ${-limit} or ${column} > ${limit})`,
    ];
  });
  if (
    invalid.length &&
    tx
      .select({ found: sql<number>`1` })
      .from(table)
      .where(and(where, or(...invalid)))
      .limit(1)
      .get()
  )
    throw new Error('مقدار ذخیره‌شده برای ثبت دقیق تاریخچه معتبر نیست؛ تغییری ثبت نشد.');
}

function readRecord(tx: DbTransaction, kind: ClinicalHistoryKind, id: string): Record<string, unknown> | undefined {
  const table = clinicalTables[kind];
  requireExactStoredRows(tx, table, eq(table.id, id));
  return tx.select().from(table).where(eq(table.id, id)).get();
}

function snapshot(tx: DbTransaction, kind: ClinicalHistoryKind, id: string): ClinicalSnapshot | null {
  const record = readRecord(tx, kind, id);
  if (!record) return null;
  if (kind === 'lab')
    requireExactStoredRows(tx, labValues, and(eq(labValues.panelId, id), isNull(labValues.deletedAt))!);
  const values =
    kind === 'lab'
      ? tx
          .select()
          .from(labValues)
          .where(and(eq(labValues.panelId, id), isNull(labValues.deletedAt)))
          .orderBy(asc(labValues.sortOrder), asc(labValues.id))
          .all()
      : undefined;
  if (values?.some((value) => value.patientId !== record.patientId))
    throw new Error('مالک یک نتیجه با آزمایش سازگار نیست؛ تغییری ثبت نشد.');
  return clinicalSnapshot(kind, record, values);
}

/**
 * Ordinary feature mutations call this inside their existing synchronous tx.
 * Restore imports SQL directly, so importing an archive cannot manufacture edits.
 * The first correction to an older record preserves its actual prior state as a
 * baseline; it does not pretend to recover changes made before history existed.
 */
export function withClinicalHistory<T>(
  tx: DbTransaction,
  kind: ClinicalHistoryKind,
  id: string,
  now: Date,
  work: () => T extends PromiseLike<unknown> ? never : T,
  reason?: 'reconciled',
): T {
  if (!Number.isFinite(now.getTime())) throw new Error('زمان ثبت تاریخچه معتبر نیست.');
  const before = snapshot(tx, kind, id);
  const result = work();
  if (
    result !== null &&
    (typeof result === 'object' || typeof result === 'function') &&
    typeof (result as { then?: unknown }).then === 'function'
  )
    throw new Error('تغییر و تاریخچه باید هم‌زمان ثبت شوند.');
  const after = snapshot(tx, kind, id);
  if (!after) {
    if (before) throw new Error('اطلاعات بالینی نباید پاک شود.');
    return result;
  }
  const patientId = kind === 'patient' ? after.record.fields.id : after.record.fields.patientId;
  const priorPatientId = before && (kind === 'patient' ? before.record.fields.id : before.record.fields.patientId);
  if (typeof patientId !== 'string' || (before && priorPatientId !== patientId))
    throw new Error('مالکیت تاریخچهٔ بیمار تغییر کرده است.');
  if (before && clinicalSnapshotContent(before) === clinicalSnapshotContent(after)) return result;

  const latest = tx
    .select()
    .from(clinicalVersions)
    .where(and(eq(clinicalVersions.kind, kind), eq(clinicalVersions.recordId, id)))
    .orderBy(desc(clinicalVersions.sequence))
    .get();
  if (latest && latest.patientId !== patientId) throw new Error('مالکیت نسخهٔ قبلی بیمار معتبر نیست.');
  let sequence = latest?.sequence ?? 0;
  const append = (value: ClinicalSnapshot, why: ClinicalVersion['reason']) => {
    sequence += 1;
    if (!Number.isSafeInteger(sequence) || sequence <= 0) throw new Error('ترتیب تاریخچه معتبر نیست.');
    tx.insert(clinicalVersions)
      .values({
        id: newId(),
        ...stamps(now),
        kind,
        recordId: id,
        patientId,
        sequence,
        recordedAt: now,
        reason: why,
        body: encodeClinicalSnapshot(value),
      })
      .run();
  };
  // An older/unrecorded state is retained verbatim before the first real change.
  if (before) {
    const previous = latest ? decodeClinicalSnapshot(latest.body, { kind, recordId: id, patientId }) : null;
    if (!previous || clinicalSnapshotContent(previous) !== clinicalSnapshotContent(before)) append(before, 'baseline');
  }
  const why =
    reason ??
    (!before
      ? 'created'
      : before.record.fields.deletedAt !== null && after.record.fields.deletedAt === null
        ? 'restored'
        : before.record.fields.deletedAt === null && after.record.fields.deletedAt !== null
          ? 'deleted'
          : 'edited');
  append(after, why);
  return result;
}
