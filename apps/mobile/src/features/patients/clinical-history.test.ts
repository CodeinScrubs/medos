import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { and, asc, eq } from 'drizzle-orm';

import { withClinicalHistory } from '@/db/clinical-history';
import {
  auditLog,
  clinicalVersions,
  diagnoses,
  labPanels,
  labValues,
  orders,
  patients,
  type ClinicalVersion,
} from '@/db/schema';
import { importTables } from '@/features/backup/import';
import { createConsult, markConsultRequested, saveConsultAnswerDraft } from '@/features/consults/queries';
import { addDiagnosis, deleteDiagnosis, updateDiagnosis } from '@/features/diagnoses/queries';
import { dischargeEncounterInTransaction, openEncounter } from '@/features/encounters/queries';
import { reconcileAllPatientStatuses } from '@/features/encounters/status';
import { createFollowUp } from '@/features/followups/queries';
import { createImagingStudy } from '@/features/imaging/queries';
import { createOrder, setOrderStatus } from '@/features/kardex/queries';
import { createLabPanel, deleteLabPanel, updateLabPanel } from '@/features/labs/queries';
import { reflagLabValuesIfNeeded } from '@/features/labs/reflag';
import { recordVital } from '@/features/vitals/queries';
import { decodeClinicalSnapshot } from '@/lib/clinical-history';
import { stamps, touch } from '@/lib/ids';
import { databaseRows, snapshotDataset } from '@/test/dataset-snapshot';
import { useTestDatabase } from '@/test/db-client';
import { createTestDatabase, type TestDatabase } from '@/test/sqljs';

import { deletedClinicalQuery, restoreClinicalRecord } from './clinical-trash-queries';
import { clinicalHistoryQuery, clinicalVersionQuery } from './history-queries';
import {
  addPatientContact,
  createPatient,
  createPatientInTransaction,
  deletePatient,
  updatePatient,
  updatePatientInTransaction,
} from './queries';

jest.mock('@/db/client', () => jest.requireActual('@/test/db-client'));
jest.mock('@/platform/notifications', () => jest.requireActual('@/test/mocks/notifications'));
let t: TestDatabase, patientId: string;
const now = new Date('2026-10-11T09:00:00.123Z');
const versions = (kind: ClinicalVersion['kind'], id: string) =>
  t.db
    .select()
    .from(clinicalVersions)
    .where(and(eq(clinicalVersions.kind, kind), eq(clinicalVersions.recordId, id)))
    .orderBy(asc(clinicalVersions.sequence))
    .all();
beforeEach(async () => {
  t = useTestDatabase(await createTestDatabase());
  patientId = t.db.transaction((tx) =>
    createPatientInTransaction(
      tx,
      { firstName: 'Synthetic', lastName: 'History', allergies: '  Penicillin\n', pastMedicalHistory: 'HTN\n DM' },
      now,
    ),
  );
});

