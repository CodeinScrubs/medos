import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import { auditLog } from '@/db/schema';
import { useTestDatabase } from '@/test/db-client';
import { createTestDatabase, type TestDatabase } from '@/test/sqljs';

import { createNote, deleteNote, deletedNotesQuery, patientNotesQuery, restoreNote } from './queries';
import { createPatient } from '../patients/queries';

jest.mock('@/db/client', () => jest.requireActual('@/test/db-client'));
jest.mock('@/platform/notifications', () => jest.requireActual('@/test/mocks/notifications'));

let t: TestDatabase;
let patientId: string;

beforeEach(async () => {
  t = useTestDatabase(await createTestDatabase());
  patientId = await createPatient({ firstName: 'Example', lastName: 'Patient', status: 'outpatient' });
});

describe('a deleted note', () => {
  /*
   * The delete message used to say a note could only come back from a backup,
   * although the row was only ever stamped. The trash now offers it back.
   */
  it('leaves the record, waits in the trash with its patient, and comes back unchanged', async () => {
    const id = await createNote({ patientId, type: 'progress', subjective: 'Chest pain since yesterday' });
    await deleteNote(id);

    expect(await patientNotesQuery(patientId)).toHaveLength(0);
    const [trashed] = await deletedNotesQuery();
    expect(trashed!.note.id).toBe(id);
    expect(trashed!.patient).toEqual({ firstName: 'Example', lastName: 'Patient' });

    await restoreNote(id);

    const [back] = await patientNotesQuery(patientId);
    expect(back!.id).toBe(id);
    expect(back!.subjective).toBe('Chest pain since yesterday');
    expect(await deletedNotesQuery()).toHaveLength(0);
  });

  it('is audited both ways', async () => {
    const id = await createNote({ patientId, type: 'progress', body: 'Seen' });
    await deleteNote(id);
    await restoreNote(id);

    const actions = (await t.db.select().from(auditLog)).filter((r) => r.entityId === id).map((r) => r.action);
    expect(actions).toEqual(['note.deleted', 'note.restored']);
  });
});
