ALTER TABLE `community_endpoint` ADD `prompt_cached_price` real DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `community_endpoint` ADD `prompt_cache_write_price` real DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `community_endpoint` ADD `prompt_audio_price` real DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `community_endpoint` ADD `prompt_image_price` real DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `community_endpoint` ADD `completion_reasoning_price` real DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `community_endpoint` ADD `completion_audio_price` real DEFAULT 0 NOT NULL;