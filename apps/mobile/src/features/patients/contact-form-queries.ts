import { and, eq, isNull } from 'drizzle-orm';

import { audit } from '@/db/audit';
import { db, type DbTransaction } from '@/db/client';
import { contactFormDrafts, patientContacts, patients, type ContactFormDraft } from '@/db/schema';
import { datasetGeneration, withDatasetWrite } from '@/lib/dataset-write';
import { softDelete, stamps, touch } from '@/lib/ids';

import {
  ContactFormConflict,
  contactFormValues,
  decodeContactForm,
  encodeContactForm,
  initialContactForm,
  type ContactFormDocument,
} from './contact-form-draft';
import { addPatientContactInTransaction } from './queries';

const openTarget = (patientId: string) =>
  and(eq(contactFormDrafts.patientId, patientId), isNull(contactFormDrafts.deletedAt));

/** Include a deleted patient so their unfinished draft can still be copied/discarded. */
export function contactFormQuery(patientId: string, reader: Pick<typeof db, 'select'> = db) {
  return reader
    .select({ patient: patients, draft: contactFormDrafts })
    .from(patients)
    .leftJoin(contactFormDrafts, openTarget(patientId))
    .where(eq(patients.id, patientId))
    .limit(1);
}
export type ContactFormRow = Awaited<ReturnType<typeof contactFormQuery>>[number];
export type ContactFormComparison = { row: ContactFormRow; original: ContactFormDraft | null };
function exists(tx: DbTransaction, patientId: string) {
  if (!tx.select({ id: patients.id }).from(patients).where(eq(patients.id, patientId)).get())
    throw new ContactFormConflict();
}
function context(row: ContactFormDraft, patientId: string) {
  if (row.patientId !== patientId) throw new ContactFormConflict();
}

/** CAS, never validation/publication: even an incomplete number has a durable raw copy. */
export async function saveContactFormDraft(
  id: string,
  patientId: string,
  document: ContactFormDocument,
  expectedRevision: number,
  generation = datasetGeneration(),
): Promise<number> {
  return withDatasetWrite(generation, async () =>
    db.transaction((tx) => {
      const body = encodeContactForm(document);
      exists(tx, patientId);
      const current = tx.select().from(contactFormDrafts).where(eq(contactFormDrafts.id, id)).get();
      if (!current) {
        if (expectedRevision !== 0 || tx.select().from(contactFormDrafts).where(openTarget(patientId)).get())
          throw new ContactFormConflict();
        if (body === encodeContactForm(initialContactForm())) return 0;
        tx.insert(contactFormDrafts)
          .values({ id, patientId, body, revision: 1, ...stamps() })
          .run();
        return 1;
      }
      context(current, patientId);
      if (current.deletedAt || current.committedContactId || current.revision !== expectedRevision)
        throw new ContactFormConflict();
      decodeContactForm(current.body);
      if (current.body === body) return current.revision;
      const revision = current.revision + 1;
      tx.update(contactFormDrafts)
        .set({ body, revision, ...touch() })
        .where(eq(contactFormDrafts.id, id))
        .run();
      return revision;
    }),
  );
}

