ALTER TABLE `rewards` ADD `gift_code_hash` text;--> statement-breakpoint
ALTER TABLE `rewards` ADD `canceled_at` integer;--> statement-breakpoint
CREATE UNIQUE INDEX `rewards_gift_code_hash_unique` ON `rewards` (`gift_code_hash`);