CREATE TABLE `call_imports` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`patient_id` text NOT NULL,
	`source_body` text NOT NULL,
	`relative_path` text NOT NULL,
	`state` text DEFAULT 'copying' NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`checksum` text,
	`size_bytes` integer,
	`note_id` text,
	`attachment_id` text,
	FOREIGN KEY (`patient_id`) REFERENCES `patients`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`note_id`) REFERENCES `notes`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`attachment_id`) REFERENCES `attachments`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `call_imports_path_idx` ON `call_imports` (`relative_path`);--> statement-breakpoint
CREATE INDEX `call_imports_pending_idx` ON `call_imports` (`state`,`deleted_at`);