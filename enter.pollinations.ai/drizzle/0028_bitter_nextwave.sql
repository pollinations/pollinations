CREATE TABLE `github_quest_issues` (
	`issue_number` integer PRIMARY KEY NOT NULL,
	`quest_id` text NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`url` text NOT NULL,
	`reward_amount` real,
	`balance_bucket` text NOT NULL,
	`state` text NOT NULL,
	`assignee_github_id` integer,
	`assignee_login` text,
	`assignees_json` text,
	`completed_by_pr_number` integer,
	`completed_at` integer,
	`github_created_at` integer,
	`github_updated_at` integer,
	`metadata_json` text,
	`updated_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_github_quest_issues_quest_id` ON `github_quest_issues` (`quest_id`);--> statement-breakpoint
CREATE INDEX `idx_github_quest_issues_state` ON `github_quest_issues` (`state`);--> statement-breakpoint
CREATE INDEX `idx_github_quest_issues_assignee_github_id` ON `github_quest_issues` (`assignee_github_id`);