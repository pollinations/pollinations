CREATE TABLE `agent` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_user_id` text NOT NULL,
	`name` text NOT NULL,
	`config` text NOT NULL,
	`base_url` text NOT NULL,
	`bearer_token_ciphertext` text NOT NULL,
	`api_key_id` text NOT NULL,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	FOREIGN KEY (`owner_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_agent_owner_user_id` ON `agent` (`owner_user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_agent_owner_name` ON `agent` (`owner_user_id`,`name`);--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_community_endpoint` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_user_id` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`modality` text DEFAULT 'text' NOT NULL,
	`image_pricing` text DEFAULT 'request' NOT NULL,
	`base_url` text,
	`agent_id` text,
	`upstream_model` text NOT NULL,
	`bearer_token_ciphertext` text,
	`visibility` text DEFAULT 'private' NOT NULL,
	`prompt_text_price` real NOT NULL,
	`prompt_cached_price` real DEFAULT 0 NOT NULL,
	`prompt_cache_write_price` real DEFAULT 0 NOT NULL,
	`prompt_audio_price` real DEFAULT 0 NOT NULL,
	`prompt_image_price` real DEFAULT 0 NOT NULL,
	`completion_text_price` real NOT NULL,
	`completion_reasoning_price` real DEFAULT 0 NOT NULL,
	`completion_audio_price` real DEFAULT 0 NOT NULL,
	`completion_image_price` real DEFAULT 0 NOT NULL,
	`disabled_at` integer,
	`disabled_reason` text,
	`disabled_by` text,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	FOREIGN KEY (`owner_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`agent_id`) REFERENCES `agent`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
INSERT INTO `__new_community_endpoint`("id", "owner_user_id", "name", "description", "modality", "image_pricing", "base_url", "agent_id", "upstream_model", "bearer_token_ciphertext", "visibility", "prompt_text_price", "prompt_cached_price", "prompt_cache_write_price", "prompt_audio_price", "prompt_image_price", "completion_text_price", "completion_reasoning_price", "completion_audio_price", "completion_image_price", "disabled_at", "disabled_reason", "disabled_by", "created_at", "updated_at") SELECT "id", "owner_user_id", "name", "description", "modality", "image_pricing", "base_url", NULL, "upstream_model", "bearer_token_ciphertext", "visibility", "prompt_text_price", "prompt_cached_price", "prompt_cache_write_price", "prompt_audio_price", "prompt_image_price", "completion_text_price", "completion_reasoning_price", "completion_audio_price", "completion_image_price", "disabled_at", "disabled_reason", "disabled_by", "created_at", "updated_at" FROM `community_endpoint`;--> statement-breakpoint
DROP TABLE `community_endpoint`;--> statement-breakpoint
ALTER TABLE `__new_community_endpoint` RENAME TO `community_endpoint`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `idx_community_endpoint_owner_user_id` ON `community_endpoint` (`owner_user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_community_endpoint_owner_name` ON `community_endpoint` (`owner_user_id`,`name`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_community_endpoint_agent_id` ON `community_endpoint` (`agent_id`);
