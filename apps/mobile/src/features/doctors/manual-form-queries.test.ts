import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { eq } from 'drizzle-orm';

import { doctorProfiles, doctors, specialties } from '@/db/schema';
import { stamps } from '@/lib/ids';
import { databaseRows } from '@/test/dataset-snapshot';
import { useTestDatabase } from '@/test/db-client';
import { createTestDatabase, type TestDatabase } from '@/test/sqljs';

import { changedFormPatch, DoctorFormConflict } from './edit-basis';
import { createDoctor, deleteDoctor, doctorQuery, updateDoctor } from './queries';
import { addDoctorRating, doctorProfileQuery, doctorRatingsQuery, saveDoctorProfile } from './ratings-queries';

jest.mock('@/db/client', () => jest.requireActual('@/test/db-client'));
jest.mock('@/platform/notifications', () => jest.requireActual('@/test/mocks/notifications'));

let t: TestDatabase;
let doctorId: string;
beforeEach(async () => {
  t = useTestDatabase(await createTestDatabase());
  doctorId = await createDoctor({ firstName: 'Synthetic', lastName: 'Colleague', notes: '  exact\n note  ' });
});

describe('manual doctor edit bases on migrated SQLite', () => {
  it('refuses combining an old specialty parent with a newly changed subspecialty', async () => {
    for (const [id, parentId] of [
      ['main-one', null],
      ['main-two', null],
      ['child-one', 'main-one'],
      ['child-two', 'main-two'],
    ] as const) {
      t.db
        .insert(specialties)
        .values({ id, parentId, nameFa: `Synthetic ${id}`, ...stamps() })
        .run();
    }
    await updateDoctor(doctorId, { specialtyId: 'main-one', subspecialtyId: null, specialtyText: 'One' });
    const basis = (await doctorQuery(doctorId))[0]!;
    await updateDoctor(doctorId, { specialtyId: 'main-two', subspecialtyId: 'child-two', specialtyText: 'Two' });
    const before = databaseRows(t);
    await expect(updateDoctor(doctorId, { subspecialtyId: 'child-one' }, basis)).rejects.toBeInstanceOf(
      DoctorFormConflict,
    );
    expect(databaseRows(t)).toEqual(before);
    await updateDoctor(doctorId, { phone: '+12025550123' }, basis);
    expect((await doctorQuery(doctorId))[0]).toMatchObject({
      specialtyId: 'main-two',
      subspecialtyId: 'child-two',
      specialtyText: 'Two',
      phone: '+12025550123',
    });
  });
  it('writes only locally changed values, preserving exact untouched text and external flags/tags', async () => {
    const basis = (await doctorQuery(doctorId))[0]!;
    await updateDoctor(doctorId, { starred: true, tags: ['external'], officeLat: '12.5' });
    const initial = { phone: '', notes: basis.notes!, starred: basis.starred, tags: '' };
    const current = { ...initial, phone: '+12025550123' };
    const patch = changedFormPatch(initial, current, {
      phone: current.phone,
      notes: 'exact note',
      starred: false,
      tags: [],
    });
    await updateDoctor(doctorId, patch, basis);
    expect((await doctorQuery(doctorId))[0]).toMatchObject({
      phone: '+12025550123',
      notes: basis.notes,
      starred: true,
      tags: ['external'],
      officeLat: '12.5',
    });
  });
  it('rejects same-field conflicts before changing any row or timestamp', async () => {
    const basis = (await doctorQuery(doctorId))[0]!;
    await updateDoctor(doctorId, { notes: 'Other editor' });
    const before = databaseRows(t);
    await expect(updateDoctor(doctorId, { notes: 'Mine', phone: '+12025550123' }, basis)).rejects.toBeInstanceOf(
      DoctorFormConflict,
    );
    expect(databaseRows(t)).toEqual(before);
  });
  it('treats already-current desired values as acknowledged without touching timestamps', async () => {
    const basis = (await doctorQuery(doctorId))[0]!;
    await updateDoctor(doctorId, { notes: 'Same desired value' });
    const before = databaseRows(t);
    await updateDoctor(doctorId, { notes: 'Same desired value' }, basis);
    expect(databaseRows(t)).toEqual(before);
  });
  it('preserves unrelated profile edits and exact untouched text, and rejects same-field conflicts', async () => {
    await saveDoctorProfile(doctorId, { personalNotes: '  old\n text  ', interests: ['one'] });
    const basis = (await doctorProfileQuery(doctorId))[0]!;
    await saveDoctorProfile(doctorId, { almaMater: 'Other editor', interests: ['one', 'two'] });
    await saveDoctorProfile(doctorId, { hometown: 'Local value' }, basis);
    expect((await doctorProfileQuery(doctorId))[0]).toMatchObject({
      almaMater: 'Other editor',
      interests: ['one', 'two'],
      personalNotes: basis.personalNotes,
      hometown: 'Local value',
    });
    const before = databaseRows(t);
    await expect(saveDoctorProfile(doctorId, { almaMater: 'Mine' }, basis)).rejects.toBeInstanceOf(DoctorFormConflict);
    expect(databaseRows(t)).toEqual(before);
  });
  it('serializes first-profile creation while merging only distinct locally changed fields', async () => {
    const ids = await Promise.all([
      saveDoctorProfile(doctorId, { hometown: 'First field' }, null),
      saveDoctorProfile(doctorId, { almaMater: 'Second field' }, null),
    ]);
    expect(ids[0]).toBe(ids[1]);
    expect(await doctorProfileQuery(doctorId)).toMatchObject([{ hometown: 'First field', almaMater: 'Second field' }]);
    const before = databaseRows(t);
    await expect(saveDoctorProfile(doctorId, { hometown: 'Conflicting field' }, null)).rejects.toBeInstanceOf(
      DoctorFormConflict,
    );
    expect(databaseRows(t)).toEqual(before);
  });
  it('refuses a retired and recreated profile rather than transferring an old edit into the new row', async () => {
    await saveDoctorProfile(doctorId, { hometown: 'Original' });
    const basis = (await doctorProfileQuery(doctorId))[0]!;
    t.db.update(doctorProfiles).set({ deletedAt: new Date() }).where(eq(doctorProfiles.id, basis.id)).run();
    await saveDoctorProfile(doctorId, { hometown: 'Replacement' });
    const before = databaseRows(t);
    await expect(saveDoctorProfile(doctorId, { personalNotes: 'Old intent' }, basis)).rejects.toBeInstanceOf(
      DoctorFormConflict,
    );
    expect(databaseRows(t)).toEqual(before);
  });
  it.each(['profile', 'rating'] as const)('refuses %s writes to a soft-deleted parent', async (kind) => {
    await deleteDoctor(doctorId);
    const before = databaseRows(t);
    await expect(
      kind === 'profile'
        ? saveDoctorProfile(doctorId, { hometown: 'Old intent' })
        : addDoctorRating(doctorId, { reasoning: 'Old intent' }),
    ).rejects.toThrow();
    expect(databaseRows(t)).toEqual(before);
  });
  it('keeps rating history and blank axes while rejecting a failed insert without side effects', async () => {
    await addDoctorRating(doctorId, { knowledge: 4, teaching: null, reasoning: 'First' });
    const before = databaseRows(t);
    t.sqlite.exec(
      "CREATE TRIGGER fail_rating BEFORE INSERT ON doctor_ratings BEGIN SELECT RAISE(ABORT, 'synthetic failure'); END",
    );
    await expect(addDoctorRating(doctorId, { reasoning: 'Retry me' })).rejects.toThrow();
    expect(databaseRows(t)).toEqual(before);
    t.sqlite.exec('DROP TRIGGER fail_rating');
    await addDoctorRating(doctorId, { reasoning: 'Retry me' });
    expect(await doctorRatingsQuery(doctorId)).toHaveLength(2);
    expect((await doctorRatingsQuery(doctorId)).find((row) => row.reasoning === 'First')).toMatchObject({
      knowledge: 4,
      teaching: null,
    });
    expect(t.db.select().from(doctors).all()).toHaveLength(1);
  });
});
