CREATE TABLE `service_authorization` (
	`id` text PRIMARY KEY NOT NULL,
	`service` text NOT NULL,
	`request_id` text NOT NULL,
	`request_path` text NOT NULL,
	`user_id` text NOT NULL,
	`user_tier` text,
	`api_key_id` text NOT NULL,
	`api_key_name` text,
	`api_key_type` text,
	`byop_client_key_id` text,
	`paid_only` integer DEFAULT false NOT NULL,
	`api_key_has_budget` integer DEFAULT false NOT NULL,
	`payer_bucket` text NOT NULL,
	`reserved_price` real DEFAULT 0 NOT NULL,
	`charged_price` real DEFAULT 0 NOT NULL,
	`settled_price` real DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`settled_at` integer,
	`canceled_at` integer,
	`expired_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_service_authorization_request` ON `service_authorization` (`service`,`request_id`);--> statement-breakpoint
CREATE TABLE `service_billing_event` (
	`authorization_id` text NOT NULL,
	`event_id` text NOT NULL,
	`event_type` text NOT NULL,
	`status` text NOT NULL,
	`fingerprint` text DEFAULT '' NOT NULL,
	`price` real DEFAULT 0 NOT NULL,
	`billed_price` real DEFAULT 0 NOT NULL,
	`model_used` text,
	`dev_user_id` text,
	`dev_credit` real DEFAULT 0 NOT NULL,
	`markup_rate` real DEFAULT 0 NOT NULL,
	`community_reward_user_id` text,
	`community_reward_credit` real DEFAULT 0 NOT NULL,
	`community_reward_rate` real DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`authorization_id`, `event_id`)
);
