CREATE TABLE `stripe_auto_top_up_attempt` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`stripe_invoice_id` text NOT NULL,
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
CREATE UNIQUE INDEX `stripe_auto_top_up_attempt_stripe_invoice_id_unique` ON `stripe_auto_top_up_attempt` (`stripe_invoice_id`);--> statement-breakpoint
CREATE INDEX `idx_stripe_auto_top_up_attempt_user_id` ON `stripe_auto_top_up_attempt` (`user_id`);--> statement-breakpoint
CREATE INDEX `idx_stripe_auto_top_up_attempt_status` ON `stripe_auto_top_up_attempt` (`status`);--> statement-breakpoint
ALTER TABLE `user` ADD `stripe_customer_id` text;--> statement-breakpoint
ALTER TABLE `user` ADD `auto_top_up_enabled` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `user` ADD `auto_top_up_amount_usd` integer;--> statement-breakpoint
ALTER TABLE `user` ADD `auto_top_up_claimed_at` integer;--> statement-breakpoint
CREATE UNIQUE INDEX `user_stripe_customer_id_unique` ON `user` (`stripe_customer_id`);--> statement-breakpoint
CREATE INDEX `idx_user_auto_top_up_enabled` ON `user` (`auto_top_up_enabled`);