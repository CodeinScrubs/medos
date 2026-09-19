CREATE TABLE `diagnoses` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`patient_id` text NOT NULL,
	`encounter_id` text,
	`title` text NOT NULL,
	`icd_code` text,
	`kind` text NOT NULL,
	`status` text NOT NULL,
	`onset_date` text,
	`notes` text,
	`sort_order` integer NOT NULL,
	FOREIGN KEY (`patient_id`) REFERENCES `patients`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`encounter_id`) REFERENCES `encounters`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `diagnoses_patient_idx` ON `diagnoses` (`patient_id`,`encounter_id`);--> statement-breakpoint
CREATE TABLE `encounters` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`patient_id` text NOT NULL,
	`kind` text NOT NULL,
	`place_id` text,
	`ward` text,
	`bed` text,
	`service` text,
	`attending_id` text,
	`chief_complaint` text,
	`admitted_at` integer,
	`discharged_at` integer,
	`discharge_type` text,
	`outcome_notes` text,
	`is_active` integer NOT NULL,
	FOREIGN KEY (`patient_id`) REFERENCES `patients`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`place_id`) REFERENCES `places`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`attending_id`) REFERENCES `doctors`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `encounters_patient_idx` ON `encounters` (`patient_id`,`admitted_at`);--> statement-breakpoint
CREATE INDEX `encounters_active_idx` ON `encounters` (`is_active`,`deleted_at`);--> statement-breakpoint
CREATE TABLE `follow_ups` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`patient_id` text NOT NULL,
	`encounter_id` text,
	`due_at` integer NOT NULL,
	`reason` text NOT NULL,
	`channel` text NOT NULL,
	`status` text NOT NULL,
	`priority` text NOT NULL,
	`outcome` text,
	`completed_at` integer,
	`notification_id` text,
	FOREIGN KEY (`patient_id`) REFERENCES `patients`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`encounter_id`) REFERENCES `encounters`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `follow_ups_due_idx` ON `follow_ups` (`status`,`due_at`);--> statement-breakpoint
CREATE INDEX `follow_ups_patient_idx` ON `follow_ups` (`patient_id`);--> statement-breakpoint
CREATE TABLE `imaging_studies` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`patient_id` text NOT NULL,
	`encounter_id` text,
	`modality` text NOT NULL,
	`region` text,
	`study_date` integer,
	`storage_location` text,
	`storage_platform` text,
	`accession_number` text,
	`access_url` text,
	`access_notes` text,
	`report_text` text,
	`impression` text,
	`radiologist_id` text,
	`status` text NOT NULL,
	`notes` text,
	FOREIGN KEY (`patient_id`) REFERENCES `patients`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`encounter_id`) REFERENCES `encounters`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`radiologist_id`) REFERENCES `doctors`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `imaging_patient_idx` ON `imaging_studies` (`patient_id`,`study_date`);--> statement-breakpoint
CREATE TABLE `lab_panels` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`patient_id` text NOT NULL,
	`encounter_id` text,
	`name` text,
	`collected_at` integer NOT NULL,
	`source` text NOT NULL,
	`lab_name` text,
	`notes` text,
	FOREIGN KEY (`patient_id`) REFERENCES `patients`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`encounter_id`) REFERENCES `encounters`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `lab_panels_patient_idx` ON `lab_panels` (`patient_id`,`collected_at`);--> statement-breakpoint
CREATE TABLE `lab_values` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`panel_id` text NOT NULL,
	`patient_id` text NOT NULL,
	`analyte` text NOT NULL,
	`value` text,
	`value_num` real,
	`unit` text,
	`ref_low` real,
	`ref_high` real,
	`flag` text,
	`notes` text,
	`sort_order` integer NOT NULL,
	FOREIGN KEY (`panel_id`) REFERENCES `lab_panels`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`patient_id`) REFERENCES `patients`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `lab_values_panel_idx` ON `lab_values` (`panel_id`);--> statement-breakpoint
