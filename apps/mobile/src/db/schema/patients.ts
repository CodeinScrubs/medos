import { relations, sql } from 'drizzle-orm';
import { index, integer, real, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

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
    /**
     * Was the hour of admission actually known?
     *
     * A timestamp always has one, so without this there is no way to tell a
     * recorded 12:01 from an assumed one — and the duration on the patient's
     * card would claim a precision the record does not have. False means the
     * stored time is the assumption (12:01 PM, the owner's rule), and the
     * duration is shown in whole days only.
     */
    admittedAtHasTime: bool('admitted_at_has_time').notNull().default(true),
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

/**
 * Every version a note has had.
 *
 * The owner chose to remember everything: nothing here is ever pruned, and a
 * note's history outlives the note itself — deleting a note soft-deletes the
 * note, not the record of what it said.
 *
 * A version is a whole copy of the note's fields rather than a diff. Diffs are
 * smaller and are the wrong shape for this: reading "what did I write about
 * this patient on Tuesday" must not depend on replaying every edit since, and
 * a single corrupt step must not cost the whole chain. A note is a few
 * kilobytes of text.
 *
 * Exact snapshot comparison avoids duplicate versions. `contentHash` is a
 * diagnostic fingerprint; it is not authoritative for equality.
 */
export const noteVersions = sqliteTable(
  'note_versions',
  {
    ...baseColumns,
    noteId: text('note_id')
      .notNull()
      .references(() => notes.id, { onDelete: 'cascade' }),
    patientId: text('patient_id')
      .notNull()
      .references(() => patients.id, { onDelete: 'cascade' }),

    /** Why this version exists: the first save, an edit, or a restore of an older one. */
    reason: text('reason', { enum: ['created', 'edited', 'restored', 'baseline'] })
      .notNull()
      .$default(() => 'edited' as const),
    /** Which version this one was restored from, when that is how it came about. */
    restoredFromId: text('restored_from_id'),

    type: text('type', { enum: NOTE_TYPES }).notNull(),
    title: text('title'),
    body: text('body'),
    subjective: text('subjective'),
    objective: text('objective'),
    assessment: text('assessment'),
    plan: text('plan'),
    noteDate: integer('note_date', { mode: 'timestamp_ms' }),
    doctorId: text('doctor_id'),
    specialty: text('specialty'),
    isPinned: bool('is_pinned'),
    isDraft: bool('is_draft'),

    /** Diagnostic only; compare the actual snapshot to detect changes. */
    contentHash: text('content_hash').notNull(),
  },
  (t) => [index('note_versions_note_idx').on(t.noteId, t.createdAt)],
);

/** A recording already moved into storage, waiting for its note to exist. */
export type DraftVoice = { relativePath: string; durationMs: number | null; sizeBytes: number | null };

/**
 * What is being typed, before it is part of the record.
 *
 * A note is a clinical document: it enters the chart when the user says so,
 * and it should not appear half-written in a patient's timeline because the
 * phone rang. But the text has to survive the phone ringing, so the editor
 * writes here continuously — a few seconds behind the keyboard at worst — and
 * the note itself is written once, on save.
 *
 * `noteId` is null while the draft belongs to a note that does not exist yet.
 * Rows are kept by `deletedAt` like everything else: a draft that was
 * committed is not worth resurrecting, but a draft the user discarded by
 * mistake at 3 a.m. is.
 */
export const noteDrafts = sqliteTable(
  'note_drafts',
  {
    ...baseColumns,
    patientId: text('patient_id')
      .notNull()
      .references(() => patients.id, { onDelete: 'cascade' }),
    /** The note being edited, or null for one not yet created. */
    noteId: text('note_id').references(() => notes.id, { onDelete: 'cascade' }),

    type: text('type', { enum: NOTE_TYPES })
      .notNull()
      .$default(() => 'progress' as const),
    title: text('title'),
    body: text('body'),
    subjective: text('subjective'),
    objective: text('objective'),
    assessment: text('assessment'),
    plan: text('plan'),
    noteDate: integer('note_date', { mode: 'timestamp_ms' }),
    doctorId: text('doctor_id').references(() => doctors.id),
    specialty: text('specialty'),
    isPinned: bool('is_pinned'),
    isDraft: bool('is_draft'),
    /** Voice notes are stored the moment recording stops, not on save. */
    voices: text('voices', { mode: 'json' }).$type<DraftVoice[]>(),
  },
  (t) => [index('note_drafts_target_idx').on(t.patientId, t.noteId)],
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
/*  Consultations                                                               */
/* -------------------------------------------------------------------------- */

/**
 * A question asked of another service, and its answer.
 *
 * A consult note records what the specialist wrote. This records the thing the
 * note cannot: that an answer is still owed. Until now "did cardiology ever
 * get back to us?" could only be answered by reading the notes and noticing an
 * absence — and an absence is exactly what nobody notices at 2 a.m.
 *
 * `status` moves by hand, because every transition is a real-world event the
 * app cannot observe: writing it down, actually asking, and being answered.
 * Nothing here infers that a consult was requested because a note exists.
 */
export const consultations = sqliteTable(
  'consultations',
  {
    ...baseColumns,
    patientId: text('patient_id')
      .notNull()
      .references(() => patients.id, { onDelete: 'cascade' }),
    encounterId: text('encounter_id').references(() => encounters.id, { onDelete: 'cascade' }),

    /** The service asked, as it is said on a ward: "قلب", "عفونی". */
    specialty: text('specialty'),
    /** The specific person, when it is a specific person. */
    doctorId: text('doctor_id').references(() => doctors.id),

    /** The question. Not the diagnosis, and not a summary of the patient. */
    reason: text('reason').notNull(),
    urgency: text('urgency', { enum: ['routine', 'urgent', 'emergency'] })
      .notNull()
      .$default(() => 'routine' as const),

    status: text('status', { enum: ['pending', 'requested', 'answered', 'cancelled'] })
      .notNull()
      .$default(() => 'pending' as const),
    requestedAt: integer('requested_at', { mode: 'timestamp_ms' }),
    respondedAt: integer('responded_at', { mode: 'timestamp_ms' }),
    /** What they said, in whatever detail was written down. */
    response: text('response'),
    /** What to do about it, kept apart from the answer itself. */
    followUpInstruction: text('follow_up_instruction'),
    /** Recoverable working text; never an answered consult until explicitly committed. */
    draftResponse: text('draft_response').notNull().default(''),
    draftInstruction: text('draft_instruction').notNull().default(''),
    /** Optimistic concurrency token for the whole answer draft. */
    draftRevision: integer('draft_revision').notNull().default(0),
    /** The consult note, when one was written. */
    noteId: text('note_id').references(() => notes.id, { onDelete: 'set null' }),
    searchText: text('search_text'),
  },
  (t) => [
    index('consultations_patient_idx').on(t.patientId, t.requestedAt),
    index('consultations_status_idx').on(t.status),
    index('consultations_search_idx').on(t.searchText),
  ],
);

/* -------------------------------------------------------------------------- */
/*  Shifts: the unit of the owner's working day                                 */
/* -------------------------------------------------------------------------- */

/**
 * One period on duty.
 *
 * The record is organised around patients and episodes, and the day is
 * organised around shifts — which patients am I carrying tonight, which ones
 * have I seen, what is left. A shift is not a clinical fact about a patient;
 * it is where the owner's attention was, and it is what "today" should show
 * first.
 *
 * A shift owns nothing. Its patients keep their own records; removing a shift
 * removes the list, never the people on it.
 */
export const shifts = sqliteTable(
  'shifts',
  {
    ...baseColumns,
    placeId: text('place_id').references(() => places.id),
    ward: text('ward'),
    /** The attending or senior on for this shift, when there is one. */
    supervisorId: text('supervisor_id').references(() => doctors.id),

    startAt: integer('start_at', { mode: 'timestamp_ms' }).notNull(),
    endAt: integer('end_at', { mode: 'timestamp_ms' }),
    /** Open until it is closed by hand; a shift nobody closed is still a shift. */
    isActive: bool('is_active')
      .notNull()
      .$default(() => true),
    notes: text('notes'),
  },
  (t) => [index('shifts_active_idx').on(t.isActive, t.startAt), index('shifts_start_idx').on(t.startAt)],
);

/**
 * A patient carried on a shift.
 *
 * Separate from the patient and from the episode, because the same patient can
 * be on many shifts and a shift says something neither of them does: whether
 * they have been seen yet tonight, and the one line to remember about them for
 * the next few hours.
 */
export const shiftPatients = sqliteTable(
  'shift_patients',
  {
    ...baseColumns,
    shiftId: text('shift_id')
      .notNull()
      .references(() => shifts.id, { onDelete: 'cascade' }),
    patientId: text('patient_id')
      .notNull()
      .references(() => patients.id, { onDelete: 'cascade' }),
    encounterId: text('encounter_id').references(() => encounters.id, { onDelete: 'cascade' }),

    /** Where they sit in the round; ties are broken by when they were added. */
    sortOrder: integer('sort_order')
      .notNull()
      .$default(() => 0),
    /** The line that matters tonight, not the patient's permanent summary. */
    shiftSummary: text('shift_summary'),
    /** What to tell whoever takes over. */
    handoffNote: text('handoff_note'),
    reviewedAt: integer('reviewed_at', { mode: 'timestamp_ms' }),
  },
  (t) => [
    index('shift_patients_shift_idx').on(t.shiftId, t.sortOrder),
    index('shift_patients_patient_idx').on(t.patientId),
  ],
);

/* -------------------------------------------------------------------------- */
/*  Tasks: what is left to do, with or without a patient                        */
/* -------------------------------------------------------------------------- */

export const TASK_KINDS = ['lab', 'imaging', 'consult', 'procedure', 'call', 'general'] as const;

/**
 * Something to do.
 *
 * `follow_ups` are a patient's appointments with the future — call them in a
 * week, check the culture on Tuesday — and they require a patient. Half of a
 * working day does not: "ring radiology about the CT", "collect the forms".
 * Those had nowhere to live, so they lived on paper and in memory.
 *
 * Every link is optional, including the patient. What a task must have is a
 * title and a state.
 */
export const tasks = sqliteTable(
  'tasks',
  {
    ...baseColumns,
    patientId: text('patient_id').references(() => patients.id, { onDelete: 'cascade' }),
    encounterId: text('encounter_id').references(() => encounters.id, { onDelete: 'cascade' }),
    shiftId: text('shift_id').references(() => shifts.id, { onDelete: 'set null' }),
    doctorId: text('doctor_id').references(() => doctors.id),
    placeId: text('place_id').references(() => places.id),

    title: text('title').notNull(),
    kind: text('kind', { enum: TASK_KINDS })
      .notNull()
      .$default(() => 'general' as const),
    dueAt: integer('due_at', { mode: 'timestamp_ms' }),
    priority: text('priority', { enum: ['low', 'normal', 'high'] })
      .notNull()
      .$default(() => 'normal' as const),
    status: text('status', { enum: ['open', 'done', 'cancelled'] })
      .notNull()
      .$default(() => 'open' as const),
    /** Where it came from: typed by hand, or lifted out of a note. */
    source: text('source'),
    notes: text('notes'),
    completedAt: integer('completed_at', { mode: 'timestamp_ms' }),
    outcome: text('outcome'),
    searchText: text('search_text'),
  },
  (t) => [
    index('tasks_status_idx').on(t.status, t.dueAt),
    index('tasks_patient_idx').on(t.patientId),
    index('tasks_shift_idx').on(t.shiftId),
    index('tasks_search_idx').on(t.searchText),
  ],
);

/* -------------------------------------------------------------------------- */
/*  Capture inbox: what was heard before there was time to file it              */
/* -------------------------------------------------------------------------- */

/** A quick-add task stays a draft until the owner presses Add. One open draft per patient/global scope. */
export const taskDrafts = sqliteTable(
  'task_drafts',
  {
    ...baseColumns,
    scopeKey: text('scope_key').notNull(),
    patientId: text('patient_id').references(() => patients.id),
    shiftId: text('shift_id').references(() => shifts.id),
    title: text('title').notNull().default(''),
    revision: integer('revision').notNull().default(0),
    /** Set with soft deletion when committed; retry returns this same task. */
    taskId: text('task_id').references(() => tasks.id),
  },
  (t) => [
    uniqueIndex('task_drafts_open_scope_idx')
      .on(t.scopeKey)
      .where(sql`${t.deletedAt} IS NULL`),
  ],
);
export type TaskDraft = typeof taskDrafts.$inferSelect;

export const CAPTURE_KINDS = ['text', 'voice', 'photo'] as const;

/**
 * A thought, caught before it is sorted.
 *
 * Every other table in MedOS asks a question first — which patient, which
 * episode, is this a note or a task. In a corridor those questions cost more
 * than the thing being remembered, so the thing is not written at all. This
 * table asks nothing: type it, say it, photograph it, and decide later.
 *
 * Two columns hold the whole lifecycle. `filedAt` null means it is still in
 * the inbox; `deletedAt` means it was thrown away, and the trash can bring it
 * back. There is deliberately no `status` column: a second way to say the same
 * thing is a second thing to keep in step.
 *
 * A filed capture is kept, never deleted — it is what the note or the task was
 * made from, and for a voice capture it is where the recording still lives.
 */
export const captureInbox = sqliteTable(
  'capture_inbox',
  {
    ...baseColumns,
    /**
     * What this was when it was made, for the icon in the list.
     *
     * Not a claim about files: the recording and the photo are attachment rows
     * like everywhere else, and deleting one does not rewrite this. Anything
     * that needs to know whether a file is there reads the attachments.
     */
    kind: text('kind', { enum: CAPTURE_KINDS })
      .notNull()
      .$default(() => 'text' as const),
    /** The typed words, or what was written down about a recording or photo. */
    text: text('text'),
    /** Known at capture time only when it happened to be obvious. */
    patientId: text('patient_id').references(() => patients.id, { onDelete: 'set null' }),
    shiftId: text('shift_id').references(() => shifts.id, { onDelete: 'set null' }),
    capturedAt: integer('captured_at', { mode: 'timestamp_ms' }).notNull(),

    /** What it turned into, once someone filed it. */
    filedAs: text('filed_as', { enum: ['note', 'task'] }),
    filedId: text('filed_id'),
    filedAt: integer('filed_at', { mode: 'timestamp_ms' }),
    searchText: text('search_text'),
  },
  (t) => [
    index('capture_inbox_open_idx').on(t.filedAt, t.capturedAt),
    index('capture_inbox_patient_idx').on(t.patientId),
    index('capture_inbox_search_idx').on(t.searchText),
  ],
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
export type NoteDraft = typeof noteDrafts.$inferSelect;
export type NoteVersion = typeof noteVersions.$inferSelect;
export type Order = typeof orders.$inferSelect;
export type Vital = typeof vitals.$inferSelect;
export type LabPanel = typeof labPanels.$inferSelect;
export type LabValue = typeof labValues.$inferSelect;
export type ImagingStudy = typeof imagingStudies.$inferSelect;
export type FollowUp = typeof followUps.$inferSelect;
export type Consultation = typeof consultations.$inferSelect;
export type Shift = typeof shifts.$inferSelect;
export type ShiftPatient = typeof shiftPatients.$inferSelect;
export type Task = typeof tasks.$inferSelect;
export type Capture = typeof captureInbox.$inferSelect;
export type CaptureKind = (typeof CAPTURE_KINDS)[number];
export type TaskKind = (typeof TASK_KINDS)[number];
