import { and, desc, eq, isNull } from 'drizzle-orm';

import { db } from '@/db/client';
import { doctorProfiles, doctorRatings, doctors, type DoctorProfile } from '@/db/schema';
import { newId, softDelete, stamps, touch } from '@/lib/ids';

import { checkedEditPatch, DoctorFormConflict } from './edit-basis';
import type { RatingScores } from './logic';

/*
 * Ratings and the social profile: two private, optional layers on a doctor.
 *
 * These are personal working notes about named colleagues. They never leave
 * the phone except inside an encrypted backup, and nothing in the app shares
 * or exports them.
 */

const ratingAlive = isNull(doctorRatings.deletedAt);
const profileAlive = isNull(doctorProfiles.deletedAt);

/** Every rating of a doctor, newest first — the current one plus its history. */
export function doctorRatingsQuery(doctorId: string) {
  return db
    .select()
    .from(doctorRatings)
    .where(and(ratingAlive, eq(doctorRatings.doctorId, doctorId)))
    .orderBy(desc(doctorRatings.ratedAt));
}

export type RatingInput = RatingScores & { reasoning?: string | null; ratedAt?: Date };

/**
 * A rating is added, never edited in place: an opinion that changed after two
 * years of working together is the interesting part, and overwriting it would
 * lose exactly that.
 */
export async function addDoctorRating(doctorId: string, input: RatingInput): Promise<string> {
  const id = newId();
  const { reasoning, ratedAt, ...scores } = input;
  db.transaction((tx) => {
    if (
      !tx
        .select({ id: doctors.id })
        .from(doctors)
        .where(and(eq(doctors.id, doctorId), isNull(doctors.deletedAt)))
        .get()
    )
      throw new Error('پزشک پیدا نشد یا حذف شده است.');
    tx.insert(doctorRatings)
      .values({
        id,
        ...stamps(),
        doctorId,
        ...scores,
        reasoning: reasoning?.trim() || null,
        ratedAt: ratedAt ?? new Date(),
      })
      .run();
  });
  return id;
}

export async function updateDoctorRating(id: string, input: RatingInput): Promise<void> {
  const { reasoning, ratedAt, ...scores } = input;
  await db
    .update(doctorRatings)
    .set({
      ...scores,
      reasoning: reasoning?.trim() || null,
      ...(ratedAt ? { ratedAt } : {}),
      ...touch(),
    })
    .where(eq(doctorRatings.id, id));
}

export async function deleteDoctorRating(id: string): Promise<void> {
  await db.update(doctorRatings).set(softDelete()).where(eq(doctorRatings.id, id));
}

/* -------------------------------------------------------------------------- */
/*  The social profile                                                          */
/* -------------------------------------------------------------------------- */

export function doctorProfileQuery(doctorId: string) {
  return db
    .select()
    .from(doctorProfiles)
    .where(and(profileAlive, eq(doctorProfiles.doctorId, doctorId)))
    .limit(1);
}

/** Resolve the live parent and optional profile in the same watched SQLite statement. */
export function doctorProfileFormQuery(doctorId: string) {
  return db
    .select({ doctor: doctors, profile: doctorProfiles })
    .from(doctors)
    .leftJoin(doctorProfiles, and(eq(doctorProfiles.doctorId, doctors.id), profileAlive))
    .where(and(eq(doctors.id, doctorId), isNull(doctors.deletedAt)))
    .limit(1);
}

export type ProfileInput = Partial<Omit<DoctorProfile, 'id' | 'doctorId' | 'createdAt' | 'updatedAt' | 'deletedAt'>>;

/** One profile per doctor: written if it exists, created if it does not. */
export async function saveDoctorProfile(
  doctorId: string,
  input: ProfileInput,
  basis?: DoctorProfile | null,
): Promise<string> {
  return db.transaction((tx) => {
    if (
      !tx
        .select({ id: doctors.id })
        .from(doctors)
        .where(and(eq(doctors.id, doctorId), isNull(doctors.deletedAt)))
        .get()
    )
      throw new Error('پزشک پیدا نشد یا حذف شده است.');
    const current = tx
      .select()
      .from(doctorProfiles)
      .where(and(profileAlive, eq(doctorProfiles.doctorId, doctorId)))
      .get();
    if (basis && (!current || current.id !== basis.id)) throw new DoctorFormConflict();
    if (current) {
      const initial =
        basis === null
          ? {
              ...current,
              birthDate: null,
              hometown: null,
              almaMater: null,
              graduationYear: null,
              familyNotes: null,
              interests: [],
              favoriteTopics: null,
              dislikes: null,
              howWeMet: null,
              memorableMoments: null,
              communicationStyle: null,
              personalNotes: null,
            }
          : basis;
      const patch = initial ? checkedEditPatch(current, initial, input) : input;
      if (Object.keys(patch).length)
        tx.update(doctorProfiles)
          .set({ ...patch, ...touch() })
          .where(and(profileAlive, eq(doctorProfiles.id, current.id)))
          .run();
      return current.id;
    }
    const id = newId();
    tx.insert(doctorProfiles)
      .values({ id, ...stamps(), doctorId, ...input })
      .run();
    return id;
  });
}

/**
 * Every rating in the directory, for the list screen.
 *
 * The average shown next to a name is worked out in JavaScript from these
 * rows: "the newest rating per doctor" is an awkward query in SQLite, and a
 * personal directory holds a few hundred rows at most.
 */
export function allDoctorRatingsQuery() {
  return db.select().from(doctorRatings).where(ratingAlive).orderBy(desc(doctorRatings.ratedAt));
}
