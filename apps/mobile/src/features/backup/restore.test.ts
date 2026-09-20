import { beforeEach, describe, expect, it } from '@jest/globals';

import { auditLog, backupRuns, imagingStudies, notes, patients, settings } from '@/db/schema';
import { newId, stamps } from '@/lib/ids';
import { createTestDatabase, type TestDatabase } from '@/test/sqljs';

import { importTables } from './import';
import { parseManifest } from './manifest';
import { BACKUP_FILE_RE, backupFileName, restoreTargetPath } from './paths';

/*
 * Restore at the database level, the way the phone does it: the backup is a
 * VACUUM INTO copy, attached next to the live database and imported.
 */

let fileCounter = 0;

/** Snapshot `backup` into sql.js's in-memory file system and attach it to `live`. */
function attachAsBackup(live: TestDatabase, backup: TestDatabase): void {
  fileCounter += 1;
  const path = `/restore-test-${fileCounter}.db`;
  backup.conn.execSync(`VACUUM INTO '${path}'`);
  live.conn.execSync(`ATTACH DATABASE '${path}' AS restore_src`);
}

async function addPatient(t: TestDatabase, firstName: string, extra: Partial<typeof patients.$inferInsert> = {}) {
  const id = newId();
  await t.db.insert(patients).values({ id, ...stamps(), firstName, lastName: 'Test', status: 'outpatient', ...extra });
  return id;
}

async function putSetting(t: TestDatabase, key: string, value: unknown) {
  await t.db
    .insert(settings)
    .values({ key, value: JSON.stringify(value), updatedAt: new Date() })
    .onConflictDoUpdate({ target: settings.key, set: { value: JSON.stringify(value) } });
}

async function addAudit(t: TestDatabase, id: string) {
  await t.db.insert(auditLog).values({ id, ...stamps(), at: new Date(), action: 'patient.deleted' });
}

async function addBackupRun(t: TestDatabase, id: string, status: 'running' | 'success') {
  await t.db.insert(backupRuns).values({ id, ...stamps(), startedAt: new Date(), trigger: 'manual', status });
}

const names = async (t: TestDatabase) =>
  (await t.db.select({ n: patients.firstName }).from(patients).orderBy(patients.firstName)).map((r) => r.n);

const settingValue = async (t: TestDatabase, key: string) =>
  (await t.db.select().from(settings)).find((s) => s.key === key)?.value ?? null;

