CREATE TABLE `stripe_customer_link` (
	`stripe_customer_id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`email` text NOT NULL,
	`source` text NOT NULL,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_stripe_customer_link_user_id` ON `stripe_customer_link` (`user_id`);--> statement-breakpoint
CREATE INDEX `idx_stripe_customer_link_email` ON `stripe_customer_link` (`email`);--> statement-breakpoint
ALTER TABLE `user` ADD `stripe_customer_id` text;--> statement-breakpoint
ALTER TABLE `user` ADD `stripe_legacy_customer_search_email` text;--> statement-breakpoint
CREATE UNIQUE INDEX `idx_user_stripe_customer_id` ON `user` (`stripe_customer_id`);