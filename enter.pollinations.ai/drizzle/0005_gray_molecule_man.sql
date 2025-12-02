ALTER TABLE `event` ADD `token_price_completion_video_seconds` real NOT NULL;--> statement-breakpoint
ALTER TABLE `event` ADD `token_count_completion_video_seconds` integer NOT NULL;--> statement-breakpoint
ALTER TABLE `event` DROP COLUMN `error_stack`;--> statement-breakpoint
ALTER TABLE `event` DROP COLUMN `error_details`;