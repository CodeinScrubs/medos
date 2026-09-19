import { relations } from 'drizzle-orm';
import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

import { baseColumns, bool, isoDate, jsonList } from './_shared';
import { places } from './places';

/* -------------------------------------------------------------------------- */
/*  Specialty reference table                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Seeded list of specialties and subspecialties so that "find me a paediatric
 * infectious disease consultant" is a filter rather than a free-text guess.
 * `parentId` is null for a specialty and set for a subspecialty (فوق تخصص).
 */
export const specialties = sqliteTable(
  'specialties',
  {
    ...baseColumns,
    /** Stable key for seeded rows (`peds-id`, `cardio`). Null for user-added specialties. */
    slug: text('slug'),
    nameFa: text('name_fa').notNull(),
    nameEn: text('name_en'),
    parentId: text('parent_id'),
    kind: text('kind', { enum: ['specialty', 'subspecialty', 'fellowship', 'general'] })
      .notNull()
      .$default(() => 'specialty' as const),
    /** Alternative spellings people actually use, for search. */
    aliases: jsonList('aliases'),
    isSeeded: bool('is_seeded')
      .notNull()
      .$default(() => false),
    sortOrder: integer('sort_order')
      .notNull()
      .$default(() => 0),
  },
  (t) => [index('specialties_parent_idx').on(t.parentId), uniqueIndex('specialties_slug_idx').on(t.slug)],
);

/* -------------------------------------------------------------------------- */
/*  Doctors, professors and colleagues                                          */
/* -------------------------------------------------------------------------- */

export const doctors = sqliteTable(
  'doctors',
  {
    ...baseColumns,

    firstName: text('first_name').notNull(),
    lastName: text('last_name').notNull(),
    /** دکتر / استاد / پروفسور — kept separate so the display name can be built. */
    title: text('title'),
    /** Academic rank: استادیار، دانشیار، استاد تمام. */
    academicRank: text('academic_rank'),

    specialtyId: text('specialty_id').references(() => specialties.id),
    subspecialtyId: text('subspecialty_id').references(() => specialties.id),
    /** Free text fallback when the seeded list does not cover it. */
    specialtyText: text('specialty_text'),

    relationship: text('relationship', {
      enum: ['professor', 'attending', 'colleague', 'resident', 'friend', 'referral', 'other'],
    })
      .notNull()
      .$default(() => 'colleague' as const),

    // Contact
    phone: text('phone'),
    phoneAlt: text('phone_alt'),
    whatsapp: text('whatsapp'),
    telegram: text('telegram'),
    email: text('email'),
    /** Hospital extension, distinct from the department extensions table. */
    extension: text('extension'),

    // Where to find them
    primaryPlaceId: text('primary_place_id').references(() => places.id),
    officeAddress: text('office_address'),
    officeLat: text('office_lat'),
    officeLng: text('office_lng'),
    officeHours: text('office_hours'),
    officePhone: text('office_phone'),

    // Referral practicalities
    acceptsReferrals: bool('accepts_referrals'),
    referralNotes: text('referral_notes'),
    visitFee: text('visit_fee'),
    insurances: jsonList('insurances'),

    photoUri: text('photo_uri'),
    notes: text('notes'),
    tags: jsonList('tags'),
    starred: bool('starred')
      .notNull()
      .$default(() => false),
    searchText: text('search_text'),
  },
  (t) => [
    index('doctors_specialty_idx').on(t.specialtyId, t.subspecialtyId),
    index('doctors_search_idx').on(t.searchText),
    index('doctors_relationship_idx').on(t.relationship),
    index('doctors_starred_idx').on(t.starred, t.deletedAt),
  ],
);

/* -------------------------------------------------------------------------- */
/*  Personal ratings                                                            */
/* -------------------------------------------------------------------------- */

/**
 * A private, subjective 1-5 score per axis. Kept in its own table so the
 * ratings can be revised over time without rewriting the contact record, and
 * so a rating can carry the reasoning behind it.
 *
 * These are personal working notes about colleagues. They are never shared,
 * exported by default, or shown to anyone else.
 */
