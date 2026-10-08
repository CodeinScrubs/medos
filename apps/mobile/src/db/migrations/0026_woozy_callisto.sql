CREATE TABLE `vital_form_drafts` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`patient_id` text NOT NULL,
	`vital_id` text,
	`scope` text NOT NULL,
	`encounter_id` text,
	`body` text NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`committed_vital_id` text,
	FOREIGN KEY (`patient_id`) REFERENCES `patients`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`vital_id`) REFERENCES `vitals`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`encounter_id`) REFERENCES `encounters`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`committed_vital_id`) REFERENCES `vitals`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `vital_form_drafts_open_target_idx` ON `vital_form_drafts` (`patient_id`,`scope`) WHERE "vital_form_drafts"."deleted_at" IS NULL;