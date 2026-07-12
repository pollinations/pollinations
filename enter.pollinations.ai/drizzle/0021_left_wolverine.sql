CREATE TABLE `stripe_checkout_credits` (
	`session_id` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL,
	`event_type` text NOT NULL,
	`user_id` text NOT NULL,
	`pollen_credited` real NOT NULL,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_stripe_checkout_credits_user_id` ON `stripe_checkout_credits` (`user_id`);