CREATE TABLE `consultations` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`patient_id` text NOT NULL,
	`encounter_id` text,
	`specialty` text,
	`doctor_id` text,
	`reason` text NOT NULL,
	`urgency` text NOT NULL,
	`status` text NOT NULL,
	`requested_at` integer,
	`responded_at` integer,
	`response` text,
	`follow_up_instruction` text,
	`note_id` text,
	`search_text` text,
	FOREIGN KEY (`patient_id`) REFERENCES `patients`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`encounter_id`) REFERENCES `encounters`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`doctor_id`) REFERENCES `doctors`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`note_id`) REFERENCES `notes`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `consultations_patient_idx` ON `consultations` (`patient_id`,`requested_at`);--> statement-breakpoint
CREATE INDEX `consultations_status_idx` ON `consultations` (`status`);--> statement-breakpoint
CREATE INDEX `consultations_search_idx` ON `consultations` (`search_text`);