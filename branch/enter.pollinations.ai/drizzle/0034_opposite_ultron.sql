ALTER TABLE `community_endpoint` ADD `disabled_at` integer;--> statement-breakpoint
ALTER TABLE `community_endpoint` ADD `disabled_reason` text;--> statement-breakpoint
ALTER TABLE `community_endpoint` ADD `disabled_by` text;