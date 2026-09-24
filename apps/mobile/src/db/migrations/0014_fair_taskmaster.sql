ALTER TABLE `tasks` ADD `reminder_enabled` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `tasks` ADD `notification_id` text;--> statement-breakpoint
ALTER TABLE `tasks` ADD `reminder_revision` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `tasks` ADD `reminder_applied_revision` integer DEFAULT -1 NOT NULL;--> statement-breakpoint
ALTER TABLE `tasks` ADD `schedule_draft` text;--> statement-breakpoint
ALTER TABLE `tasks` ADD `schedule_draft_revision` integer DEFAULT 0 NOT NULL;