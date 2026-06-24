ALTER TABLE `reward_grants` ADD COLUMN `title` text NOT NULL DEFAULT '';--> statement-breakpoint
ALTER TABLE `reward_grants` ADD COLUMN `url` text;--> statement-breakpoint
UPDATE `reward_grants`
SET
	title = 'Community issue #' || json_extract(metadata_json, '$.issueNumber'),
	url = 'https://github.com/pollinations/pollinations/issues/' || json_extract(metadata_json, '$.issueNumber')
WHERE metadata_json IS NOT NULL
	AND json_extract(metadata_json, '$.issueNumber') IS NOT NULL;--> statement-breakpoint
DROP INDEX `idx_reward_grants_source`;--> statement-breakpoint
ALTER TABLE `reward_grants` DROP COLUMN `source`;--> statement-breakpoint
ALTER TABLE `reward_grants` DROP COLUMN `source_ref`;--> statement-breakpoint
ALTER TABLE `reward_grants` DROP COLUMN `metadata_json`;
