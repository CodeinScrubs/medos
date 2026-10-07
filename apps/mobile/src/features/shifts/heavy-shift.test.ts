import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { afterEach, describe, expect, it, jest } from '@jest/globals';

import { encounters, labValues, noteVersions, orders, shiftPatients, tasks } from '@/db/schema';
import { openEncounter } from '@/features/encounters/queries';
import { createOrder, patientCurrentOrdersQuery } from '@/features/kardex/queries';
import { createLabPanel, patientLabValuesQuery } from '@/features/labs/queries';
import { createNote, latestPatientNoteQuery, updateNote } from '@/features/notes/queries';
import { createPatient } from '@/features/patients/queries';
import { createTask, setTaskStatus } from '@/features/tasks/queries';
import { Autosave } from '@/lib/autosave';
import { datasetGeneration } from '@/lib/dataset-write';
import { formatJalali, fromJalali } from '@/lib/jalali';
import { SaveGroup } from '@/lib/save-before-leave';
import { databaseRows, snapshotDataset } from '@/test/dataset-snapshot';
import { useTestDatabase } from '@/test/db-client';
import { createTestDatabase } from '@/test/sqljs';

import {
  activeShiftWorkspaceQuery,
  addPatientToShift,
  endShift,
  reorderShiftPatients,
  saveShiftPatientText,
  setShiftPatientReviewed,
  shiftHistoryPatientsQuery,
  startShift,
} from './queries';

jest.mock('@/db/client', () => jest.requireActual('@/test/db-client'));
jest.mock('@/platform/notifications', () => jest.requireActual('@/test/mocks/notifications'));
afterEach(() => {
  jest.useRealTimers();
});

