import { and, asc, desc, eq, inArray, isNotNull, isNull, sql, type SQL } from 'drizzle-orm';
import type { AnySQLiteColumn } from 'drizzle-orm/sqlite-core';

import { db } from '@/db/client';
import {
  consultations,
  encounters,
  imagingStudies,
  labPanels,
  labValues,
  notes,
  patients,
  type NoteType,
} from '@/db/schema';

import { TIMELINE_LAB_PREVIEW_SIZE, TIMELINE_PAGE_SIZE, type TimelineCursor, type TimelineKind } from './logic';

const short = (value: SQL, size: number) =>
  sql<string | null>`CASE WHEN length(${value}) > ${size} THEN substr(${value}, 1, ${size}) || '…' ELSE ${value} END`;
const keyOf = (kind: TimelineKind, id: AnySQLiteColumn, suffix = '') =>
  sql<string>`${kind} || ':' || ${id} || ${suffix}`;
const timestamp = (value: number | null) => (value == null ? null : new Date(value));
function fields(
  kind: TimelineKind,
  id: AnySQLiteColumn,
  at: SQL,
  title: SQL,
  summary: SQL,
  suffix = '',
  type: SQL = sql`NULL`,
) {
  return {
    id: keyOf(kind, id, suffix),
    sourceId: sql<string>`${id}`,
    kind: sql<TimelineKind>`${kind}`,
    at: sql<Date | null>`${at}`.mapWith(timestamp),
    title: short(title, 128),
    summary: short(summary, 320),
    noteType: sql<NoteType | null>`${type}`,
  };
}
function before(at: SQL, key: SQL, cursor?: TimelineCursor) {
  // Compare unix milliseconds, never a SQL parameter containing a JS Date.
  return cursor ? sql`(${at} < ${cursor.at} OR (${at} = ${cursor.at} AND ${key} > ${cursor.id}))` : undefined;
}
/** Retain separators only between present values, including intentional whitespace. */
function joined(...values: AnySQLiteColumn[]) {
  const parts = values.map((v) => sql`CASE WHEN coalesce(${v}, '') = '' THEN '' ELSE ' — ' || ${v} END`);
  return sql`substr(${sql.join(parts, sql` || `)}, 4)`;
}
const enabledWhere = (enabled: boolean) => sql`${enabled ? 1 : 0} = 1`;
const pageLimit = (enabled: boolean) => (enabled ? TIMELINE_PAGE_SIZE + 1 : 0);

