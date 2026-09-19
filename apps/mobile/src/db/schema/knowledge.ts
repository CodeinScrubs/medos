import { relations } from 'drizzle-orm';
import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

import { baseColumns, bool, jsonList } from './_shared';
import { doctors, specialties } from './people';

/* -------------------------------------------------------------------------- */
/*  Topic summaries                                                             */
/* -------------------------------------------------------------------------- */

/**
 * A summary of one subject, tied to the professor who actually taught it.
 * That link is the point: months later, "what did Dr X say about ARDS
 * management" is the question being asked, not "what does the textbook say".
 */
export const topics = sqliteTable(
  'topics',
  {
    ...baseColumns,
    title: text('title').notNull(),
    specialtyId: text('specialty_id').references(() => specialties.id),
    /** The professor whose teaching this records. */
    taughtById: text('taught_by_id').references(() => doctors.id),
    /** Where it was taught: rotation, ward, conference, journal club. */
    context: text('context'),
    taughtAt: integer('taught_at', { mode: 'timestamp_ms' }),

    /** The user's own condensed version. */
    summary: text('summary'),
    /** Longer body, markdown-ish free text. */
    body: text('body'),
    /** Verbatim points worth keeping in the teacher's own framing. */
    professorNotes: text('professor_notes'),
    /** Clinical pearls and exam-relevant takeaways. */
    pearls: text('pearls'),
    source: text('source'),

    tags: jsonList('tags'),
    starred: bool('starred')
      .notNull()
      .$default(() => false),
    /** Simple spaced-review flag: needs another pass before exams. */
    needsReview: bool('needs_review')
      .notNull()
      .$default(() => false),
    lastReviewedAt: integer('last_reviewed_at', { mode: 'timestamp_ms' }),
    searchText: text('search_text'),
  },
  (t) => [
    index('topics_specialty_idx').on(t.specialtyId),
    index('topics_taught_by_idx').on(t.taughtById),
    index('topics_search_idx').on(t.searchText),
  ],
);

/* -------------------------------------------------------------------------- */
/*  Specialty research: "what is this field actually like?"                     */
/* -------------------------------------------------------------------------- */

/**
 * Notes gathered while deciding on a career path: what the work looks like,
 * what residency costs in years and sanity, what the income and lifestyle are,
 * and who said so.
 */
export const specialtyProfiles = sqliteTable(
  'specialty_profiles',
  {
    ...baseColumns,
    specialtyId: text('specialty_id').references(() => specialties.id),
    /** Free text when the specialty is not in the seeded list. */
    nameText: text('name_text'),

    overview: text('overview'),
    dailyWork: text('daily_work'),
    residencyYears: text('residency_years'),
    entranceDifficulty: text('entrance_difficulty'),
    lifestyle: text('lifestyle'),
    incomeNotes: text('income_notes'),
    jobMarket: text('job_market'),
    subspecialtyPaths: text('subspecialty_paths'),
    prosText: text('pros_text'),
    consText: text('cons_text'),

    /** My own gut feeling, 1-5, revisited over time. */
    personalFit: integer('personal_fit'),
    myThoughts: text('my_thoughts'),
    /** Who I asked, so claims can be weighed later. */
    sourcesText: text('sources_text'),
    tags: jsonList('tags'),
    searchText: text('search_text'),
  },
  (t) => [index('specialty_profiles_specialty_idx').on(t.specialtyId)],
);

/* -------------------------------------------------------------------------- */
/*  Routine outpatient prescriptions                                            */
/* -------------------------------------------------------------------------- */

/**
 * A reusable prescription for a common outpatient presentation. Items are a
 * JSON array rather than a child table because a template is always read and
 * written whole, and keeping it in one row makes duplication trivial.
 *
 * These are the user's own templates. MedOS stores and reproduces what they
 * wrote; it does not generate or suggest drug regimens.
 */
export type PrescriptionItem = {
  drug: string;
  form?: string;
  dose?: string;
  route?: string;
  frequency?: string;
  duration?: string;
  quantity?: string;
  sig?: string;
  notes?: string;
};

export const prescriptionTemplates = sqliteTable(
  'prescription_templates',
  {
    ...baseColumns,
    title: text('title').notNull(),
    /** The presentation this covers, e.g. "Uncomplicated UTI, adult female". */
    condition: text('condition'),
    specialtyId: text('specialty_id').references(() => specialties.id),
    ageGroup: text('age_group', { enum: ['adult', 'pediatric', 'geriatric', 'any'] })
      .notNull()
      .$default(() => 'any' as const),

    items: text('items', { mode: 'json' }).$type<PrescriptionItem[]>(),
    /** Advice given alongside the drugs. */
    adviceText: text('advice_text'),
    /** Red flags that should send the patient back. */
    cautionsText: text('cautions_text'),
    followUpText: text('follow_up_text'),

    usageCount: integer('usage_count')
      .notNull()
      .$default(() => 0),
    lastUsedAt: integer('last_used_at', { mode: 'timestamp_ms' }),
    starred: bool('starred')
      .notNull()
      .$default(() => false),
    tags: jsonList('tags'),
    searchText: text('search_text'),
  },
  (t) => [index('rx_templates_search_idx').on(t.searchText), index('rx_templates_usage_idx').on(t.usageCount)],
);

/* -------------------------------------------------------------------------- */
/*  Idea inbox: what to build into MedOS next                                   */
/* -------------------------------------------------------------------------- */

export const ideas = sqliteTable(
  'ideas',
  {
    ...baseColumns,
    title: text('title').notNull(),
    body: text('body'),
    kind: text('kind', { enum: ['feature', 'bug', 'workflow', 'research', 'personal', 'other'] })
      .notNull()
      .$default(() => 'feature' as const),
    status: text('status', { enum: ['inbox', 'planned', 'doing', 'done', 'dropped'] })
      .notNull()
      .$default(() => 'inbox' as const),
    priority: text('priority', { enum: ['low', 'normal', 'high'] })
      .notNull()
      .$default(() => 'normal' as const),
    /** Which part of MedOS it touches. */
    area: text('area'),
    tags: jsonList('tags'),
    searchText: text('search_text'),
  },
  (t) => [index('ideas_status_idx').on(t.status, t.priority)],
);

/* -------------------------------------------------------------------------- */
/*  Relations                                                                   */
/* -------------------------------------------------------------------------- */

export const topicsRelations = relations(topics, ({ one }) => ({
  specialty: one(specialties, { fields: [topics.specialtyId], references: [specialties.id] }),
  taughtBy: one(doctors, { fields: [topics.taughtById], references: [doctors.id] }),
}));

export const specialtyProfilesRelations = relations(specialtyProfiles, ({ one }) => ({
  specialty: one(specialties, {
    fields: [specialtyProfiles.specialtyId],
    references: [specialties.id],
  }),
}));

export type Topic = typeof topics.$inferSelect;
export type SpecialtyProfile = typeof specialtyProfiles.$inferSelect;
export type PrescriptionTemplate = typeof prescriptionTemplates.$inferSelect;
export type Idea = typeof ideas.$inferSelect;
