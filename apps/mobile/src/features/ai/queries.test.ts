import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { eq } from 'drizzle-orm';

import { db } from '@/db/client';
import { consultations, notes, orders, tasks } from '@/db/schema';
import { createPatient } from '@/features/patients/queries';
import { useTestDatabase } from '@/test/db-client';
import { createTestDatabase } from '@/test/sqljs';

import { commitAiPlan, fetchDossierData } from './queries';

jest.mock('@/db/client', () => jest.requireActual('@/test/db-client'));
jest.mock('@/platform/notifications', () => jest.requireActual('@/test/mocks/notifications'));

let patientId: string;

beforeEach(async () => {
  useTestDatabase(await createTestDatabase());
  patientId = await createPatient({
    firstName: 'Sara',
    lastName: 'Mahmoudi',
    sex: 'female',
    allergies: 'Penicillin',
    pastMedicalHistory: 'Asthma',
  });
});

describe('AI Queries', () => {
  it('fetches dossier data for an existing patient', async () => {
    const data = await fetchDossierData(patientId);
    expect(data).not.toBeNull();
    expect(data?.patient.firstName).toBe('Sara');
    expect(data?.patient.lastName).toBe('Mahmoudi');
    expect(data?.patient.allergies).toBe('Penicillin');
  });

  it('commits reviewed AI plan atomically into SQLite', async () => {
    const result = await commitAiPlan({
      patientId,
      saveNote: true,
      assessmentText: 'POD #1 post-op stable',
      noteText: 'Wound clean, ambulating well',
      medications: [
        {
          id: 'med-1',
          drug: 'Cefazolin',
          dose: '1g',
          route: 'IV',
          frequency: 'Q8H',
          duration: '48h',
          instructions: 'Prophylaxis',
          selected: true,
        },
        {
          id: 'med-2',
          drug: 'UnselectedDrug',
          dose: '500mg',
          route: 'PO',
          frequency: 'Daily',
          selected: false,
        },
      ],
      labs: [
        {
          id: 'lab-1',
          analyte: 'CBC',
          timing: 'Morning',
          selected: true,
        },
      ],
      consults: [
        {
          id: 'con-1',
          specialty: 'Cardiology',
          reason: 'Pre-op clearance check',
          selected: true,
        },
      ],
      tasks: [
        {
          id: 'task-1',
          text: 'Check vitals at 18:00',
          due: '18:00',
          selected: true,
        },
      ],
    });

    expect(result.noteId).toBeDefined();
    expect(result.orderIds).toHaveLength(2); // 1 med + 1 lab order
    expect(result.consultIds).toHaveLength(1);
    expect(result.taskIds).toHaveLength(1);

    // Verify notes in database
    const noteRows = db.select().from(notes).where(eq(notes.patientId, patientId)).all();
    expect(noteRows).toHaveLength(1);
    expect(noteRows[0]?.assessment).toBe('POD #1 post-op stable');
    expect(noteRows[0]?.plan).toBe('Wound clean, ambulating well');

    // Verify orders in database (Cefazolin should exist, UnselectedDrug should NOT)
    const orderRows = db.select().from(orders).where(eq(orders.patientId, patientId)).all();
    expect(orderRows).toHaveLength(2);
    const drugOrder = orderRows.find((o) => o.kind === 'drug');
    expect(drugOrder?.name).toBe('Cefazolin');
    expect(drugOrder?.dose).toBe('1g');
    expect(orderRows.some((o) => o.name === 'UnselectedDrug')).toBe(false);

    // Verify consults in database
    const consultRows = db.select().from(consultations).where(eq(consultations.patientId, patientId)).all();
    expect(consultRows).toHaveLength(1);
    expect(consultRows[0]?.specialty).toBe('Cardiology');
    expect(consultRows[0]?.reason).toBe('Pre-op clearance check');

    // Verify tasks in database
    const taskRows = db.select().from(tasks).where(eq(tasks.patientId, patientId)).all();
    expect(taskRows).toHaveLength(1);
    expect(taskRows[0]?.title).toBe('Check vitals at 18:00');
    expect(taskRows[0]?.source).toBe('ai_copilot');
  });
});
