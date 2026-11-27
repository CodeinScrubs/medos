import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { and, eq, isNull, ne, or } from 'drizzle-orm';

import { tablesOf } from '@/db/query-tables';
import {
  attachments,
  auditLog,
  clinicalVersions,
  consultations,
  diagnoses,
  encounters,
  followUps,
  imagingStudies,
  labPanels,
  labValues,
  notes,
  orders,
  patientContacts,
  patients,
  tasks,
  vitals,
} from '@/db/schema';
import { deleteDiagnosis } from '@/features/diagnoses/queries';
import { createLabPanelInTransaction, deleteLabPanel, updateLabPanelInTransaction } from '@/features/labs/queries';
import { stamps } from '@/lib/ids';
import { databaseRows } from '@/test/dataset-snapshot';
import { useTestDatabase } from '@/test/db-client';
import { createTestDatabase, type TestDatabase } from '@/test/sqljs';

import {
  CLINICAL_TRASH_KINDS,
  deletedClinicalCountQuery,
  deletedClinicalQuery,
  restoreClinicalRecord,
  type ClinicalTrashCursor,
  type ClinicalTrashKind,
} from './clinical-trash-queries';

jest.mock('@/db/client', () => jest.requireActual('@/test/db-client'));
jest.mock('@/platform/notifications', () => jest.requireActual('@/test/mocks/notifications'));

const createdAt = new Date('2026-01-01T10:00:00.000Z');
const deletedAt = new Date('2026-01-02T10:00:00.000Z');
const restoredAt = new Date('2026-01-03T10:00:00.000Z');
const patientId = 'synthetic-patient';
const otherId = 'synthetic-other';
const childKinds = CLINICAL_TRASH_KINDS.filter((kind) => kind !== 'encounter' && kind !== 'contact');
const clinicalTables = {
  lab: labPanels,
  imaging: imagingStudies,
  vital: vitals,
  order: orders,
  consult: consultations,
  diagnosis: diagnoses,
  encounter: encounters,
  contact: patientContacts,
  followup: followUps,
};
let t: TestDatabase;

function seedPatient(id = patientId) {
  t.db
    .insert(patients)
    .values({
      id,
      ...stamps(createdAt),
      firstName: 'Synthetic',
      lastName: id,
      status: 'admitted',
      searchText: 'synthetic patient',
    })
    .run();
}

function seedEncounter(id: string, owner = patientId, deleted: Date | null = null) {
  t.db
    .insert(encounters)
    .values({
      id,
      ...stamps(createdAt),
      patientId: owner,
      kind: 'admission',
      admittedAt: createdAt,
      isActive: false,
      deletedAt: deleted,
    })
    .run();
}

function seed(kind: ClinicalTrashKind, id: string = kind, owner = patientId, encounterId: string | null = null) {
  const base = { id, ...stamps(createdAt), deletedAt, patientId: owner, encounterId };
  switch (kind) {
    case 'contact':
      t.db
        .insert(patientContacts)
        .values({
          id,
          ...stamps(createdAt),
          deletedAt,
          patientId: owner,
          name: 'Synthetic companion',
          phone: '+12025550123',
          notes: 'Synthetic private contact note',
          isPrimary: true,
        })
        .run();
      break;
    case 'followup':
      t.db
        .insert(followUps)
        .values({
          ...base,
          dueAt: createdAt,
          reason: 'Synthetic follow-up',
          status: 'pending',
          outcome: 'Synthetic retained outcome',
          channel: 'lab',
          priority: 'high',
        })
        .run();
      break;
    case 'lab':
      t.db
        .insert(labPanels)
        .values({
          ...base,
          name: 'Synthetic CBC',
          collectedAt: createdAt,
          source: 'manual',
          notes: 'Synthetic raw panel',
        })
        .run();
      break;
    case 'imaging':
      t.db
        .insert(imagingStudies)
        .values({
          ...base,
          modality: 'ct',
          region: 'Synthetic region',
          studyDate: createdAt,
          status: 'reviewed',
          accessNotes: 'Synthetic hidden login hint',
          accessUrl: 'https://invalid.example/hidden',
          reportText: 'Synthetic full report',
        })
        .run();
      break;
    case 'vital':
      t.db
        .insert(vitals)
        .values({
          ...base,
          measuredAt: createdAt,
          temperature: 37.3,
          bloodSugar: 92,
          bloodSugarUnit: null,
          urineOutput: 'Synthetic measured text',
        })
        .run();
      break;
    case 'order':
      t.db
        .insert(orders)
        .values({
          ...base,
          name: 'Synthetic drug',
          status: 'discontinued',
          endAt: deletedAt,
          dose: 'Synthetic original dose',
          isPrn: true,
          prnCondition: 'Synthetic condition',
        })
        .run();
      break;
    case 'consult':
      t.db
        .insert(consultations)
        .values({
          ...base,
          reason: 'Synthetic clinical question',
          status: 'answered',
          requestedAt: createdAt,
          respondedAt: deletedAt,
          response: 'Synthetic answer',
          draftResponse: 'Synthetic hidden uncommitted response',
          draftInstruction: 'Synthetic hidden uncommitted instruction',
          draftRevision: 5,
        })
        .run();
      break;
    case 'diagnosis':
      t.db
        .insert(diagnoses)
        .values({
          ...base,
          title: 'Synthetic rare diagnosis',
          kind: 'rule_out',
          status: 'ruled_out',
          onsetDate: '2025-12-31',
          notes: 'Synthetic original rationale',
        })
        .run();
      break;
    case 'encounter':
      t.db
        .insert(encounters)
        .values({
          id,
          ...stamps(createdAt),
          deletedAt,
          patientId: owner,
          kind: 'admission',
          admittedAt: createdAt,
          admittedAtHasTime: false,
          dischargedAt: deletedAt,
          dischargeType: 'referred',
          outcomeNotes: 'Synthetic original outcome',
          chiefComplaint: 'Synthetic historical admission',
          isActive: true,
        })
        .run();
      break;
  }
  return id;
}

