ALTER TABLE `reward_grants` ADD COLUMN `claimed_at` integer;--> statement-breakpoint
UPDATE `reward_grants`
SET `claimed_at` = `created_at`;--> statement-breakpoint
DROP INDEX `reward_grants_idempotency_key_unique`;--> statement-breakpoint
DROP INDEX `idx_reward_grants_user_id`;--> statement-breakpoint
ALTER TABLE `reward_grants` RENAME COLUMN `pollen_credited` TO `pollen_amount`;--> statement-breakpoint
ALTER TABLE `reward_grants` RENAME COLUMN `created_at` TO `earned_at`;--> statement-breakpoint
ALTER TABLE `reward_grants` RENAME TO `rewards`;--> statement-breakpoint
CREATE UNIQUE INDEX `rewards_idempotency_key_unique` ON `rewards` (`idempotency_key`);--> statement-breakpoint
CREATE INDEX `idx_rewards_user_id` ON `rewards` (`user_id`);