// Each source reads at most page-size + 1 candidates AFTER the cursor/filter.
// Any global page can contain at most that many events from a single source.
// Clinical owners remain separate; this module is only a bounded projection.
export function timelineNotesQuery(patientId: string, enabled = true, cursor?: TimelineCursor) {
  const at = sql`${notes.noteDate}`,
    key = keyOf('note', notes.id);
  return db
    .select(
      fields(
        'note',
        notes.id,
        at,
        sql`${notes.title}`,
        sql`coalesce(nullif(${notes.body}, ''), ${joined(notes.subjective, notes.objective, notes.assessment, notes.plan)})`,
        '',
        sql`${notes.type}`,
      ),
    )
    .from(notes)
    .innerJoin(patients, eq(notes.patientId, patients.id))
    .where(
      and(
        enabledWhere(enabled),
        eq(notes.patientId, patientId),
        isNull(notes.deletedAt),
        isNull(patients.deletedAt),
        before(at, key, cursor),
      ),
    )
    .orderBy(desc(at), asc(key))
    .limit(pageLimit(enabled));
}
export function timelineLabsQuery(patientId: string, enabled = true, cursor?: TimelineCursor) {
  const at = sql`${labPanels.collectedAt}`,
    key = keyOf('lab', labPanels.id);
  return db
    .select(fields('lab', labPanels.id, at, sql`${labPanels.name}`, sql`${labPanels.labName}`))
    .from(labPanels)
    .innerJoin(patients, eq(labPanels.patientId, patients.id))
    .where(
      and(
        enabledWhere(enabled),
        eq(labPanels.patientId, patientId),
        isNull(labPanels.deletedAt),
        isNull(patients.deletedAt),
        before(at, key, cursor),
      ),
    )
    .orderBy(desc(at), asc(key))
    .limit(pageLimit(enabled));
}
export function timelineImagingQuery(patientId: string, enabled = true, cursor?: TimelineCursor) {
  const at = sql`${imagingStudies.studyDate}`,
    key = keyOf('imaging', imagingStudies.id);
  return db
    .select(
      fields(
        'imaging',
        imagingStudies.id,
        at,
        sql`upper(${imagingStudies.modality}) || CASE WHEN coalesce(${imagingStudies.region}, '') = '' THEN '' ELSE ' — ' || ${imagingStudies.region} END`,
        sql`coalesce(${imagingStudies.impression}, ${imagingStudies.reportText})`,
      ),
    )
    .from(imagingStudies)
    .innerJoin(patients, eq(imagingStudies.patientId, patients.id))
    .where(
      and(
        enabledWhere(enabled),
        eq(imagingStudies.patientId, patientId),
        isNull(imagingStudies.deletedAt),
        isNotNull(imagingStudies.studyDate),
        isNull(patients.deletedAt),
        before(at, key, cursor),
      ),
    )
    .orderBy(desc(at), asc(key))
    .limit(pageLimit(enabled));
}
export function timelineConsultsQuery(patientId: string, enabled = true, cursor?: TimelineCursor) {
  const at = sql`coalesce(${consultations.respondedAt}, ${consultations.requestedAt}, ${consultations.createdAt})`,
    key = keyOf('consult', consultations.id);
  return db
    .select(
      fields(
        'consult',
        consultations.id,
        at,
        sql`'کانسالت ' || coalesce(${consultations.specialty}, '')`,
        sql`coalesce(${consultations.response}, ${consultations.reason})`,
      ),
    )
    .from(consultations)
    .innerJoin(patients, eq(consultations.patientId, patients.id))
    .where(
      and(
        enabledWhere(enabled),
        eq(consultations.patientId, patientId),
        isNull(consultations.deletedAt),
        isNull(patients.deletedAt),
        before(at, key, cursor),
      ),
    )
    .orderBy(desc(at), asc(key))
    .limit(pageLimit(enabled));
}
export function timelineEncountersQuery(
  patientId: string,
  part: 'in' | 'out',
  enabled = true,
  cursor?: TimelineCursor,
) {
  const date = part === 'in' ? encounters.admittedAt : encounters.dischargedAt;
  const at = sql`${date}`,
    key = keyOf('encounter', encounters.id, `:${part}`);
  return db
    .select(
      fields(
        'encounter',
        encounters.id,
        at,
        sql`${part === 'in' ? 'پذیرش' : 'ترخیص'}`,
        part === 'in' ? joined(encounters.ward, encounters.chiefComplaint) : sql`${encounters.outcomeNotes}`,
        `:${part}`,
      ),
    )
    .from(encounters)
    .innerJoin(patients, eq(encounters.patientId, patients.id))
    .where(
      and(
        enabledWhere(enabled),
        eq(encounters.patientId, patientId),
        isNull(encounters.deletedAt),
        isNotNull(date),
        isNull(patients.deletedAt),
        before(at, key, cursor),
      ),
    )
    .orderBy(desc(at), asc(key))
    .limit(pageLimit(enabled));
}

/** Only the panels actually on this page, and at most six short values per panel. */
export function timelineLabPreviewQuery(patientId: string, panelIds: readonly string[]) {
  const ranked = db
    .select({
      panelId: labPanels.id,
      analyte: short(sql`${labValues.analyte}`, 64).as('analyte'),
      value: short(sql`${labValues.value}`, 128).as('value'),
      unit: short(sql`${labValues.unit}`, 64).as('unit'),
      valueNum: labValues.valueNum,
      flag: labValues.flag,
      // Do not parse a truncated value as if it were its complete original.
      truncated: sql<number>`CASE WHEN length(${labValues.value}) > 128 THEN 1 ELSE 0 END`.as('truncated'),
      total: sql<number>`count(*) OVER (PARTITION BY ${labPanels.id})`.as('total'),
      rank: sql<number>`row_number() OVER (PARTITION BY ${labPanels.id} ORDER BY CASE WHEN ${labValues.flag} IN ('critical_high', 'critical_low') THEN 0 WHEN ${labValues.flag} IN ('high', 'low') THEN 1 WHEN ${labValues.valueNum} IS NULL THEN 2 ELSE 3 END, ${labValues.sortOrder}, ${labValues.id})`.as(
        'rank',
      ),
    })
    .from(labPanels)
    .innerJoin(labValues, and(eq(labValues.panelId, labPanels.id), eq(labValues.patientId, labPanels.patientId)))
    .innerJoin(patients, eq(labPanels.patientId, patients.id))
    .where(
      and(
        eq(labPanels.patientId, patientId),
        inArray(labPanels.id, [...panelIds]),
        isNull(labPanels.deletedAt),
        isNull(labValues.deletedAt),
        isNull(patients.deletedAt),
        sql`length(trim(coalesce(${labValues.value}, ''))) > 0`,
      ),
    )
    .as('timeline_values');
  return db
    .select()
    .from(ranked)
    .where(sql`${ranked.rank} <= ${TIMELINE_LAB_PREVIEW_SIZE}`)
    .orderBy(asc(ranked.panelId), asc(ranked.rank));
}
