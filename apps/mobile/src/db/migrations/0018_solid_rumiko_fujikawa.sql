CREATE TABLE `follow_up_form_drafts` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`patient_id` text NOT NULL,
	`encounter_id` text,
	`body` text NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`committed_follow_up_id` text,
	FOREIGN KEY (`patient_id`) REFERENCES `patients`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`encounter_id`) REFERENCES `encounters`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`committed_follow_up_id`) REFERENCES `follow_ups`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `follow_up_form_drafts_open_patient_idx` ON `follow_up_form_drafts` (`patient_id`) WHERE "follow_up_form_drafts"."deleted_at" IS NULL;