function read(kind: ClinicalTrashKind, id: string = kind) {
  const table = clinicalTables[kind];
  return t.db.select().from(table).where(eq(table.id, id)).get()!;
}

function shown(kind: ClinicalTrashKind, id: string = kind) {
  return deletedClinicalQuery({ kind }, null, 100)
    .all()
    .find((row) => row.id === id)!;
}

async function refuse(kind: ClinicalTrashKind, id: string, basis = shown(kind, id).expectedBasis) {
  const before = databaseRows(t);
  await expect(restoreClinicalRecord(kind, id, basis, restoredAt)).rejects.toThrow();
  expect(databaseRows(t)).toEqual(before);
}

beforeEach(async () => {
  t = useTestDatabase(await createTestDatabase());
  seedPatient();
  seedPatient(otherId);
});

describe('bounded clinical trash reads', () => {
  it('limits short metadata before primary-key basis reads and never builds clinical JSON for counts', () => {
    const query = deletedClinicalQuery({}, null, 20).toSQL();
    const statement = t.sqlite.prepare(`EXPLAIN QUERY PLAN ${query.sql}`);
    const plan: string[] = [];
    try {
      statement.bind(query.params as (string | number | null)[]);
      while (statement.step()) plan.push(String(statement.getAsObject().detail));
    } finally {
      statement.free();
    }
    expect(plan).toContain('CO-ROUTINE clinical_page');
    expect(plan.filter((detail) => detail.includes('CORRELATED SCALAR SUBQUERY'))).toHaveLength(
      2 * CLINICAL_TRASH_KINDS.length,
    );
    for (const table of [
      'lab_panels',
      'imaging_studies',
      'vitals',
      'orders',
      'consultations',
      'diagnoses',
      'encounters',
      'patient_contacts',
      'follow_ups',
    ])
      expect(plan).toContain(`SEARCH ${table} USING INDEX sqlite_autoindex_${table}_1 (id=?)`);
    const count = deletedClinicalCountQuery().toSQL().sql;
    expect(count).not.toMatch(/json_object|json_array|printf|report_text|access_notes|draft_response|outcome_notes/);
  });

  it('projects clear patient and clinical identity without hidden payload, with explicit live-query tables', () => {
    for (const kind of CLINICAL_TRASH_KINDS) seed(kind);
    const query = deletedClinicalQuery();
    const rows = query.all();
    expect(rows).toHaveLength(CLINICAL_TRASH_KINDS.length);
    for (const row of rows) {
      expect(row).toMatchObject({
        patientId,
        firstName: 'Synthetic',
        lastName: patientId,
        deletedAt,
        expectedBasis: expect.stringMatching(/^[a-f0-9]{64}$/),
      });
      expect(row.title).toBeTruthy();
      expect(Object.keys(row).sort()).toEqual(
        [
          'at',
          'deletedAt',
          'encounterId',
          'expectedBasis',
          'firstName',
          'id',
          'kind',
          'lastName',
          'patientId',
          'title',
        ].sort(),
      );
    }
    expect(JSON.stringify(rows)).not.toMatch(/hidden|uncommitted|login|invalid\.example|full report/);
    const expected = [
      'consultations',
      'diagnoses',
      'encounters',
      'imaging_studies',
      'lab_panels',
      'orders',
      'patients',
      'vitals',
      'patient_contacts',
      'follow_ups',
    ].sort();
    expect(tablesOf(query).sort()).toEqual([...expected, 'clinical_versions'].sort());
    expect(tablesOf(deletedClinicalCountQuery()).sort()).toEqual(expected);
    expect(tablesOf(deletedClinicalQuery({ kind: 'lab' })).sort()).toEqual([
      'clinical_versions',
      'lab_panels',
      'patients',
    ]);
  });

  it('uses stable global keyset pages with equal timestamps and applies all filters before LIMIT', () => {
    for (const kind of CLINICAL_TRASH_KINDS) seed(kind);
    for (const id of ['lab-a', 'lab-b', 'lab-c', 'lab-d', 'lab-e']) seed('lab', id);
    seed('lab', 'other-lab', otherId);
    const all = deletedClinicalQuery({}, null, 100).all();
    expect(deletedClinicalCountQuery().get()?.count).toBe(all.length);
    let cursor: ClinicalTrashCursor | null = null;
    const seen: string[] = [];
    for (let page = 0; page < 10; page += 1) {
      const rows = deletedClinicalQuery({}, cursor, 3).all();
      expect(rows.length).toBeLessThanOrEqual(4);
      const visible = rows.slice(0, 3);
      seen.push(...visible.map((row) => `${row.kind}:${row.id}`));
      if (rows.length <= 3) break;
      cursor = visible[visible.length - 1]!;
    }
    expect(seen).toEqual(all.map((row) => `${row.kind}:${row.id}`));
    expect(new Set(seen).size).toBe(all.length);
    const filtered = deletedClinicalQuery({ kind: 'lab', patientId: otherId }, null, 1).all();
    expect(filtered.map((row) => row.id)).toEqual(['other-lab']);
    expect(deletedClinicalCountQuery({ kind: 'lab', patientId: otherId }).get()?.count).toBe(1);
    expect(deletedClinicalCountQuery({ patientId }).get()?.count).toBe(CLINICAL_TRASH_KINDS.length + 5);
  });

  it('keeps blocked and missing-owner tombstones readable and countable', async () => {
    seed('lab');
    seed('imaging', 'orphan');
    t.db.update(patients).set({ deletedAt }).where(eq(patients.id, patientId)).run();
    t.sqlite.exec('PRAGMA foreign_keys = OFF');
    t.db
      .update(imagingStudies)
      .set({ patientId: 'synthetic-missing-owner' })
      .where(eq(imagingStudies.id, 'orphan'))
      .run();
    t.sqlite.exec('PRAGMA foreign_keys = ON');
    expect(deletedClinicalCountQuery().get()?.count).toBe(2);
    expect(shown('imaging', 'orphan')).toMatchObject({
      patientId: 'synthetic-missing-owner',
      firstName: null,
      lastName: null,
    });
    await refuse('lab', 'lab');
    await refuse('imaging', 'orphan');
  });

  it('validates the closed kind allowlist, cursors and bounded limit instead of accepting arbitrary table names', () => {
    expect(() => deletedClinicalQuery({ kind: 'patients' as ClinicalTrashKind })).toThrow();
    expect(() => deletedClinicalCountQuery({ kind: 'patient' as ClinicalTrashKind })).toThrow();
    for (const limit of [0, -1, 101, 1.5, Infinity, NaN]) expect(() => deletedClinicalQuery({}, null, limit)).toThrow();
    expect(() => deletedClinicalQuery({}, { deletedAt: new Date(NaN), kind: 'lab', id: '' })).toThrow();
  });
});

