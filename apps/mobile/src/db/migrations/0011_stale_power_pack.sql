CREATE TABLE `task_drafts` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`scope_key` text NOT NULL,
	`patient_id` text,
	`shift_id` text,
	`title` text DEFAULT '' NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`task_id` text,
	FOREIGN KEY (`patient_id`) REFERENCES `patients`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`shift_id`) REFERENCES `shifts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `task_drafts_open_scope_idx` ON `task_drafts` (`scope_key`) WHERE "task_drafts"."deleted_at" IS NULL;