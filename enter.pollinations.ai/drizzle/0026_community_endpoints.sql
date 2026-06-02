CREATE TABLE `community_endpoint` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_user_id` text NOT NULL,
	`name` text NOT NULL,
	`base_url` text NOT NULL,
	`upstream_model` text NOT NULL,
	`bearer_token_ciphertext` text NOT NULL,
	`prompt_text_price` real NOT NULL,
	`completion_text_price` real NOT NULL,
	`context_length` integer,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	FOREIGN KEY (`owner_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_community_endpoint_owner_user_id` ON `community_endpoint` (`owner_user_id`);