describe('clinical restore transactions', () => {
  it('refuses an unused old restore choice after a complete same-millisecond restore/delete cycle', async () => {
    jest.useFakeTimers({ now: deletedAt });
    try {
      seed('diagnosis');
      t.db.update(diagnoses).set({ updatedAt: deletedAt }).where(eq(diagnoses.id, 'diagnosis')).run();
      const original = read('diagnosis');
      const oldBasis = shown('diagnosis').expectedBasis;
      await restoreClinicalRecord('diagnosis', 'diagnosis', oldBasis, deletedAt);
      await deleteDiagnosis('diagnosis');
      expect(read('diagnosis')).toEqual(original);
      expect(shown('diagnosis').expectedBasis).not.toBe(oldBasis);
      await refuse('diagnosis', 'diagnosis', oldBasis);
    } finally {
      jest.useRealTimers();
    }
  });
  it.each(CLINICAL_TRASH_KINDS)(
    'restores only %s, retaining exact payload and creating id-only audit plus permanent history',
    async (kind) => {
      seed(kind);
      const original = read(kind);
      await restoreClinicalRecord(kind, kind, shown(kind).expectedBasis, restoredAt);
      expect(read(kind)).toEqual({
        ...original,
        deletedAt: null,
        updatedAt: restoredAt,
        ...(kind === 'encounter' ? { isActive: false } : {}),
        ...(kind === 'followup' ? { reminderRevision: 1, reminderAppliedRevision: 1 } : {}),
      });
      expect(t.db.select().from(auditLog).all()).toEqual([
        expect.objectContaining({
          action: `${kind}.restored`,
          entityType: kind,
          entityId: kind,
          at: restoredAt,
          summary: null,
          detail: null,
        }),
      ]);
      expect(
        t.db
          .select()
          .from(clinicalVersions)
          .all()
          .map((row) => row.reason),
      ).toEqual(['baseline', 'restored']);
      expect(deletedClinicalCountQuery().get()?.count).toBe(0);
      await refuse(kind, kind, 'a'.repeat(64));
      await refuse(kind, 'missing', 'a'.repeat(64));
    },
  );

  it.each(CLINICAL_TRASH_KINDS)('rolls back every table when the %s restore audit fails', async (kind) => {
    seed(kind);
    const basis = shown(kind).expectedBasis;
    t.sqlite.exec(
      "CREATE TRIGGER fail_restore_audit BEFORE INSERT ON audit_log BEGIN SELECT RAISE(ABORT,'Synthetic audit failure'); END",
    );
    await refuse(kind, kind, basis);
  });

  it.each(CLINICAL_TRASH_KINDS)(
    'refuses a changed full %s row even when update and deletion timestamps stay unchanged',
    async (kind) => {
      seed(kind);
      const basis = shown(kind).expectedBasis;
      const table = clinicalTables[kind];
      // All schemas contain createdAt. It is part of the exact basis, not just updatedAt/deletedAt.
      t.db
        .update(table)
        .set({ createdAt: new Date(createdAt.getTime() + 1) })
        .where(eq(table.id, kind))
        .run();
      await refuse(kind, kind, basis);
    },
  );

  it('binds hidden imaging and consult fields and the displayed patient identity to the shown basis', async () => {
    seed('imaging');
    seed('consult');
    seed('vital');
    const imaging = shown('imaging').expectedBasis;
    const consult = shown('consult').expectedBasis;
    const vital = shown('vital').expectedBasis;
    t.db
      .update(imagingStudies)
      .set({ accessNotes: 'Synthetic changed hidden hint' })
      .where(eq(imagingStudies.id, 'imaging'))
      .run();
    t.db
      .update(consultations)
      .set({ draftInstruction: 'Synthetic changed hidden draft' })
      .where(eq(consultations.id, 'consult'))
      .run();
    await refuse('imaging', 'imaging', imaging);
    await refuse('consult', 'consult', consult);
    t.db.update(patients).set({ lastName: 'Synthetic renamed identity' }).where(eq(patients.id, patientId)).run();
    await refuse('vital', 'vital', vital);
  });

  it('distinguishes neighbouring stored doubles and imported int64 values beyond JS safe integers', async () => {
    seed('vital');
    seed('order');
    t.sqlite.exec(
      "UPDATE vitals SET temperature=37.300000000000004 WHERE id='vital'; UPDATE orders SET sort_order=9007199254740992 WHERE id='order'",
    );
    const vital = shown('vital').expectedBasis;
    const order = shown('order').expectedBasis;
    t.sqlite.exec(
      "UPDATE vitals SET temperature=37.300000000000011 WHERE id='vital'; UPDATE orders SET sort_order=9007199254740993 WHERE id='order'",
    );
    expect(shown('vital').expectedBasis).not.toBe(vital);
    expect(shown('order').expectedBasis).not.toBe(order);
    await refuse('vital', 'vital', vital);
    await refuse('order', 'order', order);
  });

  it.each(CLINICAL_TRASH_KINDS)('refuses %s under its separately deleted original patient', async (kind) => {
    seed(kind);
    const basis = shown(kind).expectedBasis;
    t.db.update(patients).set({ deletedAt }).where(eq(patients.id, patientId)).run();
    await refuse(kind, kind, basis);
  });

  it.each(CLINICAL_TRASH_KINDS)('preserves imported empty-string patient ownership on %s', async (kind) => {
    seedPatient('');
    seed(kind, kind, '');
    expect(deletedClinicalCountQuery({ patientId: '' }).get()?.count).toBe(1);
    const row = deletedClinicalQuery({ patientId: '', kind }).get()!;
    expect(row.patientId).toBe('');
    await restoreClinicalRecord(kind, kind, row.expectedBasis, restoredAt);
    expect(read(kind)).toMatchObject({ patientId: '', deletedAt: null });
  });

  it.each(childKinds)('preserves explicit null on %s even when another active encounter exists', async (kind) => {
    seed(kind);
    seedEncounter('new-active');
    t.db.update(encounters).set({ isActive: true }).where(eq(encounters.id, 'new-active')).run();
    await restoreClinicalRecord(kind, kind, shown(kind).expectedBasis, restoredAt);
    expect(read(kind)).toMatchObject({ encounterId: null });
    expect(t.db.select().from(encounters).where(eq(encounters.id, 'new-active')).get()?.isActive).toBe(true);
  });

  it.each(childKinds)('refuses %s whose original encounter is deleted, cross-patient or missing', async (kind) => {
    seedEncounter('original', patientId, deletedAt);
    seed(kind, kind, patientId, 'original');
    await refuse(kind, kind);
    t.db.update(encounters).set({ deletedAt: null, patientId: otherId }).where(eq(encounters.id, 'original')).run();
    await refuse(kind, kind);
    t.sqlite.exec('PRAGMA foreign_keys = OFF');
    const table = clinicalTables[kind];
    if ('encounterId' in table)
      t.db.update(table).set({ encounterId: 'synthetic-missing-episode' }).where(eq(table.id, kind)).run();
    t.sqlite.exec('PRAGMA foreign_keys = ON');
    await refuse(kind, kind);
  });

  it.each(childKinds)('treats imported empty-string encounter keys on %s as exact bindings', async (kind) => {
    seedEncounter('');
    seed(kind, kind, patientId, '');
    const basis = shown(kind).expectedBasis;
    t.db.update(encounters).set({ patientId: otherId }).where(eq(encounters.id, '')).run();
    await refuse(kind, kind, basis);
    t.db.update(encounters).set({ patientId }).where(eq(encounters.id, '')).run();
    await restoreClinicalRecord(kind, kind, basis, restoredAt);
    expect(read(kind)).toMatchObject({ encounterId: '' });
  });

  it('requires a consult linked note to remain alive with the exact patient and encounter, including an empty key', async () => {
    seed('consult');
    seedEncounter('different-episode');
    t.db
      .insert(notes)
      .values({
        id: '',
        ...stamps(createdAt),
        patientId,
        encounterId: null,
        noteDate: createdAt,
        type: 'consult_reply',
        body: 'Synthetic answer note',
        deletedAt,
      })
      .run();
    t.db.update(consultations).set({ noteId: '' }).where(eq(consultations.id, 'consult')).run();
    const basis = shown('consult').expectedBasis;
    await refuse('consult', 'consult', basis);
    t.db.update(notes).set({ deletedAt: null, patientId: otherId }).where(eq(notes.id, '')).run();
    await refuse('consult', 'consult', basis);
    t.db.update(notes).set({ patientId, encounterId: 'different-episode' }).where(eq(notes.id, '')).run();
    await refuse('consult', 'consult', basis);
    t.db.update(notes).set({ encounterId: null }).where(eq(notes.id, '')).run();
    const noteBefore = t.db.select().from(notes).all();
    await restoreClinicalRecord('consult', 'consult', basis, restoredAt);
    expect(t.db.select().from(notes).all()).toEqual(noteBefore);
    expect(read('consult')).toMatchObject({ noteId: '', status: 'answered', draftRevision: 5 });
  });

  it('restores a lab header without touching live or separately deleted values or media', async () => {
    seed('lab');
    for (const dead of [false, true])
      t.db
        .insert(labValues)
        .values({
          id: dead ? 'dead-value' : 'live-value',
          ...stamps(createdAt),
          panelId: 'lab',
          patientId,
          analyte: 'Synthetic value',
          value: '<0.01',
          sortOrder: dead ? 1 : 0,
          deletedAt: dead ? deletedAt : null,
        })
        .run();
    const values = t.db.select().from(labValues).all();
    for (const dead of [false, true])
      t.db
        .insert(attachments)
        .values({
          id: dead ? 'dead-media' : 'live-media',
          ...stamps(createdAt),
          entityType: 'lab_panel',
          entityId: 'lab',
          patientId,
          relativePath: `synthetic/${dead ? 'dead' : 'live'}.jpg`,
          deletedAt: dead ? deletedAt : null,
        })
        .run();
    const media = t.db.select().from(attachments).all();
    await restoreClinicalRecord('lab', 'lab', shown('lab').expectedBasis, restoredAt);
    expect(t.db.select().from(labValues).all()).toEqual(values);
    expect(t.db.select().from(attachments).all()).toEqual(media);
    expect(
      t.db
        .select()
        .from(clinicalVersions)
        .all()
        .every((row) => row.body.includes('live-value') && !row.body.includes('dead-value')),
    ).toBe(true);
  });

  it('refuses a lab whose alive value belongs to another patient, leaving separately deleted mismatches untouched', async () => {
    seed('lab');
    t.db
      .insert(labValues)
      .values({
        id: 'foreign-value',
        ...stamps(createdAt),
        panelId: 'lab',
        patientId: otherId,
        analyte: 'Synthetic mismatch',
      })
      .run();
    const basis = shown('lab').expectedBasis;
    await refuse('lab', 'lab', basis);
    t.db.update(labValues).set({ deletedAt }).where(eq(labValues.id, 'foreign-value')).run();
    await restoreClinicalRecord('lab', 'lab', basis, restoredAt);
    expect(t.db.select().from(labValues).get()?.deletedAt).toEqual(deletedAt);
  });

  it('refreshes derived diagnosis search atomically and rolls everything back when reindexing fails', async () => {
    seed('diagnosis');
    const basis = shown('diagnosis').expectedBasis;
    t.sqlite.exec(
      "CREATE TRIGGER fail_diagnosis_index BEFORE UPDATE OF search_text ON patients BEGIN SELECT RAISE(ABORT,'Synthetic index failure'); END",
    );
    await refuse('diagnosis', 'diagnosis', basis);
    t.sqlite.exec('DROP TRIGGER fail_diagnosis_index');
    await restoreClinicalRecord('diagnosis', 'diagnosis', basis, restoredAt);
    expect(t.db.select().from(patients).where(eq(patients.id, patientId)).get()).toMatchObject({
      searchText: expect.stringContaining('synthetic rare diagnosis'),
      updatedAt: createdAt,
    });
  });
});

