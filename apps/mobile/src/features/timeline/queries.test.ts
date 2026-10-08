import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { eq } from 'drizzle-orm';

import { tablesOf } from '@/db/query-tables';
import { consultations, encounters, imagingStudies, labPanels, labValues, notes, patients } from '@/db/schema';
import { createPatient } from '@/features/patients/queries';
import { stamps } from '@/lib/ids';
import { useTestDatabase } from '@/test/db-client';
import { createTestDatabase, type TestDatabase } from '@/test/sqljs';

import { timelineCursor, timelinePage, TIMELINE_LAB_PREVIEW_SIZE, TIMELINE_PAGE_SIZE } from './logic';
import {
  timelineConsultsQuery,
  timelineEncountersQuery,
  timelineImagingQuery,
  timelineLabPreviewQuery,
  timelineLabsQuery,
  timelineNotesQuery,
} from './queries';

jest.mock('@/db/client', () => jest.requireActual('@/test/db-client'));
jest.mock('@/platform/notifications', () => jest.requireActual('@/test/mocks/notifications'));
let t: TestDatabase, patientId: string;
const at = new Date('2026-10-08T12:00:00Z');
beforeEach(async () => {
  t = useTestDatabase(await createTestDatabase());
  patientId = await createPatient({ firstName: 'Synthetic', lastName: 'Timeline' });
});
const all = (cursor?: ReturnType<typeof timelineCursor>) =>
  timelinePage([
    ...timelineNotesQuery(patientId, true, cursor).all(),
    ...timelineLabsQuery(patientId, true, cursor).all(),
    ...timelineImagingQuery(patientId, true, cursor).all(),
    ...timelineConsultsQuery(patientId, true, cursor).all(),
    ...timelineEncountersQuery(patientId, 'in', true, cursor).all(),
    ...timelineEncountersQuery(patientId, 'out', true, cursor).all(),
  ]);
const note = (id: string, noteDate = at) => {
  t.db
    .insert(notes)
    .values({ id, patientId, type: 'general', noteDate, ...stamps(at) })
    .run();
};

