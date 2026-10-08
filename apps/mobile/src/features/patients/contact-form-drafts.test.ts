import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { eq } from 'drizzle-orm';

import { tablesOf } from '@/db/query-tables';
import { contactFormDrafts, patientContacts } from '@/db/schema';
import { importTables } from '@/features/backup/import';
import { DatasetChangedError, datasetGeneration } from '@/lib/dataset-write';
import { databaseRows, snapshotDataset } from '@/test/dataset-snapshot';
import { useTestDatabase } from '@/test/db-client';
import { createTestDatabase, type TestDatabase } from '@/test/sqljs';

import {
  ContactFormConflict,
  contactFormValues,
  decodeContactForm,
  encodeContactForm,
  initialContactForm,
  type ContactFormDocument,
} from './contact-form-draft';
import {
  commitContactFormDraft,
  contactFormQuery,
  discardContactFormDraft,
  inspectContactForm,
  replaceContactFormDraft,
  saveContactFormDraft,
} from './contact-form-queries';
import { createPatient, deletePatient } from './queries';

jest.mock('@/db/client', () => jest.requireActual('@/test/db-client'));
jest.mock('@/platform/notifications', () => jest.requireActual('@/test/mocks/notifications'));
let t: TestDatabase;
let patientId: string;
const raw = (): ContactFormDocument => ({
  version: 1,
  fields: { name: '  Companion  ', relation: 'همراه', phone: '+12025550123', notes: '  unfinished\nEnglish / فارسی  ' },
});
const draft = () => t.db.select().from(contactFormDrafts).get()!;
const contacts = () => t.db.select().from(patientContacts).all();
beforeEach(async () => {
  t = useTestDatabase(await createTestDatabase());
  patientId = await createPatient({ firstName: 'Synthetic', lastName: 'Companion' });
});

