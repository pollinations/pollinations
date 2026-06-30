CREATE TABLE `stripe_card_fingerprint_attempt` (
	`event_id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`stripe_customer_id` text,
	`customer_email` text,
	`card_fingerprint` text NOT NULL,
	`card_brand` text,
	`card_country` text,
	`payment_intent_id` text,
	`charge_id` text,
	`status` text NOT NULL,
	`livemode` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_stripe_card_fingerprint_attempt_user_created` ON `stripe_card_fingerprint_attempt` (`user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_stripe_card_fingerprint_attempt_user_fingerprint` ON `stripe_card_fingerprint_attempt` (`user_id`,`card_fingerprint`);--> statement-breakpoint
CREATE INDEX `idx_stripe_card_fingerprint_attempt_customer_created` ON `stripe_card_fingerprint_attempt` (`stripe_customer_id`,`created_at`);
