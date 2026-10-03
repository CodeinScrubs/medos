import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { and, eq } from 'drizzle-orm';
import type { AnySQLiteColumn, SQLiteTable } from 'drizzle-orm/sqlite-core';

import {
  captureInbox,
  consultations,
  credentials,
  doctors,
  extensions,
  ideas,
  labValues,
  notes,
  noteVersions,
  patients,
  places,
  prescriptionTemplates,
  settings,
  specialties,
  specialtyProfiles,
  tasks,
  topics,
} from '@/db/schema';
import { matchesSearch } from '@/db/search';
import { reindexCaptures } from '@/features/capture/queries';
import { reindexConsults } from '@/features/consults/queries';
import { reindexDoctors } from '@/features/doctors/queries';
import { reindexIdeas } from '@/features/knowledge/ideas-queries';
import { reindexPrescriptions } from '@/features/knowledge/prescriptions-queries';
import { reindexTopics } from '@/features/knowledge/queries';
import { reindexSpecialtyProfiles } from '@/features/knowledge/specialty-profiles-queries';
import { createLabPanel } from '@/features/labs/queries';
import { reflagLabValuesIfNeeded } from '@/features/labs/reflag';
import { reindexNotes } from '@/features/notes/queries';
import { backfillNoteVersions } from '@/features/notes/version-queries';
import { createPatient, reindexPatients, updatePatient } from '@/features/patients/queries';
import { reindexPlaces } from '@/features/places/queries';
import { reindexTasks } from '@/features/tasks/queries';
import { reindexCredentials } from '@/features/vault/queries';
import { stamps } from '@/lib/ids';
import { useTestDatabase } from '@/test/db-client';
import { createTestDatabase, type TestDatabase } from '@/test/sqljs';

jest.mock('@/db/client', () => jest.requireActual('@/test/db-client'));
jest.mock('@/platform/notifications', () => jest.requireActual('@/test/mocks/notifications'));

let t: TestDatabase;
let patientId: string;
beforeEach(async () => {
  t = useTestDatabase(await createTestDatabase());
  patientId = await createPatient({ firstName: 'Original', lastName: 'Synthetic', status: 'outpatient' });
});
afterEach(() => {
  jest.restoreAllMocks();
});

/** Schedule a real edit immediately after a row snapshot is read. Awaited
 * readers yield to it; a synchronous transaction finishes its read/write unit
 * before it runs. The SQL and edit remain real, not mocked query results. */
function editAfterRead(table: string, work: () => unknown | Promise<unknown>) {
  let armed = true;
  let edit: Promise<unknown> | undefined;
  const prepare = t.sqlite.prepare.bind(t.sqlite);
  jest.spyOn(t.sqlite, 'prepare').mockImplementation((sql, params) => {
    const statement = prepare(sql, params);
    if (sql.includes(`from "${table}"`)) {
      const step = statement.step.bind(statement);
      jest.spyOn(statement, 'step').mockImplementation(() => {
        const next = step();
        if (!next && armed) {
          armed = false;
          queueMicrotask(() => {
            edit = Promise.resolve().then(work);
          });
        }
        return next;
      });
    }
    return statement;
  });
  return async () => {
    await Promise.resolve();
    expect(armed).toBe(false);
    expect(edit).toBeDefined();
    await edit;
  };
}

function legacyNote(id: string, offset = 0) {
  const at = new Date(2025, 0, 1 + offset);
  t.db
    .insert(notes)
    .values({
      id,
      ...stamps(at),
      patientId,
      type: 'event',
      body: 'Legacy synthetic note',
      noteDate: at,
      searchText: '',
    })
    .run();
}

