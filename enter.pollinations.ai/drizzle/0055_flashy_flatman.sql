CREATE TABLE `billable_event` (
	`id` text NOT NULL,
	`authorization_id` text NOT NULL,
	`request_id` text NOT NULL,
	`api_key_id` text NOT NULL,
	`user_id` text NOT NULL,
	`meter` text NOT NULL,
	`price` real NOT NULL,
	`billed_price` real NOT NULL,
	`paid_only` integer DEFAULT false NOT NULL,
	`payer_bucket` text,
	`dev_user_id` text,
	`dev_credit` real DEFAULT 0 NOT NULL,
	`community_user_id` text,
	`community_reward_rate` real DEFAULT 0 NOT NULL,
	`community_credit` real DEFAULT 0 NOT NULL,
	`event_fingerprint` text NOT NULL,
	`telemetry_json` text NOT NULL,
	`occurred_at` integer NOT NULL,
	`settled_at` integer,
	`auto_top_up_required` integer DEFAULT false NOT NULL,
	`auto_top_up_processed_at` integer,
	`auto_top_up_attempts` integer DEFAULT 0 NOT NULL,
	`auto_top_up_next_attempt_at` integer,
	`auto_top_up_error` text,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	PRIMARY KEY(`authorization_id`, `id`)
);
--> statement-breakpoint
CREATE INDEX `idx_billable_event_request_id` ON `billable_event` (`request_id`);--> statement-breakpoint
CREATE INDEX `idx_billable_event_user_occurred` ON `billable_event` (`user_id`,`occurred_at`);--> statement-breakpoint
CREATE INDEX `idx_billable_event_pending_auto_top_up` ON `billable_event` (`auto_top_up_next_attempt_at`,`created_at`) WHERE "billable_event"."auto_top_up_required" = 1 AND "billable_event"."auto_top_up_processed_at" IS NULL;--> statement-breakpoint
CREATE TABLE `billing_authorization` (
	`id` text PRIMARY KEY NOT NULL,
	`producer` text NOT NULL,
	`request_id` text NOT NULL,
	`model` text,
	`api_key_id` text NOT NULL,
	`api_key_name` text,
	`api_key_type` text,
	`api_key_created_via` text,
	`api_key_client_name` text,
	`api_key_client_user_id` text,
	`user_id` text NOT NULL,
	`user_tier` text NOT NULL,
	`parent_request_id` text,
	`estimated_price` real NOT NULL,
	`reserved_price` real NOT NULL,
	`actual_price` real,
	`paid_only` integer DEFAULT false NOT NULL,
	`byop_client_key_id` text,
	`dev_user_id` text,
	`markup_rate` real DEFAULT 0 NOT NULL,
	`key_budget_limited` integer DEFAULT false NOT NULL,
	`reservation_applied` integer DEFAULT false NOT NULL,
	`settled_at` integer,
	`cancelled_at` integer,
	`expires_at` integer NOT NULL,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_billing_authorization_producer_request` ON `billing_authorization` (`producer`,`request_id`);--> statement-breakpoint
CREATE INDEX `idx_billing_authorization_expiry` ON `billing_authorization` (`expires_at`);