describe('accelerated 24-hour, 40-patient shift integration', () => {
  it('preserves exact capture text, clinical ownership, histories and order through failure, midnight and restore', async () => {
    const t = useTestDatabase(await createTestDatabase());
    const start = fromJalali(1403, 12, 30).getTime() + 8 * 3600000;
    jest.useFakeTimers().setSystemTime(start);
    const group = new SaveGroup();
    const generation = datasetGeneration();
    const shiftId = await startShift({ ward: 'Synthetic heavy shift', startAt: new Date(start) });
    const members: {
      patientId: string;
      encounterId: string;
      member: typeof shiftPatients.$inferSelect;
      saver: Autosave<string>;
      latestTask: string | null;
    }[] = [];
    for (let i = 0; i < 40; i++) {
      const patientId = await createPatient({
        firstName: 'Synthetic',
        lastName: `Heavy ${i + 1}`,
        ageYears: 20 + i,
        sex: i % 2 ? 'male' : 'female',
      });
      // A standing order and a superseded episode must not be confused with the current one.
      await createOrder({ patientId, kind: 'drug', name: `Standing ${i + 1}` });
      await openEncounter({
        patientId,
        kind: 'admission',
        ward: 'Previous ward',
        admittedAt: new Date(start - 7 * 86400000),
      });
      await createOrder({ patientId, kind: 'drug', name: `Historical ${i + 1}` });
      const encounterId = await openEncounter({
        patientId,
        kind: 'admission',
        ward: 'Current ward',
        bed: `H-${i + 1}`,
        admittedAt: new Date(start - 25 * 3600000),
        admittedAtHasTime: i % 2 === 0,
      });
      await createOrder({ patientId, kind: 'drug', name: `Current ${i + 1}` });
      const memberId = await addPatientToShift(shiftId, patientId, { shiftSummary: `Impression ${i + 1}` });
      const member = t.db
        .select()
        .from(shiftPatients)
        .all()
        .find((row) => row.id === memberId)!;
      const saver = new Autosave<string>({
        generation,
        write: (handoffNote) => saveShiftPatientText(member, { handoffNote }),
      });
      group.register(saver);
      members.push({ patientId, encounterId, member, saver, latestTask: null });
    }
    let routed = 0;
    for (let hour = 0; hour < 24; hour++) {
      const now = new Date(start + hour * 3600000);
      jest.setSystemTime(now);
      for (let i = 0; i < members.length; i++) {
        const item = members[i]!;
        item.saver.change(`hour ${hour}: first keystrokes`);
        item.saver.change(`  Patient ${i + 1}, hour ${hour}\n\nExact final handoff\n`);
        if (item.latestTask) await setTaskStatus(item.latestTask, 'done', `Reviewed during hour ${hour}`);
        item.latestTask = await createTask({
          patientId: item.patientId,
          shiftId,
          title: `Check result ${i + 1} at hour ${hour}`,
          dueAt: now,
          priority: i % 4 === 0 ? 'high' : 'normal',
        });
        if (hour % 4 === 0) {
          const body = `Synthetic progress ${i + 1} at hour ${hour}\nNo patient-specific recommendation.\n`;
          const noteId = await createNote({ patientId: item.patientId, type: 'progress', body, noteDate: now });
          await updateNote(noteId, { body: body + 'Confirmed transcription.\n' });
          expect(latestPatientNoteQuery(item.patientId).get()?.encounterId).toBe(item.encounterId);
        }
        if (hour % 2 === 0)
          await createLabPanel({
            patientId: item.patientId,
            collectedAt: now,
            source: 'manual',
            values: [
              { analyte: 'Hb', value: '12.4', unit: 'g/dL', refLow: 10, refHigh: 15 },
              { analyte: 'WBC', value: '7,500', unit: '/uL', refLow: 3000, refHigh: 11000 },
              { analyte: 'Synthetic bound', value: '<5', unit: 'unit', refLow: 3, refHigh: 100 },
            ],
          });
      }
      if (hour === 6) {
        // One failed saver must prevent navigation even while the other 39 finish.
        t.conn.execSync(
          `CREATE TRIGGER heavy_failure BEFORE UPDATE OF handoff_note ON shift_patients WHEN NEW.id = '${members[0]!.member.id}' BEGIN SELECT RAISE(ABORT, 'synthetic disk failure'); END`,
        );
        expect(
          await group.perform(() => {
            routed += 1;
          }),
        ).toBe('unsaved');
        expect(routed).toBe(0);
        expect(members[0]!.saver.unsaved).toBe(true);
        t.conn.execSync('DROP TRIGGER heavy_failure');
      }
      expect(await group.flush()).toBe(true);
      const workspace = activeShiftWorkspaceQuery().all();
      expect(workspace).toHaveLength(40);
      for (const { member, patient, encounter, nextTask } of workspace) {
        const item = members.find((r) => r.member.id === member!.id)!;
        expect(patient?.id).toBe(item.patientId);
        expect(encounter?.id).toBe(item.encounterId);
        expect(nextTask?.id).toBe(item.latestTask);
        expect(member?.handoffNote).toBe(
          `  Patient ${members.indexOf(item) + 1}, hour ${hour}\n\nExact final handoff\n`,
        );
      }
      if (hour === 12) {
        const current = workspace.map((r) => r.member!.id);
        await reorderShiftPatients(shiftId, [...current].reverse(), current, generation);
        expect(
          activeShiftWorkspaceQuery()
            .all()
            .map((r) => r.member!.id),
        ).toEqual([...current].reverse());
      }
    }
    expect(formatJalali(new Date(start))).toBe('۱۴۰۳/۱۲/۳۰');
    expect(formatJalali(new Date(start + 24 * 3600000))).toBe('۱۴۰۴/۰۱/۰۱');
    expect(t.db.select().from(tasks).all()).toHaveLength(960);
    expect(t.db.select().from(noteVersions).all()).toHaveLength(480);
    expect(t.db.select().from(labValues).all()).toHaveLength(1440);
    expect(
      t.db
        .select()
        .from(labValues)
        .all()
        .filter((v) => v.analyte === 'WBC')
        .every((v) => v.valueNum === 7500),
    ).toBe(true);
    expect(
      t.db
        .select()
        .from(labValues)
        .all()
        .filter((v) => v.analyte === 'Synthetic bound')
        .every((v) => v.flag === null),
    ).toBe(true);
    for (let i = 0; i < members.length; i++) {
      const item = members[i]!;
      expect(
        patientCurrentOrdersQuery(item.patientId)
          .all()
          .map((o) => o.name)
          .sort(),
      ).toEqual([`Current ${i + 1}`, `Standing ${i + 1}`].sort());
      expect(patientLabValuesQuery(item.patientId).all()).toHaveLength(36);
      await setShiftPatientReviewed(item.member.id, true);
    }
    const prior = members[0]!;
    const newEncounter = await openEncounter({ patientId: prior.patientId, kind: 'admission', ward: 'Later ward' });
    await createOrder({ patientId: prior.patientId, kind: 'drug', name: 'Later episode only' });
    const laterTask = await createTask({ patientId: prior.patientId, title: 'Later episode task', priority: 'high' });
    const originalMember = activeShiftWorkspaceQuery()
      .all()
      .find((row) => row.member?.id === prior.member.id)!;
    expect(originalMember.encounter?.id).toBe(prior.encounterId);
    expect(originalMember.nextTask?.id).toBe(prior.latestTask);
    expect(originalMember.nextTask?.id).not.toBe(laterTask);
    expect(
      patientCurrentOrdersQuery(prior.patientId)
        .all()
        .map((o) => o.name)
        .sort(),
    ).toEqual(['Later episode only', 'Standing 1']);
    expect(
      t.db
        .select()
        .from(encounters)
        .all()
        .find((e) => e.id === newEncounter)?.patientId,
    ).toBe(prior.patientId);

    // Optional local QA export feeds the independently encrypted native fixture.
    // This is synthetic test data; normal CI produces no artifacts.
    const qaDirectory = process.env.MEDOS_SHIFT_QA_DIR;
    if (qaDirectory) writeFileSync(resolve(qaDirectory, 'heavy-shift.expected.db'), t.sqlite.export());
    const restore = snapshotDataset(t);
    const expected = databaseRows(t);
    await endShift(shiftId);
    await updateNote(latestPatientNoteQuery(prior.patientId).get()!.id, { body: 'After snapshot' });
    restore();
    expect(databaseRows(t)).toEqual(expected);
    expect(t.conn.getAllSync('PRAGMA integrity_check')).toEqual([{ integrity_check: 'ok' }]);
    expect(t.conn.getAllSync('PRAGMA foreign_key_check')).toEqual([]);
    prior.saver.change('A stale editor must not alter restored data');
    expect(await prior.saver.flush()).toBe(false);
    expect(databaseRows(t)).toEqual(expected);
    for (const item of members) item.saver.cancel();
    // A new intent can close the restored shift; all 40 handoffs remain readable.
    await endShift(shiftId);
    expect(shiftHistoryPatientsQuery(shiftId).all()).toHaveLength(40);
    expect(t.db.select().from(orders).all()).toHaveLength(121);
  }, 90000);
});
