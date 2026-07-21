CREATE TABLE `generation_settlement` (
	`request_id` text PRIMARY KEY NOT NULL,
	`payer_user_id` text NOT NULL,
	`api_key_id` text,
	`base_charge` real NOT NULL,
	`payer_charge` real NOT NULL,
	`payer_bucket` text NOT NULL,
	`payouts_json` text NOT NULL,
	`post_settlement_pack_balance` real,
	`created_at` integer NOT NULL
);
