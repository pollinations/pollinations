CREATE TABLE `reward_grants` (
	`id` text PRIMARY KEY NOT NULL,
	`idempotency_key` text NOT NULL,
	`user_id` text NOT NULL,
	`source` text NOT NULL,
	`quest_id` text,
	`pollen_credited` real NOT NULL,
	`balance_bucket` text NOT NULL,
	`source_ref` text,
	`metadata_json` text,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `reward_grants_idempotency_key_unique` ON `reward_grants` (`idempotency_key`);--> statement-breakpoint
CREATE INDEX `idx_reward_grants_user_id` ON `reward_grants` (`user_id`);--> statement-breakpoint
CREATE INDEX `idx_reward_grants_source` ON `reward_grants` (`source`);--> statement-breakpoint
INSERT OR IGNORE INTO reward_grants (
		id,
		idempotency_key,
		user_id,
		source,
		quest_id,
		pollen_credited,
		balance_bucket,
		source_ref,
		metadata_json,
		created_at
	)
SELECT
		'backfill:' || payout_key,
		payout_key,
		user_id,
		'code_quest',
		'github:community_issue_quest',
		pollen_credited,
		'pack',
		'pr:' || pr_number,
		json_object(
			'questTypeId',
			'github:community_issue_quest',
			'issueNumber',
			quest_issue_number,
			'prNumber',
			pr_number,
			'role',
			role,
			'githubUsername',
			github_username
		),
		created_at
	FROM quest_payout_credits;
--> statement-breakpoint
DROP TABLE `quest_payout_credits`;