describe('bounded clinical timeline', () => {
  it('keeps the JS page bounded for a large patient history with long notes', () => {
    const body = 'Synthetic history '.repeat(500);
    t.db.transaction((tx) => {
      for (let i = 0; i < 2000; i++)
        tx.insert(notes)
          .values({
            id: `large${String(i).padStart(4, '0')}`,
            patientId,
            type: 'general',
            body,
            noteDate: new Date(at.getTime() - i * 1000),
            ...stamps(at),
          })
          .run();
    });
    const rows = timelineNotesQuery(patientId).all();
    expect(rows).toHaveLength(TIMELINE_PAGE_SIZE + 1);
    expect(rows.every((row) => row.summary!.length === 321)).toBe(true);
    expect(JSON.stringify(rows).length).toBeLessThan(25000);
    const page = all();
    expect(page.items).toHaveLength(TIMELINE_PAGE_SIZE);
    expect(page.hasMore).toBe(true);
    const final = timelineNotesQuery(patientId, true, { at: at.getTime() - 1979 * 1000, id: 'note:large1979' }).all();
    expect(final).toHaveLength(20);
    expect(final[0]!.sourceId).toBe('large1980');
  });
  it('pages all tied source kinds without duplicates, losses or dependence on insertion order', () => {
    for (let i = 0; i < 60; i++) {
      const id = `tie${String(59 - i).padStart(3, '0')}`;
      note(id);
      t.db
        .insert(labPanels)
        .values({ id, patientId, collectedAt: at, source: 'manual', ...stamps(at) })
        .run();
      t.db
        .insert(imagingStudies)
        .values({ id, patientId, modality: 'ct', studyDate: at, ...stamps(at) })
        .run();
      t.db
        .insert(consultations)
        .values({ id, patientId, reason: 'Question', requestedAt: at, ...stamps(at) })
        .run();
      t.db
        .insert(encounters)
        .values({ id, patientId, kind: 'admission', admittedAt: at, dischargedAt: at, ...stamps(at) })
        .run();
    }
    let page = all();
    const found: string[] = [];
    while (page.items.length) {
      expect(page.items.length).toBeLessThanOrEqual(TIMELINE_PAGE_SIZE);
      found.push(...page.items.map((item) => item.id));
      if (!page.hasMore) break;
      page = all(timelineCursor(page.items.at(-1)!));
    }
    const expected = ['note', 'lab', 'imaging', 'consult'].flatMap((kind) =>
      Array.from({ length: 60 }, (_, i) => `${kind}:tie${String(i).padStart(3, '0')}`),
    );
    expected.push(
      ...Array.from({ length: 60 }, (_, i) =>
        ['in', 'out'].map((part) => `encounter:tie${String(i).padStart(3, '0')}:${part}`),
      ).flat(),
    );
    expect(found).toEqual(expected.sort());
    expect(new Set(found).size).toBe(360);
  });
  it('keeps a recent discharge from an old admission and sorts consults by response time', () => {
    for (let i = 0; i < 90; i++) {
      note(`note${i}`, new Date(at.getTime() - i * 60000));
      t.db
        .insert(encounters)
        .values({
          id: `enc${i}`,
          patientId,
          kind: 'outpatient',
          admittedAt: new Date(at.getTime() - i * 60000),
          ...stamps(at),
        })
        .run();
    }
    const old = new Date('1960-01-01T12:00:00Z');
    const recent = new Date(at.getTime() + 60000);
    t.db
      .insert(encounters)
      .values({
        id: 'long-episode',
        patientId,
        kind: 'admission',
        admittedAt: old,
        dischargedAt: recent,
        ...stamps(at),
      })
      .run();
    t.db
      .insert(consultations)
      .values({
        id: 'late-answer',
        patientId,
        reason: 'Question',
        requestedAt: old,
        respondedAt: new Date(recent.getTime() + 60000),
        ...stamps(old),
      })
      .run();
    expect(
      all()
        .items.slice(0, 2)
        .map((item) => item.id),
    ).toEqual(['consult:late-answer', 'encounter:long-episode:out']);
    expect(timelineEncountersQuery(patientId, 'in').all()).toHaveLength(TIMELINE_PAGE_SIZE + 1);
  });
  it('uses keyset bounds when a newer event is inserted after the first page', () => {
    for (let i = 0; i < 85; i++) note(`note${String(i).padStart(3, '0')}`, new Date(at.getTime() - i * 1000));
    const first = all();
    note('arrived-later', new Date(at.getTime() + 1000));
    const next = all(timelineCursor(first.items.at(-1)!));
    expect(next.items.map((item) => item.sourceId)).toEqual(
      Array.from({ length: 40 }, (_, i) => `note${String(i + 40).padStart(3, '0')}`),
    );
    expect(all().items[0]!.sourceId).toBe('arrived-later');
  });
  it('does not load full note bodies, cap by pinned status, invent undated imaging, or include deleted/other owners', async () => {
    const other = await createPatient({ firstName: 'Other', lastName: 'Synthetic' });
    note('old-pinned', new Date(at.getTime() - 100000));
    t.db.update(notes).set({ isPinned: true }).where(eq(notes.id, 'old-pinned')).run();
    note('newest');
    t.db
      .update(notes)
      .set({ body: 'x'.repeat(100000), title: 't'.repeat(500) })
      .where(eq(notes.id, 'newest'))
      .run();
    note('deleted');
    t.db.update(notes).set({ deletedAt: at }).where(eq(notes.id, 'deleted')).run();
    t.db
      .insert(notes)
      .values({ id: 'other', patientId: other, type: 'general', noteDate: at, ...stamps(at) })
      .run();
    t.db
      .insert(imagingStudies)
      .values({ id: 'undated', patientId, modality: 'ct', ...stamps(at) })
      .run();
    const rows = timelineNotesQuery(patientId).all();
    expect(rows.map((row) => row.sourceId)).toEqual(['newest', 'old-pinned']);
    expect(rows[0]!.summary).toHaveLength(321);
    expect(rows[0]!.title).toHaveLength(129);
    expect(rows[0]).not.toHaveProperty('body');
    expect(timelineImagingQuery(patientId).all()).toEqual([]);
    expect(timelineNotesQuery(patientId, false).all()).toEqual([]);
    t.db.update(patients).set({ deletedAt: at }).where(eq(patients.id, patientId)).run();
    expect(all().items).toEqual([]);
  });
  it('reads SOAP content without adding separators for absent fields', () => {
    note('soap');
    t.db
      .update(notes)
      .set({ body: '', subjective: '', objective: '  Finding  ', assessment: null, plan: 'Plan' })
      .where(eq(notes.id, 'soap'))
      .run();
    expect(timelineNotesQuery(patientId).all()[0]!.summary).toBe('  Finding   — Plan');
  });
  it('exposes invalid persisted dates without crashing or claiming a complete empty history', () => {
    note('valid');
    const valid = timelineNotesQuery(patientId).all()[0]!;
    const page = timelinePage([valid, { ...valid, id: 'note:bad-date', at: new Date(NaN) }]);
    expect(page.invalidDates).toBe(1);
    expect(page.items).toHaveLength(1);
  });
});

