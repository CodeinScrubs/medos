CREATE TABLE `note_drafts` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`patient_id` text NOT NULL,
	`note_id` text,
	`type` text NOT NULL,
	`title` text,
	`body` text,
	`subjective` text,
	`objective` text,
	`assessment` text,
	`plan` text,
	`note_date` integer,
	`doctor_id` text,
	`specialty` text,
	`is_pinned` integer,
	`is_draft` integer,
	`voices` text,
	FOREIGN KEY (`patient_id`) REFERENCES `patients`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`note_id`) REFERENCES `notes`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`doctor_id`) REFERENCES `doctors`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `note_drafts_target_idx` ON `note_drafts` (`patient_id`,`note_id`);