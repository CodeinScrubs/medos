DROP INDEX `doctor_profiles_doctor_idx`;--> statement-breakpoint
CREATE UNIQUE INDEX `doctor_profiles_doctor_idx` ON `doctor_profiles` (`doctor_id`) WHERE deleted_at is null;