describe('raw companion details and atomic publication on migrated SQLite', () => {
  it('observes patient and draft together and creates nothing for an untouched form', async () => {
    expect(tablesOf(contactFormQuery(patientId))).toEqual(['patients', 'contact_form_drafts']);
    const before = databaseRows(t);
    expect(await saveContactFormDraft('draft', patientId, initialContactForm(), 0)).toBe(0);
    expect(databaseRows(t)).toEqual(before);
  });
  it('preserves exact incomplete fields without publishing a contact', async () => {
    const document = raw();
    document.fields.phone = '  +۱۲۰۲  ';
    expect(await saveContactFormDraft('draft', patientId, document, 0)).toBe(1);
    expect(decodeContactForm(draft().body)).toEqual(document);
    expect(await saveContactFormDraft('draft', patientId, document, 1)).toBe(1);
    await expect(commitContactFormDraft('draft', patientId, 1)).rejects.toThrow('کامل نیست');
    expect(contacts()).toEqual([]);
    expect(draft()).toMatchObject({ revision: 1, deletedAt: null, committedContactId: null });
  });
  it('publishes once and replays the same committed token without new timestamps or rows', async () => {
    await saveContactFormDraft('draft', patientId, raw(), 0);
    const id = await commitContactFormDraft('draft', patientId, 1);
    const once = databaseRows(t);
    expect(await commitContactFormDraft('draft', patientId, 1)).toBe(id);
    expect(databaseRows(t)).toEqual(once);
    expect(contacts()).toMatchObject([
      { id, name: 'Companion', phone: '+12025550123', relation: 'همراه', notes: 'unfinished\nEnglish / فارسی' },
    ]);
    expect(draft()).toMatchObject({ revision: 2, committedContactId: id });
    expect(draft().deletedAt).not.toBeNull();
    await expect(saveContactFormDraft('draft', patientId, raw(), 2)).rejects.toThrow(ContactFormConflict);
    await expect(discardContactFormDraft('draft', patientId, 2)).rejects.toThrow(ContactFormConflict);
  });
  it('rolls back contact insertion if draft retirement fails, then permits a successful retry', async () => {
    await saveContactFormDraft('draft', patientId, raw(), 0);
    const before = databaseRows(t);
    t.sqlite.exec(
      "CREATE TRIGGER fail_contact_retire BEFORE UPDATE ON contact_form_drafts BEGIN SELECT RAISE(ABORT, 'synthetic failure'); END",
    );
    await expect(commitContactFormDraft('draft', patientId, 1)).rejects.toThrow();
    expect(databaseRows(t)).toEqual(before);
    t.sqlite.exec('DROP TRIGGER fail_contact_retire');
    await commitContactFormDraft('draft', patientId, 1);
    expect(contacts()).toHaveLength(1);
  });
  it('refuses wrong parent, stale revision and a competing open draft', async () => {
    await saveContactFormDraft('draft', patientId, raw(), 0);
    const other = await createPatient({ firstName: 'Synthetic', lastName: 'Other' });
    const before = databaseRows(t);
    await expect(saveContactFormDraft('draft', other, raw(), 1)).rejects.toThrow(ContactFormConflict);
    await expect(saveContactFormDraft('other-draft', patientId, raw(), 0)).rejects.toThrow(ContactFormConflict);
    await expect(commitContactFormDraft('draft', patientId, 0)).rejects.toThrow(ContactFormConflict);
    await expect(discardContactFormDraft('draft', other, 1)).rejects.toThrow(ContactFormConflict);
    expect(databaseRows(t)).toEqual(before);
  });
  it('keeps raw input on a deleted patient while refusing publication', async () => {
    await deletePatient(patientId);
    await saveContactFormDraft('draft', patientId, raw(), 0);
    expect(contactFormQuery(patientId).get()?.patient.deletedAt).not.toBeNull();
    const before = databaseRows(t);
    await expect(commitContactFormDraft('draft', patientId, 1)).rejects.toThrow('در دسترس نیست');
    expect(databaseRows(t)).toEqual(before);
    expect(decodeContactForm(draft().body)).toEqual(raw());
  });
  it('requires a fresh comparison if a third write happens before keeping this page', async () => {
    await saveContactFormDraft('draft', patientId, raw(), 0);
    const shown = await inspectContactForm('losing-draft', patientId);
    const newer = raw();
    newer.fields.notes = 'Changed after comparison';
    await saveContactFormDraft('draft', patientId, newer, 1);
    const before = databaseRows(t);
    await expect(replaceContactFormDraft('losing-draft', patientId, raw(), shown)).rejects.toThrow(ContactFormConflict);
    expect(databaseRows(t)).toEqual(before);
    const next = await replaceContactFormDraft(
      'losing-draft',
      patientId,
      raw(),
      await inspectContactForm('losing-draft', patientId),
    );
    expect(next).toEqual({ id: 'draft', revision: 3 });
    expect(decodeContactForm(draft().body)).toEqual(raw());
    expect(contacts()).toEqual([]);
  });
  it('never reopens a retired publication through keep/discard callbacks', async () => {
    await saveContactFormDraft('draft', patientId, raw(), 0);
    await commitContactFormDraft('draft', patientId, 1);
    const shown = await inspectContactForm('draft', patientId);
    const before = databaseRows(t);
    await expect(replaceContactFormDraft('draft', patientId, raw(), shown)).rejects.toThrow(ContactFormConflict);
    await expect(discardContactFormDraft('draft', patientId, 1)).rejects.toThrow(ContactFormConflict);
    expect(databaseRows(t)).toEqual(before);
  });
  it('soft-discards only the acknowledged draft and retains its body', async () => {
    await saveContactFormDraft('draft', patientId, raw(), 0);
    const body = draft().body;
    await discardContactFormDraft('draft', patientId, 1);
    expect(draft()).toMatchObject({ body, revision: 2, committedContactId: null });
    expect(draft().deletedAt).not.toBeNull();
    expect(contactFormQuery(patientId).get()?.draft).toBeNull();
    expect(contacts()).toEqual([]);
  });
  it('rejects every old-generation write/resolution even when IDs and revisions are unchanged', async () => {
    await saveContactFormDraft('draft', patientId, raw(), 0);
    const shown = await inspectContactForm('draft', patientId);
    const generation = datasetGeneration();
    snapshotDataset(t)();
    const before = databaseRows(t);
    await expect(saveContactFormDraft('draft', patientId, raw(), 1, generation)).rejects.toThrow(DatasetChangedError);
    await expect(commitContactFormDraft('draft', patientId, 1, generation)).rejects.toThrow(DatasetChangedError);
    await expect(inspectContactForm('draft', patientId, generation)).rejects.toThrow(DatasetChangedError);
    await expect(replaceContactFormDraft('draft', patientId, raw(), shown, generation)).rejects.toThrow(
      DatasetChangedError,
    );
    await expect(discardContactFormDraft('draft', patientId, 1, generation)).rejects.toThrow(DatasetChangedError);
    expect(databaseRows(t)).toEqual(before);
  });
  it('restores current raw bytes and clears a table absent from an older backup', async () => {
    await saveContactFormDraft('draft', patientId, raw(), 0);
    const body = draft().body;
    t.sqlite.exec("VACUUM INTO '/contact-current.db'");
    t.db
      .update(contactFormDrafts)
      .set({ body: encodeContactForm(initialContactForm()) })
      .run();
    t.sqlite.exec("PRAGMA foreign_keys=OFF; ATTACH DATABASE '/contact-current.db' AS restore_src");
    try {
      importTables(t.conn);
      expect(draft().body).toBe(body);
      t.sqlite.exec('DROP TABLE restore_src.contact_form_drafts');
      importTables(t.conn);
      expect(t.db.select().from(contactFormDrafts).all()).toEqual([]);
      expect(contacts()).toEqual([]);
    } finally {
      t.sqlite.exec('DETACH DATABASE restore_src; PRAGMA foreign_keys=ON');
    }
  });
  it('preserves unknown/corrupt bytes and never prints raw content in decoding errors', async () => {
    await saveContactFormDraft('draft', patientId, raw(), 0);
    const body = JSON.stringify({ version: 99, private: 'Private synthetic detail' });
    t.db.update(contactFormDrafts).set({ body }).where(eq(contactFormDrafts.id, 'draft')).run();
    expect(() => decodeContactForm(body)).toThrow('قابل خواندن نیست');
    expect(() => decodeContactForm(body)).not.toThrow('Private synthetic detail');
    await expect(saveContactFormDraft('draft', patientId, raw(), 1)).rejects.toThrow('قابل خواندن نیست');
    await expect(commitContactFormDraft('draft', patientId, 1)).rejects.toThrow('قابل خواندن نیست');
    expect(draft().body).toBe(body);
    expect(decodeContactForm(encodeContactForm(raw()))).toEqual(raw());
  });
  it('normalizes a complete phone only at publication and rejects a blank or partial number', () => {
    const document = raw();
    document.fields.phone = ' +۱۲۰۲۵۵۵۰۱۲۳ ';
    expect(contactFormValues(document).phone).toBe('+12025550123');
    document.fields.phone = '123';
    expect(() => contactFormValues(document)).toThrow('کامل نیست');
    document.fields.phone = '';
    expect(() => contactFormValues(document)).toThrow('لازم است');
  });
});
