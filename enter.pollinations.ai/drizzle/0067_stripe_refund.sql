CREATE TABLE `stripe_refund` (
	`refund_id` text PRIMARY KEY NOT NULL,
	`status` text NOT NULL,
	`charge_id` text NOT NULL,
	`payment_intent_id` text NOT NULL,
	`user_id` text NOT NULL,
	`amount` integer NOT NULL,
	`currency` text NOT NULL,
	`pollen_reversed` real NOT NULL,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_stripe_refund_charge_id` ON `stripe_refund` (`charge_id`);