CREATE TABLE `contact_form_drafts` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`patient_id` text NOT NULL,
	`body` text NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`committed_contact_id` text,
	FOREIGN KEY (`patient_id`) REFERENCES `patients`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`committed_contact_id`) REFERENCES `patient_contacts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `contact_form_drafts_open_patient_idx` ON `contact_form_drafts` (`patient_id`) WHERE "contact_form_drafts"."deleted_at" IS NULL;