ALTER TABLE `user` ADD `stripe_customer_id` text;--> statement-breakpoint
CREATE UNIQUE INDEX `idx_user_stripe_customer_id` ON `user` (`stripe_customer_id`);