const seed = () => ({ id: 'repair', ...stamps(), searchText: 'obsolete' });
const laterIndex = { searchText: 'updated' };
const searchCases = [
  {
    table: 'notes',
    schema: notes,
    repair: reindexNotes,
    seed: () =>
      t.db
        .insert(notes)
        .values({ ...seed(), patientId, type: 'event', body: 'Original', noteDate: new Date(2025, 0, 1) })
        .run(),
    edit: () =>
      t.db
        .update(notes)
        .set({ body: 'Updated', ...laterIndex })
        .where(eq(notes.id, 'repair'))
        .run(),
  },
  {
    table: 'doctors',
    schema: doctors,
    repair: reindexDoctors,
    seed: () =>
      t.db
        .insert(doctors)
        .values({ ...seed(), firstName: 'Original', lastName: 'Synthetic' })
        .run(),
    edit: () =>
      t.db
        .update(doctors)
        .set({ firstName: 'Updated', ...laterIndex })
        .where(eq(doctors.id, 'repair'))
        .run(),
  },
  {
    table: 'places',
    schema: places,
    repair: reindexPlaces,
    seed: () =>
      t.db
        .insert(places)
        .values({ ...seed(), name: 'Original' })
        .run(),
    edit: () =>
      t.db
        .update(places)
        .set({ name: 'Updated', ...laterIndex })
        .where(eq(places.id, 'repair'))
        .run(),
  },
  {
    table: 'topics',
    schema: topics,
    repair: reindexTopics,
    seed: () =>
      t.db
        .insert(topics)
        .values({ ...seed(), title: 'Original' })
        .run(),
    edit: () =>
      t.db
        .update(topics)
        .set({ title: 'Updated', ...laterIndex })
        .where(eq(topics.id, 'repair'))
        .run(),
  },
  {
    table: 'specialty_profiles',
    schema: specialtyProfiles,
    repair: reindexSpecialtyProfiles,
    seed: () =>
      t.db
        .insert(specialtyProfiles)
        .values({ ...seed(), nameText: 'Original' })
        .run(),
    edit: () =>
      t.db
        .update(specialtyProfiles)
        .set({ nameText: 'Updated', ...laterIndex })
        .where(eq(specialtyProfiles.id, 'repair'))
        .run(),
  },
  {
    table: 'prescription_templates',
    schema: prescriptionTemplates,
    repair: reindexPrescriptions,
    seed: () =>
      t.db
        .insert(prescriptionTemplates)
        .values({ ...seed(), title: 'Original' })
        .run(),
    edit: () =>
      t.db
        .update(prescriptionTemplates)
        .set({ title: 'Updated', ...laterIndex })
        .where(eq(prescriptionTemplates.id, 'repair'))
        .run(),
  },
  {
    table: 'ideas',
    schema: ideas,
    repair: reindexIdeas,
    seed: () =>
      t.db
        .insert(ideas)
        .values({ ...seed(), title: 'Original' })
        .run(),
    edit: () =>
      t.db
        .update(ideas)
        .set({ title: 'Updated', ...laterIndex })
        .where(eq(ideas.id, 'repair'))
        .run(),
  },
  {
    table: 'credentials',
    schema: credentials,
    repair: reindexCredentials,
    seed: () =>
      t.db
        .insert(credentials)
        .values({ ...seed(), systemName: 'Original' })
        .run(),
    edit: () =>
      t.db
        .update(credentials)
        .set({ systemName: 'Updated', ...laterIndex })
        .where(eq(credentials.id, 'repair'))
        .run(),
  },
  {
    table: 'tasks',
    schema: tasks,
    repair: reindexTasks,
    seed: () =>
      t.db
        .insert(tasks)
        .values({ ...seed(), title: 'Original' })
        .run(),
    edit: () =>
      t.db
        .update(tasks)
        .set({ title: 'Updated', ...laterIndex })
        .where(eq(tasks.id, 'repair'))
        .run(),
  },
  {
    table: 'consultations',
    schema: consultations,
    repair: reindexConsults,
    seed: () =>
      t.db
        .insert(consultations)
        .values({ ...seed(), patientId, reason: 'Original' })
        .run(),
    edit: () =>
      t.db
        .update(consultations)
        .set({ reason: 'Updated', ...laterIndex })
        .where(eq(consultations.id, 'repair'))
        .run(),
  },
  {
    table: 'capture_inbox',
    schema: captureInbox,
    repair: reindexCaptures,
    seed: () =>
      t.db
        .insert(captureInbox)
        .values({ ...seed(), text: 'Original', capturedAt: new Date(2025, 0, 1) })
        .run(),
    edit: () =>
      t.db
        .update(captureInbox)
        .set({ text: 'Updated', ...laterIndex })
        .where(eq(captureInbox.id, 'repair'))
        .run(),
  },
];

