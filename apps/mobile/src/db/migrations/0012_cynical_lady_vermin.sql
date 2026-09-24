CREATE TABLE `consult_request_drafts` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`patient_id` text NOT NULL,
	`encounter_id` text,
	`specialty` text DEFAULT '' NOT NULL,
	`reason` text DEFAULT '' NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`consult_id` text,
	FOREIGN KEY (`patient_id`) REFERENCES `patients`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`encounter_id`) REFERENCES `encounters`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`consult_id`) REFERENCES `consultations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `consult_request_drafts_open_patient_idx` ON `consult_request_drafts` (`patient_id`) WHERE "consult_request_drafts"."deleted_at" IS NULL;