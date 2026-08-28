CREATE TABLE `pollen_gift_rate_limit` (
	`key` text PRIMARY KEY NOT NULL,
	`window_started_at` integer NOT NULL,
	`attempts` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `stripe_gift_card_fingerprint_attempt` (
	`event_id` text PRIMARY KEY NOT NULL,
	`buyer_key` text NOT NULL,
	`card_fingerprint` text NOT NULL,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_stripe_gift_card_attempt_buyer_created` ON `stripe_gift_card_fingerprint_attempt` (`buyer_key`,`created_at`);--> statement-breakpoint
ALTER TABLE `pollen_gift_adjustment` ADD `active` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `pollen_gift_adjustment` ADD `terminal` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `pollen_gift_adjustment` ADD `stripe_event_created` integer DEFAULT 0 NOT NULL;