import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { eq } from 'drizzle-orm';

import { tablesOf } from '@/db/query-tables';
import { doctorFormDrafts, doctorProfiles, doctorRatings, doctors, occasions } from '@/db/schema';
import { importTables } from '@/features/backup/import';
import { datasetGeneration, DatasetChangedError } from '@/lib/dataset-write';
import { databaseRows, snapshotDataset } from '@/test/dataset-snapshot';
import { useTestDatabase } from '@/test/db-client';
import { createTestDatabase, type TestDatabase } from '@/test/sqljs';

import { DoctorFormConflict } from './edit-basis';
import {
  decodeDoctorForm,
  encodeDoctorForm,
  initialDoctorForm,
  type DoctorFormDocument,
  type DoctorFormKind,
} from './form-draft';
import {
  commitDoctorFormDraft,
  discardDoctorFormDraft,
  doctorFormQuery,
  inspectDoctorForm,
  replaceDoctorFormDraft,
  saveDoctorFormDraft,
} from './form-draft-queries';
import { createOccasion } from './occasions-queries';
import { createDoctor, doctorQuery, updateDoctor } from './queries';
import { doctorProfileQuery, saveDoctorProfile } from './ratings-queries';

jest.mock('@/db/client', () => jest.requireActual('@/test/db-client'));
jest.mock('@/platform/notifications', () => jest.requireActual('@/test/mocks/notifications'));
let t: TestDatabase;
let doctorId: string;
const now = new Date('2026-10-08T12:00:00Z');
const draft = () => t.db.select().from(doctorFormDrafts).get()!;
function raw(kind: DoctorFormKind): DoctorFormDocument {
  const seed = doctorFormQuery(kind, doctorId).get()!;
  const doc = initialDoctorForm(kind, seed.doctor, seed.profile);
  if (doc.kind === 'directory') {
    doc.fields.notes = '  exact\nEnglish / فارسی  ';
    doc.fields.phone = ' +۱۲۰۲۵۵۵۰۱۲۳ ';
  } else if (doc.kind === 'profile') {
    doc.fields.birthDate = '1400/01/02';
    doc.fields.personalNotes = '  exact\nEnglish / فارسی  ';
  } else {
    doc.fields.scores = { knowledge: 4, teaching: null };
    doc.fields.reasoning = '  exact\nEnglish / فارسی  ';
  }
  return doc;
}
beforeEach(async () => {
  t = useTestDatabase(await createTestDatabase());
  doctorId = await createDoctor({ firstName: 'Synthetic', lastName: 'Colleague', notes: '  original\n note  ' });
});

