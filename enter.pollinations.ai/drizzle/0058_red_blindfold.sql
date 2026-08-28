PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_pollen_gift_adjustment` (
	`idempotency_key` text PRIMARY KEY NOT NULL,
	`gift_id` text NOT NULL,
	`reason` text NOT NULL,
	`active` integer DEFAULT false NOT NULL,
	`terminal` integer DEFAULT false NOT NULL,
	`stripe_event_created` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`gift_id`) REFERENCES `pollen_gift_code`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_pollen_gift_adjustment`("idempotency_key", "gift_id", "reason", "active", "terminal", "stripe_event_created") SELECT "idempotency_key", "gift_id", "reason", "active", "terminal", "stripe_event_created" FROM `pollen_gift_adjustment`;--> statement-breakpoint
DROP TABLE `pollen_gift_adjustment`;--> statement-breakpoint
ALTER TABLE `__new_pollen_gift_adjustment` RENAME TO `pollen_gift_adjustment`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `idx_pollen_gift_adjustment_gift_id` ON `pollen_gift_adjustment` (`gift_id`);--> statement-breakpoint
DROP INDEX `pollen_gift_code_stripe_invoice_id_unique`;--> statement-breakpoint
DROP INDEX `idx_pollen_gift_code_status`;--> statement-breakpoint
ALTER TABLE `pollen_gift_code` DROP COLUMN `face_value_cents`;--> statement-breakpoint
ALTER TABLE `pollen_gift_code` DROP COLUMN `service_fee_cents`;--> statement-breakpoint
ALTER TABLE `pollen_gift_code` DROP COLUMN `paid_amount_cents`;--> statement-breakpoint
ALTER TABLE `pollen_gift_code` DROP COLUMN `paid_currency`;--> statement-breakpoint
ALTER TABLE `pollen_gift_code` DROP COLUMN `refunded_amount_cents`;--> statement-breakpoint
ALTER TABLE `pollen_gift_code` DROP COLUMN `stripe_invoice_id`;--> statement-breakpoint
ALTER TABLE `pollen_gift_code` DROP COLUMN `invalidated_at`;--> statement-breakpoint
ALTER TABLE `pollen_gift_rate_limit` DROP COLUMN `updated_at`;