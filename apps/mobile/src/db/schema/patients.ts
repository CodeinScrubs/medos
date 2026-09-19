import { relations } from 'drizzle-orm';
import { index, integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';

import { baseColumns, bool, isoDate, jsonList } from './_shared';
import { doctors } from './people';
import { places } from './places';

/* -------------------------------------------------------------------------- */
/*  Patient                                                                     */
/* -------------------------------------------------------------------------- */

export const patients = sqliteTable(
  'patients',
  {
    ...baseColumns,

    // Identity
    firstName: text('first_name').notNull(),
    lastName: text('last_name').notNull(),
    nationalId: text('national_id'),
    fileNumber: text('file_number'),
    sex: text('sex', { enum: ['male', 'female', 'other'] }),
    birthDate: isoDate('birth_date'),
    /** Used when only an approximate age is known, which is the norm on the ward. */
    ageYears: integer('age_years'),

    // Contact
    phone: text('phone'),
    city: text('city'),
    address: text('address'),

    // Clinical background: permanent, not per-admission
    bloodType: text('blood_type'),
    allergies: text('allergies'),
    pastMedicalHistory: text('past_medical_history'),
    drugHistory: text('drug_history'),
    familyHistory: text('family_history'),
    /** Smoking, opium, alcohol: asked on nearly every Iranian history. */
    habitualHistory: text('habitual_history'),

    // Workflow
    status: text('status', {
      enum: ['admitted', 'outpatient', 'followup', 'discharged', 'archived', 'deceased'],
    })
      .notNull()
      .$default(() => 'admitted' as const),
    starred: bool('starred')
      .notNull()
      .$default(() => false),
    tags: jsonList('tags'),
    /** One line answering "who is this patient again?" when scanning the list. */
    summary: text('summary'),

    /** Normalised name + ids + tags, so Persian search survives the ی/ي and ک/ك split. */
    searchText: text('search_text'),
  },
  (t) => [
    index('patients_status_idx').on(t.status, t.deletedAt),
    index('patients_search_idx').on(t.searchText),
    index('patients_national_id_idx').on(t.nationalId),
    index('patients_updated_idx').on(t.updatedAt),
  ],
);

/** Companions and next of kin. A patient usually has more than one useful number. */
export const patientContacts = sqliteTable(
  'patient_contacts',
  {
    ...baseColumns,
    patientId: text('patient_id')
      .notNull()
      .references(() => patients.id, { onDelete: 'cascade' }),
    name: text('name'),
    relation: text('relation'),
    phone: text('phone').notNull(),
    isPrimary: bool('is_primary')
      .notNull()
      .$default(() => false),
    notes: text('notes'),
  },
  (t) => [index('patient_contacts_patient_idx').on(t.patientId)],
);

/* -------------------------------------------------------------------------- */
/*  Encounter: one admission, or one outpatient episode                         */
/* -------------------------------------------------------------------------- */

export const encounters = sqliteTable(
  'encounters',
  {
    ...baseColumns,
    patientId: text('patient_id')
      .notNull()
      .references(() => patients.id, { onDelete: 'cascade' }),

    kind: text('kind', { enum: ['admission', 'outpatient', 'emergency', 'consult_only'] })
      .notNull()
      .$default(() => 'admission' as const),

    placeId: text('place_id').references(() => places.id),
    ward: text('ward'),
    bed: text('bed'),
    service: text('service'),
    attendingId: text('attending_id').references(() => doctors.id),

    chiefComplaint: text('chief_complaint'),
    admittedAt: integer('admitted_at', { mode: 'timestamp_ms' }),
    dischargedAt: integer('discharged_at', { mode: 'timestamp_ms' }),
    dischargeType: text('discharge_type', {
      enum: ['recovered', 'improved', 'referred', 'ama', 'death', 'other'],
    }),
    outcomeNotes: text('outcome_notes'),
    isActive: bool('is_active')
      .notNull()
      .$default(() => true),
  },
  (t) => [
    index('encounters_patient_idx').on(t.patientId, t.admittedAt),
    index('encounters_active_idx').on(t.isActive, t.deletedAt),
  ],
);

/* -------------------------------------------------------------------------- */
/*  Diagnoses                                                                   */
/* -------------------------------------------------------------------------- */

export const diagnoses = sqliteTable(
  'diagnoses',
  {
    ...baseColumns,
    patientId: text('patient_id')
      .notNull()
      .references(() => patients.id, { onDelete: 'cascade' }),
    encounterId: text('encounter_id').references(() => encounters.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    icdCode: text('icd_code'),
    kind: text('kind', { enum: ['primary', 'secondary', 'rule_out', 'past', 'complication'] })
      .notNull()
      .$default(() => 'secondary' as const),
    status: text('status', { enum: ['active', 'resolved', 'ruled_out'] })
      .notNull()
      .$default(() => 'active' as const),
    onsetDate: isoDate('onset_date'),
    notes: text('notes'),
    sortOrder: integer('sort_order')
      .notNull()
      .$default(() => 0),
  },
  (t) => [index('diagnoses_patient_idx').on(t.patientId, t.encounterId)],
);

/* -------------------------------------------------------------------------- */
/*  Notes: H&P, progress, consult, discharge summary                            */
/* -------------------------------------------------------------------------- */

export const NOTE_TYPES = [
  'admission',
  'progress',
  'consult_request',
  'consult_reply',
  'procedure',
  'operation',
  'outpatient_visit',
  'phone_followup',
  'discharge',
  'event',
  'general',
] as const;

export type NoteType = (typeof NOTE_TYPES)[number];

export const notes = sqliteTable(
  'notes',
  {
    ...baseColumns,
    patientId: text('patient_id')
      .notNull()
      .references(() => patients.id, { onDelete: 'cascade' }),
    encounterId: text('encounter_id').references(() => encounters.id, { onDelete: 'cascade' }),

    type: text('type', { enum: NOTE_TYPES })
      .notNull()
      .$default(() => 'progress' as const),

    title: text('title'),
    body: text('body'),
    /** SOAP fields kept separate so each note type can template only what it needs. */
    subjective: text('subjective'),
    objective: text('objective'),
    assessment: text('assessment'),
    plan: text('plan'),

    noteDate: integer('note_date', { mode: 'timestamp_ms' }).notNull(),
    authorName: text('author_name'),
    /** Consult notes point at the specialist involved. */
    doctorId: text('doctor_id').references(() => doctors.id),
    specialty: text('specialty'),
    isDraft: bool('is_draft')
      .notNull()
      .$default(() => false),
    isPinned: bool('is_pinned')
      .notNull()
      .$default(() => false),
    searchText: text('search_text'),
  },
  (t) => [
    index('notes_patient_idx').on(t.patientId, t.noteDate),
    index('notes_encounter_idx').on(t.encounterId),
    index('notes_type_idx').on(t.type),
    index('notes_search_idx').on(t.searchText),
  ],
);

/* -------------------------------------------------------------------------- */
/*  Kardex: drugs, fluids, diet and nursing orders                              */
/* -------------------------------------------------------------------------- */

export const orders = sqliteTable(
  'orders',
  {
    ...baseColumns,
    patientId: text('patient_id')
      .notNull()
      .references(() => patients.id, { onDelete: 'cascade' }),
    encounterId: text('encounter_id').references(() => encounters.id, { onDelete: 'cascade' }),

    kind: text('kind', {
      enum: ['drug', 'fluid', 'diet', 'nursing', 'lab', 'imaging', 'consult', 'other'],
    })
      .notNull()
      .$default(() => 'drug' as const),

    name: text('name').notNull(),
    brandName: text('brand_name'),
    dose: text('dose'),
    route: text('route'),
    frequency: text('frequency'),
    /** Infusions: "80 cc/h". */
    rate: text('rate'),
    duration: text('duration'),
    isPrn: bool('is_prn')
      .notNull()
      .$default(() => false),
    prnCondition: text('prn_condition'),

    status: text('status', { enum: ['active', 'held', 'discontinued', 'completed'] })
      .notNull()
      .$default(() => 'active' as const),
    startAt: integer('start_at', { mode: 'timestamp_ms' }),
    endAt: integer('end_at', { mode: 'timestamp_ms' }),

    indication: text('indication'),
    prescriberId: text('prescriber_id').references(() => doctors.id),
    notes: text('notes'),
    sortOrder: integer('sort_order')
      .notNull()
      .$default(() => 0),
  },
  (t) => [index('orders_patient_idx').on(t.patientId, t.status), index('orders_encounter_idx').on(t.encounterId)],
);

/* -------------------------------------------------------------------------- */
/*  Vitals                                                                      */
/* -------------------------------------------------------------------------- */

export const vitals = sqliteTable(
  'vitals',
  {
    ...baseColumns,
    patientId: text('patient_id')
      .notNull()
      .references(() => patients.id, { onDelete: 'cascade' }),
    encounterId: text('encounter_id').references(() => encounters.id, { onDelete: 'cascade' }),
    measuredAt: integer('measured_at', { mode: 'timestamp_ms' }).notNull(),
    systolic: integer('systolic'),
    diastolic: integer('diastolic'),
    heartRate: integer('heart_rate'),
    respRate: integer('resp_rate'),
    temperature: real('temperature'),
    spo2: integer('spo2'),
    bloodSugar: integer('blood_sugar'),
    weightKg: real('weight_kg'),
    heightCm: real('height_cm'),
    painScore: integer('pain_score'),
    urineOutput: text('urine_output'),
    notes: text('notes'),
  },
  (t) => [index('vitals_patient_idx').on(t.patientId, t.measuredAt)],
);

/* -------------------------------------------------------------------------- */
/*  Labs: a panel is one draw, values are the individual analytes               */
/* -------------------------------------------------------------------------- */

export const labPanels = sqliteTable(
  'lab_panels',
  {
    ...baseColumns,
    patientId: text('patient_id')
      .notNull()
      .references(() => patients.id, { onDelete: 'cascade' }),
    encounterId: text('encounter_id').references(() => encounters.id, { onDelete: 'cascade' }),
    name: text('name'),
    collectedAt: integer('collected_at', { mode: 'timestamp_ms' }).notNull(),
    /** How the panel got in. A photo-only panel has no parsed values yet. */
    source: text('source', { enum: ['manual', 'excel', 'photo', 'draft'] })
      .notNull()
      .$default(() => 'manual' as const),
    labName: text('lab_name'),
    notes: text('notes'),
  },
  (t) => [index('lab_panels_patient_idx').on(t.patientId, t.collectedAt)],
);

export const labValues = sqliteTable(
  'lab_values',
  {
    ...baseColumns,
    panelId: text('panel_id')
      .notNull()
      .references(() => labPanels.id, { onDelete: 'cascade' }),
    patientId: text('patient_id')
      .notNull()
      .references(() => patients.id, { onDelete: 'cascade' }),
    analyte: text('analyte').notNull(),
    /** Text, because results are not always numeric: "negative", "trace", "<0.01". */
    value: text('value'),
    /** Parsed numeric copy, used for trend charts and out-of-range flags. */
    valueNum: real('value_num'),
    unit: text('unit'),
    refLow: real('ref_low'),
    refHigh: real('ref_high'),
    flag: text('flag', { enum: ['normal', 'high', 'low', 'critical_high', 'critical_low'] }),
    notes: text('notes'),
    sortOrder: integer('sort_order')
      .notNull()
      .$default(() => 0),
  },
  (t) => [index('lab_values_panel_idx').on(t.panelId), index('lab_values_trend_idx').on(t.patientId, t.analyte)],
);

/* -------------------------------------------------------------------------- */
/*  Imaging, including "where does this study actually live?"                   */
/* -------------------------------------------------------------------------- */

export const imagingStudies = sqliteTable(
  'imaging_studies',
  {
    ...baseColumns,
    patientId: text('patient_id')
      .notNull()
      .references(() => patients.id, { onDelete: 'cascade' }),
    encounterId: text('encounter_id').references(() => encounters.id, { onDelete: 'cascade' }),
    modality: text('modality', {
      enum: ['xray', 'ct', 'mri', 'us', 'echo', 'endoscopy', 'nuclear', 'angio', 'other'],
    })
      .notNull()
      .$default(() => 'other' as const),
    region: text('region'),
    studyDate: integer('study_date', { mode: 'timestamp_ms' }),
    /** The practical question on rounds: where do I go to actually look at it? */
    storageLocation: text('storage_location'),
    storagePlatform: text('storage_platform'),
    accessionNumber: text('accession_number'),
    accessUrl: text('access_url'),
    /** Login hints, which workstation, who to ask. */
    accessNotes: text('access_notes'),
    reportText: text('report_text'),
    impression: text('impression'),
    radiologistId: text('radiologist_id').references(() => doctors.id),
    status: text('status', { enum: ['ordered', 'done', 'reported', 'reviewed'] })
      .notNull()
      .$default(() => 'done' as const),
    notes: text('notes'),
  },
  (t) => [index('imaging_patient_idx').on(t.patientId, t.studyDate)],
);

/* -------------------------------------------------------------------------- */
/*  Follow-up                                                                   */
/* -------------------------------------------------------------------------- */

export const followUps = sqliteTable(
  'follow_ups',
  {
    ...baseColumns,
    patientId: text('patient_id')
      .notNull()
      .references(() => patients.id, { onDelete: 'cascade' }),
    encounterId: text('encounter_id').references(() => encounters.id, { onDelete: 'cascade' }),
    dueAt: integer('due_at', { mode: 'timestamp_ms' }).notNull(),
    reason: text('reason').notNull(),
    channel: text('channel', { enum: ['call', 'sms', 'visit', 'message', 'lab', 'other'] })
      .notNull()
      .$default(() => 'call' as const),
    status: text('status', { enum: ['pending', 'done', 'missed', 'cancelled'] })
      .notNull()
      .$default(() => 'pending' as const),
    priority: text('priority', { enum: ['low', 'normal', 'high'] })
      .notNull()
      .$default(() => 'normal' as const),
    outcome: text('outcome'),
    completedAt: integer('completed_at', { mode: 'timestamp_ms' }),
    /** expo-notifications id, so the reminder can be cancelled or rescheduled. */
    notificationId: text('notification_id'),
  },
  (t) => [index('follow_ups_due_idx').on(t.status, t.dueAt), index('follow_ups_patient_idx').on(t.patientId)],
);

/* -------------------------------------------------------------------------- */
/*  Relations                                                                   */
/* -------------------------------------------------------------------------- */

export const patientsRelations = relations(patients, ({ many }) => ({
  contacts: many(patientContacts),
  encounters: many(encounters),
  diagnoses: many(diagnoses),
  notes: many(notes),
  orders: many(orders),
  vitals: many(vitals),
  labPanels: many(labPanels),
  imagingStudies: many(imagingStudies),
  followUps: many(followUps),
}));

export const patientContactsRelations = relations(patientContacts, ({ one }) => ({
  patient: one(patients, { fields: [patientContacts.patientId], references: [patients.id] }),
}));

export const encountersRelations = relations(encounters, ({ one, many }) => ({
  patient: one(patients, { fields: [encounters.patientId], references: [patients.id] }),
  attending: one(doctors, { fields: [encounters.attendingId], references: [doctors.id] }),
  place: one(places, { fields: [encounters.placeId], references: [places.id] }),
  notes: many(notes),
  orders: many(orders),
}));

export const notesRelations = relations(notes, ({ one }) => ({
  patient: one(patients, { fields: [notes.patientId], references: [patients.id] }),
  encounter: one(encounters, { fields: [notes.encounterId], references: [encounters.id] }),
  doctor: one(doctors, { fields: [notes.doctorId], references: [doctors.id] }),
}));

export const labPanelsRelations = relations(labPanels, ({ one, many }) => ({
  patient: one(patients, { fields: [labPanels.patientId], references: [patients.id] }),
  values: many(labValues),
}));

export const labValuesRelations = relations(labValues, ({ one }) => ({
  panel: one(labPanels, { fields: [labValues.panelId], references: [labPanels.id] }),
}));

/* -------------------------------------------------------------------------- */
/*  Inferred types                                                              */
/* -------------------------------------------------------------------------- */

export type Patient = typeof patients.$inferSelect;
export type NewPatient = typeof patients.$inferInsert;
export type PatientStatus = Patient['status'];
export type PatientContact = typeof patientContacts.$inferSelect;
export type Encounter = typeof encounters.$inferSelect;
export type Diagnosis = typeof diagnoses.$inferSelect;
export type Note = typeof notes.$inferSelect;
export type Order = typeof orders.$inferSelect;
export type Vital = typeof vitals.$inferSelect;
export type LabPanel = typeof labPanels.$inferSelect;
export type LabValue = typeof labValues.$inferSelect;
export type ImagingStudy = typeof imagingStudies.$inferSelect;
export type FollowUp = typeof followUps.$inferSelect;