function searchCount(table: SQLiteTable & { id: AnySQLiteColumn; searchText: AnySQLiteColumn }) {
  return t.db
    .select({ id: table.id })
    .from(table)
    .where(and(...matchesSearch(table.searchText, 'Updated')))
    .all().length;
}

const relatedCases = [
  {
    label: 'doctor specialty',
    read: 'specialties',
    schema: doctors,
    repair: reindexDoctors,
    seed: () =>
      t.db
        .insert(doctors)
        .values({ ...seed(), firstName: 'Synthetic', lastName: 'Doctor', specialtyId: 'specialty' })
        .run(),
    edit: () => t.db.update(doctors).set(laterIndex).where(eq(doctors.id, 'repair')).run(),
  },
  {
    label: 'knowledge specialty',
    read: 'specialties',
    schema: topics,
    repair: reindexTopics,
    seed: () =>
      t.db
        .insert(topics)
        .values({ ...seed(), title: 'Synthetic topic', specialtyId: 'specialty' })
        .run(),
    edit: () => t.db.update(topics).set(laterIndex).where(eq(topics.id, 'repair')).run(),
  },
  {
    label: 'specialty profile',
    read: 'specialties',
    schema: specialtyProfiles,
    repair: reindexSpecialtyProfiles,
    seed: () =>
      t.db
        .insert(specialtyProfiles)
        .values({ ...seed(), specialtyId: 'specialty' })
        .run(),
    edit: () => t.db.update(specialtyProfiles).set(laterIndex).where(eq(specialtyProfiles.id, 'repair')).run(),
  },
];

