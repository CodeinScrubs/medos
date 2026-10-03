CREATE TABLE `recording_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`patient_id` text,
	`source_uri` text NOT NULL,
	`duration_ms` integer NOT NULL,
	`captured_at` integer NOT NULL,
	`relative_path` text NOT NULL,
	`state` text DEFAULT 'copying' NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`checksum` text,
	`size_bytes` integer,
	`attachment_id` text,
	FOREIGN KEY (`attachment_id`) REFERENCES `attachments`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `recording_jobs_path_idx` ON `recording_jobs` (`relative_path`);--> statement-breakpoint
CREATE INDEX `recording_jobs_pending_idx` ON `recording_jobs` (`entity_type`,`entity_id`,`state`,`deleted_at`);