ALTER TABLE `community_endpoint` ADD `modality` text DEFAULT 'text' NOT NULL;--> statement-breakpoint
ALTER TABLE `community_endpoint` ADD `completion_image_price` real DEFAULT 0 NOT NULL;
