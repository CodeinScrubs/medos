CREATE TABLE `image_edit_drafts` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`attachment_id` text NOT NULL,
	`basis` text NOT NULL,
	`body` text NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`committed_version_id` text,
	FOREIGN KEY (`attachment_id`) REFERENCES `attachments`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `image_edit_drafts_open_idx` ON `image_edit_drafts` (`attachment_id`,`deleted_at`);--> statement-breakpoint
CREATE TABLE `image_edit_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`attachment_id` text NOT NULL,
	`revision` integer NOT NULL,
	`body` text NOT NULL,
	FOREIGN KEY (`attachment_id`) REFERENCES `attachments`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `image_edit_versions_revision_idx` ON `image_edit_versions` (`attachment_id`,`revision`);--> statement-breakpoint
ALTER TABLE `attachments` ADD `original_mime_type` text;--> statement-breakpoint
ALTER TABLE `attachments` ADD `image_edit_body` text;--> statement-breakpoint
ALTER TABLE `attachments` ADD `image_edit_revision` integer DEFAULT 0 NOT NULL;