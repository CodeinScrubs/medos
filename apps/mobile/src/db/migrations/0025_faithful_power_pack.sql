CREATE TABLE `imaging_form_drafts` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`patient_id` text NOT NULL,
	`study_id` text,
	`scope` text NOT NULL,
	`encounter_id` text,
	`body` text NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`committed_study_id` text,
	FOREIGN KEY (`patient_id`) REFERENCES `patients`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`study_id`) REFERENCES `imaging_studies`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`encounter_id`) REFERENCES `encounters`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`committed_study_id`) REFERENCES `imaging_studies`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `imaging_form_drafts_open_scope_idx` ON `imaging_form_drafts` (`patient_id`,`scope`) WHERE "imaging_form_drafts"."deleted_at" IS NULL;--> statement-breakpoint
CREATE TABLE `doctor_form_drafts` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`kind` text NOT NULL,
	`scope` text NOT NULL,
	`doctor_id` text,
	`body` text NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`committed_entity_id` text,
	FOREIGN KEY (`doctor_id`) REFERENCES `doctors`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `doctor_form_drafts_open_scope_idx` ON `doctor_form_drafts` (`kind`,`scope`) WHERE "doctor_form_drafts"."deleted_at" IS NULL;--> statement-breakpoint
CREATE TABLE `attachment_caption_drafts` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`attachment_id` text NOT NULL,
	`body` text NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`committed_attachment_id` text,
	FOREIGN KEY (`attachment_id`) REFERENCES `attachments`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`committed_attachment_id`) REFERENCES `attachments`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `attachment_caption_drafts_open_target_idx` ON `attachment_caption_drafts` (`attachment_id`) WHERE "attachment_caption_drafts"."deleted_at" IS NULL;--> statement-breakpoint
CREATE TABLE `photo_import_batches` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`patient_id` text,
	`mode` text DEFAULT 'attachment' NOT NULL,
	`kind` text DEFAULT 'photo' NOT NULL,
	`caption` text,
	`body_site` text,
	`encounter_id` text,
	`captured_at` integer NOT NULL,
	`body` text NOT NULL,
	`state` text DEFAULT 'copying' NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE INDEX `photo_import_batches_target_idx` ON `photo_import_batches` (`entity_type`,`entity_id`,`state`,`deleted_at`);--> statement-breakpoint
CREATE INDEX `photo_import_batches_patient_idx` ON `photo_import_batches` (`patient_id`,`state`,`deleted_at`);