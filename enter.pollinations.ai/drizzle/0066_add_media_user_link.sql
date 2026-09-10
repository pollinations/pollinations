CREATE TABLE `media_user_link` (
	`item_id` text NOT NULL,
	`user_id` text NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`user_id`, `item_id`),
	FOREIGN KEY (`item_id`) REFERENCES `media_item`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_media_user_link_user_created` ON `media_user_link` (`user_id`,`created_at`);--> statement-breakpoint
--
-- Backfill default: every media_item row that predates this migration was
-- created through the tag-publish upload path (generations were never
-- cataloged before this change), so `'upload'` is the correct historical
-- value, not a guess. New rows always pass an explicit `source`.
ALTER TABLE `media_item` ADD `source` text NOT NULL DEFAULT 'upload';