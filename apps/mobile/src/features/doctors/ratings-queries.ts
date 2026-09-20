import { and, desc, eq, isNull } from 'drizzle-orm';

import { db } from '@/db/client';
import { doctorProfiles, doctorRatings, type DoctorProfile } from '@/db/schema';
import { newId, softDelete, stamps, touch } from '@/lib/ids';

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
  await db.insert(doctorRatings).values({
    id,
    ...stamps(),
    doctorId,
    ...scores,
    reasoning: reasoning?.trim() || null,
    ratedAt: ratedAt ?? new Date(),
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

export type ProfileInput = Partial<Omit<DoctorProfile, 'id' | 'doctorId' | 'createdAt' | 'updatedAt' | 'deletedAt'>>;

/** One profile per doctor: written if it exists, created if it does not. */
export async function saveDoctorProfile(doctorId: string, input: ProfileInput): Promise<string> {
  const current = (await doctorProfileQuery(doctorId))[0];
  if (current) {
    await db
      .update(doctorProfiles)
      .set({ ...input, ...touch() })
      .where(eq(doctorProfiles.id, current.id));
    return current.id;
  }
  const id = newId();
  await db.insert(doctorProfiles).values({ id, ...stamps(), doctorId, ...input });
  return id;
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
