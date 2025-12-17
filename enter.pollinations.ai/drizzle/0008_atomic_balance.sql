ALTER TABLE `user` ADD `balance` real DEFAULT 1000 NOT NULL;--> statement-breakpoint
CREATE INDEX `idx_user_balance` ON `user` (`balance`);