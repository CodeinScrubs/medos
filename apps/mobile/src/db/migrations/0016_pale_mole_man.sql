CREATE TABLE `patient_form_drafts` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`scope_key` text NOT NULL,
	`patient_id` text,
	`body` text NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`committed_patient_id` text,
	FOREIGN KEY (`patient_id`) REFERENCES `patients`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`committed_patient_id`) REFERENCES `patients`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `patient_form_drafts_open_scope_idx` ON `patient_form_drafts` (`scope_key`) WHERE "patient_form_drafts"."deleted_at" IS NULL;