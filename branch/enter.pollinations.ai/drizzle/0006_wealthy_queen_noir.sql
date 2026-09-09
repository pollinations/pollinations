CREATE INDEX `idx_account_user_id` ON `account` (`user_id`);--> statement-breakpoint
CREATE INDEX `idx_apikey_key` ON `apikey` (`key`);--> statement-breakpoint
CREATE INDEX `idx_apikey_expires_at` ON `apikey` (`expires_at`);--> statement-breakpoint
CREATE INDEX `idx_apikey_user_id` ON `apikey` (`user_id`);--> statement-breakpoint
CREATE INDEX `idx_session_user_id` ON `session` (`user_id`);--> statement-breakpoint
CREATE INDEX `idx_user_email` ON `user` (`email`);--> statement-breakpoint
CREATE INDEX `idx_verification_identifier` ON `verification` (`identifier`);--> statement-breakpoint
CREATE INDEX `idx_event_processing_status` ON `event` (`event_processing_id`,`event_status`);--> statement-breakpoint
CREATE INDEX `idx_event_created_at` ON `event` (`created_at`);