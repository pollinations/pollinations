PRAGMA foreign_keys=OFF;--> statement-breakpoint
UPDATE `community_endpoint`
SET `title` = COALESCE(
	NULLIF(TRIM(`title`), ''),
	NULLIF(TRIM(`description`), ''),
	`name`
);--> statement-breakpoint
CREATE TABLE `__new_community_endpoint` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_user_id` text NOT NULL,
	`name` text NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`type` text DEFAULT 'proxy' NOT NULL,
	`base_url` text NOT NULL,
	`upstream_model` text NOT NULL,
	`payload` text DEFAULT '{}' NOT NULL,
	`visibility` text DEFAULT 'private' NOT NULL,
	`pending_payload` text,
	`pending_visibility` text,
	`pending_at` integer,
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
INSERT INTO `__new_community_endpoint`("id", "owner_user_id", "name", "title", "description", "type", "base_url", "upstream_model", "payload", "visibility", "pending_payload", "pending_visibility", "pending_at", "hidden_at", "hidden_reason", "hidden_by", "created_at", "updated_at") SELECT "id", "owner_user_id", "name", "title", "description", "type", "base_url", "upstream_model", "payload", "visibility", "pending_payload", "pending_visibility", "pending_at", "hidden_at", "hidden_reason", "hidden_by", "created_at", "updated_at" FROM `community_endpoint`;--> statement-breakpoint
DROP TABLE `community_endpoint`;--> statement-breakpoint
ALTER TABLE `__new_community_endpoint` RENAME TO `community_endpoint`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `idx_community_endpoint_owner_user_id` ON `community_endpoint` (`owner_user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_community_endpoint_owner_name` ON `community_endpoint` (`owner_user_id`,`name`);
