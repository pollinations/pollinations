CREATE TABLE `user_app` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_user_id` text NOT NULL,
	`slug` text NOT NULL,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	FOREIGN KEY (`owner_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_user_app_owner_user_id` ON `user_app` (`owner_user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_user_app_slug` ON `user_app` (`slug`);