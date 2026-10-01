import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { eq } from 'drizzle-orm';

import { auditLog, encounterFormDrafts, encounters, patients } from '@/db/schema';
import { importTables } from '@/features/backup/import';
import { createPatient, deletePatient } from '@/features/patients/queries';
import { newId, softDelete } from '@/lib/ids';
import { useTestDatabase } from '@/test/db-client';
import { createTestDatabase, type TestDatabase } from '@/test/sqljs';

import {
  decodeEncounterForm,
  encodeEncounterForm,
  EncounterFormConflict,
  type EncounterFormDocument,
  type EncounterFormMode,
} from './form-draft';
import {
  commitEncounterFormDraft,
  discardEncounterFormDraft,
  encounterFormQuery,
  encounterFormSeed,
  inspectEncounterForm,
  replaceEncounterFormDraft,
  saveEncounterFormDraft,
} from './form-draft-queries';
import { dischargeEncounter, openEncounter, updateEncounter } from './queries';

jest.mock('@/db/client', () => jest.requireActual('@/test/db-client'));
jest.mock('@/platform/notifications', () => jest.requireActual('@/test/mocks/notifications'));
let t: TestDatabase;
let patientId: string;
let id: string;
const now = new Date(2026, 9, 1, 10, 30);
async function document(mode: EncounterFormMode = 'new', target: string | null = null): Promise<EncounterFormDocument> {
  return encounterFormSeed(await encounterFormQuery(mode, patientId, target), mode, target, now).document;
}
const stored = () => t.db.select().from(encounterFormDrafts).where(eq(encounterFormDrafts.id, id)).get()!;
const episodes = () => t.db.select().from(encounters).all();
function save(doc: EncounterFormDocument, revision = 0, target: string | null = null) {
  return saveEncounterFormDraft(id, doc.mode, patientId, target, doc, revision);
}
function commit(doc: EncounterFormDocument, revision = 1, target: string | null = null) {
  return commitEncounterFormDraft(id, doc.mode, patientId, target, revision, doc, now);
}
function setText(doc: EncounterFormDocument, text: string) {
  if (doc.mode === 'discharge') doc.fields.outcomeNotes = text;
  else doc.fields.ward = text;
}
beforeEach(async () => {
  t = useTestDatabase(await createTestDatabase());
  patientId = await createPatient({ firstName: 'Synthetic', lastName: 'Episode', status: 'outpatient' });
  id = newId();
});

