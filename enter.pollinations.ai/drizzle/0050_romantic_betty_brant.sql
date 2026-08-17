ALTER TABLE `community_endpoint` ADD `listing_type` text DEFAULT 'model' NOT NULL;--> statement-breakpoint
UPDATE `community_endpoint`
SET `listing_type` = 'agent'
WHERE `agent_id` IS NOT NULL OR `delegates_generation` = 1;
