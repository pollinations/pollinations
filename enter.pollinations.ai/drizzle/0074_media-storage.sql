-- Media uploaded with a user's API key, paid ahead: gen's cron charges each
-- period, rewrites renewed files before R2's 30-day lifecycle deletes them,
-- and deletes files whose paid time is over.
CREATE TABLE `media_storage` (
    `id` text PRIMARY KEY NOT NULL,
    `api_key_id` text REFERENCES `apikey`(`id`) ON DELETE set null,
    `size` integer NOT NULL,
    `expires_after` text NOT NULL,
    `paid_until` integer NOT NULL,
    `renew_to` integer
);
CREATE INDEX `idx_media_storage_paid_until` ON `media_storage` (`paid_until`);
CREATE INDEX `idx_media_storage_renew_to` ON `media_storage` (`renew_to`);
CREATE INDEX `idx_media_storage_api_key_id` ON `media_storage` (`api_key_id`);
