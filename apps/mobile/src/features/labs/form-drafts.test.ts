import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { eq } from 'drizzle-orm';

import { tablesOf } from '@/db/query-tables';
import { labFormDrafts, labPanels, labValues, patients } from '@/db/schema';
import { importTables } from '@/features/backup/import';
import { openEncounter } from '@/features/encounters/queries';
import { createPatient } from '@/features/patients/queries';
import { DatasetChangedError, datasetGeneration } from '@/lib/dataset-write';
import { newId, softDelete } from '@/lib/ids';
import { databaseRows, snapshotDataset } from '@/test/dataset-snapshot';
import { useTestDatabase } from '@/test/db-client';
import { createTestDatabase, type TestDatabase } from '@/test/sqljs';

import {
  decodeLabForm,
  encodeLabForm,
  initialLabForm,
  LabFormConflict,
  labFormValues,
  type LabFormDocument,
} from './form-draft';
import {
  commitLabFormDraft,
  discardLabFormDraft,
  inspectLabForm,
  labFormQuery,
  replaceLabFormDraft,
  saveLabFormDraft,
} from './form-draft-queries';
import { createLabPanel, updateLabPanel } from './queries';

jest.mock('@/db/client', () => jest.requireActual('@/test/db-client'));
jest.mock('@/platform/notifications', () => jest.requireActual('@/test/mocks/notifications'));
let t: TestDatabase;
let patientId: string;
const now = new Date('2026-10-08T09:00:00Z');
beforeEach(async () => {
  t = useTestDatabase(await createTestDatabase());
  patientId = await createPatient({ firstName: 'Synthetic', lastName: 'Laboratory' });
});
function document(panelId: string | null = null): LabFormDocument {
  const rows = labFormQuery(patientId, panelId).all();
  const seed = rows[0]!;
  const result = initialLabForm(
    seed.panel,
    rows.flatMap((r) => (r.value ? [r.value] : [])),
    seed.active?.id ?? null,
    now,
  );
  if (!panelId)
    result.fields = {
      ...result.fields,
      rows: [
        {
          key: newId(),
          analyte: 'K',
          value: '>5.8',
          unit: 'mmol/L',
          refLow: 3.5,
          refHigh: 5.1,
          notes: 'Retained value note',
          custom: false,
          qualitative: false,
        },
      ],
    };
  return result;
}
const clinical = () => ({ panels: t.db.select().from(labPanels).all(), values: t.db.select().from(labValues).all() });
const draft = () => t.db.select().from(labFormDrafts).get()!;
async function panel() {
  return createLabPanel({
    patientId,
    source: 'photo',
    name: 'Original panel',
    collectedAt: now,
    values: [{ analyte: 'Hb', value: '12', unit: 'g/dL', notes: 'Hidden original value note' }],
  });
}

