CREATE TABLE `pollen_gift_code` (
	`id` text PRIMARY KEY NOT NULL,
	`code_hash` text NOT NULL,
	`pollen_amount` integer NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`stripe_checkout_session_id` text,
	`stripe_payment_intent_id` text,
	`redeemer_user_id` text,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`redeemed_at` integer,
	FOREIGN KEY (`redeemer_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `pollen_gift_code_code_hash_unique` ON `pollen_gift_code` (`code_hash`);--> statement-breakpoint
CREATE UNIQUE INDEX `pollen_gift_code_stripe_checkout_session_id_unique` ON `pollen_gift_code` (`stripe_checkout_session_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `pollen_gift_code_stripe_payment_intent_id_unique` ON `pollen_gift_code` (`stripe_payment_intent_id`);--> statement-breakpoint
CREATE INDEX `idx_pollen_gift_code_redeemer_user_id` ON `pollen_gift_code` (`redeemer_user_id`);
