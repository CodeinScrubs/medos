CREATE TABLE `occasion_form_drafts` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`doctor_id` text NOT NULL,
	`occasion_id` text,
	`form_key` text NOT NULL,
	`body` text NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`committed_occasion_id` text,
	FOREIGN KEY (`doctor_id`) REFERENCES `doctors`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`occasion_id`) REFERENCES `occasions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`committed_occasion_id`) REFERENCES `occasions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `occasion_form_drafts_open_target_idx` ON `occasion_form_drafts` (`doctor_id`,`form_key`) WHERE "occasion_form_drafts"."deleted_at" IS NULL;