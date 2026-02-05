CREATE TABLE `device_verification` (
	`id` text PRIMARY KEY NOT NULL,
	`user_code` text NOT NULL,
	`device_code` text NOT NULL,
	`verification_uri` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`user_id` text,
	`verified` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `device_verification_user_code_unique` ON `device_verification` (`user_code`);--> statement-breakpoint
CREATE UNIQUE INDEX `device_verification_device_code_unique` ON `device_verification` (`device_code`);