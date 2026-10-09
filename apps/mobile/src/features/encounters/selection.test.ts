import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { eq } from 'drizzle-orm';

import { tablesOf } from '@/db/query-tables';
import { encounters, imagingStudies, labPanels, notes, patients, vitals } from '@/db/schema';
import {
  activeEncounterDetailQuery,
  currentEncounterQuery,
  resolveActiveEncounterId,
} from '@/features/encounters/queries';
import { activeEncounterQuery, activeLocationsQuery, reconcilePatientStatus } from '@/features/encounters/status';
import { followUpFormQuery } from '@/features/followups/form-draft-queries';
import { imagingFormQuery } from '@/features/imaging/form-draft-queries';
import { createImagingStudy } from '@/features/imaging/queries';
import { labFormQuery } from '@/features/labs/form-draft-queries';
import { createLabPanel } from '@/features/labs/queries';
import { createNote } from '@/features/notes/queries';
import { createPatient } from '@/features/patients/queries';
import { initialVitalForm, decodeVitalForm } from '@/features/vitals/form-draft';
import { vitalFormQuery, saveVitalFormDraft, commitVitalFormDraft } from '@/features/vitals/form-draft-queries';
import { recordVital } from '@/features/vitals/queries';
import { stamps } from '@/lib/ids';
import { useTestDatabase } from '@/test/db-client';
import { createTestDatabase, type TestDatabase } from '@/test/sqljs';

jest.mock('@/db/client', () => jest.requireActual('@/test/db-client'));
jest.mock('@/platform/notifications', () => jest.requireActual('@/test/mocks/notifications'));

let t: TestDatabase, patientId: string;
const at = new Date('2025-01-01T12:00:00Z');
const id = (letter: string) => `synthetic-${letter}-episode`;
beforeEach(async () => {
  t = useTestDatabase(await createTestDatabase());
  patientId = await createPatient({ firstName: 'Synthetic', lastName: 'Episode tie' });
});
function seed(order: readonly string[], date: Date | null = at) {
  for (const letter of order)
    t.db
      .insert(encounters)
      .values({
        id: id(letter),
        patientId,
        ...stamps(at),
        admittedAt: date,
        isActive: true,
        kind: letter === 'a' ? 'admission' : 'outpatient',
        ward: `Synthetic ${letter}`,
      })
      .run();
}
async function selected() {
  return {
    status: (await activeEncounterQuery(patientId))[0]?.id,
    detail: (await activeEncounterDetailQuery(patientId))[0]?.encounter.id,
    current: (await currentEncounterQuery(patientId))[0]?.id,
    publication: resolveActiveEncounterId(patientId),
    lab: (await labFormQuery(patientId, null))[0]?.active?.id,
    imaging: (await imagingFormQuery(patientId, null))[0]?.active?.id,
    vital: (await vitalFormQuery(patientId, null))[0]?.active?.id,
    followUp: (await followUpFormQuery(patientId))[0]?.encounter?.id,
  };
}
const expected = (target: string) =>
  Object.fromEntries(
    ['status', 'detail', 'current', 'publication', 'lab', 'imaging', 'vital', 'followUp'].map((key) => [key, target]),
  );
