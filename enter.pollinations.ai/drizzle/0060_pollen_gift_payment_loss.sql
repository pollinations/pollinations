CREATE TABLE `pollen_gift_payment_loss` (
	`key` text PRIMARY KEY NOT NULL,
	`payment_intent_id` text NOT NULL,
	`kind` text NOT NULL,
	`active` integer DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_pollen_gift_payment_loss_intent` ON `pollen_gift_payment_loss` (`payment_intent_id`);