describe('historical encounter visibility', () => {
  it('uses migrated ownership indexes for every newly indexed alive-child gate', () => {
    for (const [table, index] of [
      [diagnoses, 'diagnoses_encounter_owner_idx'],
      [vitals, 'vitals_encounter_owner_idx'],
      [labPanels, 'lab_panels_encounter_owner_idx'],
      [imagingStudies, 'imaging_encounter_owner_idx'],
      [followUps, 'follow_ups_encounter_owner_idx'],
      [consultations, 'consultations_encounter_owner_idx'],
      [tasks, 'tasks_encounter_owner_idx'],
    ] as const) {
      const query = t.db
        .select({ id: table.id })
        .from(table)
        .where(
          and(
            eq(table.encounterId, 'encounter'),
            isNull(table.deletedAt),
            or(ne(table.patientId, patientId), isNull(table.patientId)),
          ),
        )
        .limit(1)
        .toSQL();
      const statement = t.sqlite.prepare(`EXPLAIN QUERY PLAN ${query.sql}`);
      const plan: string[] = [];
      try {
        statement.bind(query.params as (string | number | null)[]);
        while (statement.step()) plan.push(String(statement.getAsObject().detail));
      } finally {
        statement.free();
      }
      expect(plan).toEqual(
        expect.arrayContaining([expect.stringContaining(`USING INDEX ${index} (encounter_id=? AND deleted_at=?)`)]),
      );
    }
  });

  function child(
    table: 'notes' | 'orders' | 'vitals' | 'labs' | 'imaging' | 'diagnoses' | 'followups' | 'consultations' | 'tasks',
    owner: string | null,
    deleted: Date | null = null,
  ) {
    const base = {
      id: `child-${table}`,
      ...stamps(createdAt),
      patientId: owner!,
      encounterId: 'encounter',
      deletedAt: deleted,
    };
    switch (table) {
      case 'notes':
        t.db
          .insert(notes)
          .values({ ...base, noteDate: createdAt, body: 'Synthetic child note' })
          .run();
        break;
      case 'orders':
        t.db
          .insert(orders)
          .values({ ...base, name: 'Synthetic child order', status: 'held' })
          .run();
        break;
      case 'vitals':
        t.db
          .insert(vitals)
          .values({ ...base, measuredAt: createdAt })
          .run();
        break;
      case 'labs':
        t.db
          .insert(labPanels)
          .values({ ...base, collectedAt: createdAt })
          .run();
        break;
      case 'imaging':
        t.db.insert(imagingStudies).values(base).run();
        break;
      case 'diagnoses':
        t.db
          .insert(diagnoses)
          .values({ ...base, title: 'Synthetic child diagnosis' })
          .run();
        break;
      case 'followups':
        t.db
          .insert(followUps)
          .values({ ...base, dueAt: createdAt, reason: 'Synthetic child followup' })
          .run();
        break;
      case 'consultations':
        t.db
          .insert(consultations)
          .values({ ...base, reason: 'Synthetic child consult' })
          .run();
        break;
      case 'tasks':
        t.db
          .insert(tasks)
          .values({ ...base, patientId: owner, title: 'Synthetic child task' })
          .run();
        break;
    }
  }
  const tables = [
    'notes',
    'orders',
    'vitals',
    'labs',
    'imaging',
    'diagnoses',
    'followups',
    'consultations',
    'tasks',
  ] as const;

  it.each(tables)('refuses an imported alive cross-patient child in %s without changing any table', async (table) => {
    seed('encounter');
    child(table, otherId);
    await refuse('encounter', 'encounter');
  });

  it('refuses a linked task with no patient instead of attaching it implicitly', async () => {
    seed('encounter');
    child('tasks', null);
    await refuse('encounter', 'encounter');
  });

  it('only restores historical visibility, preserving discharge fields, current episode/status/orders and child tombstones', async () => {
    seed('encounter');
    seedEncounter('current');
    t.db.update(encounters).set({ isActive: true }).where(eq(encounters.id, 'current')).run();
    for (const table of tables) child(table, patientId);
    // Separately deleted conflicting children do not block and never revive.
    t.db.update(notes).set({ deletedAt, patientId: otherId }).where(eq(notes.id, 'child-notes')).run();
    const before = databaseRows(t);
    const old = read('encounter');
    await restoreClinicalRecord('encounter', 'encounter', shown('encounter').expectedBasis, restoredAt);
    expect(read('encounter')).toEqual({ ...old, deletedAt: null, updatedAt: restoredAt, isActive: false });
    const after = databaseRows(t);
    for (const table of [
      'patients',
      'notes',
      'orders',
      'vitals',
      'lab_panels',
      'imaging_studies',
      'diagnoses',
      'follow_ups',
      'consultations',
      'tasks',
    ])
      expect(after[table]).toEqual(before[table]);
    expect(t.db.select().from(encounters).where(eq(encounters.id, 'current')).get()?.isActive).toBe(true);
  });
});

