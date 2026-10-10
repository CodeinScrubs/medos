import { and, desc, eq, isNull, sql, type SQL } from 'drizzle-orm';

import { db, type DbTransaction } from '@/db/client';
import { doctors, specialties, topics } from '@/db/schema';
import { matchesSearch } from '@/db/search';
import { doctorDisplayName } from '@/features/doctors/logic';
import { newId, softDelete, stamps, touch } from '@/lib/ids';

import { topicSearchText } from './logic';

/*
 * Subject summaries, tied to the person who taught them.
 *
 * The teacher's name and the specialty are part of the search index, so
 * "ARDS استاد کریمی" finds the topic even though the name is in another table.
 */

const alive = isNull(topics.deletedAt);

export type TopicFilter = {
  search?: string;
  specialtyId?: string | null;
  taughtById?: string | null;
  needsReviewOnly?: boolean;
  starredOnly?: boolean;
};

export function topicsQuery(filter: TopicFilter = {}) {
  const clauses: (SQL | undefined)[] = [alive];
  if (filter.specialtyId) clauses.push(eq(topics.specialtyId, filter.specialtyId));
  if (filter.taughtById) clauses.push(eq(topics.taughtById, filter.taughtById));
  if (filter.needsReviewOnly) clauses.push(eq(topics.needsReview, true));
  if (filter.starredOnly) clauses.push(eq(topics.starred, true));
  clauses.push(...matchesSearch(topics.searchText, filter.search));

  return db
    .select({ topic: topics, teacher: doctors, specialty: specialties })
    .from(topics)
    .leftJoin(doctors, eq(topics.taughtById, doctors.id))
    .leftJoin(specialties, eq(topics.specialtyId, specialties.id))
    .where(and(...clauses))
    .orderBy(desc(topics.starred), desc(topics.taughtAt), desc(topics.createdAt));
}

export function topicQuery(id: string) {
  return db
    .select({ topic: topics, teacher: doctors, specialty: specialties })
    .from(topics)
    .leftJoin(doctors, eq(topics.taughtById, doctors.id))
    .leftJoin(specialties, eq(topics.specialtyId, specialties.id))
    .where(and(alive, eq(topics.id, id)))
    .limit(1);
}

/** Read only the selected references, including archived historical links.
 * Archived rows remain visible here but never become picker choices.
 */
export function topicReferencesQuery(taughtById: string | null, specialtyId: string | null) {
  return db
    .select({
      teacher: {
        id: doctors.id,
        title: doctors.title,
        firstName: doctors.firstName,
        lastName: doctors.lastName,
        deletedAt: doctors.deletedAt,
      },
      specialty: { id: specialties.id, nameFa: specialties.nameFa, deletedAt: specialties.deletedAt },
    })
    .from(sql`(select 1) as topic_references`)
    .leftJoin(doctors, taughtById === null ? sql`0` : eq(doctors.id, taughtById))
    .leftJoin(specialties, specialtyId === null ? sql`0` : eq(specialties.id, specialtyId))
    .limit(1);
}

export type TopicInput = {
  title: string;
  specialtyId?: string | null;
  taughtById?: string | null;
  context?: string | null;
  taughtAt?: Date | null;
  summary?: string | null;
  body?: string | null;
  professorNotes?: string | null;
  pearls?: string | null;
  source?: string | null;
  tags?: string[];
  starred?: boolean;
  needsReview?: boolean;
};

/** The teacher's name and the specialty's names, so both are searchable. */
function relatedWords(
  tx: DbTransaction,
  input: { specialtyId?: string | null; taughtById?: string | null },
  previous?: { specialtyId: string | null; taughtById: string | null },
): string[] {
  const words: string[] = [];
  if (input.taughtById) {
    const row = tx
      .select({
        title: doctors.title,
        firstName: doctors.firstName,
        lastName: doctors.lastName,
        deletedAt: doctors.deletedAt,
      })
      .from(doctors)
      .where(eq(doctors.id, input.taughtById))
      .get();
    if (!row || (row.deletedAt !== null && input.taughtById !== previous?.taughtById))
      throw new Error('استاد انتخاب‌شده در دسترس نیست.');
    words.push(doctorDisplayName(row));
  }
  if (input.specialtyId) {
    const row = tx.select().from(specialties).where(eq(specialties.id, input.specialtyId)).get();
    if (!row || (row.deletedAt !== null && input.specialtyId !== previous?.specialtyId))
      throw new Error('تخصص انتخاب‌شده در دسترس نیست.');
    words.push(row.nameFa, row.nameEn ?? '', ...(row.aliases ?? []));
  }
  return words.filter(Boolean);
}

