import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { eq } from 'drizzle-orm';
import { z } from 'zod';

import { createCapture } from '@/features/capture/queries';
import { createConsult } from '@/features/consults/queries';
import { createPatient } from '@/features/patients/queries';
import { reindexSearchIfNeeded, SEARCH_INDEX_VERSION } from '@/features/search/reindex';
import { createTask } from '@/features/tasks/queries';
import { useTestDatabase } from '@/test/db-client';
import { createTestDatabase, type TestDatabase } from '@/test/sqljs';

import { audit } from './audit';
import { tablesOf } from './query-tables';
import { auditLog, followUps, patients, settings, specialties, tasks, consultations, captureInbox } from './schema';
import { contains, matchesSearch } from './search';
import { runSeeds } from './seed';
import { SPECIALTY_SEED } from './seed-specialties';
import { defineSetting, parseSetting, readSetting, writeSetting } from './settings';

jest.mock('@/db/client', () => jest.requireActual('@/test/db-client'));
jest.mock('@/platform/notifications', () => jest.requireActual('@/test/mocks/notifications'));

let t: TestDatabase;

beforeEach(async () => {
  t = useTestDatabase(await createTestDatabase());
});

describe('typed settings', () => {
  const interval = defineSetting('test.intervalHours', z.number().int().min(1).max(720), 24);

  it('falls back to the default for a missing, corrupt or wrongly typed value', () => {
    expect(parseSetting(interval, undefined)).toBe(24);
    expect(parseSetting(interval, { value: null })).toBe(24);
    expect(parseSetting(interval, { value: '{not json' })).toBe(24);
    expect(parseSetting(interval, { value: '"12"' })).toBe(24);
    expect(parseSetting(interval, { value: '0' })).toBe(24);
    expect(parseSetting(interval, { value: '12' })).toBe(12);
  });

  it('round-trips through the database and refuses to store an invalid value', async () => {
    expect(await readSetting(interval)).toBe(24);
    await writeSetting(interval, 168);
    await writeSetting(interval, 12);
    expect(await readSetting(interval)).toBe(12);
    await expect(writeSetting(interval, 0)).rejects.toThrow();
    expect(await readSetting(interval)).toBe(12);
    expect(await t.db.select().from(settings).where(eq(settings.key, 'test.intervalHours'))).toHaveLength(1);
  });
});

describe('audit', () => {
  it('records an action with its details', async () => {
    await audit('patient.deleted', { entityType: 'patient', entityId: 'p1', detail: { reason: 'test' } });
    const [entry] = await t.db.select().from(auditLog);
    expect(entry).toMatchObject({
      action: 'patient.deleted',
      entityType: 'patient',
      entityId: 'p1',
      detail: { reason: 'test' },
    });
  });

  it('never breaks the action it records', async () => {
    t.conn.execSync('DROP TABLE audit_log');
    await expect(audit('patient.deleted')).resolves.toBeUndefined();
  });
});

describe('seeds', () => {
  it('seed the specialty tree once, with parents resolved, and leave user edits alone', async () => {
    await runSeeds();
    const rows = await t.db.select().from(specialties);
    expect(rows).toHaveLength(SPECIALTY_SEED.length);
    const bySlug = new Map(rows.map((r) => [r.slug, r]));
    expect(bySlug.get('gastro')?.parentId).toBe(bySlug.get('internal')?.id);

    await t.db.update(specialties).set({ nameFa: 'داخلی عمومی' }).where(eq(specialties.slug, 'internal'));
    await runSeeds();
    const again = await t.db.select().from(specialties);
    expect(again).toHaveLength(SPECIALTY_SEED.length);
    expect(again.find((r) => r.slug === 'internal')?.nameFa).toBe('داخلی عمومی');
  });

  it('have unique slugs whose parents exist', () => {
    const slugs = new Set(SPECIALTY_SEED.map((s) => s.slug));
    expect(slugs.size).toBe(SPECIALTY_SEED.length);
    for (const s of SPECIALTY_SEED) if (s.parent) expect(slugs.has(s.parent)).toBe(true);
  });
});

describe('search helpers', () => {
  it('match literally and every term independently', async () => {
    for (const text of ['50% off', '50 percent', 'a_b', 'ab']) {
      await t.db.insert(settings).values({ key: text, value: text, updatedAt: new Date() });
    }
    const keys = async (clause: ReturnType<typeof contains>) =>
      (await t.db.select().from(settings).where(clause)).map((r) => r.key).sort();
    expect(await keys(contains(settings.value, '%'))).toEqual(['50% off']);
    expect(await keys(contains(settings.value, '_'))).toEqual(['a_b']);
    expect(await keys(contains(settings.value, '!'))).toEqual([]);
    expect(matchesSearch(settings.value, '  ')).toEqual([]);
  });
});

describe('tablesOf', () => {
  it('lists the FROM table and every joined table, so live queries refresh on either', () => {
    const query = t.db
      .select()
      .from(followUps)
      .innerJoin(patients, eq(followUps.patientId, patients.id))
      .leftJoin(specialties, eq(specialties.id, patients.id));
    expect(tablesOf(query).sort()).toEqual(['follow_ups', 'patients', 'specialties']);
    expect(tablesOf(t.db.select().from(patients))).toEqual(['patients']);
  });
});

describe('reindexSearchIfNeeded', () => {
  it('repairs stale task, consult and capture indexes on upgrade from version one', async () => {
    const patientId = await createPatient({ firstName: 'Test', lastName: 'Patient' });
    await createTask({ title: 'Task needle' });
    await createConsult({ patientId, reason: 'Consult needle' });
    await createCapture({ text: 'Capture needle' });
    t.conn.execSync(
      "UPDATE tasks SET search_text = 'stale'; UPDATE consultations SET search_text = 'stale'; UPDATE capture_inbox SET search_text = 'stale';",
    );
    await t.db.insert(settings).values({ key: 'search.indexVersion', value: '1', updatedAt: new Date() });
    await reindexSearchIfNeeded();
    expect(t.db.select().from(tasks).get()!.searchText).toContain('task needle');
    expect(t.db.select().from(consultations).get()!.searchText).toContain('consult needle');
    expect(t.db.select().from(captureInbox).get()!.searchText).toContain('capture needle');
    expect(t.db.select().from(settings).where(eq(settings.key, 'search.indexVersion')).get()!.value).toBe(
      String(SEARCH_INDEX_VERSION),
    );
  });

  it('rebuilds stale indexes once, records the version, and audits what changed', async () => {
    await createPatient({ firstName: 'مریم', lastName: 'کریمی' });
    t.conn.execSync("UPDATE patients SET search_text = 'stale'");

    await reindexSearchIfNeeded();
    expect((await t.db.select().from(patients))[0]?.searchText).toBe('مریم کریمی');
    const entries = await t.db.select().from(auditLog);
    expect(entries.map((e) => e.action)).toEqual(['search.reindexed']);

    await reindexSearchIfNeeded();
    expect(await t.db.select().from(auditLog)).toHaveLength(1);
  });

  it('rebuilds when a backup from a newer build brought a different version', async () => {
    await t.db
      .insert(settings)
      .values({ key: 'search.indexVersion', value: String(SEARCH_INDEX_VERSION + 1), updatedAt: new Date() });
    await createPatient({ firstName: 'مریم', lastName: 'کریمی' });
    t.conn.execSync("UPDATE patients SET search_text = 'stale'");
    await reindexSearchIfNeeded();
    expect((await t.db.select().from(patients))[0]?.searchText).toBe('مریم کریمی');
  });
});
