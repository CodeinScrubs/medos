ALTER TABLE `occasions` ADD `reminder_revision` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `occasions` ADD `reminder_applied_revision` integer DEFAULT -1 NOT NULL;