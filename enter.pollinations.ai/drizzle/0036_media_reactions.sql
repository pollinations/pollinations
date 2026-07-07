CREATE TABLE `media_reaction` (
	`item_id` text NOT NULL,
	`user_id` text NOT NULL,
	`reaction` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`item_id`) REFERENCES `media_item`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_media_reaction_item_user_reaction` ON `media_reaction` (`item_id`,`user_id`,`reaction`);