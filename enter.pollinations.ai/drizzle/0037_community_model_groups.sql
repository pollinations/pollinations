CREATE TABLE `community_endpoint_group` (
	`slug` text PRIMARY KEY NOT NULL,
	`display_name` text NOT NULL,
	`description` text,
	`admin_user_id` text NOT NULL,
	`prompt_text_price` real NOT NULL,
	`prompt_cached_price` real DEFAULT 0 NOT NULL,
	`prompt_cache_write_price` real DEFAULT 0 NOT NULL,
	`prompt_audio_price` real DEFAULT 0 NOT NULL,
	`prompt_image_price` real DEFAULT 0 NOT NULL,
	`completion_text_price` real NOT NULL,
	`completion_reasoning_price` real DEFAULT 0 NOT NULL,
	`completion_audio_price` real DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`admin_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `community_endpoint_invitation` (
	`id` text PRIMARY KEY NOT NULL,
	`group_slug` text NOT NULL,
	`inviter_user_id` text NOT NULL,
	`invitee_user_id` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`group_slug`) REFERENCES `community_endpoint_group`(`slug`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`inviter_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`invitee_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_community_endpoint_group_admin_user_id` ON `community_endpoint_group` (`admin_user_id`);--> statement-breakpoint
CREATE INDEX `idx_community_endpoint_invitation_group_slug` ON `community_endpoint_invitation` (`group_slug`);--> statement-breakpoint
CREATE INDEX `idx_community_endpoint_invitation_invitee_user_id` ON `community_endpoint_invitation` (`invitee_user_id`);--> statement-breakpoint
ALTER TABLE `community_endpoint` ADD `group_slug` text;--> statement-breakpoint
CREATE INDEX `idx_community_endpoint_group_slug` ON `community_endpoint` (`group_slug`);
