CREATE TABLE `stripe_gift_credits` (
	`session_id` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL,
	`event_type` text NOT NULL,
	`sender_user_id` text NOT NULL,
	`recipient_user_id` text NOT NULL,
	`recipient_github_username` text NOT NULL,
	`pack_key` text NOT NULL,
	`pollen_credited` real NOT NULL,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	FOREIGN KEY (`sender_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`recipient_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_stripe_gift_credits_sender_user_id` ON `stripe_gift_credits` (`sender_user_id`);--> statement-breakpoint
CREATE INDEX `idx_stripe_gift_credits_recipient_user_id` ON `stripe_gift_credits` (`recipient_user_id`);--> statement-breakpoint
CREATE INDEX `idx_user_github_username` ON `user` (`github_username`);