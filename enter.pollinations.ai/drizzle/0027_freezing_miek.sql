ALTER TABLE `stripe_auto_top_up_attempt` ADD `charged_currency` text;--> statement-breakpoint
ALTER TABLE `stripe_auto_top_up_attempt` ADD `charged_amount_cents` integer;