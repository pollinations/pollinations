CREATE TABLE `community_endpoint_cooldown` (
	`model_id` text PRIMARY KEY NOT NULL,
	`owner_user_id` text NOT NULL,
	`price_snapshot` text NOT NULL,
	`paid_only_snapshot` integer DEFAULT false NOT NULL,
	`visibility_snapshot` text DEFAULT 'public' NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`owner_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
