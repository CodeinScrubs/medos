import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { eq } from 'drizzle-orm';

import { tablesOf } from '@/db/query-tables';
import { auditLog, clinicalVersions, labPanels, labValues, patients, settings } from '@/db/schema';
import { timelineLabPreviewQuery } from '@/features/timeline/queries';
import { stamps } from '@/lib/ids';
import { databaseRows } from '@/test/dataset-snapshot';
import { useTestDatabase } from '@/test/db-client';
import { createTestDatabase, type TestDatabase } from '@/test/sqljs';

import { patientLabOwnershipIssuesQuery } from './ownership-queries';
import {
  analyteSeriesQuery,
  deleteLabPanel,
  panelValuesQuery,
  patientLabPanelsQuery,
  patientLabValuesQuery,
  updateLabPanel,
} from './queries';
import { reflagLabValuesIfNeeded } from './reflag';

jest.mock('@/db/client', () => jest.requireActual('@/test/db-client'));
const now = new Date('2026-10-11T09:00:00Z');
let t: TestDatabase;
function panel(id: string, patientId = 'owner', deletedAt: Date | null = null) {
  t.db
    .insert(labPanels)
    .values({ id, patientId, source: 'manual', collectedAt: now, ...stamps(now), deletedAt })
    .run();
}
function value(id: string, panelId: string, patientId = 'owner', deletedAt: Date | null = null) {
  t.db
    .insert(labValues)
    .values({
      id,
      panelId,
      patientId,
      analyte: 'Synthetic analyte',
      value: '<5',
      refLow: 3,
      refHigh: 100,
      flag: 'normal',
      ...stamps(now),
      deletedAt,
    })
    .run();
}
function inconsistentPanel() {
  panel('mixed');
  value('owned-sibling', 'mixed');
  value('foreign-child', 'mixed', 'other');
}
beforeEach(async () => {
  t = useTestDatabase(await createTestDatabase());
  for (const id of ['owner', 'other'])
    t.db
      .insert(patients)
      .values({ id, firstName: 'Synthetic', lastName: id, ...stamps(now) })
      .run();
});

