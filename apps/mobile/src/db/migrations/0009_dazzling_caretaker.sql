CREATE TABLE `capture_inbox` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`kind` text NOT NULL,
	`text` text,
	`patient_id` text,
	`shift_id` text,
	`captured_at` integer NOT NULL,
	`filed_as` text,
	`filed_id` text,
	`filed_at` integer,
	`search_text` text,
	FOREIGN KEY (`patient_id`) REFERENCES `patients`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`shift_id`) REFERENCES `shifts`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `capture_inbox_open_idx` ON `capture_inbox` (`filed_at`,`captured_at`);--> statement-breakpoint
CREATE INDEX `capture_inbox_patient_idx` ON `capture_inbox` (`patient_id`);--> statement-breakpoint
CREATE INDEX `capture_inbox_search_idx` ON `capture_inbox` (`search_text`);