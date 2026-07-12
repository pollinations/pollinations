CREATE TABLE `polar_checkout_credits` (
	`order_id` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL,
	`event_type` text NOT NULL,
	`user_id` text NOT NULL,
	`pollen_credited` real NOT NULL,
	`polar_created_at` integer NOT NULL,
	`amount` integer,
	`total_amount` integer,
	`currency` text,
	`customer_id` text,
	`product_id` text,
	`product_name` text,
	`product_slug` text,
	`metadata_json` text,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_polar_checkout_credits_user_id` ON `polar_checkout_credits` (`user_id`);