describe('durable doctor directory/profile/rating forms on migrated SQLite', () => {
  it('watches parent/profile/draft together and also resolves an empty new-directory scope', async () => {
    expect(tablesOf(doctorFormQuery('directory', doctorId))).toEqual([
      'doctors',
      'doctor_profiles',
      'doctor_form_drafts',
    ]);
    expect(doctorFormQuery('directory', null).get()).toEqual({ doctor: null, profile: null, draft: null });
    expect(doctorFormQuery('directory', 'missing').get()).toBeUndefined();
  });
  it.each(['directory', 'profile', 'rating'] as const)(
    'retains exact invalid %s raw input without publishing',
    async (kind) => {
      const doc = raw(kind);
      if (doc.kind === 'directory') doc.fields.firstName = '  ';
      else if (doc.kind === 'profile') doc.fields.birthDate = '۱۴۰۵/';
      else {
        doc.fields.scores = { knowledge: null };
        doc.fields.reasoning = ' \n ';
      }
      const clinical = databaseRows(t);
      expect(await saveDoctorFormDraft('draft', kind, doctorId, doc, 0)).toBe(1);
      expect(decodeDoctorForm(draft().body)).toEqual(doc);
      const once = databaseRows(t);
      expect(await saveDoctorFormDraft('draft', kind, doctorId, doc, 1)).toBe(1);
      expect(databaseRows(t)).toEqual(once);
      await expect(commitDoctorFormDraft('draft', kind, doctorId, 1, now)).rejects.toThrow();
      expect(databaseRows(t).doctors).toEqual(clinical.doctors);
      expect(t.db.select().from(doctorProfiles).all()).toEqual([]);
      expect(t.db.select().from(doctorRatings).all()).toEqual([]);
      expect(draft()).toMatchObject({ revision: 1, deletedAt: null, committedEntityId: null });
    },
  );
  it.each(['directory', 'profile', 'rating'] as const)(
    'publishes %s once and replays without changing rows or timestamps',
    async (kind) => {
      await saveDoctorFormDraft('draft', kind, doctorId, raw(kind), 0);
      const id = await commitDoctorFormDraft('draft', kind, doctorId, 1, now);
      const once = databaseRows(t);
      expect(await commitDoctorFormDraft('draft', kind, doctorId, 1, new Date(now.getTime() + 60000))).toBe(id);
      expect(databaseRows(t)).toEqual(once);
      expect(draft()).toMatchObject({ revision: 2, committedEntityId: id, deletedAt: now });
      await expect(saveDoctorFormDraft('draft', kind, doctorId, raw(kind), 2)).rejects.toThrow(DoctorFormConflict);
      await expect(discardDoctorFormDraft('draft', kind, doctorId, 2)).rejects.toThrow(DoctorFormConflict);
      await expect(
        replaceDoctorFormDraft('draft', kind, doctorId, raw(kind), await inspectDoctorForm('draft', kind, doctorId)),
      ).rejects.toThrow(DoctorFormConflict);
      if (kind === 'directory')
        expect((await doctorQuery(doctorId))[0]).toMatchObject({
          phone: '+12025550123',
          notes: 'exact\nEnglish / فارسی',
        });
      if (kind === 'profile')
        expect((await doctorProfileQuery(doctorId))[0]).toMatchObject({ personalNotes: 'exact\nEnglish / فارسی' });
      if (kind === 'rating')
        expect(t.db.select().from(doctorRatings).all()).toMatchObject([
          { id, knowledge: 4, teaching: null, ratedAt: now },
        ]);
    },
  );
  it.each(['directory', 'profile', 'rating'] as const)(
    'rolls %s publication back if retiring its draft fails, then retries',
    async (kind) => {
      await saveDoctorFormDraft('draft', kind, doctorId, raw(kind), 0);
      const before = databaseRows(t);
      t.sqlite.exec(
        "CREATE TRIGGER fail_doctor_retire BEFORE UPDATE ON doctor_form_drafts BEGIN SELECT RAISE(ABORT, 'synthetic failure'); END",
      );
      await expect(commitDoctorFormDraft('draft', kind, doctorId, 1, now)).rejects.toThrow();
      expect(databaseRows(t)).toEqual(before);
      t.sqlite.exec('DROP TRIGGER fail_doctor_retire');
      await commitDoctorFormDraft('draft', kind, doctorId, 1, now);
      expect(draft().committedEntityId).not.toBeNull();
    },
  );
  it('recovers invalid new-directory raw text without a doctor and creates one only on valid explicit publication', async () => {
    const doc = initialDoctorForm('directory', null, null);
    doc.fields.firstName = '  New  ';
    doc.fields.phone = ' +۱۲۰ ';
    doc.fields.notes = '  raw\n draft  ';
    await saveDoctorFormDraft('new-draft', 'directory', null, doc, 0);
    expect(doctorFormQuery('directory', null).get()?.draft?.body).toBe(encodeDoctorForm(doc));
    await expect(commitDoctorFormDraft('new-draft', 'directory', null, 1, now)).rejects.toThrow('نام خانوادگی');
    expect(t.db.select().from(doctors).all()).toHaveLength(1);
    doc.fields.lastName = '  Synthetic  ';
    await saveDoctorFormDraft('new-draft', 'directory', null, doc, 1);
    const id = await commitDoctorFormDraft('new-draft', 'directory', null, 2, now);
    expect((await doctorQuery(id))[0]).toMatchObject({ firstName: 'New', lastName: 'Synthetic', notes: 'raw\n draft' });
    expect(await commitDoctorFormDraft('new-draft', 'directory', null, 2, now)).toBe(id);
    expect(t.db.select().from(doctors).all()).toHaveLength(2);
    expect(doctorFormQuery('directory', null).get()?.draft).toBeNull();
  });
  it('keeps the stored original directory basis after reopening, merges unrelated fields and refuses same-field conflict', async () => {
    const doc = raw('directory');
    await saveDoctorFormDraft('draft', 'directory', doctorId, doc, 0);
    await updateDoctor(doctorId, { starred: true, tags: ['external'], officeLat: '12.5', notes: 'External conflict' });
    const before = databaseRows(t);
    await expect(commitDoctorFormDraft('draft', 'directory', doctorId, 1, now)).rejects.toThrow(DoctorFormConflict);
    expect(databaseRows(t)).toEqual(before);
    const recovered = decodeDoctorForm(doctorFormQuery('directory', doctorId).get()!.draft!.body);
    expect(recovered).toEqual(doc);
    const shown = await inspectDoctorForm('draft', 'directory', doctorId);
    const next = await replaceDoctorFormDraft('draft', 'directory', doctorId, recovered, shown);
    await commitDoctorFormDraft(next.id, 'directory', doctorId, next.revision, now);
    expect((await doctorQuery(doctorId))[0]).toMatchObject({
      starred: true,
      tags: ['external'],
      officeLat: '12.5',
      notes: 'exact\nEnglish / فارسی',
    });
  });
  it('rebases profile changes only and refuses transferring an old profile draft to a recreated profile', async () => {
    await saveDoctorProfile(doctorId, { personalNotes: 'Original' });
    const doc = raw('profile');
    await saveDoctorFormDraft('draft', 'profile', doctorId, doc, 0);
    await saveDoctorProfile(doctorId, { almaMater: 'External', interests: ['external'], personalNotes: 'Conflict' });
    await expect(commitDoctorFormDraft('draft', 'profile', doctorId, 1, now)).rejects.toThrow(DoctorFormConflict);
    const next = await replaceDoctorFormDraft(
      'draft',
      'profile',
      doctorId,
      doc,
      await inspectDoctorForm('draft', 'profile', doctorId),
    );
    await commitDoctorFormDraft(next.id, 'profile', doctorId, next.revision, now);
    expect((await doctorProfileQuery(doctorId))[0]).toMatchObject({
      almaMater: 'External',
      interests: ['external'],
      personalNotes: 'exact\nEnglish / فارسی',
    });
    const old = (await doctorProfileQuery(doctorId))[0]!;
    const later = raw('profile');
    await saveDoctorFormDraft('later', 'profile', doctorId, later, 0);
    t.db.update(doctorProfiles).set({ deletedAt: now }).where(eq(doctorProfiles.id, old.id)).run();
    await saveDoctorProfile(doctorId, { hometown: 'Replacement' });
    const before = databaseRows(t);
    await expect(commitDoctorFormDraft('later', 'profile', doctorId, 1, now)).rejects.toThrow(DoctorFormConflict);
    await expect(
      replaceDoctorFormDraft(
        'later',
        'profile',
        doctorId,
        later,
        await inspectDoctorForm('later', 'profile', doctorId),
      ),
    ).rejects.toThrow(DoctorFormConflict);
    expect(databaseRows(t)).toEqual(before);
  });
  it('requires a fresh comparison after either the raw branch or published basis changes', async () => {
    const doc = raw('directory');
    await saveDoctorFormDraft('draft', 'directory', doctorId, doc, 0);
    const shown = await inspectDoctorForm('losing', 'directory', doctorId);
    const newer = raw('directory');
    if (newer.kind === 'directory') newer.fields.phone = '+12025550124';
    await saveDoctorFormDraft('draft', 'directory', doctorId, newer, 1);
    const before = databaseRows(t);
    await expect(replaceDoctorFormDraft('losing', 'directory', doctorId, doc, shown)).rejects.toThrow(
      DoctorFormConflict,
    );
    expect(databaseRows(t)).toEqual(before);
    const fresh = await inspectDoctorForm('losing', 'directory', doctorId);
    await updateDoctor(doctorId, { starred: true });
    const after = databaseRows(t);
    await expect(replaceDoctorFormDraft('losing', 'directory', doctorId, doc, fresh)).rejects.toThrow(
      DoctorFormConflict,
    );
    expect(databaseRows(t)).toEqual(after);
  });
  it.each(['directory', 'profile', 'rating'] as const)(
    'checks %s scope, CAS, parent liveness, and soft discard',
    async (kind) => {
      const doc = raw(kind);
      await saveDoctorFormDraft('draft', kind, doctorId, doc, 0);
      const before = databaseRows(t);
      await expect(saveDoctorFormDraft('other', kind, doctorId, doc, 0)).rejects.toThrow(DoctorFormConflict);
      await expect(saveDoctorFormDraft('draft', kind, doctorId, doc, 0)).rejects.toThrow(DoctorFormConflict);
      await expect(commitDoctorFormDraft('draft', kind, doctorId, 0, now)).rejects.toThrow(DoctorFormConflict);
      expect(databaseRows(t)).toEqual(before);
      t.db.update(doctors).set({ deletedAt: now }).where(eq(doctors.id, doctorId)).run();
      expect(await saveDoctorFormDraft('draft', kind, doctorId, doc, 1)).toBe(1);
      await expect(commitDoctorFormDraft('draft', kind, doctorId, 1, now)).rejects.toThrow('حذف شده');
      const body = draft().body;
      await discardDoctorFormDraft('draft', kind, doctorId, 1);
      expect(draft()).toMatchObject({ body, revision: 2, committedEntityId: null });
      expect(draft().deletedAt).not.toBeNull();
      expect(doctorFormQuery(kind, doctorId).get()?.draft).toBeNull();
    },
  );
  it('keeps rating blank axes and history; a concurrent unrelated rating is never replaced', async () => {
    const first = raw('rating');
    await saveDoctorFormDraft('draft', 'rating', doctorId, first, 0);
    await commitDoctorFormDraft('draft', 'rating', doctorId, 1, now);
    await saveDoctorFormDraft('next', 'rating', doctorId, raw('rating'), 0);
    await commitDoctorFormDraft('next', 'rating', doctorId, 1, new Date(now.getTime() + 1000));
    expect(t.db.select().from(doctorRatings).all()).toMatchObject([
      { knowledge: 4, teaching: null },
      { knowledge: 4, teaching: null },
    ]);
  });
  it('atomically marks renamed occasions for repair and rolls that revision back with failed retirement', async () => {
    const occasionId = await createOccasion({
      doctorId,
      kind: 'custom',
      title: 'Synthetic',
      isRecurring: false,
      onDate: '2026-10-09',
    });
    const original = t.db.select().from(occasions).get()!;
    const doc = raw('directory');
    if (doc.kind === 'directory') doc.fields.firstName = 'Renamed';
    await saveDoctorFormDraft('draft', 'directory', doctorId, doc, 0);
    t.sqlite.exec(
      "CREATE TRIGGER fail_rename_retire BEFORE UPDATE ON doctor_form_drafts BEGIN SELECT RAISE(ABORT, 'synthetic failure'); END",
    );
    const before = databaseRows(t);
    await expect(commitDoctorFormDraft('draft', 'directory', doctorId, 1, now)).rejects.toThrow();
    expect(databaseRows(t)).toEqual(before);
    t.sqlite.exec('DROP TRIGGER fail_rename_retire');
    await commitDoctorFormDraft('draft', 'directory', doctorId, 1, now);
    expect(t.db.select().from(occasions).where(eq(occasions.id, occasionId)).get()?.reminderRevision).toBeGreaterThan(
      original.reminderRevision,
    );
  });
  it.each(['directory', 'profile', 'rating'] as const)(
    'fences every old-generation %s save, publication and resolution',
    async (kind) => {
      const doc = raw(kind);
      await saveDoctorFormDraft('draft', kind, doctorId, doc, 0);
      const shown = await inspectDoctorForm('draft', kind, doctorId);
      const generation = datasetGeneration();
      snapshotDataset(t)();
      const before = databaseRows(t);
      await expect(saveDoctorFormDraft('draft', kind, doctorId, doc, 1, generation)).rejects.toThrow(
        DatasetChangedError,
      );
      await expect(commitDoctorFormDraft('draft', kind, doctorId, 1, now, generation)).rejects.toThrow(
        DatasetChangedError,
      );
      await expect(inspectDoctorForm('draft', kind, doctorId, generation)).rejects.toThrow(DatasetChangedError);
      await expect(replaceDoctorFormDraft('draft', kind, doctorId, doc, shown, generation)).rejects.toThrow(
        DatasetChangedError,
      );
      await expect(discardDoctorFormDraft('draft', kind, doctorId, 1, generation)).rejects.toThrow(DatasetChangedError);
      expect(databaseRows(t)).toEqual(before);
    },
  );
  it('restores exact current raw bytes and clears a table absent from an old archive', async () => {
    for (const kind of ['directory', 'profile', 'rating'] as const)
      await saveDoctorFormDraft(kind, kind, doctorId, raw(kind), 0);
    const original = t.db.select().from(doctorFormDrafts).all();
    t.sqlite.exec("VACUUM INTO '/doctor-current.db'");
    t.db.update(doctorFormDrafts).set({ body: 'invalid' }).run();
    t.sqlite.exec("PRAGMA foreign_keys=OFF; ATTACH DATABASE '/doctor-current.db' AS restore_src");
    try {
      importTables(t.conn);
      expect(t.db.select().from(doctorFormDrafts).all()).toEqual(original);
      t.sqlite.exec('DROP TABLE restore_src.doctor_form_drafts');
      importTables(t.conn);
      expect(t.db.select().from(doctorFormDrafts).all()).toEqual([]);
      expect(t.db.select().from(doctorProfiles).all()).toEqual([]);
      expect(t.db.select().from(doctorRatings).all()).toEqual([]);
    } finally {
      t.sqlite.exec('DETACH DATABASE restore_src; PRAGMA foreign_keys=ON');
    }
  });
  it('retains unreadable/future documents and uses generic decoding errors without raw private text', async () => {
    const doc = raw('profile');
    await saveDoctorFormDraft('draft', 'profile', doctorId, doc, 0);
    const body = JSON.stringify({ version: 99, private: 'Private synthetic detail' });
    t.db.update(doctorFormDrafts).set({ body }).run();
    expect(() => decodeDoctorForm(body)).toThrow('قابل خواندن نیست');
    expect(() => decodeDoctorForm(body)).not.toThrow('Private synthetic detail');
    const before = databaseRows(t);
    await expect(saveDoctorFormDraft('draft', 'profile', doctorId, doc, 1)).rejects.toThrow('قابل خواندن نیست');
    await expect(commitDoctorFormDraft('draft', 'profile', doctorId, 1, now)).rejects.toThrow('قابل خواندن نیست');
    await expect(
      replaceDoctorFormDraft('draft', 'profile', doctorId, doc, await inspectDoctorForm('draft', 'profile', doctorId)),
    ).rejects.toThrow('قابل خواندن نیست');
    expect(databaseRows(t)).toEqual(before);
  });
});