describe('repair reads and writes belong to one current snapshot', () => {
  it.each(searchCases)('cannot overwrite an acknowledged newer $table search index', async (test) => {
    test.seed();
    const settle = editAfterRead(test.table, test.edit);
    await test.repair();
    await settle();
    expect(searchCount(test.schema)).toBe(1);
  });
  it('cannot erase a newer patient name from search when an edit follows its read', async () => {
    await t.db.update(patients).set({ searchText: 'obsolete' }).where(eq(patients.id, patientId));
    const settle = editAfterRead('patients', () => updatePatient(patientId, { firstName: 'Updated' }));
    await reindexPatients();
    await settle();
    expect(t.db.select().from(patients).get()!.firstName).toBe('Updated');
    expect(
      t.db
        .select()
        .from(patients)
        .where(and(...matchesSearch(patients.searchText, 'Updated')))
        .all(),
    ).toHaveLength(1);
  });

  it.each(relatedCases)('uses the current related name for $label', async (test) => {
    t.db
      .insert(specialties)
      .values({ id: 'specialty', ...stamps(), nameFa: 'Original' })
      .run();
    test.seed();
    const settle = editAfterRead(test.read, () => {
      t.db.transaction((tx) => {
        tx.update(specialties).set({ nameFa: 'Updated' }).where(eq(specialties.id, 'specialty')).run();
        test.edit();
      });
    });
    await test.repair();
    await settle();
    expect(searchCount(test.schema)).toBe(1);
  });

  it('cannot rebuild a topic with its teacher name from an old related snapshot', async () => {
    t.db
      .insert(doctors)
      .values({ id: 'teacher', ...stamps(), firstName: 'Original', lastName: 'Teacher' })
      .run();
    t.db
      .insert(topics)
      .values({ ...seed(), title: 'Synthetic topic', taughtById: 'teacher' })
      .run();
    const settle = editAfterRead('doctors', () => {
      t.db.transaction((tx) => {
        tx.update(doctors).set({ firstName: 'Updated' }).where(eq(doctors.id, 'teacher')).run();
        tx.update(topics).set(laterIndex).where(eq(topics.id, 'repair')).run();
      });
    });
    await reindexTopics();
    await settle();
    expect(searchCount(topics)).toBe(1);
  });

  it('cannot rebuild an extension with its place name from an old related snapshot', async () => {
    t.db
      .insert(places)
      .values({ id: 'place', ...stamps(), name: 'Original' })
      .run();
    t.db
      .insert(extensions)
      .values({ ...seed(), placeId: 'place', department: 'Synthetic department', extension: '1234' })
      .run();
    const settle = editAfterRead('places', () => {
      t.db.transaction((tx) => {
        tx.update(places)
          .set({ name: 'Updated', ...laterIndex })
          .where(eq(places.id, 'place'))
          .run();
        tx.update(extensions).set(laterIndex).where(eq(extensions.id, 'repair')).run();
      });
    });
    await reindexPlaces();
    await settle();
    expect(searchCount(extensions)).toBe(1);
  });

  it('cannot apply an old value/range verdict to a newer lab value', async () => {
    await createLabPanel({
      patientId,
      collectedAt: new Date(2025, 0, 1),
      source: 'manual',
      values: [{ analyte: 'Synthetic', value: '5', refLow: 1, refHigh: 10 }],
    });
    const row = t.db.select().from(labValues).get()!;
    t.db.update(labValues).set({ flag: 'low' }).where(eq(labValues.id, row.id)).run();
    const settle = editAfterRead('lab_values', () => {
      // A fully acknowledged correction, including its correctly derived flag.
      t.db.update(labValues).set({ value: '30', valueNum: 30, flag: 'high' }).where(eq(labValues.id, row.id)).run();
    });
    await reflagLabValuesIfNeeded();
    await settle();
    expect(t.db.select().from(labValues).get()).toMatchObject({ value: '30', valueNum: 30, flag: 'high' });
  });

  it('rolls back all lab flags and leaves the version unset after a later SQL failure', async () => {
    await createLabPanel({
      patientId,
      collectedAt: new Date(2025, 0, 1),
      source: 'manual',
      values: [
        { analyte: 'First synthetic', value: '5', refLow: 1, refHigh: 10 },
        { analyte: 'Second synthetic', value: '5', refLow: 1, refHigh: 10 },
      ],
    });
    t.db.update(labValues).set({ flag: 'low' }).run();
    const before = t.db.select().from(labValues).all();
    t.sqlite.exec(
      "CREATE TRIGGER refuse_reflag BEFORE UPDATE ON lab_values WHEN OLD.analyte = 'Second synthetic' BEGIN SELECT RAISE(ABORT, 'synthetic failure'); END;",
    );
    await expect(reflagLabValuesIfNeeded()).rejects.toThrow('synthetic failure');
    expect(t.db.select().from(labValues).all()).toEqual(before);
    expect(t.db.select().from(settings).where(eq(settings.key, 'labs.flagVersion')).get()).toBeUndefined();
    t.sqlite.exec('DROP TRIGGER refuse_reflag');
    await reflagLabValuesIfNeeded();
    expect(t.db.select().from(labValues).all()).toEqual(before.map((row) => ({ ...row, flag: 'normal' })));
    expect(t.db.select().from(settings).where(eq(settings.key, 'labs.flagVersion')).get()!.value).toBe('1');
  });

  it('concurrent legacy-history repairs cannot create duplicate baseline versions', async () => {
    legacyNote('legacy');
    await Promise.all([backfillNoteVersions(), backfillNoteVersions()]);
    expect(t.db.select().from(noteVersions).all()).toHaveLength(1);
  });

  it('rolls back the complete legacy-history pass on a later SQL failure', async () => {
    legacyNote('first');
    legacyNote('second', 1);
    t.sqlite.exec(
      "CREATE TRIGGER refuse_baseline BEFORE INSERT ON note_versions WHEN NEW.note_id = 'second' BEGIN SELECT RAISE(ABORT, 'synthetic failure'); END;",
    );
    await expect(backfillNoteVersions()).rejects.toThrow('synthetic failure');
    expect(t.db.select().from(noteVersions).all()).toHaveLength(0);
    t.sqlite.exec('DROP TRIGGER refuse_baseline');
    expect(await backfillNoteVersions()).toBe(2);
    expect(t.db.select().from(noteVersions).all()).toHaveLength(2);
  });
});
