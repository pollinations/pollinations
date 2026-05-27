CREATE TABLE `media_asset` (
	`id` text PRIMARY KEY NOT NULL,
	`url` text NOT NULL,
	`hash` text NOT NULL,
	`content_type` text NOT NULL,
	`size` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`expires_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `media_asset_url_unique` ON `media_asset` (`url`);--> statement-breakpoint
CREATE UNIQUE INDEX `media_asset_hash_unique` ON `media_asset` (`hash`);--> statement-breakpoint
CREATE INDEX `idx_media_asset_expires_at` ON `media_asset` (`expires_at`);--> statement-breakpoint
CREATE TABLE `media_event` (
	`id` text PRIMARY KEY NOT NULL,
	`media_id` text NOT NULL,
	`user_id` text,
	`api_key_id` text,
	`app_key_id` text,
	`app_name` text,
	`attribution_source` text DEFAULT 'none' NOT NULL,
	`creation_source` text DEFAULT 'upload' NOT NULL,
	`visibility` text DEFAULT 'public' NOT NULL,
	`prompt` text,
	`model` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_media_event_user_created` ON `media_event` (`user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_media_event_app_created` ON `media_event` (`app_key_id`,`visibility`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_media_event_media_created` ON `media_event` (`media_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `media_edge` (
	`parent_media_id` text NOT NULL,
	`child_media_id` text NOT NULL,
	`event_id` text NOT NULL,
	`relation` text DEFAULT 'derived_from' NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`parent_media_id`, `child_media_id`, `event_id`)
);
--> statement-breakpoint
CREATE INDEX `idx_media_edge_parent_created` ON `media_edge` (`parent_media_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_media_edge_child` ON `media_edge` (`child_media_id`);--> statement-breakpoint
CREATE TABLE `media_tag` (
	`tag` text NOT NULL,
	`media_id` text NOT NULL,
	`event_id` text NOT NULL,
	`source` text DEFAULT 'user' NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`tag`, `media_id`, `event_id`)
);
--> statement-breakpoint
CREATE INDEX `idx_media_tag_tag_created` ON `media_tag` (`tag`,`created_at`);
