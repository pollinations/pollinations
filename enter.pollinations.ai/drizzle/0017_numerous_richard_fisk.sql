CREATE TABLE `device_code` (
	`id` text PRIMARY KEY NOT NULL,
	`device_code` text NOT NULL,
	`user_code` text NOT NULL,
	`user_id` text,
	`expires_at` integer NOT NULL,
	`status` text NOT NULL,
	`client_id` text,
	`scope` text,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_device_code_device_code` ON `device_code` (`device_code`);--> statement-breakpoint
CREATE INDEX `idx_device_code_user_code` ON `device_code` (`user_code`);--> statement-breakpoint
DROP TABLE IF EXISTS `event`;