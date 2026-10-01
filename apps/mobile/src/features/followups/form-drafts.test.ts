import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { eq } from 'drizzle-orm';

import { auditLog, encounters, followUpFormDrafts, followUps, patients } from '@/db/schema';
import { importTables } from '@/features/backup/import';
import { openEncounter } from '@/features/encounters/queries';
import { createPatient, deletePatient } from '@/features/patients/queries';
import { newId, softDelete } from '@/lib/ids';
import { useTestDatabase } from '@/test/db-client';
import { permission, resetNotifications, scheduled } from '@/test/mocks/notifications';
import { createTestDatabase, type TestDatabase } from '@/test/sqljs';

import {
  decodeFollowUpForm,
  FollowUpFormConflict,
  initialFollowUpFields,
  type FollowUpFormDocument,
} from './form-draft';
import {
  commitFollowUpFormDraft,
  discardFollowUpFormDraft,
  followUpFormQuery,
  inspectFollowUpForm,
  replaceFollowUpFormDraft,
  saveFollowUpFormDraft,
} from './form-draft-queries';

jest.mock('@/db/client', () => jest.requireActual('@/test/db-client'));
jest.mock('@/platform/notifications', () => jest.requireActual('@/test/mocks/notifications'));

let t: TestDatabase;
let patientId: string;
let draftId: string;
const now = new Date(2026, 9, 1, 10);
function document(reason = ''): FollowUpFormDocument {
  const initial = initialFollowUpFields(now);
  return { version: 1, initial, fields: { ...initial, date: { ...initial.date }, reason } };
}
const stored = () => t.db.select().from(followUpFormDrafts).where(eq(followUpFormDrafts.id, draftId)).get()!;
const records = () => t.db.select().from(followUps).all();
const save = (doc = document('Follow the result'), revision = 0, encounterId: string | null = null) =>
  saveFollowUpFormDraft(draftId, patientId, encounterId, doc, revision);
beforeEach(async () => {
  t = useTestDatabase(await createTestDatabase());
  resetNotifications();
  patientId = await createPatient({ firstName: 'Synthetic', lastName: 'Followup' });
  draftId = newId();
});
afterEach(() => {
  jest.restoreAllMocks();
});

