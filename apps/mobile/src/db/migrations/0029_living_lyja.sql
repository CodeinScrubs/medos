CREATE TABLE `workspace_form_drafts` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`kind` text NOT NULL,
	`parent_id` text,
	`record_id` text,
	`scope` text NOT NULL,
	`body` text NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`committed_id` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `workspace_form_open_scope_idx` ON `workspace_form_drafts` (`kind`,`scope`) WHERE "workspace_form_drafts"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX `workspace_form_recent_idx` ON `workspace_form_drafts` (`kind`,`deleted_at`,`updated_at`,`id`);