describe('imported encounter ties use one deterministic context', () => {
  it.each([
    ['a', 'z'],
    ['z', 'a'],
  ])('all readers agree independently of insertion order %s/%s', async (first, second) => {
    seed([first, second]);
    const before = t.db.select().from(encounters).all();
    expect(await selected()).toEqual(expected(id('a')));
    expect(t.db.select().from(encounters).all()).toEqual(before);
  });
  it('unknown admission timestamps use the same tie policy', async () => {
    seed(['a', 'z'], null);
    expect(await selected()).toEqual(expected(id('a')));
  });
  it('bedside location and patient status refer to the selected episode once', async () => {
    seed(['a', 'z']);
    const before = t.db.select().from(encounters).all();
    expect(await reconcilePatientStatus(patientId)).toBe('admitted');
    const locations = await activeLocationsQuery();
    expect(locations.filter((row) => row.patientId === patientId)).toEqual([
      { patientId, ward: 'Synthetic a', bed: null, kind: 'admission' },
    ]);
    expect(t.db.select().from(encounters).all()).toEqual(before);
    expect(t.db.select().from(patients).where(eq(patients.id, patientId)).get()!.status).toBe('admitted');
  });
  it('a later admission wins before the id tie policy', async () => {
    seed(['a', 'z']);
    t.db
      .update(encounters)
      .set({ admittedAt: new Date(at.getTime() + 1000) })
      .where(eq(encounters.id, id('z')))
      .run();
    expect(await selected()).toEqual(expected(id('z')));
    expect((await activeLocationsQuery()).filter((row) => row.patientId === patientId)).toEqual([
      { patientId, ward: 'Synthetic z', bed: null, kind: 'outpatient' },
    ]);
  });
  it('a deleted active episode cannot replace the remaining context', async () => {
    seed(['a', 'z']);
    t.db
      .update(encounters)
      .set({ deletedAt: at, admittedAt: new Date(at.getTime() + 1000) })
      .where(eq(encounters.id, id('z')))
      .run();
    expect(await selected()).toEqual(expected(id('a')));
    expect((await activeLocationsQuery()).filter((row) => row.patientId === patientId)).toHaveLength(1);
  });
  it('closed tied history stays readable without inventing an active admission', async () => {
    seed(['a', 'z']);
    t.db.update(encounters).set({ isActive: false }).run();
    expect(await selected()).toEqual({
      status: undefined,
      detail: undefined,
      current: id('a'),
      publication: null,
      lab: undefined,
      imaging: undefined,
      vital: undefined,
      followUp: undefined,
    });
    expect(await activeLocationsQuery()).toEqual([]);
  });
  it('an existing raw draft keeps its captured episode even if the current tie fallback changes', async () => {
    seed(['z']);
    const document = initialVitalForm(null, id('z'), at);
    document.fields.heartRate = '80';
    await saveVitalFormDraft('synthetic-raw', patientId, null, document, 0);
    seed(['a']);
    const row = (await vitalFormQuery(patientId, null))[0]!;
    expect(row.active!.id).toBe(id('a'));
    expect(decodeVitalForm(row.draft!.body)).toEqual(document);
    const before = t.db.select().from(encounters).all();
    const published = await commitVitalFormDraft('synthetic-raw', patientId, null, 1, at);
    expect(t.db.select().from(vitals).where(eq(vitals.id, published)).get()!.encounterId).toBe(id('z'));
    expect(t.db.select().from(encounters).all()).toEqual(before);
  });
  it('new observations, notes, imaging and labs use the same selected context', async () => {
    seed(['a', 'z']);
    const before = t.db.select().from(encounters).all();
    const vitalId = await recordVital({ patientId, heartRate: 80 }, at);
    const noteId = await createNote({ patientId, type: 'progress', body: 'Synthetic selected context' });
    const studyId = await createImagingStudy({ patientId, modality: 'ct', region: 'Synthetic', status: 'done' });
    const panelId = await createLabPanel({
      patientId,
      source: 'manual',
      collectedAt: at,
      values: [{ analyte: 'Na', value: '140', unit: 'mmol/L' }],
    });
    expect([
      t.db.select().from(vitals).where(eq(vitals.id, vitalId)).get()!.encounterId,
      t.db.select().from(notes).where(eq(notes.id, noteId)).get()!.encounterId,
      t.db.select().from(imagingStudies).where(eq(imagingStudies.id, studyId)).get()!.encounterId,
      t.db.select().from(labPanels).where(eq(labPanels.id, panelId)).get()!.encounterId,
    ]).toEqual([id('a'), id('a'), id('a'), id('a')]);
    expect(t.db.select().from(encounters).all()).toEqual(before);
  });
  it('ranked locations and nested raw selections subscribe to real encounter changes', () => {
    for (const query of [
      activeLocationsQuery(),
      labFormQuery(patientId, null),
      imagingFormQuery(patientId, null),
      vitalFormQuery(patientId, null),
      followUpFormQuery(patientId),
    ])
      expect(tablesOf(query)).toContain('encounters');
    expect(tablesOf(activeLocationsQuery())).toEqual(['encounters']);
  });
});