export const doctorRatings = sqliteTable(
  'doctor_ratings',
  {
    ...baseColumns,
    doctorId: text('doctor_id')
      .notNull()
      .references(() => doctors.id, { onDelete: 'cascade' }),

    /** سواد و دانش روز */
    knowledge: integer('knowledge'),
    /** اورینت بودن و به‌روز بودن با پروتکل‌ها */
    orientation: integer('orientation'),
    /** نحوه‌ی برخورد با بیمار */
    patientRapport: integer('patient_rapport'),
    /** احتمال پاسخگویی در شرایط اورژانسی */
    emergencyResponsiveness: integer('emergency_responsiveness'),
    /** میزان استقبال از تماس یا پیام من */
    contactOpenness: integer('contact_openness'),
    /** همکاری و آموزش‌دهندگی */
    teaching: integer('teaching'),

    reasoning: text('reasoning'),
    ratedAt: integer('rated_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (t) => [index('doctor_ratings_doctor_idx').on(t.doctorId, t.ratedAt)],
);

/* -------------------------------------------------------------------------- */
/*  Personal profile: the social layer                                          */
/* -------------------------------------------------------------------------- */

/**
 * Background details that make a working relationship warmer: where they are
 * from, what they studied, what they like talking about, how we met. Split
 * from `doctors` because it is optional and much more free-form.
 */
export const doctorProfiles = sqliteTable(
  'doctor_profiles',
  {
    ...baseColumns,
    doctorId: text('doctor_id')
      .notNull()
      .references(() => doctors.id, { onDelete: 'cascade' }),

    birthDate: isoDate('birth_date'),
    hometown: text('hometown'),
    almaMater: text('alma_mater'),
    graduationYear: text('graduation_year'),
    familyNotes: text('family_notes'),
    interests: jsonList('interests'),
    favoriteTopics: text('favorite_topics'),
    dislikes: text('dislikes'),
    /** How we met and what the shared history is. */
    howWeMet: text('how_we_met'),
    memorableMoments: text('memorable_moments'),
    /** Practical etiquette: prefers calls after 9pm, hates voice notes, etc. */
    communicationStyle: text('communication_style'),
    personalNotes: text('personal_notes'),
  },
  (t) => [index('doctor_profiles_doctor_idx').on(t.doctorId)],
);

/* -------------------------------------------------------------------------- */
/*  Occasions and scheduled greetings                                           */
/* -------------------------------------------------------------------------- */

/**
 * Recurring dates worth a message. `jalaliMonth`/`jalaliDay` are stored
 * directly because a Persian birthday recurs on the Jalali calendar, and
 * converting a stored Gregorian date back each year drifts by a day.
 */
export const occasions = sqliteTable(
  'occasions',
  {
    ...baseColumns,
    doctorId: text('doctor_id').references(() => doctors.id, { onDelete: 'cascade' }),
    patientId: text('patient_id'),

    kind: text('kind', {
      enum: ['birthday', 'anniversary', 'graduation', 'holiday', 'religious', 'custom'],
    })
      .notNull()
      .$default(() => 'custom' as const),
    title: text('title').notNull(),

    jalaliMonth: integer('jalali_month'),
    jalaliDay: integer('jalali_day'),
    /** One-off occasions use an absolute date instead. */
    onDate: isoDate('on_date'),
    isRecurring: bool('is_recurring')
      .notNull()
      .$default(() => true),

    messageTemplate: text('message_template'),
    /** How many days ahead to be reminded. */
    remindDaysBefore: integer('remind_days_before')
      .notNull()
      .$default(() => 1),
    isEnabled: bool('is_enabled')
      .notNull()
      .$default(() => true),
    notificationId: text('notification_id'),
  },
  (t) => [index('occasions_doctor_idx').on(t.doctorId), index('occasions_date_idx').on(t.jalaliMonth, t.jalaliDay)],
);

/**
 * A planned or sent greeting. MedOS never sends silently: it raises a
 * notification, prefills the text, and the user taps send in their own SMS or
 * messaging app. The log is what makes "they know who I am" work over years.
 */
export const scheduledMessages = sqliteTable(
  'scheduled_messages',
  {
    ...baseColumns,
    doctorId: text('doctor_id').references(() => doctors.id, { onDelete: 'cascade' }),
    patientId: text('patient_id'),
    occasionId: text('occasion_id').references(() => occasions.id, { onDelete: 'set null' }),

    channel: text('channel', { enum: ['sms', 'whatsapp', 'telegram', 'call', 'email', 'inperson'] })
      .notNull()
      .$default(() => 'sms' as const),
    body: text('body'),
    scheduledFor: integer('scheduled_for', { mode: 'timestamp_ms' }).notNull(),
    status: text('status', { enum: ['pending', 'ready', 'sent', 'skipped', 'failed'] })
      .notNull()
      .$default(() => 'pending' as const),
    sentAt: integer('sent_at', { mode: 'timestamp_ms' }),
    notificationId: text('notification_id'),
    notes: text('notes'),
  },
  (t) => [
    index('scheduled_messages_due_idx').on(t.status, t.scheduledFor),
    index('scheduled_messages_doctor_idx').on(t.doctorId),
  ],
);

/* -------------------------------------------------------------------------- */
/*  Relations                                                                   */
/* -------------------------------------------------------------------------- */

export const doctorsRelations = relations(doctors, ({ one, many }) => ({
  specialty: one(specialties, {
    fields: [doctors.specialtyId],
    references: [specialties.id],
    relationName: 'doctorSpecialty',
  }),
  subspecialty: one(specialties, {
    fields: [doctors.subspecialtyId],
    references: [specialties.id],
    relationName: 'doctorSubspecialty',
  }),
  primaryPlace: one(places, { fields: [doctors.primaryPlaceId], references: [places.id] }),
  ratings: many(doctorRatings),
  profiles: many(doctorProfiles),
  occasions: many(occasions),
  messages: many(scheduledMessages),
}));

export const doctorRatingsRelations = relations(doctorRatings, ({ one }) => ({
  doctor: one(doctors, { fields: [doctorRatings.doctorId], references: [doctors.id] }),
}));

export const doctorProfilesRelations = relations(doctorProfiles, ({ one }) => ({
  doctor: one(doctors, { fields: [doctorProfiles.doctorId], references: [doctors.id] }),
}));

export const occasionsRelations = relations(occasions, ({ one, many }) => ({
  doctor: one(doctors, { fields: [occasions.doctorId], references: [doctors.id] }),
  messages: many(scheduledMessages),
}));

/* -------------------------------------------------------------------------- */
/*  Inferred types                                                              */
/* -------------------------------------------------------------------------- */

export type Specialty = typeof specialties.$inferSelect;
export type Doctor = typeof doctors.$inferSelect;
export type NewDoctor = typeof doctors.$inferInsert;
export type DoctorRating = typeof doctorRatings.$inferSelect;
export type DoctorProfile = typeof doctorProfiles.$inferSelect;
export type Occasion = typeof occasions.$inferSelect;
export type ScheduledMessage = typeof scheduledMessages.$inferSelect;

/** The rating axes, in the order they should appear in the UI. */
export const RATING_AXES = [
  { key: 'knowledge', labelFa: 'سواد و دانش' },
  { key: 'orientation', labelFa: 'اورینت بودن' },
  { key: 'patientRapport', labelFa: 'برخورد با بیمار' },
  { key: 'emergencyResponsiveness', labelFa: 'پاسخگویی اورژانسی' },
  { key: 'contactOpenness', labelFa: 'استقبال از تماس' },
  { key: 'teaching', labelFa: 'آموزش‌دهندگی' },
] as const;

export type RatingAxis = (typeof RATING_AXES)[number]['key'];
