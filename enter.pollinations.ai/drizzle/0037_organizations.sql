CREATE TABLE `organization` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`owner_user_id` text NOT NULL,
	`pack_balance` real DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	FOREIGN KEY (`owner_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_organization_owner_user_id` ON `organization` (`owner_user_id`);--> statement-breakpoint
CREATE TABLE `organization_member` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`user_id` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`can_manage_api_keys` integer DEFAULT false NOT NULL,
	`can_fund_organization` integer DEFAULT false NOT NULL,
	`invited_by_user_id` text NOT NULL,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`responded_at` integer,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`invited_by_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_organization_member_organization_id` ON `organization_member` (`organization_id`);--> statement-breakpoint
CREATE INDEX `idx_organization_member_user_id` ON `organization_member` (`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_organization_member_org_user` ON `organization_member` (`organization_id`,`user_id`);--> statement-breakpoint
ALTER TABLE `apikey` ADD `organization_id` text REFERENCES organization(id) ON DELETE cascade;--> statement-breakpoint
CREATE INDEX `idx_apikey_organization_id` ON `apikey` (`organization_id`);--> statement-breakpoint
ALTER TABLE `stripe_checkout_credits` ADD `organization_id` text REFERENCES organization(id) ON DELETE set null;--> statement-breakpoint
CREATE INDEX `idx_stripe_checkout_credits_organization_id` ON `stripe_checkout_credits` (`organization_id`);