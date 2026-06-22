DROP INDEX `idx_reward_grants_source`;--> statement-breakpoint
ALTER TABLE `reward_grants` DROP COLUMN `source`;--> statement-breakpoint
ALTER TABLE `reward_grants` DROP COLUMN `source_ref`;--> statement-breakpoint
ALTER TABLE `reward_grants` DROP COLUMN `metadata_json`;--> statement-breakpoint
ALTER TABLE `reward_grants` ADD COLUMN `title` text NOT NULL DEFAULT '';--> statement-breakpoint
ALTER TABLE `reward_grants` ADD COLUMN `url` text;