CREATE TABLE `billing_settlement` (
	`request_id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`api_key_id` text,
	`is_billed_usage` integer NOT NULL,
	`total_price` real NOT NULL,
	`api_key_pollen_balance` real,
	`byop_client_key_id` text,
	`model_paid_only` integer DEFAULT false NOT NULL,
	`quest_pollen_only` integer DEFAULT false NOT NULL,
	`community_model_reward` text,
	`request_path` text,
	`environment` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`last_error` text,
	`billed_price` real,
	`payer_bucket` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`settled_at` integer
);
--> statement-breakpoint
CREATE INDEX `idx_billing_settlement_status_created` ON `billing_settlement` (`status`,`created_at`);
