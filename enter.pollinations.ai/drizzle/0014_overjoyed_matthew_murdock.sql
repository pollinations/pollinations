ALTER TABLE `user` ADD `tier_balance` real;--> statement-breakpoint
ALTER TABLE `user` ADD `pack_balance` real;--> statement-breakpoint
ALTER TABLE `user` ADD `last_tier_grant` integer;--> statement-breakpoint
ALTER TABLE `user` DROP COLUMN `pollen_balance`;