describe('raw follow-up drafts on migrated SQLite', () => {
  it('does not create a blank draft, clinical record or reminder for an untouched editor', async () => {
    expect(await save(document())).toBe(0);
    expect(await t.db.select().from(followUpFormDrafts)).toEqual([]);
    expect(records()).toEqual([]);
    expect(scheduled.size).toBe(0);
  });
  it('persists exact invalid raw date/clock but refuses clinical publication', async () => {
    const doc = document('Pending report');
    doc.fields.date = { dateText: '1405/07/', clockText: '2:', customOpen: true };
    expect(await save(doc)).toBe(1);
    expect(decodeFollowUpForm(stored().body)).toEqual(doc);
    await expect(commitFollowUpFormDraft(draftId, patientId, 1, now)).rejects.toThrow('تاریخ');
    doc.fields.date.dateText = '1405/07/09';
    await save(doc, 1);
    await expect(commitFollowUpFormDraft(draftId, patientId, 2, now)).rejects.toThrow('ساعت');
    expect(records()).toEqual([]);
    expect(stored().deletedAt).toBeNull();
    expect(scheduled.size).toBe(0);
  });
  it('rejects unreadable/unknown documents without overwriting stored text', async () => {
    await save();
    const body = JSON.stringify({ ...document('Private text'), version: 2 });
    t.db.update(followUpFormDrafts).set({ body }).where(eq(followUpFormDrafts.id, draftId)).run();
    await expect(save(document('Overwrite'), 1)).rejects.toThrow('قابل خواندن');
    await expect(commitFollowUpFormDraft(draftId, patientId, 1, now)).rejects.toThrow('قابل خواندن');
    expect(stored().body).toBe(body);
    expect(records()).toEqual([]);
  });
  it('publishes and retires atomically, returning one destination for repeated concurrent tokens', async () => {
    await save();
    const ids = await Promise.all([
      commitFollowUpFormDraft(draftId, patientId, 1, now),
      commitFollowUpFormDraft(draftId, patientId, 1, now),
    ]);
    expect(ids[0]).toBe(ids[1]);
    expect(records()).toHaveLength(1);
    expect(stored()).toMatchObject({ revision: 2, committedFollowUpId: ids[0], deletedAt: now });
    expect((await followUpFormQuery(patientId))[0]?.draft).toBeNull();
    t.db.update(followUps).set(softDelete()).where(eq(followUps.id, ids[0]!)).run();
    await expect(commitFollowUpFormDraft(draftId, patientId, 1, now)).rejects.toThrow();
    expect(records()).toHaveLength(1);
  });
  it('rolls back the clinical insert if retiring its draft fails, then retries without duplication', async () => {
    await save();
    t.sqlite.exec(
      "CREATE TRIGGER refuse_retirement BEFORE UPDATE ON follow_up_form_drafts BEGIN SELECT RAISE(ABORT, 'synthetic failure'); END;",
    );
    await expect(commitFollowUpFormDraft(draftId, patientId, 1, now)).rejects.toThrow();
    expect(records()).toEqual([]);
    expect(stored()).toMatchObject({ revision: 1, deletedAt: null, committedFollowUpId: null });
    expect(scheduled.size).toBe(0);
    t.sqlite.exec('DROP TRIGGER refuse_retirement');
    await commitFollowUpFormDraft(draftId, patientId, 1, now);
    expect(records()).toHaveLength(1);
  });
  it.each([false, true])(
    'retains captured encounter context after another admission opens (captured=%s)',
    async (captured) => {
      const old = captured ? await openEncounter({ patientId, kind: 'admission' }) : null;
      await save(document('Old-context report'), 0, old);
      const newer = await openEncounter({ patientId, kind: 'admission' });
      expect(newer).not.toBe(old);
      await commitFollowUpFormDraft(draftId, patientId, 1, now);
      expect(records()[0]!.encounterId).toBe(old);
    },
  );
  it('rejects stale scope, cross-patient operations and a changed displayed comparison', async () => {
    await save();
    await expect(saveFollowUpFormDraft(newId(), patientId, null, document('Competing'), 0)).rejects.toBeInstanceOf(
      FollowUpFormConflict,
    );
    const other = await createPatient({ firstName: 'Other', lastName: 'Synthetic' });
    await expect(saveFollowUpFormDraft(draftId, other, null, document('Wrong patient'), 1)).rejects.toThrow();
    await expect(commitFollowUpFormDraft(draftId, other, 1, now)).rejects.toThrow();
    await expect(discardFollowUpFormDraft(draftId, other, 1)).rejects.toThrow();
    const comparison = await inspectFollowUpForm(patientId, draftId);
    await save(document('Intervening'), 1);
    await expect(replaceFollowUpFormDraft(draftId, patientId, null, document('Mine'), comparison)).rejects.toThrow();
    expect(decodeFollowUpForm(stored().body).fields.reason).toBe('Intervening');
    const fresh = await inspectFollowUpForm(patientId, draftId);
    const result = await replaceFollowUpFormDraft(draftId, patientId, null, document('Mine'), fresh);
    expect(result).toMatchObject({ id: draftId, revision: 3 });
    expect(decodeFollowUpForm(stored().body).fields.reason).toBe('Mine');
  });
  it('does not rebind a compared draft to another encounter or revive a published token', async () => {
    await save();
    const otherContext = await openEncounter({ patientId, kind: 'admission' });
    const comparison = await inspectFollowUpForm(patientId, draftId);
    await expect(
      replaceFollowUpFormDraft(draftId, patientId, otherContext, document('Mine'), comparison),
    ).rejects.toThrow();
    await commitFollowUpFormDraft(draftId, patientId, 1, now);
    const closed = await inspectFollowUpForm(patientId, draftId);
    await expect(replaceFollowUpFormDraft(draftId, patientId, null, document('Duplicate'), closed)).rejects.toThrow();
    expect(records()).toHaveLength(1);
  });
  it('refuses a foreign encounter even in explicit first-write conflict resolution', async () => {
    const other = await createPatient({ firstName: 'Other', lastName: 'Patient' });
    const foreign = await openEncounter({ patientId: other, kind: 'admission' });
    const comparison = await inspectFollowUpForm(patientId, draftId);
    await expect(
      replaceFollowUpFormDraft(draftId, patientId, foreign, document('Wrong context'), comparison),
    ).rejects.toThrow();
    expect(t.db.select().from(followUpFormDrafts).all()).toEqual([]);
  });
  it('keeps raw input for deleted parents while refusing publication or revival', async () => {
    const context = await openEncounter({ patientId, kind: 'admission' });
    await save(document('Saved'), 0, context);
    await deletePatient(patientId);
    await save(document('Final exact text'), 1, context);
    await expect(commitFollowUpFormDraft(draftId, patientId, 2, now)).rejects.toThrow();
    expect(decodeFollowUpForm(stored().body).fields.reason).toBe('Final exact text');
    expect(t.db.select().from(patients).where(eq(patients.id, patientId)).get()!.deletedAt).not.toBeNull();
    expect(records()).toEqual([]);
  });
  it('does not publish under a deleted or foreign encounter', async () => {
    const other = await createPatient({ firstName: 'Other', lastName: 'Context' });
    const foreign = await openEncounter({ patientId: other, kind: 'admission' });
    await expect(save(document('Wrong context'), 0, foreign)).rejects.toThrow();
    const context = await openEncounter({ patientId, kind: 'admission' });
    await save(document('Pending'), 0, context);
    t.db.update(encounters).set(softDelete()).where(eq(encounters.id, context)).run();
    await expect(commitFollowUpFormDraft(draftId, patientId, 1, now)).rejects.toThrow();
    expect(records()).toEqual([]);
  });
  it('keeps one durable clinical record if Android permission is refused', async () => {
    permission.granted = false;
    await save();
    const id = await commitFollowUpFormDraft(draftId, patientId, 1, now);
    expect(records()).toHaveLength(1);
    expect(records()[0]).toMatchObject({ id, notificationId: null });
    expect(stored().committedFollowUpId).toBe(id);
  });
  it('soft-discards only the matching revision and audits the id without text', async () => {
    await save(document('Synthetic private reason'));
    await expect(discardFollowUpFormDraft(draftId, patientId, 0)).rejects.toThrow();
    await discardFollowUpFormDraft(draftId, patientId, 1);
    expect(stored()).toMatchObject({ revision: 2, committedFollowUpId: null });
    expect(stored().deletedAt).not.toBeNull();
    expect(records()).toEqual([]);
    const audit = t.db.select().from(auditLog).where(eq(auditLog.action, 'followup.draftDiscarded')).get()!;
    expect(audit.entityId).toBe(draftId);
    expect(JSON.stringify(audit)).not.toContain('Synthetic private reason');
  });
  it.each([false, true])(
    'restores current raw drafts and accepts older backups missing this table (old=%s)',
    async (old) => {
      const doc = document('Raw backup');
      doc.fields.date.clockText = '2:';
      await save(doc);
      const path = `/followup-${newId()}.db`;
      t.conn.execSync(`VACUUM INTO '${path}'`);
      t.conn.execSync(`ATTACH DATABASE '${path}' AS source`);
      if (old) t.conn.execSync('DROP TABLE source.follow_up_form_drafts');
      await save(document('Changed'), 1);
      t.conn.execSync('PRAGMA foreign_keys = OFF');
      try {
        importTables(t.conn, 'source');
      } finally {
        t.conn.execSync('DETACH DATABASE source');
        t.conn.execSync('PRAGMA foreign_keys = ON');
      }
      if (old) expect(await t.db.select().from(followUpFormDrafts)).toEqual([]);
      else expect(decodeFollowUpForm(stored().body)).toEqual(doc);
      expect(t.db.select().from(patients).where(eq(patients.id, patientId)).get()).toBeDefined();
      expect(t.conn.getAllSync('PRAGMA foreign_key_check')).toEqual([]);
    },
  );
});
