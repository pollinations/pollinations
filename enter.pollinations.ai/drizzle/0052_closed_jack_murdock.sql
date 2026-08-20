CREATE TABLE `generation_settlement` (
	`settlement_id` text PRIMARY KEY NOT NULL,
	`payer_user_id` text NOT NULL,
	`api_key_id` text,
	`base_price` real NOT NULL,
	`billed_price` real NOT NULL,
	`payer_bucket` text,
	`markup_json` text,
	`community_model_reward_json` text,
	`post_deduction_pack_balance` real,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL
);
