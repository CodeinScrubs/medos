import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js';
import { and, eq, getTableColumns, isNull, ne, or, sql, type SQL } from 'drizzle-orm';

import { auditInTransaction } from '@/db/audit';
import { db, type DbTransaction } from '@/db/client';
import { clinicalHistorySequence, withClinicalHistory } from '@/db/clinical-history';
import {
  consultations,
  diagnoses,
  encounters,
  followUps,
  imagingStudies,
  labPanels,
  labValues,
  notes,
  orders,
  patientContacts,
  patients,
  tasks,
  vitals,
} from '@/db/schema';
import { reconcileFollowUpReminder } from '@/features/followups/reminder-queries';
import { formBasis } from '@/lib/form-document';
import { touch } from '@/lib/ids';
import { logError } from '@/platform/error-log';

import { refreshPatientSearchText } from './search-index';

export const CLINICAL_TRASH_KINDS = [
  'lab',
  'imaging',
  'vital',
  'order',
  'consult',
  'diagnosis',
  'encounter',
  'contact',
  'followup',
] as const;
export type ClinicalTrashKind = (typeof CLINICAL_TRASH_KINDS)[number];
export type ClinicalRestoreNotice = { reminderIssue: 'dirty' | 'unavailable' };
export type ClinicalTrashFilter = { patientId?: string; kind?: ClinicalTrashKind };
export type ClinicalTrashCursor = { deletedAt: Date; kind: ClinicalTrashKind; id: string };

const sources = {
  lab: {
    table: labPanels,
    title: sql`coalesce(nullif(trim(${labPanels.name}), ''), 'آزمایش')`,
    at: labPanels.collectedAt,
  },
  imaging: {
    table: imagingStudies,
    title: sql`${imagingStudies.modality} || coalesce(' · ' || ${imagingStudies.region}, '')`,
    at: imagingStudies.studyDate,
  },
  vital: { table: vitals, title: sql`'علائم حیاتی'`, at: vitals.measuredAt },
  order: { table: orders, title: sql`${orders.name}`, at: orders.startAt },
  consult: { table: consultations, title: sql`${consultations.reason}`, at: consultations.requestedAt },
  diagnosis: { table: diagnoses, title: sql`${diagnoses.title}`, at: diagnoses.createdAt },
  encounter: {
    table: encounters,
    title: sql`coalesce(nullif(trim(${encounters.chiefComplaint}), ''), nullif(trim(${encounters.service}), ''), 'نوبت درمانی')`,
    at: encounters.admittedAt,
  },
  contact: {
    table: patientContacts,
    title: sql`coalesce(nullif(trim(${patientContacts.name}), ''), ${patientContacts.phone})`,
    at: patientContacts.createdAt,
  },
  followup: { table: followUps, title: sql`${followUps.reason}`, at: followUps.dueAt },
} as const;

function requireKind(value: unknown): asserts value is ClinicalTrashKind {
  if (!CLINICAL_TRASH_KINDS.some((kind) => kind === value)) throw new Error('نوع سابقهٔ حذف‌شده معتبر نیست.');
}

function requireFilter(filter: ClinicalTrashFilter) {
  if (filter.kind !== undefined) requireKind(filter.kind);
  if (filter.patientId !== undefined && typeof filter.patientId !== 'string')
    throw new Error('بیمار انتخاب‌شده معتبر نیست.');
}

/** Hash every SQLite column without exposing hidden fields in the list. */
function basisProjection(kind: ClinicalTrashKind) {
  const record = sql.join(
    Object.entries(getTableColumns(sources[kind].table)).map(
      ([key, column]) =>
        // JSON numbers lose int64 precision and SQLite's usual JSON real output
        // can round neighbouring doubles alike. Keep the storage type and exact
        // integer/round-trip real text before the JS canonical hash is computed.
        sql`${key}, json_array(typeof(${column}), case typeof(${column}) when 'integer' then cast(${column} as text) when 'real' then printf('%!.26g', ${column}) else ${column} end)`,
    ),
    sql`, `,
  );
  return sql<string>`json_object('kind', ${kind}, 'record', json_object(${record}), 'historySequence', cast(${clinicalHistorySequence(kind, sources[kind].table.id)} as text), 'patient', json_object('id', ${patients.id}, 'firstName', ${patients.firstName}, 'lastName', ${patients.lastName}))`;
}