describe('lab result ownership at read and repair boundaries', () => {
  it('withholds every value of an inconsistent panel from both patient lists and charts', () => {
    inconsistentPanel();
    panel('healthy');
    value('healthy-child', 'healthy');
    expect(
      patientLabValuesQuery('owner')
        .all()
        .map((r) => r.value.id),
    ).toEqual(['healthy-child']);
    expect(patientLabValuesQuery('other').all()).toEqual([]);
    expect(
      analyteSeriesQuery('owner', 'Synthetic analyte')
        .all()
        .map((r) => r.value.id),
    ).toEqual(['healthy-child']);
    expect(analyteSeriesQuery('other', 'Synthetic analyte').all()).toEqual([]);
    expect(panelValuesQuery('mixed').all()).toEqual([]);
    expect(
      timelineLabPreviewQuery('owner', ['mixed', 'healthy'])
        .all()
        .map((r) => r.panelId),
    ).toEqual(['healthy']);
  });
  it('does not expose values of deleted panels or patients through direct queries', () => {
    panel('deleted', 'owner', now);
    value('deleted-parent-child', 'deleted');
    expect(panelValuesQuery('deleted').all()).toEqual([]);
    panel('alive');
    value('alive-child', 'alive');
    t.db.update(patients).set({ deletedAt: now }).where(eq(patients.id, 'owner')).run();
    expect(patientLabValuesQuery('owner').all()).toEqual([]);
    expect(analyteSeriesQuery('owner', 'Synthetic analyte').all()).toEqual([]);
    expect(panelValuesQuery('alive').all()).toEqual([]);
  });
  it('preserves an inconsistent panel verbatim and repairs healthy flags without preventing startup', async () => {
    inconsistentPanel();
    panel('healthy');
    value('healthy-child', 'healthy');
    const before = databaseRows(t);
    await expect(reflagLabValuesIfNeeded(now)).resolves.toBeUndefined();
    expect(databaseRows(t).lab_panels).toEqual(before.lab_panels);
    expect(databaseRows(t).lab_values!.filter((r) => r.panel_id === 'mixed')).toEqual(
      before.lab_values!.filter((r) => r.panel_id === 'mixed'),
    );
    expect(t.db.select().from(labValues).where(eq(labValues.id, 'healthy-child')).get()!.flag).toBeNull();
    expect(
      t.db
        .select()
        .from(clinicalVersions)
        .all()
        .map((r) => r.recordId),
    ).toEqual(['healthy', 'healthy']);
    expect(t.db.select().from(settings).where(eq(settings.key, 'labs.flagVersion')).get()!.value).toBe('1');
    expect(t.db.select().from(auditLog).all()[0]!.detail).toEqual({
      from: 0,
      to: 1,
      changed: 1,
      cleared: 1,
      blockedPanels: 1,
      skippedValues: 2,
    });
    const repaired = databaseRows(t);
    await reflagLabValuesIfNeeded(now);
    expect(databaseRows(t)).toEqual(repaired);
  });
  it('reports one panel to both affected patients without fetching foreign clinical fields', () => {
    inconsistentPanel();
    expect(patientLabOwnershipIssuesQuery('owner').all()).toEqual([{ count: 1 }]);
    expect(patientLabOwnershipIssuesQuery('other').all()).toEqual([{ count: 1 }]);
    expect(patientLabPanelsQuery('owner').all()[0]!.ownershipIssue).toBe(1);
    expect(patientLabPanelsQuery('other').all()).toEqual([]);
    expect(new Set(tablesOf(patientLabOwnershipIssuesQuery('owner')))).toEqual(
      new Set(['lab_panels', 'lab_values', 'patients']),
    );
    expect(new Set(tablesOf(patientLabPanelsQuery('owner')))).toEqual(
      new Set(['lab_panels', 'lab_values', 'patients']),
    );
    t.db.update(patients).set({ deletedAt: now }).where(eq(patients.id, 'other')).run();
    expect(patientLabOwnershipIssuesQuery('other').all()).toEqual([{ count: 0 }]);
  });
  it('withholds correct-looking siblings even when no stored flag needs changing', async () => {
    inconsistentPanel();
    t.db.update(labValues).set({ value: '5', flag: 'normal' }).run();
    const before = databaseRows(t);
    await reflagLabValuesIfNeeded(now);
    expect(databaseRows(t).lab_values).toEqual(before.lab_values);
    expect(t.db.select().from(clinicalVersions).all()).toEqual([]);
    expect(patientLabValuesQuery('owner').all()).toEqual([]);
    expect(patientLabOwnershipIssuesQuery('owner').all()).toEqual([{ count: 1 }]);
  });
  it('uses patient-indexed candidates instead of scanning every other patient panel for the issue count', () => {
    inconsistentPanel();
    const query = patientLabOwnershipIssuesQuery('owner').toSQL();
    const statement = t.sqlite.prepare('EXPLAIN QUERY PLAN ' + query.sql);
    try {
      statement.bind(query.params as string[]);
      const plan: string[] = [];
      while (statement.step()) plan.push(String(statement.getAsObject().detail));
      expect(plan.join('\n')).toContain('lab_panels_patient_idx');
      expect(plan.join('\n')).toContain('lab_values_trend_idx');
      expect(plan.join('\n')).toContain('lab_values_panel_idx');
      expect(plan.some((step) => /^SCAN lab_panels\b/.test(step))).toBe(false);
    } finally {
      statement.free();
    }
  });
  it('does not quarantine a healthy panel because of a separately deleted foreign child', async () => {
    panel('healthy');
    value('healthy-child', 'healthy');
    value('deleted-foreign', 'healthy', 'other', now);
    const deleted = t.db.select().from(labValues).where(eq(labValues.id, 'deleted-foreign')).get();
    await reflagLabValuesIfNeeded(now);
    expect(
      patientLabValuesQuery('owner')
        .all()
        .map((r) => r.value.id),
    ).toEqual(['healthy-child']);
    expect(patientLabOwnershipIssuesQuery('owner').all()).toEqual([{ count: 0 }]);
    expect(t.db.select().from(labValues).where(eq(labValues.id, 'deleted-foreign')).get()).toEqual(deleted);
  });
  it('still refuses publication or deletion of the raw inconsistent panel without moving data', async () => {
    inconsistentPanel();
    const before = databaseRows(t);
    await expect(
      updateLabPanel('mixed', { collectedAt: now, source: 'manual', values: [{ analyte: 'Replacement', value: '9' }] }),
    ).rejects.toThrow('مالک');
    await expect(deleteLabPanel('mixed')).rejects.toThrow('مالک');
    expect(databaseRows(t)).toEqual(before);
  });
  it.each(['flag', 'history'])(
    'rolls back the entire healthy repair after a real %s write failure',
    async (failure) => {
      inconsistentPanel();
      for (const id of ['first', 'second']) {
        panel(id);
        value(id + '-child', id);
      }
      const before = databaseRows(t);
      const trigger =
        failure === 'flag'
          ? "CREATE TRIGGER refuse_repair BEFORE UPDATE ON lab_values WHEN OLD.id='second-child' BEGIN SELECT RAISE(ABORT, 'synthetic repair failure'); END;"
          : "CREATE TRIGGER refuse_repair BEFORE INSERT ON clinical_versions WHEN NEW.record_id='second' BEGIN SELECT RAISE(ABORT, 'synthetic repair failure'); END;";
      t.sqlite.exec(trigger);
      await expect(reflagLabValuesIfNeeded(now)).rejects.toThrow('synthetic repair failure');
      expect(databaseRows(t)).toEqual(before);
      t.sqlite.exec('DROP TRIGGER refuse_repair');
      await reflagLabValuesIfNeeded(now);
      expect(t.db.select().from(clinicalVersions).all()).toHaveLength(4);
    },
  );
});
