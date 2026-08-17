PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_rewards` (
	`id` text PRIMARY KEY NOT NULL,
	`idempotency_key` text NOT NULL,
	`github_id` integer,
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
INSERT INTO `__new_rewards`("id", "idempotency_key", "github_id", "user_id", "quest_id", "title", "url", "pollen_amount", "balance_bucket", "earned_at", "claimed_at")
SELECT
	`rewards`.`id`,
	CASE
		WHEN `rewards`.`quest_id` IS NOT NULL
			AND `user`.`github_id` IS NOT NULL
			AND `rewards`.`idempotency_key` = 'quest:' || `rewards`.`quest_id` || ':user:' || `rewards`.`user_id`
		THEN 'quest:' || `rewards`.`quest_id` || ':github:' || `user`.`github_id`
		ELSE `rewards`.`idempotency_key`
	END,
	`user`.`github_id`,
	`rewards`.`user_id`,
	`rewards`.`quest_id`,
	`rewards`.`title`,
	`rewards`.`url`,
	`rewards`.`pollen_amount`,
	`rewards`.`balance_bucket`,
	`rewards`.`earned_at`,
	`rewards`.`claimed_at`
FROM `rewards`
LEFT JOIN `user` ON `user`.`id` = `rewards`.`user_id`;--> statement-breakpoint
DROP TABLE `rewards`;--> statement-breakpoint
ALTER TABLE `__new_rewards` RENAME TO `rewards`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `rewards_idempotency_key_unique` ON `rewards` (`idempotency_key`);--> statement-breakpoint
CREATE INDEX `idx_rewards_user_id` ON `rewards` (`user_id`);--> statement-breakpoint
CREATE INDEX `idx_rewards_github_id` ON `rewards` (`github_id`);
