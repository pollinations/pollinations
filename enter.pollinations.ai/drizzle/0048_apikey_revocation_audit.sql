CREATE TABLE `apikey_revocation_audit` (
	`id` text PRIMARY KEY NOT NULL,
	`apikey_id` text NOT NULL,
	`key_hash` text NOT NULL,
	`owner_user_id` text NOT NULL,
	`owner_email` text,
	`triggered_by` text NOT NULL,
	`source` text NOT NULL,
	`reference` text,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	FOREIGN KEY (`owner_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_apikey_revocation_audit_key_hash` ON `apikey_revocation_audit` (`key_hash`);--> statement-breakpoint
CREATE INDEX `idx_apikey_revocation_audit_owner_user_id` ON `apikey_revocation_audit` (`owner_user_id`);--> statement-breakpoint
CREATE INDEX `idx_apikey_revocation_audit_created_at` ON `apikey_revocation_audit` (`created_at`);