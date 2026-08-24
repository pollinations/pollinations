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
	`occurred_at` integer NOT NULL,
	`settled_at` integer,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	PRIMARY KEY(`authorization_id`, `id`)
);
--> statement-breakpoint
CREATE INDEX `idx_billable_event_request_id` ON `billable_event` (`request_id`);--> statement-breakpoint
CREATE INDEX `idx_billable_event_user_occurred` ON `billable_event` (`user_id`,`occurred_at`);--> statement-breakpoint
CREATE TABLE `billing_authorization` (
	`id` text PRIMARY KEY NOT NULL,
	`producer` text NOT NULL,
	`request_id` text NOT NULL,
	`api_key_id` text NOT NULL,
	`user_id` text NOT NULL,
	`estimated_price` real NOT NULL,
	`reserved_price` real NOT NULL,
	`actual_price` real,
	`paid_only` integer DEFAULT false NOT NULL,
	`byop_client_key_id` text,
	`key_budget_limited` integer DEFAULT false NOT NULL,
	`reservation_applied` integer DEFAULT false NOT NULL,
	`settled_at` integer,
	`cancelled_at` integer,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_billing_authorization_producer_request` ON `billing_authorization` (`producer`,`request_id`);