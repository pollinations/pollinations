-- Add video seconds columns for Veo video generation billing
ALTER TABLE `event` ADD COLUMN `token_price_completion_video_seconds` real NOT NULL DEFAULT 0;--> statement-breakpoint
ALTER TABLE `event` ADD COLUMN `token_count_completion_video_seconds` integer NOT NULL DEFAULT 0;
