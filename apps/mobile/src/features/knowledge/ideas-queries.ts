import { and, asc, desc, eq, isNull, sql, type SQL } from 'drizzle-orm';

import { db } from '@/db/client';
import { ideas, type Idea } from '@/db/schema';
import { matchesSearch } from '@/db/search';
import { newId, softDelete, stamps, touch } from '@/lib/ids';

import { ideaSearchText } from './logic';

/*
 * The idea inbox: what to build into MedOS next, written down the moment it
 * occurs on a shift rather than lost by the end of it.
 */

const alive = isNull(ideas.deletedAt);

// Text enums sort alphabetically, which would put "done" first and "inbox"
// between "doing" and "planned". Rank them the way a board reads.
const statusRank = sql`case ${ideas.status} when 'doing' then 0 when 'planned' then 1 when 'inbox' then 2 when 'done' then 3 else 4 end`;
const priorityRank = sql`case ${ideas.priority} when 'high' then 0 when 'normal' then 1 else 2 end`;

export type IdeaFilter = { search?: string; status?: Idea['status'] | null; openOnly?: boolean };

export function ideasQuery(filter: IdeaFilter = {}) {
  const clauses: (SQL | undefined)[] = [alive];
  if (filter.status) clauses.push(eq(ideas.status, filter.status));
  if (filter.openOnly) clauses.push(sql`${ideas.status} in ('inbox', 'planned', 'doing')`);
  clauses.push(...matchesSearch(ideas.searchText, filter.search));

  return db
    .select()
    .from(ideas)
    .where(and(...clauses))
    .orderBy(statusRank, priorityRank, desc(ideas.createdAt));
}

export function ideaQuery(id: string) {
  return db
    .select()
    .from(ideas)
    .where(and(alive, eq(ideas.id, id)))
    .limit(1);
}

export type IdeaInput = {
  title: string;
  body?: string | null;
  kind?: Idea['kind'];
  status?: Idea['status'];
  priority?: Idea['priority'];
  area?: string | null;
  tags?: string[];
};

function values(input: IdeaInput) {
  return {
    title: input.title.trim(),
    body: input.body?.trim() || null,
    kind: input.kind ?? ('feature' as const),
    status: input.status ?? ('inbox' as const),
    priority: input.priority ?? ('normal' as const),
    area: input.area?.trim() || null,
    tags: input.tags ?? [],
  };
}

export async function createIdea(input: IdeaInput): Promise<string> {
  const id = newId();
  const row = values(input);
  await db.insert(ideas).values({ id, ...stamps(), ...row, searchText: ideaSearchText(row) });
  return id;
}

export async function updateIdea(id: string, patch: Partial<IdeaInput>): Promise<void> {
  const current = (await ideaQuery(id))[0];
  if (!current) throw new Error(`Idea ${id} not found`);
  const row = values({ ...current, ...patch } as IdeaInput);
  await db
    .update(ideas)
    .set({ ...row, searchText: ideaSearchText(row), ...touch() })
    .where(and(alive, eq(ideas.id, id)));
}

export async function setIdeaStatus(id: string, status: Idea['status']): Promise<void> {
  await db
    .update(ideas)
    .set({ status, ...touch() })
    .where(eq(ideas.id, id));
}

export async function deleteIdea(id: string): Promise<void> {
  await db.update(ideas).set(softDelete()).where(eq(ideas.id, id));
}

/** Areas used before, so the field is a choice rather than free typing every time. */
export async function suggestIdeaAreas(limit = 10): Promise<string[]> {
  const rows = await db
    .select({ area: ideas.area, uses: sql<number>`count(*)` })
    .from(ideas)
    .where(and(alive, sql`${ideas.area} is not null and ${ideas.area} <> ''`))
    .groupBy(ideas.area)
    .orderBy(desc(sql`count(*)`), asc(ideas.area))
    .limit(limit);
  return rows.map((r) => r.area).filter((a): a is string => Boolean(a));
}

export async function reindexIdeas(): Promise<number> {
  const rows = await db.select().from(ideas);
  let changed = 0;
  db.transaction((tx) => {
    for (const i of rows) {
      const next = ideaSearchText(i);
      if (next === i.searchText) continue;
      tx.update(ideas).set({ searchText: next }).where(eq(ideas.id, i.id)).run();
      changed += 1;
    }
  });
  return changed;
}
