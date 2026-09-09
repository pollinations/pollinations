CREATE TABLE `rewards` (
	`id` text PRIMARY KEY NOT NULL,
	`idempotency_key` text NOT NULL,
	`user_id` text NOT NULL,
	`quest_id` text,
	`title` text NOT NULL,
	`url` text,
	`pollen_amount` real NOT NULL,
	`balance_bucket` text NOT NULL,
	`earned_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`claimed_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `rewards_idempotency_key_unique` ON `rewards` (`idempotency_key`);--> statement-breakpoint
CREATE INDEX `idx_rewards_user_id` ON `rewards` (`user_id`);--> statement-breakpoint
DROP TABLE `gh_issues`;--> statement-breakpoint
DROP TABLE `gh_pr_closing_issues`;--> statement-breakpoint
DROP TABLE `gh_pull_requests`;--> statement-breakpoint
INSERT OR IGNORE INTO rewards (
		id,
		idempotency_key,
		user_id,
		quest_id,
		title,
		url,
		pollen_amount,
		balance_bucket,
		earned_at,
		claimed_at
	)
SELECT
		'backfill:quest:' || quest_issue_number,
		'quest:github:issue:' || quest_issue_number,
		user_id,
		'github:issue:' || quest_issue_number,
		'Community issue #' || quest_issue_number,
		'https://github.com/pollinations/pollinations/issues/' || quest_issue_number,
		pollen_credited,
		'tier',
		created_at,
		created_at
	FROM quest_payout_credits;
--> statement-breakpoint
DROP TABLE `quest_payout_credits`;