describe('ordinary clinical mutations and permanent exact history', () => {
  it('preserves before/after fields including clears and same-ms corrections with monotonic per-record sequence', async () => {
    t.db.transaction((tx) => updatePatientInTransaction(tx, patientId, { allergies: null, summary: 'First' }, now));
    t.db.transaction((tx) => updatePatientInTransaction(tx, patientId, { summary: 'Second' }, now));
    t.db.transaction((tx) =>
      updatePatientInTransaction(tx, patientId, { summary: 'Backwards clock' }, new Date(now.getTime() - 1000)),
    );
    const rows = versions('patient', patientId);
    expect(rows.map((row) => row.sequence)).toEqual([1, 2, 3, 4]);
    expect(rows.map((row) => decodeClinicalSnapshot(row.body)?.record.fields.summary)).toEqual([
      null,
      'First',
      'Second',
      'Backwards clock',
    ]);
    expect(decodeClinicalSnapshot(rows[0]!.body)?.record.fields).toMatchObject({
      allergies: '  Penicillin\n',
      pastMedicalHistory: 'HTN\n DM',
    });
    expect(decodeClinicalSnapshot(rows[1]!.body)?.record.fields.allergies).toBeNull();
    const detail = (await clinicalVersionQuery(patientId, rows[3]!.id))[0]!;
    expect(decodeClinicalSnapshot(detail.previousBody!)?.record.fields.summary).toBe('Second');
  });
  it('ignores touches/reindexed content and exact unchanged writes', async () => {
    await updatePatient(patientId, { allergies: '  Penicillin\n' });
    t.db.transaction((tx) =>
      withClinicalHistory(tx, 'patient', patientId, now, () =>
        tx
          .update(patients)
          .set({ searchText: 'rebuild', ...touch(new Date(now.getTime() + 1)) })
          .where(eq(patients.id, patientId))
          .run(),
      ),
    );
    expect(versions('patient', patientId)).toHaveLength(1);
  });
  it.each([
    ['age_years', '9007199254740993'],
    ['age_years', "'not-a-number'"],
    ['starred', '2'],
    ['created_at', '8640000000000001'],
    ['created_at', '1760000000000.5'],
  ])('refuses lossy imported %s=%s without changing any field or version', async (column, literal) => {
    // Hard-coded synthetic SQL is necessary: a JS parameter would round int64
    // before SQLite ever received the witness.
    t.sqlite.exec(`UPDATE patients SET ${column} = ${literal}`);
    const before = databaseRows(t);
    const exactBefore = t.sqlite.exec(`SELECT typeof(${column}), cast(${column} AS TEXT) FROM patients`);
    await expect(updatePatient(patientId, { summary: 'Must not publish' })).rejects.toThrow('تاریخچه');
    expect(databaseRows(t)).toEqual(before);
    expect(t.sqlite.exec(`SELECT typeof(${column}), cast(${column} AS TEXT) FROM patients`)).toEqual(exactBefore);
  });
  it('keeps a legitimate large REAL lab double and its exact raw clinical text', async () => {
    const panel = await createLabPanel({
      patientId,
      source: 'manual',
      collectedAt: now,
      values: [{ analyte: 'Synthetic', value: '9007199254740992', unit: 'synthetic' }],
    });
    await updateLabPanel(panel, {
      name: 'Corrected heading',
      collectedAt: now,
      source: 'manual',
      values: [{ analyte: 'Synthetic', value: '9007199254740992', unit: 'synthetic' }],
    });
    const latest = decodeClinicalSnapshot(versions('lab', panel).at(-1)!.body)!;
    expect(latest.values![0]!.fields.value).toBe('9007199254740992');
    expect(latest.values![0]!.fields.valueNum).toBe(9007199254740992);
  });
  it.each(['mg/dL', 'mmol/L'] as const)(
    'retains fractional glucose in INTEGER-affinity storage with %s',
    async (unit) => {
      const id = await recordVital({ patientId, bloodSugar: 2.5, bloodSugarUnit: unit, measuredAt: now });
      const body = decodeClinicalSnapshot(versions('vital', id)[0]!.body)!;
      expect(body.record.fields.bloodSugar).toBe(2.5);
      expect(body.record.fields.bloodSugarUnit).toBe(unit);
      expect(t.sqlite.exec('SELECT typeof(blood_sugar), blood_sugar FROM vitals')[0]!.values).toEqual([['real', 2.5]]);
    },
  );
  it('starts a legacy record with its real prior baseline, without invented old edits or times', async () => {
    const legacy = 'legacy';
    t.db
      .insert(patients)
      .values({
        id: legacy,
        firstName: 'Legacy',
        lastName: 'Synthetic',
        allergies: 'Old',
        status: 'outpatient',
        ...stamps(new Date(1)),
      })
      .run();
    t.db.transaction((tx) => updatePatientInTransaction(tx, legacy, { allergies: 'Corrected' }, now));
    const rows = versions('patient', legacy);
    expect(rows.map((row) => row.reason)).toEqual(['baseline', 'edited']);
    expect(rows.map((row) => row.recordedAt)).toEqual([now, now]);
    expect(decodeClinicalSnapshot(rows[0]!.body)?.record.fields.createdAt).toBe(1);
    expect(decodeClinicalSnapshot(rows[0]!.body)?.record.fields.allergies).toBe('Old');
  });
  it('records normal creation for every supported clinical kind', async () => {
    const episode = await openEncounter({ patientId, kind: 'admission', admittedAt: now });
    const contact = await addPatientContact(patientId, { name: 'Synthetic companion', phone: '0000000' });
    const diagnosis = await addDiagnosis({ patientId, title: 'Synthetic diagnosis' });
    const vital = await recordVital({ patientId, temperature: 37, measuredAt: now });
    const lab = await createLabPanel({
      patientId,
      source: 'manual',
      collectedAt: now,
      values: [{ analyte: 'Synthetic', value: '<5', unit: null }],
    });
    const imaging = await createImagingStudy({ patientId, modality: 'ct', status: 'done' });
    const order = await createOrder({ patientId, kind: 'drug', name: 'Synthetic order' });
    const consult = await createConsult({ patientId, reason: 'Synthetic question' });
    const followup = await createFollowUp({
      patientId,
      reason: 'Synthetic follow-up',
      dueAt: new Date(now.getTime() + 3600000),
      priority: 'normal',
      channel: 'call',
    });
    for (const [kind, id] of [
      ['patient', patientId],
      ['contact', contact],
      ['encounter', episode],
      ['diagnosis', diagnosis],
      ['vital', vital],
      ['lab', lab],
      ['imaging', imaging],
      ['order', order],
      ['consult', consult],
      ['followup', followup],
    ] as const) {
      const first = versions(kind, id)[0]!;
      expect(first.reason).toBe('created');
      expect(first.patientId).toBe(patientId);
      expect(decodeClinicalSnapshot(first.body)?.record.fields.id).toBe(id);
    }
    expect(decodeClinicalSnapshot(versions('lab', lab)[0]!.body)?.values?.[0]?.fields.value).toBe('<5');
  });
  it('captures a whole lab before replacement and does not revive separately deleted values on restore', async () => {
    const lab = await createLabPanel({
      patientId,
      source: 'manual',
      collectedAt: now,
      values: [
        { analyte: 'Hb', value: '<5', unit: null },
        { analyte: 'WBC', value: '7500', unit: '/uL' },
      ],
    });
    const original = t.db.select().from(labValues).where(eq(labValues.panelId, lab)).all();
    await updateLabPanel(lab, {
      source: 'manual',
      collectedAt: now,
      values: [{ analyte: 'Hb', value: '10', unit: 'g/dL' }],
    });
    expect(
      decodeClinicalSnapshot(versions('lab', lab)[0]!.body)?.values?.map((v) => [
        v.fields.analyte,
        v.fields.value,
        v.fields.unit,
      ]),
    ).toEqual([
      ['Hb', '<5', null],
      ['WBC', '7500', '/uL'],
    ]);
    expect(decodeClinicalSnapshot(versions('lab', lab)[1]!.body)?.values).toHaveLength(1);
    await deleteLabPanel(lab);
    const tombstone = (await deletedClinicalQuery({ patientId, kind: 'lab' }))[0]!;
    await restoreClinicalRecord('lab', lab, tombstone.expectedBasis, now);
    expect(versions('lab', lab).map((r) => r.reason)).toEqual(['created', 'edited', 'deleted', 'restored']);
    expect(
      original.every((v) => t.db.select().from(labValues).where(eq(labValues.id, v.id)).get()!.deletedAt !== null),
    ).toBe(true);
  });
  it('ends only active/held orders of the discharged episode and preserves the exact prior course', async () => {
    const episode = await openEncounter({ patientId, kind: 'admission', admittedAt: now });
    const running = await createOrder({ patientId, kind: 'drug', name: 'Running', dose: '10 mg', frequency: 'BID' });
    const held = await createOrder({ patientId, kind: 'drug', name: 'Held' });
    await setOrderStatus(held, 'held');
    const standing = t.db.transaction((tx) => {
      const id = 'standing';
      tx.insert(orders)
        .values({ id, patientId, encounterId: null, kind: 'drug', name: 'Standing', status: 'active', ...stamps(now) })
        .run();
      return id;
    });
    const discharge = new Date(now.getTime() + 86400000);
    t.db.transaction((tx) =>
      dischargeEncounterInTransaction(
        tx,
        episode,
        { dischargedAt: discharge, dischargeType: 'improved', nextStatus: 'followup' },
        discharge,
      ),
    );
    expect(versions('order', running).map((r) => decodeClinicalSnapshot(r.body)?.record.fields.status)).toEqual([
      'active',
      'completed',
    ]);
    expect(versions('order', held).map((r) => decodeClinicalSnapshot(r.body)?.record.fields.status)).toEqual([
      'active',
      'held',
      'completed',
    ]);
    expect(decodeClinicalSnapshot(versions('order', running)[0]!.body)?.record.fields).toMatchObject({
      dose: '10 mg',
      frequency: 'BID',
    });
    expect(t.db.select().from(orders).where(eq(orders.id, standing)).get()!.status).toBe('active');
    expect(decodeClinicalSnapshot(versions('patient', patientId).at(-1)!.body)?.record.fields.status).toBe('followup');
    expect(decodeClinicalSnapshot(versions('encounter', episode).at(-1)!.body)?.record.fields.dischargedAt).toBe(
      discharge.getTime(),
    );
  });
  it('does not turn consult reply keystrokes into clinical versions', async () => {
    const consult = await createConsult({ patientId, reason: 'Question' });
    await markConsultRequested(consult, now);
    const before = versions('consult', consult);
    await saveConsultAnswerDraft(consult, { response: 'Partial answer', instruction: 'Partial follow-up' }, 0);
    expect(versions('consult', consult)).toEqual(before);
  });
  it('retains deleted-record history and excludes another patient from detail access', async () => {
    const diagnosis = await addDiagnosis({ patientId, title: 'Before' });
    await updateDiagnosis(diagnosis, { title: 'After' });
    await deleteDiagnosis(diagnosis);
    const other = await createPatient({ firstName: 'Other', lastName: 'Synthetic' });
    expect(await clinicalVersionQuery(other, versions('diagnosis', diagnosis)[0]!.id)).toEqual([]);
    expect((await clinicalHistoryQuery(patientId)).filter((r) => r.kind === 'diagnosis')).toHaveLength(3);
    await deletePatient(patientId);
    expect(versions('diagnosis', diagnosis)).toHaveLength(3);
    expect(await clinicalHistoryQuery(patientId)).toEqual([]);
  });
});

