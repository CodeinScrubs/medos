import { and, asc, desc, eq, isNull, or, sql, type SQL } from 'drizzle-orm';

import { db } from '@/db/client';
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
async function relatedWords(input: { specialtyId?: string | null; taughtById?: string | null }): Promise<string[]> {
  const words: string[] = [];
  if (input.taughtById) {
    const row = (
      await db
        .select({ title: doctors.title, firstName: doctors.firstName, lastName: doctors.lastName })
        .from(doctors)
        .where(eq(doctors.id, input.taughtById))
        .limit(1)
    )[0];
    if (row) words.push(doctorDisplayName(row));
  }
  if (input.specialtyId) {
    const row = (await db.select().from(specialties).where(eq(specialties.id, input.specialtyId)).limit(1))[0];
    if (row) words.push(row.nameFa, row.nameEn ?? '', ...(row.aliases ?? []));
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

export async function createTopic(input: TopicInput): Promise<string> {
  const id = newId();
  const row = values(input);
  await db.insert(topics).values({
    id,
    ...stamps(),
    ...row,
    searchText: topicSearchText(row, await relatedWords(row)),
  });
  return id;
}

export async function updateTopic(id: string, patch: Partial<TopicInput>): Promise<void> {
  const current = (
    await db
      .select()
      .from(topics)
      .where(and(alive, eq(topics.id, id)))
      .limit(1)
  )[0];
  if (!current) throw new Error(`Topic ${id} not found`);
  // Rebuilt from the merged row, never from the patch: editing only the title
  // must not drop the body out of the index.
  const merged = { ...current, ...values({ ...current, ...patch } as TopicInput) };
  await db
    .update(topics)
    .set({
      ...values({ ...current, ...patch } as TopicInput),
      searchText: topicSearchText(merged, await relatedWords(merged)),
      ...touch(),
    })
    .where(and(alive, eq(topics.id, id)));
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
  const rows = await db.select().from(topics);
  const doctorRows = await db.select().from(doctors);
  const specialtyRows = await db.select().from(specialties);
  const nameById = new Map(doctorRows.map((d) => [d.id, doctorDisplayName(d)]));
  const wordsById = new Map(specialtyRows.map((s) => [s.id, [s.nameFa, s.nameEn ?? '', ...(s.aliases ?? [])]]));

  let changed = 0;
  db.transaction((tx) => {
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

/** Titles used before, for the "same subject again" case. */
export async function suggestTopicTitles(prefix: string, limit = 8): Promise<string[]> {
  const term = prefix.trim();
  if (term.length < 2) return [];
  const rows = await db
    .select({ title: topics.title, uses: sql<number>`count(*)` })
    .from(topics)
    .where(and(alive, or(eq(topics.title, term), matchesSearch(topics.searchText, term)[0])))
    .groupBy(topics.title)
    .orderBy(desc(sql`count(*)`), asc(topics.title))
    .limit(limit);
  return rows.map((r) => r.title);
}
