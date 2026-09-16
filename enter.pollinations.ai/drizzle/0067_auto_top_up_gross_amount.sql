ALTER TABLE `stripe_auto_top_up_attempt` ADD `stripe_amount_paid` integer;--> statement-breakpoint
ALTER TABLE `stripe_auto_top_up_attempt` ADD `stripe_currency` text;