describe('failure and compatibility boundaries', () => {
  it('rolls back encounter/patient/order/search/audit changes if history cannot be written', async () => {
    const episode = await openEncounter({ patientId, kind: 'admission', admittedAt: now, ward: 'Synthetic ward' });
    await createOrder({ patientId, kind: 'drug', name: 'Synthetic active' });
    const before = databaseRows(t);
    t.sqlite.exec(
      "CREATE TRIGGER reject_history BEFORE INSERT ON clinical_versions BEGIN SELECT RAISE(ABORT, 'Synthetic history failure'); END",
    );
    expect(() =>
      t.db.transaction((tx) =>
        dischargeEncounterInTransaction(
          tx,
          episode,
          { dischargedAt: now, dischargeType: 'improved', nextStatus: 'discharged' },
          now,
        ),
      ),
    ).toThrow();
    expect(databaseRows(t)).toEqual(before);
  });
  it('rolls back deletion and its new versions if the required audit fails', async () => {
    const diagnosis = await addDiagnosis({ patientId, title: 'Synthetic' });
    const before = databaseRows(t);
    t.sqlite.exec(
      "CREATE TRIGGER reject_audit BEFORE INSERT ON audit_log BEGIN SELECT RAISE(ABORT, 'Synthetic audit failure'); END",
    );
    await expect(deleteDiagnosis(diagnosis)).rejects.toThrow();
    expect(databaseRows(t)).toEqual(before);
  });
  it('rejects a lazy Drizzle/foreign thenable callback before it can silently evade history', () => {
    const before = databaseRows(t);
    expect(() =>
      t.db.transaction((tx) =>
        withClinicalHistory(
          tx,
          'patient',
          patientId,
          now,
          // Deliberately simulate an untyped builder; normal TypeScript rejects this callback.
          (() => tx.update(patients).set({ summary: 'Must not publish' }).where(eq(patients.id, patientId))) as never,
        ),
      ),
    ).toThrow('هم‌زمان');
    expect(databaseRows(t)).toEqual(before);
  });
  it('refuses re-parenting and rolls every field back', async () => {
    const diagnosis = await addDiagnosis({ patientId, title: 'Synthetic' });
    const other = await createPatient({ firstName: 'Other', lastName: 'Synthetic' });
    const before = databaseRows(t);
    expect(() =>
      t.db.transaction((tx) =>
        withClinicalHistory(tx, 'diagnosis', diagnosis, now, () =>
          tx
            .update(diagnoses)
            .set({ patientId: other, title: 'Must not move' })
            .where(eq(diagnoses.id, diagnosis))
            .run(),
        ),
      ),
    ).toThrow('مالکیت');
    expect(databaseRows(t)).toEqual(before);
    expect(versions('diagnosis', diagnosis)).toHaveLength(1);
  });
  it("does not record another patient's lab value during startup reflag", async () => {
    const other = await createPatient({ firstName: 'Other', lastName: 'Synthetic' });
    t.db
      .insert(labPanels)
      .values({ id: 'legacy-panel', patientId, collectedAt: now, source: 'manual', ...stamps(now) })
      .run();
    t.db
      .insert(labValues)
      .values({
        id: 'foreign-value',
        panelId: 'legacy-panel',
        patientId: other,
        analyte: 'Synthetic foreign',
        value: '<5',
        refLow: 3,
        refHigh: 100,
        flag: 'normal',
        ...stamps(now),
      })
      .run();
    const before = databaseRows(t);
    await expect(reflagLabValuesIfNeeded(now)).resolves.toBeUndefined();
    const after = databaseRows(t);
    for (const [table, rows] of Object.entries(before))
      if (table !== 'settings' && table !== 'audit_log') expect(after[table]).toEqual(rows);
    expect(versions('lab', 'legacy-panel')).toEqual([]);
  });
  it('records a legacy status repair exactly once, with an explicit repair reason', async () => {
    t.db
      .insert(patients)
      .values({ id: 'legacy-status', firstName: 'Legacy', lastName: 'Synthetic', status: 'admitted', ...stamps(now) })
      .run();
    await reconcileAllPatientStatuses();
    expect(versions('patient', 'legacy-status').map((r) => r.reason)).toEqual(['baseline', 'reconciled']);
    await reconcileAllPatientStatuses();
    expect(versions('patient', 'legacy-status')).toHaveLength(2);
  });
  it('keeps current history verbatim during real SQL dataset replacement, without manufactured versions', async () => {
    await updatePatient(patientId, { allergies: 'Changed' });
    const rows = databaseRows(t);
    const replace = snapshotDataset(t);
    await updatePatient(patientId, { allergies: 'Later' });
    replace();
    expect(databaseRows(t).clinical_versions).toEqual(rows.clinical_versions);
    expect(t.db.select().from(auditLog).all()).toHaveLength(0);
  });
  it('clears newer-dataset versions when restoring an old archive with no clinical history table', async () => {
    const replace = snapshotDataset(t);
    // Construct an independent old source with the same clinical rows, no new table.
    t.sqlite.exec("VACUUM INTO '/old-history-free.db'");
    t.sqlite.exec("ATTACH DATABASE '/old-history-free.db' AS old_fixture");
    t.sqlite.exec('DROP TABLE old_fixture.clinical_versions');
    t.sqlite.exec('DETACH DATABASE old_fixture');
    t.sqlite.exec("ATTACH DATABASE '/old-history-free.db' AS restore_src");
    t.sqlite.exec('PRAGMA foreign_keys = OFF');
    importTables(t.conn);
    t.sqlite.exec('DETACH DATABASE restore_src');
    t.sqlite.exec('PRAGMA foreign_keys = ON');
    expect(t.db.select().from(clinicalVersions).all()).toEqual([]);
    expect(t.db.select().from(patients).where(eq(patients.id, patientId)).get()).toBeDefined();
    replace();
    expect(versions('patient', patientId)).toHaveLength(1);
  });
  it('paginates all same-time records deterministically and fetches only one body on expansion', async () => {
    for (let i = 0; i < 47; i++)
      t.db.transaction((tx) => updatePatientInTransaction(tx, patientId, { summary: `Summary${i}` }, now));
    const first = await clinicalHistoryQuery(patientId, undefined, 20);
    expect(first).toHaveLength(21);
    expect(first[0]).not.toHaveProperty('body');
    const second = await clinicalHistoryQuery(patientId, first[19], 20);
    const third = await clinicalHistoryQuery(patientId, second[19], 20);
    const all = [...first.slice(0, 20), ...second.slice(0, 20), ...third];
    expect(all).toHaveLength(48);
    expect(new Set(all.map((r) => r.id)).size).toBe(48);
    expect(all.map((r) => r.sequence)).toEqual(Array.from({ length: 48 }, (_, i) => 48 - i));
    expect(await clinicalVersionQuery(patientId, first[0]!.id)).toHaveLength(1);
  });
  it('retains future/misowned versions verbatim and withholds their title from the patient list', async () => {
    const body =
      '{"version":99,"kind":"patient","record":{"fields":{"id":"other","firstName":"Must not show"},"dates":[]}}';
    t.db
      .insert(clinicalVersions)
      .values({
        id: 'unsupported',
        patientId,
        kind: 'patient',
        recordId: patientId,
        sequence: 2,
        reason: 'edited',
        recordedAt: now,
        body,
        ...stamps(now),
      })
      .run();
    await updatePatient(patientId, { summary: 'Genuine correction' });
    expect(versions('patient', patientId).map((r) => r.reason)).toEqual(['created', 'edited', 'baseline', 'edited']);
    expect(versions('patient', patientId)[1]!.body).toBe(body);
    expect((await clinicalHistoryQuery(patientId)).find((r) => r.id === 'unsupported')!.title).toBe('');
  });
});
