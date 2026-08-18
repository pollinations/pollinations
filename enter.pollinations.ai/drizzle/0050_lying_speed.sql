ALTER TABLE `community_endpoint` ADD `kind` text DEFAULT 'model' NOT NULL;--> statement-breakpoint
-- Both existing ways of being an agent collapse into the new column: a prompt
-- agent (agent_id set) and an admin-granted delegating endpoint were already
-- treated as one by every guard that reads them. Image rows are excluded
-- because agent listings are text-only and the image path never minted a run
-- token for them, so their delegates_generation flag was inert.
UPDATE `community_endpoint`
SET `kind` = 'agent'
WHERE `agent_id` IS NOT NULL
	OR (`delegates_generation` = 1 AND `modality` = 'text');
