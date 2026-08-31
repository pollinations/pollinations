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
CREATE INDEX `idx_pollen_gift_code_redeemer_user_id` ON `pollen_gift_code` (`redeemer_user_id`);--> statement-breakpoint
CREATE TABLE `pollen_gift_rate_limit` (
	`key` text PRIMARY KEY NOT NULL,
	`window_started_at` integer NOT NULL,
	`attempts` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `stripe_gift_card_fingerprint_attempt` (
	`event_id` text PRIMARY KEY NOT NULL,
	`buyer_key` text NOT NULL,
	`card_fingerprint` text NOT NULL,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_stripe_gift_card_attempt_buyer_created` ON `stripe_gift_card_fingerprint_attempt` (`buyer_key`,`created_at`);