CREATE INDEX `lab_values_trend_idx` ON `lab_values` (`patient_id`,`analyte`);--> statement-breakpoint
CREATE TABLE `notes` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`patient_id` text NOT NULL,
	`encounter_id` text,
	`type` text NOT NULL,
	`title` text,
	`body` text,
	`subjective` text,
	`objective` text,
	`assessment` text,
	`plan` text,
	`note_date` integer NOT NULL,
	`author_name` text,
	`doctor_id` text,
	`specialty` text,
	`is_draft` integer NOT NULL,
	`is_pinned` integer NOT NULL,
	`search_text` text,
	FOREIGN KEY (`patient_id`) REFERENCES `patients`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`encounter_id`) REFERENCES `encounters`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`doctor_id`) REFERENCES `doctors`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `notes_patient_idx` ON `notes` (`patient_id`,`note_date`);--> statement-breakpoint
CREATE INDEX `notes_encounter_idx` ON `notes` (`encounter_id`);--> statement-breakpoint
CREATE INDEX `notes_type_idx` ON `notes` (`type`);--> statement-breakpoint
CREATE INDEX `notes_search_idx` ON `notes` (`search_text`);--> statement-breakpoint
CREATE TABLE `orders` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`patient_id` text NOT NULL,
	`encounter_id` text,
	`kind` text NOT NULL,
	`name` text NOT NULL,
	`brand_name` text,
	`dose` text,
	`route` text,
	`frequency` text,
	`rate` text,
	`duration` text,
	`is_prn` integer NOT NULL,
	`prn_condition` text,
	`status` text NOT NULL,
	`start_at` integer,
	`end_at` integer,
	`indication` text,
	`prescriber_id` text,
	`notes` text,
	`sort_order` integer NOT NULL,
	FOREIGN KEY (`patient_id`) REFERENCES `patients`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`encounter_id`) REFERENCES `encounters`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`prescriber_id`) REFERENCES `doctors`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `orders_patient_idx` ON `orders` (`patient_id`,`status`);--> statement-breakpoint
CREATE INDEX `orders_encounter_idx` ON `orders` (`encounter_id`);--> statement-breakpoint
CREATE TABLE `patient_contacts` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`patient_id` text NOT NULL,
	`name` text,
	`relation` text,
	`phone` text NOT NULL,
	`is_primary` integer NOT NULL,
	`notes` text,
	FOREIGN KEY (`patient_id`) REFERENCES `patients`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `patient_contacts_patient_idx` ON `patient_contacts` (`patient_id`);--> statement-breakpoint
CREATE TABLE `patients` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`first_name` text NOT NULL,
	`last_name` text NOT NULL,
	`national_id` text,
	`file_number` text,
	`sex` text,
	`birth_date` text,
	`age_years` integer,
	`phone` text,
	`city` text,
	`address` text,
	`blood_type` text,
	`allergies` text,
	`past_medical_history` text,
	`drug_history` text,
	`family_history` text,
	`habitual_history` text,
	`status` text NOT NULL,
	`starred` integer NOT NULL,
	`tags` text,
	`summary` text,
	`search_text` text
);
--> statement-breakpoint
CREATE INDEX `patients_status_idx` ON `patients` (`status`,`deleted_at`);--> statement-breakpoint
CREATE INDEX `patients_search_idx` ON `patients` (`search_text`);--> statement-breakpoint
CREATE INDEX `patients_national_id_idx` ON `patients` (`national_id`);--> statement-breakpoint
CREATE INDEX `patients_updated_idx` ON `patients` (`updated_at`);--> statement-breakpoint
CREATE TABLE `vitals` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`patient_id` text NOT NULL,
	`encounter_id` text,
	`measured_at` integer NOT NULL,
	`systolic` integer,
	`diastolic` integer,
	`heart_rate` integer,
	`resp_rate` integer,
	`temperature` real,
	`spo2` integer,
	`blood_sugar` integer,
	`weight_kg` real,
	`height_cm` real,
	`pain_score` integer,
	`urine_output` text,
	`notes` text,
	FOREIGN KEY (`patient_id`) REFERENCES `patients`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`encounter_id`) REFERENCES `encounters`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `vitals_patient_idx` ON `vitals` (`patient_id`,`measured_at`);--> statement-breakpoint
