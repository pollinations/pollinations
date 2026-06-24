CREATE TABLE `gh_issues` (
	`number` integer PRIMARY KEY NOT NULL,
	`author_github_id` integer,
	`author_login` text,
	`state` text NOT NULL,
	`title` text NOT NULL,
	`url` text NOT NULL,
	`body` text,
	`labels_json` text,
	`assignee_github_id` integer,
	`assignee_login` text,
	`github_updated_at` integer,
	`synced_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_gh_issues_author_github_id` ON `gh_issues` (`author_github_id`);--> statement-breakpoint
CREATE INDEX `idx_gh_issues_assignee_github_id` ON `gh_issues` (`assignee_github_id`);--> statement-breakpoint
CREATE INDEX `idx_gh_issues_state` ON `gh_issues` (`state`);--> statement-breakpoint
CREATE TABLE `gh_pr_closing_issues` (
	`edge_key` text PRIMARY KEY NOT NULL,
	`pr_number` integer NOT NULL,
	`issue_number` integer NOT NULL,
	`synced_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_gh_pr_closing_issues_pr_number` ON `gh_pr_closing_issues` (`pr_number`);--> statement-breakpoint
CREATE INDEX `idx_gh_pr_closing_issues_issue_number` ON `gh_pr_closing_issues` (`issue_number`);--> statement-breakpoint
CREATE TABLE `gh_pull_requests` (
	`number` integer PRIMARY KEY NOT NULL,
	`author_github_id` integer,
	`author_login` text,
	`state` text NOT NULL,
	`merged_at` integer,
	`title` text NOT NULL,
	`url` text NOT NULL,
	`github_updated_at` integer,
	`synced_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_gh_pull_requests_author_github_id` ON `gh_pull_requests` (`author_github_id`);--> statement-breakpoint
CREATE INDEX `idx_gh_pull_requests_merged_at` ON `gh_pull_requests` (`merged_at`);--> statement-breakpoint
CREATE INDEX `idx_user_github_id` ON `user` (`github_id`);