CREATE TABLE `media_item` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`locator` text NOT NULL,
	`owner_user_id` text,
	`app_key_id` text,
	`content_type` text NOT NULL,
	`size` integer,
	`model` text,
	`prompt` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`owner_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_media_item_owner_locator` ON `media_item` (`owner_user_id`,`locator`);--> statement-breakpoint
CREATE INDEX `idx_media_item_owner_created` ON `media_item` (`owner_user_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `media_tag` (
	`item_id` text NOT NULL,
	`tag` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`item_id`) REFERENCES `media_item`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_media_tag_item_tag` ON `media_tag` (`item_id`,`tag`);--> statement-breakpoint
CREATE INDEX `idx_media_tag_tag_created` ON `media_tag` (`tag`,`created_at`);