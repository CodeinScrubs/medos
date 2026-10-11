import { and, desc, eq, isNull, lt, or, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/sqlite-core';

import { db } from '@/db/client';
import { clinicalVersions, patients } from '@/db/schema';

export type ClinicalHistoryCursor = { recordedAt: Date; sequence: number; id: string };

/** Bodies are fetched only for the one expanded version, never the entire history. */
export function clinicalHistoryQuery(patientId: string, cursor?: ClinicalHistoryCursor, limit = 20) {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) throw new Error('اندازهٔ صفحه معتبر نیست.');
  if (
    cursor &&
    (!Number.isFinite(cursor.recordedAt.getTime()) ||
      !Number.isSafeInteger(cursor.sequence) ||
      typeof cursor.id !== 'string')
  )
    throw new Error('صفحهٔ تاریخچه معتبر نیست.');
  return db
    .select({
      id: clinicalVersions.id,
      kind: clinicalVersions.kind,
      recordId: clinicalVersions.recordId,
      sequence: clinicalVersions.sequence,
      reason: clinicalVersions.reason,
      recordedAt: clinicalVersions.recordedAt,
      title: sql<string>`case when json_valid(${clinicalVersions.body}) then case when
      json_extract(${clinicalVersions.body}, '$.version') = 1 and
      json_extract(${clinicalVersions.body}, '$.kind') = ${clinicalVersions.kind} and
      json_extract(${clinicalVersions.body}, '$.record.fields.id') = ${clinicalVersions.recordId} and
      (case when ${clinicalVersions.kind} = 'patient' then json_extract(${clinicalVersions.body}, '$.record.fields.id') else json_extract(${clinicalVersions.body}, '$.record.fields.patientId') end) = ${clinicalVersions.patientId}
      then substr(coalesce(
      json_extract(${clinicalVersions.body}, '$.record.fields.title'),
      json_extract(${clinicalVersions.body}, '$.record.fields.name'),
      json_extract(${clinicalVersions.body}, '$.record.fields.reason'),
      json_extract(${clinicalVersions.body}, '$.record.fields.chiefComplaint'),
      json_extract(${clinicalVersions.body}, '$.record.fields.modality'), ''), 1, 120) else '' end else '' end`,
    })
    .from(clinicalVersions)
    .innerJoin(patients, eq(patients.id, clinicalVersions.patientId))
    .where(
      and(
        eq(clinicalVersions.patientId, patientId),
        isNull(patients.deletedAt),
        cursor
          ? or(
              lt(clinicalVersions.recordedAt, cursor.recordedAt),
              and(eq(clinicalVersions.recordedAt, cursor.recordedAt), lt(clinicalVersions.sequence, cursor.sequence)),
              and(
                eq(clinicalVersions.recordedAt, cursor.recordedAt),
                eq(clinicalVersions.sequence, cursor.sequence),
                lt(clinicalVersions.id, cursor.id),
              ),
            )
          : undefined,
      ),
    )
    .orderBy(desc(clinicalVersions.recordedAt), desc(clinicalVersions.sequence), desc(clinicalVersions.id))
    .limit(limit + 1);
}

export function clinicalVersionQuery(patientId: string, versionId: string) {
  const previous = alias(clinicalVersions, 'previous_clinical_version');
  const prior = db
    .select({ body: previous.body })
    .from(previous)
    .where(
      and(
        eq(previous.patientId, patientId),
        eq(previous.kind, clinicalVersions.kind),
        eq(previous.recordId, clinicalVersions.recordId),
        lt(previous.sequence, clinicalVersions.sequence),
      ),
    )
    .orderBy(desc(previous.sequence))
    .limit(1);
  return db
    .select({
      version: clinicalVersions,
      previousBody: sql<string | null>`(${prior.getSQL()})`,
    })
    .from(clinicalVersions)
    .innerJoin(patients, eq(patients.id, clinicalVersions.patientId))
    .where(
      and(eq(clinicalVersions.id, versionId), eq(clinicalVersions.patientId, patientId), isNull(patients.deletedAt)),
    )
    .limit(1);
}
