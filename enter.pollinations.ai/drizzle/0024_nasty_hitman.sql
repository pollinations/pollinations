CREATE TABLE `quest_payout_credits` (
	`payout_key` text PRIMARY KEY NOT NULL,
	`quest_issue_number` integer NOT NULL,
	`pr_number` integer NOT NULL,
	`role` text NOT NULL,
	`github_username` text NOT NULL,
	`user_id` text NOT NULL,
	`pollen_credited` real NOT NULL,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_quest_payout_credits_user_id` ON `quest_payout_credits` (`user_id`);--> statement-breakpoint
CREATE INDEX `idx_quest_payout_credits_quest_issue` ON `quest_payout_credits` (`quest_issue_number`);