function digest(raw: string): string {
  return bytesToHex(sha256(utf8ToBytes(formBasis(JSON.parse(raw)))));
}

/** UNION predicates run before the one global LIMIT; orphan tombstones remain visible. */
function deletedSource(filter: ClinicalTrashFilter, cursor: ClinicalTrashCursor | null = null): SQL {
  requireFilter(filter);
  if (cursor) {
    requireKind(cursor.kind);
    if (
      !(cursor.deletedAt instanceof Date) ||
      !Number.isFinite(cursor.deletedAt.getTime()) ||
      typeof cursor.id !== 'string'
    )
      throw new Error('صفحهٔ سابقه معتبر نیست.');
  }
  const kinds = filter.kind === undefined ? CLINICAL_TRASH_KINDS : [filter.kind];
  const branches = kinds.map((kind) => {
    const { table, title, at } = sources[kind];
    return db
      .select({
        id: sql<string>`${table.id}`.as('id'),
        kind: sql<ClinicalTrashKind>`${kind}`.as('kind'),
        patientId: sql<string>`${table.patientId}`.as('patient_id'),
        firstName: sql<string | null>`${patients.firstName}`.as('first_name'),
        lastName: sql<string | null>`${patients.lastName}`.as('last_name'),
        encounterId: ('encounterId' in table ? sql<string | null>`${table.encounterId}` : sql<string | null>`null`).as(
          'encounter_id',
        ),
        title: sql<string>`substr(${title}, 1, 160)`.as('title'),
        at: sql<number | null>`${at}`.as('clinical_at'),
        deletedAt: sql<number>`${table.deletedAt}`.as('deleted_at'),
      })
      .from(table)
      .leftJoin(patients, eq(table.patientId, patients.id))
      .where(
        and(
          sql`${table.deletedAt} is not null`,
          filter.patientId === undefined ? undefined : eq(table.patientId, filter.patientId),
          cursor
            ? sql`(${table.deletedAt} < ${cursor.deletedAt.getTime()} or (${table.deletedAt} = ${cursor.deletedAt.getTime()} and (${kind} > ${cursor.kind} or (${kind} = ${cursor.kind} and ${table.id} > ${cursor.id}))))`
            : undefined,
        ),
      )
      .getSQL();
  });
  return sql`(${sql.join(branches, sql` union all `)}) as deleted_clinical`;
}

