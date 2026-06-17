CREATE TABLE `quest_definitions` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`description` text NOT NULL,
	`category` text NOT NULL,
	`status` text NOT NULL,
	`trigger` text NOT NULL,
	`reward_amount` real NOT NULL,
	`balance_bucket` text DEFAULT 'pack' NOT NULL,
	`repeatability` text DEFAULT 'once' NOT NULL,
	`criteria_json` text,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_quest_definitions_status` ON `quest_definitions` (`status`);--> statement-breakpoint
CREATE INDEX `idx_quest_definitions_trigger` ON `quest_definitions` (`trigger`);