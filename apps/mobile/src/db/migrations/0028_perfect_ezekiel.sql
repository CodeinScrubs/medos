ALTER TABLE `note_drafts` ADD `origin` text;--> statement-breakpoint
ALTER TABLE `note_drafts` ADD `raw_date` text;--> statement-breakpoint
ALTER TABLE `note_drafts` ADD `revision` integer DEFAULT 0 NOT NULL;