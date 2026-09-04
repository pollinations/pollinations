ALTER TABLE `apikey` ADD `config_id` text DEFAULT 'default' NOT NULL;--> statement-breakpoint
CREATE INDEX `idx_apikey_config_id` ON `apikey` (`config_id`);