CREATE TABLE `lab_form_drafts` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`patient_id` text NOT NULL,
	`panel_id` text,
	`encounter_id` text,
	`form_key` text NOT NULL,
	`body` text NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`committed_panel_id` text,
	FOREIGN KEY (`patient_id`) REFERENCES `patients`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`panel_id`) REFERENCES `lab_panels`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`encounter_id`) REFERENCES `encounters`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`committed_panel_id`) REFERENCES `lab_panels`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `lab_form_drafts_open_target_idx` ON `lab_form_drafts` (`patient_id`,`form_key`) WHERE "lab_form_drafts"."deleted_at" IS NULL;