/** limit+1 gives callers an honest next-page witness without an unbounded read. */
export function deletedClinicalQuery(
  filter: ClinicalTrashFilter = {},
  cursor: ClinicalTrashCursor | null = null,
  limit = 20,
) {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) throw new Error('اندازهٔ صفحهٔ سابقه معتبر نیست.');
  const page = db
    .select({
      id: sql<string>`deleted_clinical.id`.as('id'),
      kind: sql<ClinicalTrashKind>`deleted_clinical.kind`.as('kind'),
      patientId: sql<string>`deleted_clinical.patient_id`.as('patient_id'),
      firstName: sql<string | null>`deleted_clinical.first_name`.as('first_name'),
      lastName: sql<string | null>`deleted_clinical.last_name`.as('last_name'),
      encounterId: sql<string | null>`deleted_clinical.encounter_id`.as('encounter_id'),
      title: sql<string>`deleted_clinical.title`.as('title'),
      at: sql<number | null>`deleted_clinical.clinical_at`.as('clinical_at'),
      deletedAt: sql<number>`deleted_clinical.deleted_at`.as('deleted_at'),
    })
    .from(deletedSource(filter, cursor))
    .orderBy(sql`deleted_clinical.deleted_at desc, deleted_clinical.kind asc, deleted_clinical.id asc`)
    .limit(limit + 1)
    .as('clinical_page');
  const kinds = filter.kind === undefined ? CLINICAL_TRASH_KINDS : [filter.kind];
  const basisCases = kinds.map((kind) => {
    const { table } = sources[kind];
    const one = db
      .select({ basis: basisProjection(kind) })
      .from(table)
      .leftJoin(patients, eq(table.patientId, patients.id))
      .where(eq(table.id, sql`clinical_page.id`))
      .limit(1);
    return sql`when ${kind} then (${one.getSQL()})`;
  });
  // Both levels retain ORDER BY: SQLite keeps this LIMITed page as a co-routine,
  // then evaluates one primary-key basis lookup per returned row. Full clinical
  // bodies never enter the global tombstone sorter or the count query.
  return db
    .select({
      id: page.id,
      kind: page.kind,
      patientId: page.patientId,
      firstName: page.firstName,
      lastName: page.lastName,
      encounterId: page.encounterId,
      title: page.title,
      at: sql<Date | null>`${page.at}`.mapWith((value: number | null) => (value === null ? null : new Date(value))),
      deletedAt: sql<Date>`${page.deletedAt}`.mapWith((value: number) => new Date(value)),
      expectedBasis: sql<string>`case ${page.kind} ${sql.join(basisCases, sql` `)} end`.mapWith(digest),
    })
    .from(page)
    .orderBy(sql`${page.deletedAt} desc, ${page.kind} asc, ${page.id} asc`);
}

export function deletedClinicalCountQuery(filter: ClinicalTrashFilter = {}) {
  return db.select({ count: sql<number>`count(*)`.mapWith(Number) }).from(deletedSource(filter));
}

function requireEncounter(tx: DbTransaction, patientId: string, encounterId: string | null) {
  // Imported empty-string keys are real keys; only explicit null means unbound.
  if (encounterId === null) return;
  const encounter = tx.select().from(encounters).where(eq(encounters.id, encounterId)).get();
  if (!encounter || encounter.deletedAt !== null || encounter.patientId !== patientId)
    throw new Error('نوبت اصلی بیمار در دسترس نیست؛ سابقه بازیابی نشد.');
}

function requireEncounterChildren(tx: DbTransaction, patientId: string, encounterId: string) {
  for (const table of [notes, orders, vitals, labPanels, imagingStudies, diagnoses, followUps, consultations, tasks]) {
    const conflict = tx
      .select({ id: table.id })
      .from(table)
      .where(
        and(
          eq(table.encounterId, encounterId),
          isNull(table.deletedAt),
          or(ne(table.patientId, patientId), isNull(table.patientId)),
        ),
      )
      .limit(1)
      .get();
    if (conflict) throw new Error('یک سابقهٔ وابسته با بیمار این نوبت سازگار نیست؛ نوبت بازیابی نشد.');
  }
}

