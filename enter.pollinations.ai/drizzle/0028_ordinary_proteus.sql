CREATE TABLE `quest_definitions` (
	`id` text PRIMARY KEY NOT NULL,
	`key` text NOT NULL,
	`title` text NOT NULL,
	`category` text,
	`trigger_type` text NOT NULL,
	`reward_amount` real NOT NULL,
	`balance_bucket` text DEFAULT 'tier' NOT NULL,
	`repeatability` text DEFAULT 'once' NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`criteria_json` text,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `quest_definitions_key_unique` ON `quest_definitions` (`key`);--> statement-breakpoint
CREATE INDEX `idx_quest_definitions_trigger_type` ON `quest_definitions` (`trigger_type`);