CREATE TABLE `doctor_profiles` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`doctor_id` text NOT NULL,
	`birth_date` text,
	`hometown` text,
	`alma_mater` text,
	`graduation_year` text,
	`family_notes` text,
	`interests` text,
	`favorite_topics` text,
	`dislikes` text,
	`how_we_met` text,
	`memorable_moments` text,
	`communication_style` text,
	`personal_notes` text,
	FOREIGN KEY (`doctor_id`) REFERENCES `doctors`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `doctor_profiles_doctor_idx` ON `doctor_profiles` (`doctor_id`);--> statement-breakpoint
CREATE TABLE `doctor_ratings` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`doctor_id` text NOT NULL,
	`knowledge` integer,
	`orientation` integer,
	`patient_rapport` integer,
	`emergency_responsiveness` integer,
	`contact_openness` integer,
	`teaching` integer,
	`reasoning` text,
	`rated_at` integer NOT NULL,
	FOREIGN KEY (`doctor_id`) REFERENCES `doctors`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `doctor_ratings_doctor_idx` ON `doctor_ratings` (`doctor_id`,`rated_at`);--> statement-breakpoint
CREATE TABLE `doctors` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`first_name` text NOT NULL,
	`last_name` text NOT NULL,
	`title` text,
	`academic_rank` text,
	`specialty_id` text,
	`subspecialty_id` text,
	`specialty_text` text,
	`relationship` text NOT NULL,
	`phone` text,
	`phone_alt` text,
	`whatsapp` text,
	`telegram` text,
	`email` text,
	`extension` text,
	`primary_place_id` text,
	`office_address` text,
	`office_lat` text,
	`office_lng` text,
	`office_hours` text,
	`office_phone` text,
	`accepts_referrals` integer,
	`referral_notes` text,
	`visit_fee` text,
	`insurances` text,
	`photo_uri` text,
	`notes` text,
	`tags` text,
	`starred` integer NOT NULL,
	`search_text` text,
	FOREIGN KEY (`specialty_id`) REFERENCES `specialties`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`subspecialty_id`) REFERENCES `specialties`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`primary_place_id`) REFERENCES `places`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `doctors_specialty_idx` ON `doctors` (`specialty_id`,`subspecialty_id`);--> statement-breakpoint
CREATE INDEX `doctors_search_idx` ON `doctors` (`search_text`);--> statement-breakpoint
CREATE INDEX `doctors_relationship_idx` ON `doctors` (`relationship`);--> statement-breakpoint
CREATE INDEX `doctors_starred_idx` ON `doctors` (`starred`,`deleted_at`);--> statement-breakpoint
CREATE TABLE `occasions` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`doctor_id` text,
	`patient_id` text,
	`kind` text NOT NULL,
	`title` text NOT NULL,
	`jalali_month` integer,
	`jalali_day` integer,
	`on_date` text,
	`is_recurring` integer NOT NULL,
	`message_template` text,
	`remind_days_before` integer NOT NULL,
	`is_enabled` integer NOT NULL,
	`notification_id` text,
	FOREIGN KEY (`doctor_id`) REFERENCES `doctors`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `occasions_doctor_idx` ON `occasions` (`doctor_id`);--> statement-breakpoint
