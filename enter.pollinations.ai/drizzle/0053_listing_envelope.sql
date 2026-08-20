PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_community_endpoint` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_user_id` text NOT NULL,
	`name` text NOT NULL,
	`title` text,
	`description` text,
	`type` text DEFAULT 'proxy' NOT NULL,
	`base_url` text NOT NULL,
	`upstream_model` text NOT NULL,
	`payload` text DEFAULT '{}' NOT NULL,
	`visibility` text DEFAULT 'private' NOT NULL,
	`hidden_at` integer,
	`hidden_reason` text,
	`hidden_by` text,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	FOREIGN KEY (`owner_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "community_endpoint_type" CHECK(type IN ('proxy', 'prompt_agent', 'endpoint_agent')),
	CONSTRAINT "community_endpoint_prompt_agent_model" CHECK(type != 'prompt_agent' OR upstream_model = id),
	CONSTRAINT "community_endpoint_base_url" CHECK(type != 'prompt_agent' OR base_url = 'https://agent-runtime.invalid/api/agent-runtime/v1')
);
--> statement-breakpoint
INSERT INTO `__new_community_endpoint`(
	"id", "owner_user_id", "name", "title", "description", "type",
	"base_url", "upstream_model", "payload", "visibility", "hidden_at",
	"hidden_reason", "hidden_by", "created_at", "updated_at"
)
SELECT
	CASE WHEN "agent_id" IS NOT NULL THEN "agent_id" ELSE "id" END,
	"owner_user_id", "name", "title", "description",
	CASE
		WHEN "agent_id" IS NOT NULL THEN 'prompt_agent'
		WHEN "delegates_generation" = 1 AND "modality" = 'text' THEN 'endpoint_agent'
		ELSE 'proxy'
	END,
	CASE
		WHEN "agent_id" IS NOT NULL THEN 'https://agent-runtime.invalid/api/agent-runtime/v1'
		ELSE coalesce("base_url", '')
	END,
	CASE WHEN "agent_id" IS NOT NULL THEN "agent_id" ELSE "upstream_model" END,
	CASE
		WHEN "agent_id" IS NOT NULL THEN coalesce(
			(SELECT "config" FROM "agent" WHERE "agent"."id" = "community_endpoint"."agent_id"),
			'{}'
		)
		WHEN "delegates_generation" = 1 AND "modality" = 'text' THEN '{}'
		ELSE json_object(
			'bearerTokenCiphertext', coalesce("bearer_token_ciphertext", ''),
			'modality', "modality",
			'imagePricing', "image_pricing",
			'inputModalities', CASE
				WHEN "input_modalities" IS NOT NULL THEN json("input_modalities")
				WHEN "modality" = 'transcription' THEN json_array('audio')
				ELSE json_array('text')
			END,
			'perUserRpm', "per_user_rpm",
			'fallbacks', CASE
				WHEN "fallback_model_ids" IS NULL THEN json_array()
				ELSE json("fallback_model_ids")
			END,
			'prices', json_object(
				'promptTextPrice', "prompt_text_price",
				'promptCachedPrice', "prompt_cached_price",
				'promptCacheWritePrice', "prompt_cache_write_price",
				'promptAudioPrice', "prompt_audio_price",
				'promptImagePrice', "prompt_image_price",
				'completionTextPrice', "completion_text_price",
				'completionReasoningPrice', "completion_reasoning_price",
				'completionAudioPrice', "completion_audio_price",
				'completionImagePrice', "completion_image_price"
			)
		)
	END,
	"visibility", "hidden_at", "hidden_reason", "hidden_by",
	"created_at", "updated_at"
FROM `community_endpoint`;--> statement-breakpoint
INSERT INTO `__new_community_endpoint`(
	"id", "owner_user_id", "name", "title", "description", "type",
	"base_url", "upstream_model", "payload", "visibility", "hidden_at",
	"hidden_reason", "hidden_by", "created_at", "updated_at"
)
SELECT
	"agent"."id", "agent"."owner_user_id",
	'__migrated_agent__' || "agent"."id",
	'Agent ' || substr("agent"."id", 1, 8),
	NULL, 'prompt_agent',
	'https://agent-runtime.invalid/api/agent-runtime/v1',
	"agent"."id", "agent"."config", 'private',
	NULL, NULL, NULL, "agent"."created_at", "agent"."updated_at"
FROM `agent`
WHERE NOT EXISTS (
	SELECT 1 FROM `community_endpoint`
	WHERE `community_endpoint`.`agent_id` = `agent`.`id`
);--> statement-breakpoint
CREATE UNIQUE INDEX `__guard_community_endpoint_owner_name` ON `__new_community_endpoint` (`owner_user_id`,`name`);--> statement-breakpoint
DROP TABLE `community_endpoint`;--> statement-breakpoint
ALTER TABLE `__new_community_endpoint` RENAME TO `community_endpoint`;--> statement-breakpoint
DROP TABLE `agent`;--> statement-breakpoint
DROP INDEX `__guard_community_endpoint_owner_name`;--> statement-breakpoint
CREATE INDEX `idx_community_endpoint_owner_user_id` ON `community_endpoint` (`owner_user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_community_endpoint_owner_name` ON `community_endpoint` (`owner_user_id`,`name`);--> statement-breakpoint
PRAGMA foreign_keys=ON;