describe('bounded lab hydration', () => {
  it('reads only selected panels, prioritizes flagged results, preserves units and reports the unabridged count', () => {
    for (const id of ['visible', 'off-page'])
      t.db
        .insert(labPanels)
        .values({ id, patientId, collectedAt: at, source: 'manual', ...stamps(at) })
        .run();
    for (let i = 0; i < 100; i++)
      t.db
        .insert(labValues)
        .values({
          id: `normal${i}`,
          patientId,
          panelId: 'visible',
          analyte: `A${i}`,
          value: '10',
          valueNum: 10,
          unit: 'mmol/L',
          flag: 'normal',
          sortOrder: i,
          ...stamps(at),
        })
        .run();
    for (const [id, flag] of [
      ['flagged', 'high'],
      ['critical', 'critical_high'],
    ] as const)
      t.db
        .insert(labValues)
        .values({
          id,
          patientId,
          panelId: 'visible',
          analyte: 'K',
          value: '>9',
          valueNum: 9,
          unit: 'mmol/L',
          flag,
          sortOrder: 1000,
          ...stamps(at),
        })
        .run();
    t.db
      .insert(labValues)
      .values({
        id: 'unreadable',
        patientId,
        panelId: 'visible',
        analyte: 'Uncertain',
        value: '5,8',
        valueNum: null,
        sortOrder: 1001,
        ...stamps(at),
      })
      .run();
    t.db
      .insert(labValues)
      .values({ id: 'off', patientId, panelId: 'off-page', analyte: 'Off', value: '20', ...stamps(at) })
      .run();
    t.db
      .insert(labValues)
      .values({
        id: 'deleted',
        patientId,
        panelId: 'visible',
        analyte: 'Deleted',
        value: '99',
        flag: 'critical_high',
        deletedAt: at,
        ...stamps(at),
      })
      .run();
    const rows = timelineLabPreviewQuery(patientId, ['visible']).all();
    expect(rows).toHaveLength(TIMELINE_LAB_PREVIEW_SIZE);
    expect(rows.map((row) => row.value).slice(0, 3)).toEqual(['>9', '>9', '5,8']);
    expect(rows[0]!.flag).toBe('critical_high');
    expect(rows[0]!.unit).toBe('mmol/L');
    expect(rows.every((row) => row.panelId === 'visible' && row.total === 103)).toBe(true);
    expect(timelineLabPreviewQuery(patientId, []).all()).toEqual([]);
    expect(tablesOf(timelineLabPreviewQuery(patientId, ['visible'])).sort()).toEqual([
      'lab_panels',
      'lab_values',
      'patients',
    ]);
  });
  it('bounds pathological field length and excludes cross-owner lab values', async () => {
    const other = await createPatient({ firstName: 'Other', lastName: 'Synthetic' });
    t.db
      .insert(labPanels)
      .values({ id: 'panel', patientId, collectedAt: at, source: 'manual', ...stamps(at) })
      .run();
    t.db
      .insert(labValues)
      .values({
        id: 'long',
        patientId,
        panelId: 'panel',
        analyte: 'a'.repeat(500),
        value: '9'.repeat(1000),
        unit: 'u'.repeat(500),
        ...stamps(at),
      })
      .run();
    t.db
      .insert(labValues)
      .values({
        id: 'wrong-owner',
        patientId: other,
        panelId: 'panel',
        analyte: 'Wrong owner',
        value: '10',
        flag: 'critical_high',
        ...stamps(at),
      })
      .run();
    const row = timelineLabPreviewQuery(patientId, ['panel']).all()[0]!;
    expect(row.analyte).toHaveLength(65);
    expect(row.value).toHaveLength(129);
    expect(row.unit).toHaveLength(65);
    expect(row.truncated).toBe(1);
    expect(row.total).toBe(1);
  });
});
