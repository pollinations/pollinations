ALTER TABLE `user` ADD `github_id` integer;--> statement-breakpoint
ALTER TABLE `user` ADD `github_username` text;--> statement-breakpoint
ALTER TABLE `user` ADD `tier` text DEFAULT 'seed' NOT NULL;--> statement-breakpoint
CREATE INDEX `idx_user_tier` ON `user` (`tier`);--> statement-breakpoint
ALTER TABLE `event` ADD `request_path` text NOT NULL;--> statement-breakpoint
ALTER TABLE `event` ADD `api_key_id` text;--> statement-breakpoint
ALTER TABLE `event` ADD `api_key_type` text;--> statement-breakpoint
ALTER TABLE `event` ADD `resolved_model_requested` text;--> statement-breakpoint
ALTER TABLE `event` ADD `free_model_requested` integer;--> statement-breakpoint
ALTER TABLE `event` ADD `error_response_code` text;--> statement-breakpoint
ALTER TABLE `event` ADD `error_source` text;--> statement-breakpoint
ALTER TABLE `event` ADD `error_message` text;--> statement-breakpoint
ALTER TABLE `event` ADD `error_stack` text;--> statement-breakpoint
ALTER TABLE `event` ADD `error_details` text;--> statement-breakpoint
ALTER TABLE `event` DROP COLUMN `cost_type`;
