CREATE TABLE `pollen_gift_adjustment` (
	`idempotency_key` text PRIMARY KEY NOT NULL,
	`gift_id` text NOT NULL,
	`stripe_event_id` text NOT NULL,
	`user_id` text,
	`pollen_delta` real NOT NULL,
	`amount_cents` integer DEFAULT 0 NOT NULL,
	`reason` text NOT NULL,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	FOREIGN KEY (`gift_id`) REFERENCES `pollen_gift_code`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_pollen_gift_adjustment_gift_id` ON `pollen_gift_adjustment` (`gift_id`);--> statement-breakpoint
CREATE INDEX `idx_pollen_gift_adjustment_user_id` ON `pollen_gift_adjustment` (`user_id`);--> statement-breakpoint
CREATE TABLE `pollen_gift_code` (
	`id` text PRIMARY KEY NOT NULL,
	`code_hash` text NOT NULL,
	`pollen_amount` integer NOT NULL,
	`face_value_cents` integer NOT NULL,
	`service_fee_cents` integer NOT NULL,
	`paid_amount_cents` integer,
	`paid_currency` text,
	`refunded_amount_cents` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`status_before_dispute` text,
	`balance_reversed` integer DEFAULT false NOT NULL,
	`stripe_checkout_session_id` text,
	`stripe_payment_intent_id` text,
	`stripe_invoice_id` text,
	`redeemer_user_id` text,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`activated_at` integer,
	`redeemed_at` integer,
	`invalidated_at` integer,
	FOREIGN KEY (`redeemer_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `pollen_gift_code_code_hash_unique` ON `pollen_gift_code` (`code_hash`);--> statement-breakpoint
CREATE UNIQUE INDEX `pollen_gift_code_stripe_checkout_session_id_unique` ON `pollen_gift_code` (`stripe_checkout_session_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `pollen_gift_code_stripe_payment_intent_id_unique` ON `pollen_gift_code` (`stripe_payment_intent_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `pollen_gift_code_stripe_invoice_id_unique` ON `pollen_gift_code` (`stripe_invoice_id`);--> statement-breakpoint
CREATE INDEX `idx_pollen_gift_code_status` ON `pollen_gift_code` (`status`);--> statement-breakpoint
CREATE INDEX `idx_pollen_gift_code_redeemer_user_id` ON `pollen_gift_code` (`redeemer_user_id`);