ALTER TABLE `gh_issues` ADD `assignees_json` text;--> statement-breakpoint
ALTER TABLE `gh_issues` ADD `github_created_at` integer;--> statement-breakpoint
ALTER TABLE `gh_issues` ADD `github_closed_at` integer;--> statement-breakpoint
ALTER TABLE `gh_pull_requests` ADD `github_created_at` integer;--> statement-breakpoint
ALTER TABLE `gh_pull_requests` ADD `github_closed_at` integer;