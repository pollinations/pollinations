ALTER TABLE `community_endpoint` ADD `kind` text DEFAULT 'model' NOT NULL;--> statement-breakpoint
ALTER TABLE `community_endpoint` ADD `tools` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `community_endpoint` ADD `search` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `community_endpoint` ADD `reasoning` integer DEFAULT false NOT NULL;