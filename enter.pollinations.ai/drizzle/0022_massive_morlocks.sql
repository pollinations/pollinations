ALTER TABLE `apikey` ADD `byop_client_key_id` text;--> statement-breakpoint
CREATE INDEX `idx_apikey_byop_client_key_id` ON `apikey` (`byop_client_key_id`);--> statement-breakpoint
ALTER TABLE `user` ADD `dev_balance` real;