CREATE INDEX `occasions_date_idx` ON `occasions` (`jalali_month`,`jalali_day`);--> statement-breakpoint
CREATE TABLE `scheduled_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`doctor_id` text,
	`patient_id` text,
	`occasion_id` text,
	`channel` text NOT NULL,
	`body` text,
	`scheduled_for` integer NOT NULL,
	`status` text NOT NULL,
	`sent_at` integer,
	`notification_id` text,
	`notes` text,
	FOREIGN KEY (`doctor_id`) REFERENCES `doctors`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`occasion_id`) REFERENCES `occasions`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `scheduled_messages_due_idx` ON `scheduled_messages` (`status`,`scheduled_for`);--> statement-breakpoint
CREATE INDEX `scheduled_messages_doctor_idx` ON `scheduled_messages` (`doctor_id`);--> statement-breakpoint
CREATE TABLE `specialties` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`slug` text,
	`name_fa` text NOT NULL,
	`name_en` text,
	`parent_id` text,
	`kind` text NOT NULL,
	`aliases` text,
	`is_seeded` integer NOT NULL,
	`sort_order` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `specialties_parent_idx` ON `specialties` (`parent_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `specialties_slug_idx` ON `specialties` (`slug`);--> statement-breakpoint
CREATE TABLE `extensions` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`place_id` text NOT NULL,
	`department` text NOT NULL,
	`extension` text NOT NULL,
	`direct_line` text,
	`floor` text,
	`available_hours` text,
	`contact_person` text,
	`notes` text,
	`usage_count` integer NOT NULL,
	`starred` integer NOT NULL,
	`search_text` text,
	FOREIGN KEY (`place_id`) REFERENCES `places`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `extensions_place_idx` ON `extensions` (`place_id`);--> statement-breakpoint
CREATE INDEX `extensions_search_idx` ON `extensions` (`search_text`);--> statement-breakpoint
CREATE INDEX `extensions_usage_idx` ON `extensions` (`usage_count`);--> statement-breakpoint
CREATE TABLE `places` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`name` text NOT NULL,
	`kind` text NOT NULL,
	`city` text,
	`address` text,
	`lat` text,
	`lng` text,
	`map_url` text,
	`phone` text,
	`switchboard` text,
	`website` text,
	`notes` text,
	`tags` text,
	`starred` integer NOT NULL,
	`search_text` text
);
--> statement-breakpoint
CREATE INDEX `places_kind_idx` ON `places` (`kind`,`deleted_at`);--> statement-breakpoint
CREATE INDEX `places_search_idx` ON `places` (`search_text`);--> statement-breakpoint
CREATE TABLE `ideas` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`title` text NOT NULL,
	`body` text,
	`kind` text NOT NULL,
	`status` text NOT NULL,
	`priority` text NOT NULL,
	`area` text,
	`tags` text,
	`search_text` text
);
--> statement-breakpoint
CREATE INDEX `ideas_status_idx` ON `ideas` (`status`,`priority`);--> statement-breakpoint
CREATE TABLE `prescription_templates` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`title` text NOT NULL,
	`condition` text,
	`specialty_id` text,
	`age_group` text NOT NULL,
	`items` text,
	`advice_text` text,
	`cautions_text` text,
	`follow_up_text` text,
	`usage_count` integer NOT NULL,
	`last_used_at` integer,
	`starred` integer NOT NULL,
	`tags` text,
	`search_text` text,
	FOREIGN KEY (`specialty_id`) REFERENCES `specialties`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `rx_templates_search_idx` ON `prescription_templates` (`search_text`);--> statement-breakpoint
CREATE INDEX `rx_templates_usage_idx` ON `prescription_templates` (`usage_count`);--> statement-breakpoint
CREATE TABLE `specialty_profiles` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`specialty_id` text,
	`name_text` text,
	`overview` text,
	`daily_work` text,
	`residency_years` text,
	`entrance_difficulty` text,
	`lifestyle` text,
	`income_notes` text,
	`job_market` text,
	`subspecialty_paths` text,
	`pros_text` text,
	`cons_text` text,
	`personal_fit` integer,
	`my_thoughts` text,
	`sources_text` text,
	`tags` text,
	`search_text` text,
	FOREIGN KEY (`specialty_id`) REFERENCES `specialties`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `specialty_profiles_specialty_idx` ON `specialty_profiles` (`specialty_id`);--> statement-breakpoint
