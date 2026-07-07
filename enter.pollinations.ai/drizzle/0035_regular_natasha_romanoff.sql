ALTER TABLE `account` ADD `username` text;--> statement-breakpoint
CREATE UNIQUE INDEX `idx_account_provider_account` ON `account` (`provider_id`,`account_id`);--> statement-breakpoint
ALTER TABLE `user` ADD `handle` text;--> statement-breakpoint
CREATE UNIQUE INDEX `idx_user_handle_lower` ON `user` (lower("handle"));