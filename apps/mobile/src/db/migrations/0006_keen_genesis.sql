CREATE TABLE `note_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`note_id` text NOT NULL,
	`patient_id` text NOT NULL,
	`reason` text NOT NULL,
	`restored_from_id` text,
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
	`content_hash` text NOT NULL,
	FOREIGN KEY (`note_id`) REFERENCES `notes`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`patient_id`) REFERENCES `patients`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `note_versions_note_idx` ON `note_versions` (`note_id`,`created_at`);