describe('lab deletion and complete value history', () => {
  function livePanel() {
    seed('lab');
    t.db.update(labPanels).set({ deletedAt: null }).where(eq(labPanels.id, 'lab')).run();
    t.db
      .insert(labValues)
      .values({
        id: 'live-value',
        ...stamps(createdAt),
        panelId: 'lab',
        patientId,
        analyte: 'Synthetic analyte',
        value: '1.2',
      })
      .run();
    return t.db.select().from(labPanels).get()!;
  }

  it('deletes once with id-only audit/history and leaves values unchanged on retries', async () => {
    const original = livePanel();
    const values = t.db.select().from(labValues).all();
    await deleteLabPanel('lab', original, deletedAt);
    expect(t.db.select().from(labValues).all()).toEqual(values);
    expect(t.db.select().from(auditLog).all()).toEqual([
      expect.objectContaining({
        action: 'lab.deleted',
        entityId: 'lab',
        entityType: 'lab',
        summary: null,
        detail: null,
      }),
    ]);
    const before = databaseRows(t);
    await deleteLabPanel('lab', original, restoredAt);
    expect(databaseRows(t)).toEqual(before);
    await expect(deleteLabPanel('missing')).rejects.toThrow();
    expect(databaseRows(t)).toEqual(before);
  });

  it('refuses stale deletion and rolls deletion/history back if the required audit fails', async () => {
    const expected = livePanel();
    t.db.update(labPanels).set({ notes: 'Synthetic changed panel' }).where(eq(labPanels.id, 'lab')).run();
    let before = databaseRows(t);
    await expect(deleteLabPanel('lab', expected, deletedAt)).rejects.toThrow();
    expect(databaseRows(t)).toEqual(before);
    t.sqlite.exec(
      "CREATE TRIGGER fail_lab_delete_audit BEFORE INSERT ON audit_log BEGIN SELECT RAISE(ABORT,'Synthetic audit failure'); END",
    );
    before = databaseRows(t);
    await expect(deleteLabPanel('lab', undefined, deletedAt)).rejects.toThrow();
    expect(databaseRows(t)).toEqual(before);
  });

  it('validates live patient, original encounter and alive value ownership before deletion', async () => {
    livePanel();
    seedEncounter('original', otherId);
    t.db.update(labPanels).set({ encounterId: 'original' }).where(eq(labPanels.id, 'lab')).run();
    const before = databaseRows(t);
    await expect(deleteLabPanel('lab')).rejects.toThrow();
    expect(databaseRows(t)).toEqual(before);
    t.db.update(labPanels).set({ encounterId: null }).where(eq(labPanels.id, 'lab')).run();
    t.db.update(labValues).set({ patientId: otherId }).where(eq(labValues.id, 'live-value')).run();
    await expect(deleteLabPanel('lab')).rejects.toThrow();
    t.db.update(labValues).set({ patientId }).where(eq(labValues.id, 'live-value')).run();
    t.db.update(patients).set({ deletedAt }).where(eq(patients.id, patientId)).run();
    await expect(deleteLabPanel('lab')).rejects.toThrow();
  });

  it('captures exact before/after live values for create and replacement, preserving previous values as tombstones', () => {
    const input = {
      patientId,
      collectedAt: createdAt,
      source: 'manual' as const,
      name: 'Synthetic draw',
      values: [{ analyte: 'Synthetic old', value: '<0.01' }],
    };
    const id = t.db.transaction((tx) => createLabPanelInTransaction(tx, input, createdAt, null));
    const old = t.db.select().from(labValues).get()!;
    t.db.transaction((tx) =>
      updateLabPanelInTransaction(
        tx,
        id,
        { ...input, values: [{ analyte: 'Synthetic new', value: '2.5' }] },
        restoredAt,
      ),
    );
    const versions = t.db.select().from(clinicalVersions).all();
    expect(versions.map((row) => row.reason)).toEqual(['created', 'edited']);
    expect(versions[0]!.body).toContain('Synthetic old');
    expect(versions[0]!.body).not.toContain('Synthetic new');
    expect(versions[1]!.body).toContain('Synthetic new');
    expect(versions[1]!.body).not.toContain('Synthetic old');
    expect(t.db.select().from(labValues).where(eq(labValues.id, old.id)).get()?.deletedAt).toEqual(restoredAt);
  });

  it('rolls lab creation and value replacement back if permanent history cannot be written', () => {
    const input = {
      patientId,
      collectedAt: createdAt,
      source: 'manual' as const,
      values: [{ analyte: 'Synthetic old', value: '1.2' }],
    };
    const failHistory = () =>
      t.sqlite.exec(
        "CREATE TRIGGER fail_lab_history BEFORE INSERT ON clinical_versions BEGIN SELECT RAISE(ABORT,'Synthetic history failure'); END",
      );
    failHistory();
    let before = databaseRows(t);
    expect(() => t.db.transaction((tx) => createLabPanelInTransaction(tx, input, createdAt, null))).toThrow();
    expect(databaseRows(t)).toEqual(before);
    t.sqlite.exec('DROP TRIGGER fail_lab_history');
    const id = t.db.transaction((tx) => createLabPanelInTransaction(tx, input, createdAt, null));
    failHistory();
    before = databaseRows(t);
    expect(() =>
      t.db.transaction((tx) =>
        updateLabPanelInTransaction(
          tx,
          id,
          { ...input, values: [{ analyte: 'Synthetic new', value: '2.5' }] },
          restoredAt,
        ),
      ),
    ).toThrow();
    expect(databaseRows(t)).toEqual(before);
  });

  it('refuses create/update publication with deleted, foreign or imported empty-string encounter ownership', () => {
    seedEncounter('', otherId);
    const input = { patientId, collectedAt: createdAt, source: 'manual' as const, values: [] };
    const before = databaseRows(t);
    expect(() => t.db.transaction((tx) => createLabPanelInTransaction(tx, input, createdAt, ''))).toThrow();
    expect(databaseRows(t)).toEqual(before);
    t.db.update(encounters).set({ patientId, deletedAt }).where(eq(encounters.id, '')).run();
    expect(() => t.db.transaction((tx) => createLabPanelInTransaction(tx, input, createdAt, ''))).toThrow();
    t.db.update(encounters).set({ deletedAt: null }).where(eq(encounters.id, '')).run();
    const id = t.db.transaction((tx) => createLabPanelInTransaction(tx, input, createdAt, ''));
    t.db.update(encounters).set({ deletedAt }).where(eq(encounters.id, '')).run();
    const preUpdate = databaseRows(t);
    expect(() => t.db.transaction((tx) => updateLabPanelInTransaction(tx, id, input, restoredAt))).toThrow();
    expect(databaseRows(t)).toEqual(preUpdate);
  });
});