/** Caller carries its original dataset admission; this backend never acquires a fresh token. */
export async function restoreClinicalRecord(
  kind: ClinicalTrashKind,
  id: string,
  expectedBasis: string,
  now: Date,
): Promise<void | ClinicalRestoreNotice> {
  requireKind(kind);
  if (typeof id !== 'string' || typeof expectedBasis !== 'string' || !/^[a-f0-9]{64}$/.test(expectedBasis))
    throw new Error('انتخاب سابقه معتبر نیست؛ فهرست را دوباره بخوانید.');
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) throw new Error('زمان بازیابی معتبر نیست.');
  db.transaction((tx) => {
    const { table } = sources[kind];
    const current = tx.select().from(table).where(eq(table.id, id)).get();
    if (!current || current.deletedAt === null)
      throw new Error('این سابقهٔ حذف‌شده در دسترس نیست؛ فهرست را دوباره بخوانید.');
    const patient = tx.select().from(patients).where(eq(patients.id, current.patientId)).get();
    if (!patient || patient.deletedAt !== null)
      throw new Error('پروندهٔ اصلی بیمار در دسترس نیست؛ ابتدا آن را بازیابی کنید.');
    const basis = tx
      .select({ value: basisProjection(kind).mapWith(digest) })
      .from(table)
      .leftJoin(patients, eq(table.patientId, patients.id))
      .where(eq(table.id, id))
      .get();
    if (basis?.value !== expectedBasis) throw new Error('سابقه یا هویت بیمار تغییر کرده است؛ فهرست را دوباره بخوانید.');
    if (kind === 'encounter') requireEncounterChildren(tx, current.patientId, id);
    else requireEncounter(tx, current.patientId, 'encounterId' in current ? current.encounterId : null);
    if (
      kind === 'lab' &&
      tx
        .select({ id: labValues.id })
        .from(labValues)
        .where(and(eq(labValues.panelId, id), isNull(labValues.deletedAt), ne(labValues.patientId, current.patientId)))
        .limit(1)
        .get()
    )
      throw new Error('مالک یک نتیجه با آزمایش سازگار نیست؛ آزمایش بازیابی نشد.');
    if (kind === 'consult' && 'noteId' in current && current.noteId !== null) {
      const note = tx.select().from(notes).where(eq(notes.id, current.noteId)).get();
      if (
        !note ||
        note.deletedAt !== null ||
        note.patientId !== current.patientId ||
        note.encounterId !== current.encounterId
      )
        throw new Error('یادداشت اصلی مشاوره در دسترس نیست یا به این نوبت تعلق ندارد.');
    }
    if (kind === 'followup' && 'reminderRevision' in current) {
      if (
        !Number.isSafeInteger(current.reminderRevision) ||
        current.reminderRevision < 0 ||
        current.reminderRevision >= Number.MAX_SAFE_INTEGER
      )
        throw new Error('نسل یادآور معتبر نیست؛ پیگیری بدون تغییر نگه داشته شد.');
      if (
        !['pending', 'done', 'missed', 'cancelled'].includes(current.status) ||
        !['call', 'sms', 'visit', 'message', 'lab', 'other'].includes(current.channel) ||
        !['low', 'normal', 'high'].includes(current.priority)
      )
        throw new Error('وضعیت پیگیری معتبر نیست؛ اطلاعات اصلی بدون تغییر نگه داشته شد.');
    }
    withClinicalHistory(tx, kind, id, now, () => {
      tx.update(table)
        .set({
          deletedAt: null,
          ...touch(now),
          ...(kind === 'encounter' ? { isActive: false } : {}),
          ...(kind === 'followup' && 'reminderRevision' in current
            ? { reminderRevision: current.reminderRevision + 1, reminderAppliedRevision: -1 }
            : {}),
        })
        .where(eq(table.id, id))
        .run();
      if (kind === 'diagnosis') refreshPatientSearchText(current.patientId, tx);
      auditInTransaction(tx, `${kind}.restored`, { entityType: kind, entityId: id }, now);
    });
  });
  if (kind === 'followup') {
    // SQL/history/audit are already durable. Native failure must not report that
    // the recovered clinical record was lost, or request permission implicitly.
    await reconcileFollowUpReminder(id);
    try {
      const row = db.select().from(followUps).where(eq(followUps.id, id)).get();
      if (row && row.reminderRevision !== row.reminderAppliedRevision) return { reminderIssue: 'dirty' };
      if (row && row.deletedAt === null && row.status === 'pending' && row.dueAt > now && !row.notificationId)
        return { reminderIssue: 'unavailable' };
    } catch (error) {
      logError(error, { source: 'handled', context: 'follow-up restore reminder receipt' });
      return { reminderIssue: 'dirty' };
    }
  }
}
