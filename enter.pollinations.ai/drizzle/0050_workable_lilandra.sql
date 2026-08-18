-- One account per GitHub identity. Runs first: if two accounts ever shared a
-- github_id, the migration stops here, before anything is re-keyed or dropped.
CREATE UNIQUE INDEX `user_github_id_unique` ON `user` (`github_id`);--> statement-breakpoint
DROP INDEX `idx_user_github_id`;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_rewards` (
	`id` text PRIMARY KEY NOT NULL,
	`idempotency_key` text NOT NULL,
	`user_id` text,
	`quest_id` text,
	`title` text NOT NULL,
	`url` text,
	`pollen_amount` real NOT NULL,
	`balance_bucket` text NOT NULL,
	`earned_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`claimed_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
-- Re-key per-person rewards from the account id to the GitHub id, so the key
-- still matches after the account is deleted. Keys of any other shape
-- ("quest:{issue}" bounties) are one-per-issue already and stay as they are.
INSERT INTO `__new_rewards`("id", "idempotency_key", "user_id", "quest_id", "title", "url", "pollen_amount", "balance_bucket", "earned_at", "claimed_at")
SELECT
	`r`.`id`,
	CASE
		WHEN `u`.`github_id` IS NOT NULL
			AND `r`.`idempotency_key` = 'quest:' || `r`.`quest_id` || ':user:' || `r`.`user_id`
		THEN 'quest:' || `r`.`quest_id` || ':github:' || `u`.`github_id`
		ELSE `r`.`idempotency_key`
	END,
	`r`.`user_id`,
	`r`.`quest_id`,
	`r`.`title`,
	`r`.`url`,
	`r`.`pollen_amount`,
	`r`.`balance_bucket`,
	`r`.`earned_at`,
	`r`.`claimed_at`
FROM `rewards` `r`
LEFT JOIN `user` `u` ON `u`.`id` = `r`.`user_id`;--> statement-breakpoint
DROP TABLE `rewards`;--> statement-breakpoint
ALTER TABLE `__new_rewards` RENAME TO `rewards`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `rewards_idempotency_key_unique` ON `rewards` (`idempotency_key`);--> statement-breakpoint
CREATE INDEX `idx_rewards_user_id` ON `rewards` (`user_id`);