CREATE TABLE `topics` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`title` text NOT NULL,
	`specialty_id` text,
	`taught_by_id` text,
	`context` text,
	`taught_at` integer,
	`summary` text,
	`body` text,
	`professor_notes` text,
	`pearls` text,
	`source` text,
	`tags` text,
	`starred` integer NOT NULL,
	`needs_review` integer NOT NULL,
	`last_reviewed_at` integer,
	`search_text` text,
	FOREIGN KEY (`specialty_id`) REFERENCES `specialties`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`taught_by_id`) REFERENCES `doctors`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `topics_specialty_idx` ON `topics` (`specialty_id`);--> statement-breakpoint
CREATE INDEX `topics_taught_by_idx` ON `topics` (`taught_by_id`);--> statement-breakpoint
CREATE INDEX `topics_search_idx` ON `topics` (`search_text`);--> statement-breakpoint
CREATE TABLE `credentials` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`system_name` text NOT NULL,
	`category` text NOT NULL,
	`url` text,
	`username` text,
	`secret_cipher` text,
	`secret_nonce` text,
	`key_version` integer NOT NULL,
	`second_factor_notes` text,
	`owner_kind` text NOT NULL,
	`owner_name` text,
	`owner_consent_note` text,
	`notes` text,
	`tags` text,
	`last_used_at` integer,
	`expires_at` integer,
	`starred` integer NOT NULL,
	`search_text` text
);
--> statement-breakpoint
CREATE INDEX `credentials_category_idx` ON `credentials` (`category`,`deleted_at`);--> statement-breakpoint
CREATE INDEX `credentials_owner_idx` ON `credentials` (`owner_kind`);--> statement-breakpoint
CREATE INDEX `credentials_search_idx` ON `credentials` (`search_text`);--> statement-breakpoint
CREATE TABLE `attachments` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`patient_id` text,
	`kind` text NOT NULL,
	`relative_path` text NOT NULL,
	`thumbnail_path` text,
	`mime_type` text,
	`size_bytes` integer,
	`width` integer,
	`height` integer,
	`duration_ms` integer,
	`caption` text,
	`transcript` text,
	`captured_at` integer,
	`body_site` text,
	`tags` text,
	`is_sensitive` integer NOT NULL,
	`is_missing` integer NOT NULL,
	`checksum` text,
	`sort_order` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `attachments_entity_idx` ON `attachments` (`entity_type`,`entity_id`);--> statement-breakpoint
CREATE INDEX `attachments_patient_idx` ON `attachments` (`patient_id`,`kind`);--> statement-breakpoint
CREATE INDEX `attachments_kind_idx` ON `attachments` (`kind`,`deleted_at`);--> statement-breakpoint
CREATE TABLE `audit_log` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`at` integer NOT NULL,
	`action` text NOT NULL,
	`entity_type` text,
	`entity_id` text,
	`summary` text,
	`detail` text
);
--> statement-breakpoint
CREATE INDEX `audit_log_at_idx` ON `audit_log` (`at`);--> statement-breakpoint
CREATE INDEX `audit_log_entity_idx` ON `audit_log` (`entity_type`,`entity_id`);--> statement-breakpoint
CREATE TABLE `backup_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`started_at` integer NOT NULL,
	`finished_at` integer,
	`trigger` text NOT NULL,
	`status` text NOT NULL,
	`destination` text,
	`file_name` text,
	`size_bytes` integer,
	`checksum` text,
	`includes_media` integer NOT NULL,
	`is_encrypted` integer NOT NULL,
	`row_counts` text,
	`schema_version` integer,
	`error_text` text
);
--> statement-breakpoint
CREATE INDEX `backup_runs_started_idx` ON `backup_runs` (`started_at`);--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text,
	`updated_at` integer NOT NULL
);