describe('raw laboratory drafts and atomic publication on migrated SQLite', () => {
  it('watches all five tables of the combined form snapshot', () => {
    expect(tablesOf(labFormQuery(patientId, null))).toEqual([
      'patients',
      'lab_panels',
      'lab_values',
      'lab_form_drafts',
      'encounters',
    ]);
  });
  it.each(['new', 'edit'])('preserves exact incomplete %s fields without clinical mutation', async (mode) => {
    const panelId = mode === 'edit' ? await panel() : null;
    const raw = document(panelId);
    raw.fields.rows[0]!.value = '5,8';
    raw.fields.date = { dateText: '1405/07/', clockText: '2:', customOpen: true };
    raw.fields.notes = '  Unfinished words  ';
    raw.fields.rangeEditor = { id: 'range-session', rowKey: raw.fields.rows[0]!.key, text: '135-' };
    const before = clinical();
    expect(await saveLabFormDraft('draft', patientId, panelId, raw, 0)).toBe(1);
    expect(decodeLabForm(draft().body)).toEqual(raw);
    expect(await saveLabFormDraft('draft', patientId, panelId, raw, 1)).toBe(1);
    await expect(commitLabFormDraft('draft', patientId, panelId, 1, now)).rejects.toThrow('تاریخ');
    expect(clinical()).toEqual(before);
    expect(draft()).toMatchObject({ revision: 1, deletedAt: null, committedPanelId: null });
  });
  it('rejects ambiguous values and unresolved ranges while allowing exact comparator publication once', async () => {
    const raw = document();
    raw.fields.rows[0]!.value = '5,8';
    await saveLabFormDraft('draft', patientId, null, raw, 0);
    await expect(commitLabFormDraft('draft', patientId, null, 1, now)).rejects.toThrow('عدد');
    raw.fields.rows[0]!.value = '>5.8';
    raw.fields.rangeEditor = { id: 'range-session', rowKey: raw.fields.rows[0]!.key, text: '135-' };
    expect(() => labFormValues(raw, now, false)).toThrow('محدوده');
    raw.fields.rangeEditor = null;
    await saveLabFormDraft('draft', patientId, null, raw, 1);
    const id = await commitLabFormDraft('draft', patientId, null, 2, now);
    const once = clinical();
    expect(await commitLabFormDraft('draft', patientId, null, 2, now)).toBe(id);
    expect(clinical()).toEqual(once);
    expect(once.values[0]).toMatchObject({
      value: '>5.8',
      valueNum: 5.8,
      flag: 'high',
      unit: 'mmol/L',
      notes: 'Retained value note',
    });
    expect(draft()).toMatchObject({ revision: 3, committedPanelId: id, deletedAt: now });
  });
  it('keeps the original source, captured admission and hidden value notes on edit', async () => {
    const encounter = await openEncounter({ patientId, kind: 'admission', admittedAt: now });
    const panelId = await panel();
    const raw = document(panelId);
    raw.fields.rows[0]!.value = '14';
    const original = clinical().values[0]!;
    await saveLabFormDraft('draft', patientId, panelId, raw, 0);
    await commitLabFormDraft('draft', patientId, panelId, 1, now);
    expect(clinical().panels[0]).toMatchObject({ source: 'photo', encounterId: encounter });
    expect(clinical().values.find((v) => v.id === original.id)).toMatchObject({
      value: '12',
      notes: original.notes,
      deletedAt: now,
    });
    expect(clinical().values.filter((v) => !v.deletedAt)).toEqual([
      expect.objectContaining({ value: '14', notes: original.notes }),
    ]);
  });
  it('preserves the existing draw second and millisecond on a note-only edit', async () => {
    const exact = new Date('2026-10-07T09:00:45.678Z');
    const panelId = await createLabPanel({
      patientId,
      source: 'manual',
      collectedAt: exact,
      values: [{ analyte: 'K', value: '4', unit: 'mmol/L' }],
    });
    const raw = document(panelId);
    raw.fields.notes = 'Note-only correction';
    await saveLabFormDraft('draft', patientId, panelId, raw, 0);
    await commitLabFormDraft('draft', patientId, panelId, 1, now);
    expect(clinical().panels[0]!.collectedAt.getTime()).toBe(exact.getTime());
  });
  it.each(['new', 'edit'])('rolls back every clinical %s effect when value insert fails', async (mode) => {
    const panelId = mode === 'edit' ? await panel() : null;
    await saveLabFormDraft('draft', patientId, panelId, document(panelId), 0);
    const before = clinical();
    const stored = draft();
    t.sqlite.exec(
      "CREATE TRIGGER fail_value BEFORE INSERT ON lab_values BEGIN SELECT RAISE(ABORT, 'synthetic failure'); END;",
    );
    await expect(commitLabFormDraft('draft', patientId, panelId, 1, now)).rejects.toThrow();
    expect(clinical()).toEqual(before);
    expect(draft()).toEqual(stored);
  });
  it.each(['new', 'edit'])('rolls back every clinical %s effect when retirement fails', async (mode) => {
    const panelId = mode === 'edit' ? await panel() : null;
    const raw = document(panelId);
    raw.fields.notes = 'Changed header';
    await saveLabFormDraft('draft', patientId, panelId, raw, 0);
    const before = clinical();
    const stored = draft();
    t.sqlite.exec(
      "CREATE TRIGGER fail_draft BEFORE UPDATE ON lab_form_drafts BEGIN SELECT RAISE(ABORT, 'synthetic failure'); END;",
    );
    await expect(commitLabFormDraft('draft', patientId, panelId, 1, now)).rejects.toThrow();
    expect(clinical()).toEqual(before);
    expect(draft()).toEqual(stored);
  });
  it('refuses a competing draft, wrong owner, mutable basis and stale discard without losing either version', async () => {
    const raw = document();
    await saveLabFormDraft('draft', patientId, null, raw, 0);
    await expect(saveLabFormDraft('other', patientId, null, raw, 0)).rejects.toBeInstanceOf(LabFormConflict);
    const second = await createPatient({ firstName: 'Synthetic', lastName: 'Other' });
    await expect(saveLabFormDraft('draft', second, null, raw, 1)).rejects.toBeInstanceOf(LabFormConflict);
    await expect(
      saveLabFormDraft('draft', patientId, null, { ...raw, initial: { ...raw.initial, name: 'Different basis' } }, 1),
    ).rejects.toBeInstanceOf(LabFormConflict);
    raw.fields.name = 'Newer draft';
    await saveLabFormDraft('draft', patientId, null, raw, 1);
    await expect(discardLabFormDraft('draft', patientId, null, 1)).rejects.toBeInstanceOf(LabFormConflict);
    expect(decodeLabForm(draft().body).fields.name).toBe('Newer draft');
  });
  it('requires an explicit fresh comparison before replacing changed clinical data', async () => {
    const panelId = await panel();
    const raw = document(panelId);
    raw.fields.notes = 'My raw note';
    await saveLabFormDraft('draft', patientId, panelId, raw, 0);
    await updateLabPanel(panelId, {
      source: 'photo',
      collectedAt: now,
      name: 'Other editor',
      values: [{ analyte: 'Hb', value: '13', unit: 'g/dL' }],
    });
    const before = clinical();
    await expect(commitLabFormDraft('draft', patientId, panelId, 1, now)).rejects.toBeInstanceOf(LabFormConflict);
    expect(clinical()).toEqual(before);
    const shown = await inspectLabForm('draft', patientId, panelId);
    const next = await replaceLabFormDraft('draft', patientId, panelId, raw, shown);
    expect(next.document.fields.notes).toBe('My raw note');
    await expect(replaceLabFormDraft('draft', patientId, panelId, raw, shown)).rejects.toBeInstanceOf(LabFormConflict);
    await commitLabFormDraft(next.id, patientId, panelId, next.revision, now);
    expect(clinical().panels[0]!.notes).toBe('My raw note');
  });
  it('preserves input after parent deletion but cannot publish or revive it', async () => {
    const raw = document();
    t.db.update(patients).set(softDelete(now)).where(eq(patients.id, patientId)).run();
    await saveLabFormDraft('draft', patientId, null, raw, 0);
    await expect(commitLabFormDraft('draft', patientId, null, 1, now)).rejects.toBeInstanceOf(LabFormConflict);
    expect(clinical().panels).toEqual([]);
    expect(decodeLabForm(draft().body)).toEqual(raw);
    await discardLabFormDraft('draft', patientId, null, 1);
    expect(draft().deletedAt).not.toBeNull();
    await expect(saveLabFormDraft('draft', patientId, null, raw, 2)).rejects.toBeInstanceOf(LabFormConflict);
  });
  it('keeps the captured historical admission instead of attaching to a new one', async () => {
    const first = await openEncounter({ patientId, kind: 'admission', admittedAt: now });
    const raw = document();
    await saveLabFormDraft('draft', patientId, null, raw, 0);
    await openEncounter({ patientId, kind: 'outpatient', admittedAt: now });
    await commitLabFormDraft('draft', patientId, null, 1, now);
    expect(clinical().panels[0]!.encounterId).toBe(first);
  });
  it('fences clean draft operations after same-ID dataset replacement', async () => {
    const raw = document();
    await saveLabFormDraft('draft', patientId, null, raw, 0);
    const generation = datasetGeneration();
    const restore = snapshotDataset(t);
    restore();
    const before = databaseRows(t);
    await expect(commitLabFormDraft('draft', patientId, null, 1, now, generation)).rejects.toBeInstanceOf(
      DatasetChangedError,
    );
    await expect(discardLabFormDraft('draft', patientId, null, 1, generation)).rejects.toBeInstanceOf(
      DatasetChangedError,
    );
    expect(databaseRows(t)).toEqual(before);
  });
  it('round-trips raw drafts through restore and clears them for an older source without the table', async () => {
    const raw = document();
    raw.fields.date.clockText = '2:';
    await saveLabFormDraft('draft', patientId, null, raw, 0);
    const before = draft();
    t.sqlite.exec("VACUUM INTO '/lab-drafts-roundtrip.db'");
    t.db.update(labFormDrafts).set({ body: 'different' }).run();
    t.sqlite.exec("ATTACH DATABASE '/lab-drafts-roundtrip.db' AS restore_src");
    t.sqlite.exec('PRAGMA foreign_keys = OFF');
    try {
      importTables(t.conn);
    } finally {
      t.sqlite.exec('DETACH DATABASE restore_src');
      t.sqlite.exec('PRAGMA foreign_keys = ON');
    }
    expect(draft()).toEqual(before);
    t.sqlite.exec("ATTACH DATABASE '/lab-drafts-roundtrip.db' AS restore_src");
    t.sqlite.exec('PRAGMA foreign_keys = OFF');
    try {
      t.sqlite.exec('DROP TABLE restore_src.lab_form_drafts');
      importTables(t.conn);
    } finally {
      t.sqlite.exec('DETACH DATABASE restore_src');
      t.sqlite.exec('PRAGMA foreign_keys = ON');
    }
    expect(t.db.select().from(labFormDrafts).all()).toEqual([]);
    expect(clinical().panels).toEqual([]);
  });
  it('rolls back an entire restore with a broken captured encounter reference', async () => {
    await saveLabFormDraft('draft', patientId, null, document(), 0);
    const before = databaseRows(t);
    t.sqlite.exec("VACUUM INTO '/lab-drafts-broken.db'");
    t.sqlite.exec("ATTACH DATABASE '/lab-drafts-broken.db' AS restore_src");
    t.sqlite.exec('PRAGMA foreign_keys = OFF');
    try {
      t.sqlite.exec("UPDATE restore_src.lab_form_drafts SET encounter_id = 'missing-encounter'");
      expect(() => importTables(t.conn)).toThrow();
    } finally {
      t.sqlite.exec('DETACH DATABASE restore_src');
      t.sqlite.exec('PRAGMA foreign_keys = ON');
    }
    expect(databaseRows(t)).toEqual(before);
  });
  it('keeps unknown document bytes and reports generic corruption instead of a blank form', async () => {
    const raw = document();
    await saveLabFormDraft('draft', patientId, null, raw, 0);
    const body = JSON.stringify({ ...raw, version: 99, secret: 'Private synthetic input' });
    t.db.update(labFormDrafts).set({ body }).run();
    expect(() => decodeLabForm(body)).toThrow('قابل خواندن نیست');
    try {
      decodeLabForm(body);
    } catch (e) {
      expect(String(e)).not.toContain('Private synthetic input');
    }
    await expect(commitLabFormDraft('draft', patientId, null, 1, now)).rejects.toThrow('قابل خواندن نیست');
    expect(draft().body).toBe(body);
    expect(decodeLabForm(encodeLabForm(raw))).toEqual(raw);
  });
});
