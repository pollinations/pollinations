ALTER TABLE `agent` ADD `kind` text DEFAULT 'prompt' NOT NULL;
--> statement-breakpoint
INSERT OR IGNORE INTO `agent` (
	`id`,
	`owner_user_id`,
	`kind`,
	`config`,
	`created_at`,
	`updated_at`
)
SELECT
	`id`,
	`owner_user_id`,
	'endpoint',
	json_object('baseUrl', `base_url`, 'upstreamModel', `upstream_model`),
	`created_at`,
	`updated_at`
FROM `community_endpoint`
WHERE
	`delegates_generation` = 1
	AND `agent_id` IS NULL
	AND `base_url` IS NOT NULL;
--> statement-breakpoint
UPDATE `community_endpoint`
SET
	`agent_id` = `id`,
	`base_url` = NULL,
	`upstream_model` = `id`
WHERE
	`delegates_generation` = 1
	AND `agent_id` IS NULL
	AND `id` IN (SELECT `id` FROM `agent` WHERE `kind` = 'endpoint');
