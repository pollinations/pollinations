CREATE TABLE `reward_grants` (
	`id` text PRIMARY KEY NOT NULL,
	`idempotency_key` text NOT NULL,
	`user_id` text NOT NULL,
	`source` text NOT NULL,
	`quest_id` text,
	`amount` real NOT NULL,
	`balance_bucket` text NOT NULL,
	`source_ref` text,
	`metadata_json` text,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_reward_grants_idempotency_key` ON `reward_grants` (`idempotency_key`);--> statement-breakpoint
CREATE INDEX `idx_reward_grants_user_id` ON `reward_grants` (`user_id`);--> statement-breakpoint
CREATE INDEX `idx_reward_grants_source` ON `reward_grants` (`source`);--> statement-breakpoint
CREATE INDEX `idx_reward_grants_quest_id` ON `reward_grants` (`quest_id`);