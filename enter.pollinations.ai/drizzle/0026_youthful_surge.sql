PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_stripe_auto_top_up_attempt` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`stripe_invoice_id` text,
	`amount_usd` integer NOT NULL,
	`pollen_grant` real NOT NULL,
	`status` text NOT NULL,
	`failure_reason` text,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`completed_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_stripe_auto_top_up_attempt`("id", "user_id", "stripe_invoice_id", "amount_usd", "pollen_grant", "status", "failure_reason", "created_at", "updated_at", "completed_at") SELECT "id", "user_id", "stripe_invoice_id", "amount_usd", "pollen_grant", "status", "failure_reason", "created_at", "updated_at", "completed_at" FROM `stripe_auto_top_up_attempt`;--> statement-breakpoint
DROP TABLE `stripe_auto_top_up_attempt`;--> statement-breakpoint
ALTER TABLE `__new_stripe_auto_top_up_attempt` RENAME TO `stripe_auto_top_up_attempt`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `stripe_auto_top_up_attempt_stripe_invoice_id_unique` ON `stripe_auto_top_up_attempt` (`stripe_invoice_id`);--> statement-breakpoint
CREATE INDEX `idx_stripe_auto_top_up_attempt_user_id` ON `stripe_auto_top_up_attempt` (`user_id`);--> statement-breakpoint
CREATE INDEX `idx_stripe_auto_top_up_attempt_status` ON `stripe_auto_top_up_attempt` (`status`);
