CREATE INDEX `consultations_encounter_owner_idx` ON `consultations` (`encounter_id`,`deleted_at`,`patient_id`);--> statement-breakpoint
CREATE INDEX `diagnoses_encounter_owner_idx` ON `diagnoses` (`encounter_id`,`deleted_at`,`patient_id`);--> statement-breakpoint
CREATE INDEX `follow_ups_encounter_owner_idx` ON `follow_ups` (`encounter_id`,`deleted_at`,`patient_id`);--> statement-breakpoint
CREATE INDEX `imaging_encounter_owner_idx` ON `imaging_studies` (`encounter_id`,`deleted_at`,`patient_id`);--> statement-breakpoint
CREATE INDEX `lab_panels_encounter_owner_idx` ON `lab_panels` (`encounter_id`,`deleted_at`,`patient_id`);--> statement-breakpoint
CREATE INDEX `tasks_encounter_owner_idx` ON `tasks` (`encounter_id`,`deleted_at`,`patient_id`);--> statement-breakpoint
CREATE INDEX `vitals_encounter_owner_idx` ON `vitals` (`encounter_id`,`deleted_at`,`patient_id`);