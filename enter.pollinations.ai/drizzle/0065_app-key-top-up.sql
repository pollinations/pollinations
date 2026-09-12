CREATE TABLE `app_key_top_up` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`key_id` text NOT NULL,
	`client_key_id` text NOT NULL,
	`amount` integer NOT NULL,
	`return_to` text NOT NULL,
	`checkout_pack` integer,
	`checkout_session_id` text,
	`created_at` integer NOT NULL,
	`completed_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`key_id`) REFERENCES `apikey`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`client_key_id`) REFERENCES `apikey`(`id`) ON UPDATE no action ON DELETE cascade
);
