ALTER TABLE `consultations` ADD `draft_response` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `consultations` ADD `draft_instruction` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `consultations` ADD `draft_revision` integer DEFAULT 0 NOT NULL;