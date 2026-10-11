CREATE TABLE `clinical_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`kind` text NOT NULL,
	`record_id` text NOT NULL,
	`patient_id` text NOT NULL,
	`sequence` integer DEFAULT 1 NOT NULL,
	`recorded_at` integer NOT NULL,
	`reason` text NOT NULL,
	`body` text NOT NULL,
	FOREIGN KEY (`patient_id`) REFERENCES `patients`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `clinical_versions_record_sequence_idx` ON `clinical_versions` (`kind`,`record_id`,`sequence`);--> statement-breakpoint
CREATE INDEX `clinical_versions_patient_time_idx` ON `clinical_versions` (`patient_id`,`recorded_at`,`id`);