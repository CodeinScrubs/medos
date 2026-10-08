import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

import { baseColumns, bool, jsonList } from './_shared';

/* -------------------------------------------------------------------------- */
/*  Attachments: photos, voice notes, documents                                 */
/* -------------------------------------------------------------------------- */

/**
 * Polymorphic on purpose. Almost every entity in MedOS can carry a photo or a
 * voice note, and a per-parent join table for each would be a dozen near
 * identical tables. `entityType` + `entityId` is checked in the data layer,
 * not by a foreign key.
 *
 * Files live on the device filesystem under the app's private documents
 * directory; only the relative path is stored, so a restore onto a new phone
 * can re-anchor every attachment by rewriting the base directory.
 */
export const ATTACHMENT_ENTITIES = [
  'patient',
  'encounter',
  'note',
  'note_draft',
  'lab_panel',
  'imaging_study',
  'doctor',
  'topic',
  'idea',
  'prescription_template',
  'place',
  'credential',
  'follow_up',
  'capture',
] as const;

export type AttachmentEntity = (typeof ATTACHMENT_ENTITIES)[number];

export const ATTACHMENT_KINDS = [
  'photo',
  'lab_sheet',
  'radiology',
  'clinical_photo',
  'document',
  'voice',
  'video',
  'other',
] as const;

export type AttachmentKind = (typeof ATTACHMENT_KINDS)[number];

export const attachments = sqliteTable(
  'attachments',
  {
    ...baseColumns,
    entityType: text('entity_type', { enum: ATTACHMENT_ENTITIES }).notNull(),
    entityId: text('entity_id').notNull(),
    /** Denormalised so a patient's whole media gallery is one indexed query. */
    patientId: text('patient_id'),

    kind: text('kind', { enum: ATTACHMENT_KINDS })
      .notNull()
      .$default(() => 'photo' as const),
    /** Path relative to the app documents directory, e.g. "media/2026/09/ab12.jpg". */
    relativePath: text('relative_path').notNull(),
    thumbnailPath: text('thumbnail_path'),
    /**
     * The file exactly as it arrived, when it was kept.
     *
     * `relativePath` is a re-encode — 2400px, JPEG — which is right for a
     * chart photo and wrong for the two things that need the sensor's own
     * pixels: zooming into a lesion, and putting two ECGs side by side. Null
     * means the original was not kept, never that it is missing.
     */
    originalPath: text('original_path'),
    originalMimeType: text('original_mime_type'),
    /** Non-destructive annotations/crop/rotation; relativePath remains immutable. */
    imageEditBody: text('image_edit_body'),
    imageEditRevision: integer('image_edit_revision').notNull().default(0),
    mimeType: text('mime_type'),
    sizeBytes: integer('size_bytes'),
    width: integer('width'),
    height: integer('height'),
    /** Voice and video length in milliseconds. */
    durationMs: integer('duration_ms'),

    caption: text('caption'),
    /** Transcript of a voice note, filled in by hand or later by speech-to-text. */
    transcript: text('transcript'),
    capturedAt: integer('captured_at', { mode: 'timestamp_ms' }),
    /** Body region or view for clinical photos: "left leg, anterior". */
    bodySite: text('body_site'),
    tags: jsonList('tags'),
    isSensitive: bool('is_sensitive')
      .notNull()
      .$default(() => false),
    /** Verified present on disk at last check; a restore can flag missing files. */
    isMissing: bool('is_missing')
      .notNull()
      .$default(() => false),
    checksum: text('checksum'),
    sortOrder: integer('sort_order')
      .notNull()
      .$default(() => 0),
  },
  (t) => [
    index('attachments_entity_idx').on(t.entityType, t.entityId),
    index('attachments_patient_idx').on(t.patientId, t.kind),
    index('attachments_kind_idx').on(t.kind, t.deletedAt),
  ],
);

export type Attachment = typeof attachments.$inferSelect;
export type NewAttachment = typeof attachments.$inferInsert;

/** One stopped voice destined for an existing record; retry never creates a new job. */
export const recordingJobs = sqliteTable(
  'recording_jobs',
  {
    ...baseColumns,
    entityType: text('entity_type', { enum: ATTACHMENT_ENTITIES }).notNull(),
    entityId: text('entity_id').notNull(),
    patientId: text('patient_id'),
    sourceUri: text('source_uri').notNull(),
    durationMs: integer('duration_ms').notNull(),
    capturedAt: integer('captured_at', { mode: 'timestamp_ms' }).notNull(),
    relativePath: text('relative_path').notNull(),
    state: text('state', { enum: ['copying', 'ready', 'saved', 'discarding', 'discarded'] })
      .notNull()
      .default('copying'),
    revision: integer('revision').notNull().default(0),
    /** Source fingerprint commits before copy; the destination must match it. */
    checksum: text('checksum'),
    sizeBytes: integer('size_bytes'),
    attachmentId: text('attachment_id').references(() => attachments.id),
  },
  (t) => [
    uniqueIndex('recording_jobs_path_idx').on(t.relativePath),
    index('recording_jobs_pending_idx').on(t.entityType, t.entityId, t.state, t.deletedAt),
  ],
);

export type RecordingJob = typeof recordingJobs.$inferSelect;

/** Raw text/marks survive closing or restarting the editor without publishing. */
export const imageEditDrafts = sqliteTable(
  'image_edit_drafts',
  {
    ...baseColumns,
    attachmentId: text('attachment_id')
      .notNull()
      .references(() => attachments.id),
    /** Frozen attachment identity, source and published revision on editor entry. */
    basis: text('basis').notNull(),
    body: text('body').notNull(),
    revision: integer('revision').notNull().default(0),
    committedVersionId: text('committed_version_id'),
  },
  (t) => [index('image_edit_drafts_open_idx').on(t.attachmentId, t.deletedAt)],
);

/** Published image documents are immutable; reverting creates a new revision. */
export const imageEditVersions = sqliteTable(
  'image_edit_versions',
  {
    ...baseColumns,
    attachmentId: text('attachment_id')
      .notNull()
      .references(() => attachments.id),
    revision: integer('revision').notNull(),
    body: text('body').notNull(),
  },
  (t) => [uniqueIndex('image_edit_versions_revision_idx').on(t.attachmentId, t.revision)],
);
export type ImageEditDraft = typeof imageEditDrafts.$inferSelect;
export type ImageEditVersion = typeof imageEditVersions.$inferSelect;
