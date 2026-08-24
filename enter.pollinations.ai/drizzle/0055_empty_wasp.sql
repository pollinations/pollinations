CREATE TABLE `billable_event` (
	`id` text PRIMARY KEY NOT NULL,
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
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_billable_event_request_id` ON `billable_event` (`request_id`);--> statement-breakpoint
CREATE INDEX `idx_billable_event_user_occurred` ON `billable_event` (`user_id`,`occurred_at`);