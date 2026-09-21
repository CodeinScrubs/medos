CREATE TABLE `shift_patients` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`shift_id` text NOT NULL,
	`patient_id` text NOT NULL,
	`encounter_id` text,
	`sort_order` integer NOT NULL,
	`shift_summary` text,
	`handoff_note` text,
	`reviewed_at` integer,
	FOREIGN KEY (`shift_id`) REFERENCES `shifts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`patient_id`) REFERENCES `patients`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`encounter_id`) REFERENCES `encounters`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `shift_patients_shift_idx` ON `shift_patients` (`shift_id`,`sort_order`);--> statement-breakpoint
CREATE INDEX `shift_patients_patient_idx` ON `shift_patients` (`patient_id`);--> statement-breakpoint
CREATE TABLE `shifts` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`place_id` text,
	`ward` text,
	`supervisor_id` text,
	`start_at` integer NOT NULL,
	`end_at` integer,
	`is_active` integer NOT NULL,
	`notes` text,
	FOREIGN KEY (`place_id`) REFERENCES `places`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`supervisor_id`) REFERENCES `doctors`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `shifts_active_idx` ON `shifts` (`is_active`,`start_at`);--> statement-breakpoint
CREATE INDEX `shifts_start_idx` ON `shifts` (`start_at`);--> statement-breakpoint
CREATE TABLE `tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`patient_id` text,
	`encounter_id` text,
	`shift_id` text,
	`doctor_id` text,
	`place_id` text,
	`title` text NOT NULL,
	`kind` text NOT NULL,
	`due_at` integer,
	`priority` text NOT NULL,
	`status` text NOT NULL,
	`source` text,
	`notes` text,
	`completed_at` integer,
	`outcome` text,
	`search_text` text,
	FOREIGN KEY (`patient_id`) REFERENCES `patients`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`encounter_id`) REFERENCES `encounters`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`shift_id`) REFERENCES `shifts`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`doctor_id`) REFERENCES `doctors`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`place_id`) REFERENCES `places`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `tasks_status_idx` ON `tasks` (`status`,`due_at`);--> statement-breakpoint
CREATE INDEX `tasks_patient_idx` ON `tasks` (`patient_id`);--> statement-breakpoint
CREATE INDEX `tasks_shift_idx` ON `tasks` (`shift_id`);--> statement-breakpoint
CREATE INDEX `tasks_search_idx` ON `tasks` (`search_text`);