/** Contact insertion and draft retirement commit together; a repeated token inserts nothing. */
export async function commitContactFormDraft(
  id: string,
  patientId: string,
  expectedRevision: number,
  generation = datasetGeneration(),
): Promise<string> {
  return withDatasetWrite(generation, async () =>
    db.transaction((tx) => {
      const row = tx.select().from(contactFormDrafts).where(eq(contactFormDrafts.id, id)).get();
      if (!row) throw new ContactFormConflict();
      context(row, patientId);
      if (
        !tx
          .select({ id: patients.id })
          .from(patients)
          .where(and(eq(patients.id, patientId), isNull(patients.deletedAt)))
          .get()
      )
        throw new Error('پروندهٔ بیمار در دسترس نیست؛ پیش‌نویس همراه نگه داشته شد.');
      if (row.committedContactId && row.revision === expectedRevision + 1) {
        const contact = tx.select().from(patientContacts).where(eq(patientContacts.id, row.committedContactId)).get();
        if (!contact || contact.patientId !== patientId || contact.deletedAt) throw new ContactFormConflict();
        return contact.id;
      }
      if (row.deletedAt || row.committedContactId || row.revision !== expectedRevision) throw new ContactFormConflict();
      const contactId = addPatientContactInTransaction(tx, patientId, contactFormValues(decodeContactForm(row.body)));
      tx.update(contactFormDrafts)
        .set({ committedContactId: contactId, revision: row.revision + 1, ...softDelete() })
        .where(eq(contactFormDrafts.id, id))
        .run();
      return contactId;
    }),
  );
}

export async function inspectContactForm(
  id: string,
  patientId: string,
  generation = datasetGeneration(),
): Promise<ContactFormComparison> {
  return withDatasetWrite(generation, async () =>
    db.transaction((tx) => {
      const row = contactFormQuery(patientId, tx).get();
      if (!row) throw new ContactFormConflict();
      const original = tx.select().from(contactFormDrafts).where(eq(contactFormDrafts.id, id)).get() ?? null;
      if (original) context(original, patientId);
      return { row, original };
    }),
  );
}

/** Replace only the exact draft shown by Compare; never restore an already published token. */
export async function replaceContactFormDraft(
  id: string,
  patientId: string,
  document: ContactFormDocument,
  shown: ContactFormComparison,
  generation = datasetGeneration(),
): Promise<{ id: string; revision: number }> {
  return withDatasetWrite(generation, async () =>
    db.transaction((tx) => {
      const body = encodeContactForm(document);
      exists(tx, patientId);
      if (shown.row.patient.id !== patientId) throw new ContactFormConflict();
      const live = tx.select().from(contactFormDrafts).where(openTarget(patientId)).get();
      if (live?.id !== shown.row.draft?.id || live?.revision !== shown.row.draft?.revision)
        throw new ContactFormConflict();
      const original = tx.select().from(contactFormDrafts).where(eq(contactFormDrafts.id, id)).get();
      if (original) {
        context(original, patientId);
        if (original.deletedAt || original.committedContactId) throw new ContactFormConflict();
      }
      if (live) {
        decodeContactForm(live.body);
        const revision = live.revision + 1;
        tx.update(contactFormDrafts)
          .set({ body, revision, ...touch() })
          .where(eq(contactFormDrafts.id, live.id))
          .run();
        return { id: live.id, revision };
      }
      if (original) throw new ContactFormConflict();
      tx.insert(contactFormDrafts)
        .values({ id, patientId, body, revision: 1, ...stamps() })
        .run();
      return { id, revision: 1 };
    }),
  );
}

export async function discardContactFormDraft(
  id: string,
  patientId: string,
  expectedRevision: number,
  generation = datasetGeneration(),
): Promise<void> {
  return withDatasetWrite(generation, async () => {
    db.transaction((tx) => {
      const row = tx.select().from(contactFormDrafts).where(eq(contactFormDrafts.id, id)).get();
      if (!row) {
        if (expectedRevision !== 0 || tx.select().from(contactFormDrafts).where(openTarget(patientId)).get())
          throw new ContactFormConflict();
        return;
      }
      context(row, patientId);
      if (row.deletedAt && !row.committedContactId && row.revision === expectedRevision + 1) return;
      if (row.deletedAt || row.committedContactId || row.revision !== expectedRevision) throw new ContactFormConflict();
      tx.update(contactFormDrafts)
        .set({ revision: row.revision + 1, ...softDelete() })
        .where(eq(contactFormDrafts.id, id))
        .run();
    });
    await audit('contact.draftDiscarded', { entityType: 'contact_form_draft', entityId: id });
  });
}