function values(input: TopicInput) {
  return {
    title: input.title.trim(),
    specialtyId: input.specialtyId ?? null,
    taughtById: input.taughtById ?? null,
    context: input.context?.trim() || null,
    taughtAt: input.taughtAt ?? null,
    summary: input.summary?.trim() || null,
    body: input.body?.trim() || null,
    professorNotes: input.professorNotes?.trim() || null,
    pearls: input.pearls?.trim() || null,
    source: input.source?.trim() || null,
    tags: input.tags ?? [],
    starred: input.starred ?? false,
    needsReview: input.needsReview ?? false,
  };
}

export function createTopicInTransaction(tx: DbTransaction, input: TopicInput, now: Date): string {
  const id = newId();
  const row = values(input);
  tx.insert(topics)
    .values({
      id,
      ...stamps(now),
      ...row,
      searchText: topicSearchText(row, relatedWords(tx, row)),
    })
    .run();
  return id;
}

export function updateTopicInTransaction(tx: DbTransaction, id: string, patch: Partial<TopicInput>, now: Date): void {
  const current = tx
    .select()
    .from(topics)
    .where(and(alive, eq(topics.id, id)))
    .get();
  if (!current) throw new Error('مبحث در دسترس نیست.');
  // Rebuilt from the merged row, never from the patch: editing only the title
  // must not drop the body out of the index.
  const defined = Object.fromEntries(Object.entries(patch).filter(([, value]) => value !== undefined));
  const row = values({ ...current, ...defined, tags: patch.tags ?? current.tags ?? [] });
  const merged = { ...current, ...row };
  tx.update(topics)
    .set({
      ...row,
      // Keep an existing archived relationship; reject a newly selected one.
      searchText: topicSearchText(merged, relatedWords(tx, merged, current)),
      ...touch(now),
    })
    .where(and(alive, eq(topics.id, id)))
    .run();
}

export async function createTopic(input: TopicInput): Promise<string> {
  return db.transaction((tx) => createTopicInTransaction(tx, input, new Date()));
}
export async function updateTopic(id: string, patch: Partial<TopicInput>): Promise<void> {
  db.transaction((tx) => updateTopicInTransaction(tx, id, patch, new Date()));
}

/** Mark a subject reviewed: the flag comes off and the date is stamped. */
export async function markTopicReviewed(id: string): Promise<void> {
  await db
    .update(topics)
    .set({ needsReview: false, lastReviewedAt: new Date(), ...touch() })
    .where(eq(topics.id, id));
}

export async function setTopicNeedsReview(id: string, needsReview: boolean): Promise<void> {
  await db
    .update(topics)
    .set({ needsReview, ...touch() })
    .where(eq(topics.id, id));
}

export async function setTopicStarred(id: string, starred: boolean): Promise<void> {
  await db
    .update(topics)
    .set({ starred, ...touch() })
    .where(eq(topics.id, id));
}

export async function deleteTopic(id: string): Promise<void> {
  await db.update(topics).set(softDelete()).where(eq(topics.id, id));
}

/** Tags used before, most used first — the tag suggestions on the form. */
export async function suggestTopicTags(limit = 12): Promise<string[]> {
  const rows = await db.select({ tags: topics.tags }).from(topics).where(alive);
  const counts = new Map<string, number>();
  for (const row of rows) {
    for (const tag of row.tags ?? []) counts.set(tag, (counts.get(tag) ?? 0) + 1);
  }
  return [...counts]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([tag]) => tag);
}

/** Rebuild every topic's search index; see features/search/reindex.ts. */
export async function reindexTopics(): Promise<number> {
  let changed = 0;
  db.transaction((tx) => {
    const rows = tx.select().from(topics).all();
    const doctorRows = tx.select().from(doctors).all();
    const specialtyRows = tx.select().from(specialties).all();
    const nameById = new Map(doctorRows.map((d) => [d.id, doctorDisplayName(d)]));
    const wordsById = new Map(specialtyRows.map((s) => [s.id, [s.nameFa, s.nameEn ?? '', ...(s.aliases ?? [])]]));
    for (const t of rows) {
      const extra = [
        t.taughtById ? (nameById.get(t.taughtById) ?? '') : '',
        ...(t.specialtyId ? (wordsById.get(t.specialtyId) ?? []) : []),
      ].filter(Boolean);
      const next = topicSearchText(t, extra);
      if (next === t.searchText) continue;
      tx.update(topics).set({ searchText: next }).where(eq(topics.id, t.id)).run();
      changed += 1;
    }
  });
  return changed;
}

/** Subjects a teacher taught — shown on their page in the doctors directory. */
export function topicsByTeacherQuery(doctorId: string) {
  return db
    .select()
    .from(topics)
    .where(and(alive, eq(topics.taughtById, doctorId)))
    .orderBy(desc(topics.taughtAt), desc(topics.createdAt));
}
