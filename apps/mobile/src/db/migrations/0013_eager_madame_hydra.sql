ALTER TABLE `follow_ups` ADD `reminder_revision` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `follow_ups` ADD `reminder_applied_revision` integer DEFAULT -1 NOT NULL;