describe('importTables', () => {
  let live: TestDatabase;
  let backup: TestDatabase;

  beforeEach(async () => {
    live = await createTestDatabase();
    backup = await createTestDatabase();
  });

  it('replaces the clinical record with the backup’s', async () => {
    await addPatient(live, 'Current');
    await addPatient(backup, 'Alpha');
    await addPatient(backup, 'Beta');
    attachAsBackup(live, backup);

    const result = importTables(live.conn);

    expect(await names(live)).toEqual(['Alpha', 'Beta']);
    expect(result.rows).toBeGreaterThanOrEqual(2);
    expect(live.conn.getAllSync('PRAGMA foreign_key_check')).toEqual([]);
  });

  it('keeps this phone’s migration history and backup log', async () => {
    await addBackupRun(live, 'run-live', 'success');
    // A backup's own snapshot holds its run still marked "running".
    await addBackupRun(backup, 'run-in-backup', 'running');
    const migrationsBefore = live.conn.getAllSync('SELECT * FROM __drizzle_migrations');
    attachAsBackup(live, backup);

    importTables(live.conn);

    expect((await live.db.select().from(backupRuns)).map((r) => r.id)).toEqual(['run-live']);
    expect(live.conn.getAllSync('SELECT * FROM __drizzle_migrations')).toEqual(migrationsBefore);
  });

  it('keeps this phone’s backup settings and takes every other setting from the backup', async () => {
    await putSetting(live, 'backup.folderUri', 'content://this-phone');
    await putSetting(live, 'lock.enabled', false);
    await putSetting(backup, 'backup.folderUri', 'content://old-phone');
    await putSetting(backup, 'lock.enabled', true);
    attachAsBackup(live, backup);

    importTables(live.conn);

    expect(await settingValue(live, 'backup.folderUri')).toBe('"content://this-phone"');
    expect(await settingValue(live, 'lock.enabled')).toBe('true');
  });

  /*
   * What makes a killed restore recoverable: the marker saying "the files were
   * replaced, the database was not" is an ordinary setting, so the import that
   * commits the new database deletes it in the same transaction. There is no
   * moment where the marker and the data disagree.
   */
  it('clears the restore-in-flight marker in the transaction that commits the data', async () => {
    await putSetting(live, 'restore.inFlight', { dir: 'abc', at: 1 });
    await putSetting(live, 'backup.folderUri', 'content://this-phone');
    attachAsBackup(live, backup);

    importTables(live.conn);

    expect(await settingValue(live, 'restore.inFlight')).toBeNull();
    // And it is not simply that every setting went: the phone's own stayed.
    expect(await settingValue(live, 'backup.folderUri')).toBe('"content://this-phone"');
  });

  it('merges the audit log instead of replacing it', async () => {
    await addAudit(live, 'a-live');
    await addAudit(live, 'a-shared');
    await addAudit(backup, 'a-shared');
    await addAudit(backup, 'a-backup');
    attachAsBackup(live, backup);

    importTables(live.conn);

    const ids = (await live.db.select({ id: auditLog.id }).from(auditLog)).map((r) => r.id).sort();
    expect(ids).toEqual(['a-backup', 'a-live', 'a-shared']);
  });

  it('restores a backup made before a column existed', async () => {
    await addPatient(backup, 'Alpha');
    backup.conn.execSync('ALTER TABLE patients DROP COLUMN summary');
    await addPatient(live, 'Current', { summary: 'to be replaced' });
    attachAsBackup(live, backup);

    importTables(live.conn);

    const rows = await live.db.select({ firstName: patients.firstName, summary: patients.summary }).from(patients);
    expect(rows).toEqual([{ firstName: 'Alpha', summary: null }]);
  });

  it('empties a table the backup does not have', async () => {
    const patientId = await addPatient(live, 'Current');
    await live.db
      .insert(imagingStudies)
      .values({ id: newId(), ...stamps(), patientId, modality: 'ct', status: 'done' });
    backup.conn.execSync('DROP TABLE imaging_studies');
    attachAsBackup(live, backup);

    importTables(live.conn);

    expect(await live.db.select().from(imagingStudies)).toEqual([]);
  });

  it('refuses a backup whose rows point at something that is not there', async () => {
    await addPatient(live, 'Current');
    // A note whose patient is missing from the backup: foreign keys are off
    // during the copy, so this is only caught by the check before commit.
    const alpha = await addPatient(backup, 'Alpha');
    await backup.db
      .insert(notes)
      .values({ id: 'n1', ...stamps(), patientId: alpha, type: 'progress', noteDate: new Date() });
    backup.conn.execSync('PRAGMA foreign_keys = OFF');
    backup.conn.execSync("UPDATE notes SET patient_id = 'ghost-patient' WHERE id = 'n1'");
    attachAsBackup(live, backup);

    // The restore turns enforcement off while the tables are refilled, exactly
    // as importDatabase() does on the phone; the check before commit is what
    // catches this.
    live.conn.execSync('PRAGMA foreign_keys = OFF');
    try {
      expect(() => importTables(live.conn)).toThrow('ارجاع‌های نادرست');
    } finally {
      live.conn.execSync('PRAGMA foreign_keys = ON');
    }
    expect(await names(live)).toEqual(['Current']);
    expect(await live.db.select().from(notes)).toEqual([]);
    expect(live.conn.getAllSync('PRAGMA foreign_key_check')).toEqual([]);
  });

  it('changes nothing when any table fails to import', async () => {
    await addPatient(live, 'Current');
    await addPatient(backup, 'Alpha');
    // Give the backup a row the live schema cannot accept: last_name is NOT
    // NULL on the phone, so this table's import fails part-way through.
    backup.conn.execSync('PRAGMA foreign_keys = OFF');
    backup.conn.execSync('CREATE TABLE patients_loose AS SELECT * FROM patients');
    backup.conn.execSync('DROP TABLE patients');
    backup.conn.execSync('ALTER TABLE patients_loose RENAME TO patients');
    backup.conn.execSync(
      "INSERT INTO patients (id, created_at, updated_at, first_name, last_name, status, starred) VALUES ('p2', 1, 1, 'Broken', NULL, 'outpatient', 0)",
    );
    attachAsBackup(live, backup);

    expect(() => importTables(live.conn)).toThrow();
    expect(await names(live)).toEqual(['Current']);
  });
});

describe('restore paths', () => {
  it('accepts only the database and media files', () => {
    expect(restoreTargetPath('db/medos.db')).toBe('database');
    expect(restoreTargetPath('media/2024/06/abc-123.jpg')).toBe('media');
  });

  it.each([
    'media/../medos.db',
    'media/./x.jpg',
    'media//x.jpg',
    '/media/x.jpg',
    'media/',
    'db/other.db',
    '../../etc/passwd',
    'media/x y.jpg',
    'manifest.json',
  ])('refuses %j', (path) => {
    expect(restoreTargetPath(path)).toBeNull();
  });

  it('names backup files by Jalali date and time, in sortable order', () => {
    const name = backupFileName(new Date(2025, 8, 19, 8, 30, 15), true);
    expect(name).toBe('MedOS-1404-06-28_083015-full.medosbak');
    expect(BACKUP_FILE_RE.test(name)).toBe(true);
    // Names from earlier builds, without seconds, are still recognised.
    expect(BACKUP_FILE_RE.test('MedOS-1404-06-28_0830-db.medosbak')).toBe(true);
    // A copy renamed by a sync app is left alone by rotation.
    expect(BACKUP_FILE_RE.test('MedOS-1404-06-28_0830-db (1).medosbak')).toBe(false);
    const later = backupFileName(new Date(2025, 8, 19, 8, 30, 16), true);
    expect(later > name).toBe(true);
  });
});

describe('parseManifest', () => {
  const valid = {
    app: 'MedOS',
    appVersion: '0.1.0',
    createdAt: new Date(2025, 0, 1).toISOString(),
    schemaMigrations: 1,
    includesMedia: true,
    counts: { patients: 3 },
    mediaFiles: 2,
    mediaBytes: 1024,
    device: 'Pixel',
  };

  it('accepts a manifest this app writes', () => {
    expect(parseManifest(valid)).toEqual(valid);
  });

  it.each([
    ['another app', { ...valid, app: 'Other' }],
    ['a bad date', { ...valid, createdAt: 'yesterday' }],
    ['a negative count', { ...valid, counts: { patients: -1 } }],
    ['a missing field', { ...valid, includesMedia: undefined }],
    ['not an object', 'MedOS'],
  ])('rejects %s', (_, manifest) => {
    expect(() => parseManifest(manifest)).toThrow();
  });
});