describe('unpublished episode input on migrated SQLite', () => {
  it('records one discharge action when publication is retried with the same token', async () => {
    const target = await openEncounter({ patientId, kind: 'admission', admittedAt: now });
    const doc = await document('discharge', target);
    setText(doc, 'Outcome');
    await save(doc, 0, target);
    await commit(doc, 1, target);
    await commit(doc, 1, target);
    expect(t.db.select().from(auditLog).where(eq(auditLog.action, 'encounter.discharged')).all()).toHaveLength(1);
  });
  it('does not acknowledge different input as a replay of an already published draft', async () => {
    const doc = await document();
    setText(doc, 'Published value');
    await save(doc);
    await commit(doc);
    setText(doc, 'Different value');
    await expect(commit(doc)).rejects.toBeInstanceOf(EncounterFormConflict);
    expect(episodes()).toHaveLength(1);
    expect(episodes()[0]!.ward).toBe('Published value');
  });
  it('refuses a mismatched scope during inspection, replacement and discard', async () => {
    const doc = await document();
    setText(doc, 'Keep exact input');
    await save(doc);
    const compared = await inspectEncounterForm('new', patientId, null, id, now);
    t.db
      .update(encounterFormDrafts)
      .set({ scopeKey: 'new:another-context' })
      .where(eq(encounterFormDrafts.id, id))
      .run();
    await expect(inspectEncounterForm('new', patientId, null, id, now)).rejects.toThrow();
    await expect(replaceEncounterFormDraft(id, 'new', patientId, null, doc, compared)).rejects.toThrow();
    await expect(discardEncounterFormDraft(id, 'new', patientId, null, 1)).rejects.toThrow();
    expect(stored()).toMatchObject({ deletedAt: null, body: encodeEncounterForm(doc), revision: 1 });
    expect(episodes()).toEqual([]);
  });
  it('creates nothing for an untouched form; an explicit valid Add creates one token and episode', async () => {
    const doc = await document();
    expect(await save(doc)).toBe(0);
    expect(episodes()).toEqual([]);
    expect(t.db.select().from(encounterFormDrafts).all()).toEqual([]);
    const ids = await Promise.all([commit(doc, 0), commit(doc, 0)]);
    expect(ids[0]).toBe(ids[1]);
    expect(episodes()).toHaveLength(1);
    expect(stored()).toMatchObject({ revision: 1, committedEncounterId: ids[0] });
    expect(stored().deletedAt).not.toBeNull();
  });
  it.each(['new', 'edit', 'discharge'] as const)(
    'retains exact invalid %s input without changing clinical state',
    async (mode) => {
      const target = mode === 'new' ? null : await openEncounter({ patientId, kind: 'admission', admittedAt: now });
      const before = episodes();
      const doc = await document(mode, target);
      setText(doc, 'Exact raw text\nnot yet published');
      doc.fields.date = { dateText: '1405/07/', clockText: '2:', customOpen: true };
      expect(await save(doc, 0, target)).toBe(1);
      expect(decodeEncounterForm(stored().body)).toEqual(doc);
      await expect(commit(doc, 1, target)).rejects.toThrow('تاریخ');
      expect(episodes()).toEqual(before);
      doc.fields.date.dateText = '1405/07/09';
      await save(doc, 1, target);
      await expect(commit(doc, 2, target)).rejects.toThrow('ساعت');
      expect(episodes()).toEqual(before);
      expect(stored().deletedAt).toBeNull();
    },
  );
  it('publishes an explicitly unknown hour as 12:01 without validating a hidden partial clock', async () => {
    const doc = await document();
    if (doc.mode !== 'new') throw new Error('test mode');
    doc.fields.hourKnown = false;
    doc.fields.date.clockText = '2:';
    doc.fields.chiefComplaint = 'Synthetic complaint';
    await save(doc);
    await commit(doc);
    expect(episodes()[0]).toMatchObject({ admittedAtHasTime: false, chiefComplaint: 'Synthetic complaint' });
    expect(episodes()[0]!.admittedAt!.getHours()).toBe(12);
    expect(episodes()[0]!.admittedAt!.getMinutes()).toBe(1);
  });
  it.each(['new', 'edit', 'discharge'] as const)(
    'rolls back %s effects when draft retirement fails, then retries once',
    async (mode) => {
      const old = await openEncounter({ patientId, kind: 'admission', ward: 'Old ward', admittedAt: now });
      const target = mode === 'new' ? null : old;
      const doc = await document(mode, target);
      setText(doc, 'New raw value');
      await save(doc, 0, target);
      const before = episodes();
      const patient = t.db.select().from(patients).get();
      t.sqlite.exec(
        "CREATE TRIGGER fail_retire BEFORE UPDATE ON encounter_form_drafts BEGIN SELECT RAISE(ABORT, 'synthetic failure'); END;",
      );
      await expect(commit(doc, 1, target)).rejects.toThrow();
      expect(episodes()).toEqual(before);
      expect(t.db.select().from(patients).get()).toEqual(patient);
      expect(stored()).toMatchObject({ revision: 1, deletedAt: null, committedEncounterId: null });
      t.sqlite.exec('DROP TRIGGER fail_retire');
      const ids = await Promise.all([commit(doc, 1, target), commit(doc, 1, target)]);
      expect(ids[0]).toBe(ids[1]);
      expect(episodes()).toHaveLength(mode === 'new' ? 2 : 1);
    },
  );
  it('refuses a changed active context before a new episode supersedes it', async () => {
    const doc = await document();
    setText(doc, 'My ward');
    await save(doc);
    const other = await openEncounter({ patientId, kind: 'emergency', ward: 'Later admission', admittedAt: now });
    await expect(commit(doc)).rejects.toBeInstanceOf(EncounterFormConflict);
    expect(episodes()).toHaveLength(1);
    expect(episodes()[0]).toMatchObject({ id: other, isActive: true });
    const compared = await inspectEncounterForm('new', patientId, null, id, now);
    const kept = await replaceEncounterFormDraft(id, 'new', patientId, null, doc, compared);
    await commit(kept.document, kept.revision);
    expect(episodes()).toHaveLength(2);
    expect(episodes().find((row) => row.id === other)?.isActive).toBe(false);
  });
  it('refuses overwriting an intervening correction until its clinical basis has been compared', async () => {
    const target = await openEncounter({ patientId, kind: 'admission', ward: 'Initial', admittedAt: now });
    const doc = await document('edit', target);
    setText(doc, 'Mine');
    await save(doc, 0, target);
    await updateEncounter(target, { ward: 'Stored elsewhere' });
    await expect(commit(doc, 1, target)).rejects.toThrow();
    expect(episodes()[0]!.ward).toBe('Stored elsewhere');
    const compared = await inspectEncounterForm('edit', patientId, target, id, now);
    await updateEncounter(target, { ward: 'Changed after comparison' });
    await expect(replaceEncounterFormDraft(id, 'edit', patientId, target, doc, compared)).rejects.toThrow();
    const fresh = await inspectEncounterForm('edit', patientId, target, id, now);
    const kept = await replaceEncounterFormDraft(id, 'edit', patientId, target, doc, fresh);
    await commit(kept.document, kept.revision, target);
    expect(episodes()[0]!.ward).toBe('Mine');
  });
  it('does not discharge a superseded episode or a different patient supplied by a stale route', async () => {
    const target = await openEncounter({ patientId, kind: 'admission', admittedAt: now });
    const doc = await document('discharge', target);
    setText(doc, 'Outcome draft');
    await save(doc, 0, target);
    await openEncounter({ patientId, kind: 'admission', admittedAt: now });
    await expect(commit(doc, 1, target)).rejects.toThrow();
    const other = await createPatient({ firstName: 'Other', lastName: 'Synthetic' });
    expect(await encounterFormQuery('edit', other, target)).toMatchObject([{ target: null }]);
    await expect(commitEncounterFormDraft(id, 'discharge', other, target, 1, doc, now)).rejects.toThrow();
    expect(t.db.select().from(patients).where(eq(patients.id, patientId)).get()?.status).toBe('admitted');
  });
  it('retains the loaded final raw input after soft deletion but never publishes or revives it', async () => {
    const target = await openEncounter({ patientId, kind: 'admission', admittedAt: now });
    const doc = await document('edit', target);
    setText(doc, 'First');
    await save(doc, 0, target);
    await deletePatient(patientId);
    setText(doc, 'Final exact text');
    await save(doc, 1, target);
    await expect(commit(doc, 2, target)).rejects.toThrow();
    expect(decodeEncounterForm(stored().body).fields).toMatchObject({ ward: 'Final exact text' });
    expect(t.db.select().from(patients).get()?.deletedAt).not.toBeNull();
    expect(episodes()[0]?.deletedAt).toBeNull();
  });
  it('separates scopes, refuses stale writers/comparisons and soft-discards only the matching revision', async () => {
    const doc = await document();
    setText(doc, 'Private test text');
    await save(doc);
    await expect(saveEncounterFormDraft(newId(), 'new', patientId, null, doc, 0)).rejects.toThrow();
    const compared = await inspectEncounterForm('new', patientId, null, id, now);
    setText(doc, 'Intervening');
    await save(doc, 1);
    await expect(replaceEncounterFormDraft(id, 'new', patientId, null, doc, compared)).rejects.toThrow();
    await expect(discardEncounterFormDraft(id, 'new', patientId, null, 1)).rejects.toThrow();
    await discardEncounterFormDraft(id, 'new', patientId, null, 2);
    expect(stored().deletedAt).not.toBeNull();
    expect(episodes()).toEqual([]);
    const log = t.db.select().from(auditLog).where(eq(auditLog.action, 'encounter.draftDiscarded')).get()!;
    expect(log.entityId).toBe(id);
    expect(JSON.stringify(log)).not.toContain('Intervening');
    await expect(save(doc, 3)).rejects.toThrow();
  });
  it('refuses unreadable versions and deleted destinations without rewriting the stored body', async () => {
    const doc = await document();
    setText(doc, 'Before');
    await save(doc);
    const corrupt = JSON.stringify({ ...doc, version: 2 });
    t.db.update(encounterFormDrafts).set({ body: corrupt }).where(eq(encounterFormDrafts.id, id)).run();
    await expect(save(doc, 1)).rejects.toThrow('قابل خواندن');
    await expect(commit(doc)).rejects.toThrow('قابل خواندن');
    expect(stored().body).toBe(corrupt);
    t.db
      .update(encounterFormDrafts)
      .set({ body: encodeEncounterForm(doc) })
      .where(eq(encounterFormDrafts.id, id))
      .run();
    const target = await commit(doc);
    t.db.update(encounters).set(softDelete()).where(eq(encounters.id, target)).run();
    await expect(commit(doc)).rejects.toThrow();
    expect(episodes()).toHaveLength(1);
  });
  it('retains a discharge draft when the episode was already clinically closed', async () => {
    const target = await openEncounter({ patientId, kind: 'admission', admittedAt: now });
    const doc = await document('discharge', target);
    setText(doc, 'Retained');
    await save(doc, 0, target);
    await dischargeEncounter(target, { dischargedAt: now, dischargeType: 'improved', nextStatus: 'discharged' });
    await expect(commit(doc, 1, target)).rejects.toThrow();
    const comparison = await inspectEncounterForm('discharge', patientId, target, id, now);
    await expect(replaceEncounterFormDraft(id, 'discharge', patientId, target, doc, comparison)).rejects.toThrow();
    expect(stored().deletedAt).toBeNull();
  });
  it.each([false, true])(
    'accepts current/older backup table sets without losing compatibility (old=%s)',
    async (old) => {
      const doc = await document();
      setText(doc, 'Backup raw');
      doc.fields.date.clockText = '2:';
      await save(doc);
      const path = `/episode-${newId()}.db`;
      t.conn.execSync(`VACUUM INTO '${path}'`);
      t.conn.execSync(`ATTACH DATABASE '${path}' AS source;`);
      if (old) t.conn.execSync('DROP TABLE source.encounter_form_drafts;');
      t.conn.execSync('PRAGMA foreign_keys = OFF;');
      importTables(t.conn, 'source');
      t.conn.execSync('PRAGMA foreign_keys = ON;');
      expect(t.db.select().from(encounterFormDrafts).all()).toHaveLength(old ? 0 : 1);
      if (!old) expect(decodeEncounterForm(stored().body)).toEqual(doc);
      expect(t.conn.getAllSync('PRAGMA foreign_key_check;')).toEqual([]);
    },
  );
});
