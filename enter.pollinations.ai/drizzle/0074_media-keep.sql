-- Media kept until deleted: gen's cron rewrites each file before R2's 30-day
-- lifecycle deletes it, paid by the key that uploaded it.
CREATE TABLE `media_keep` (
    `id` text PRIMARY KEY NOT NULL,
    `api_key_id` text NOT NULL REFERENCES `apikey`(`id`) ON DELETE cascade,
    `size` integer NOT NULL,
    `paid_until` integer NOT NULL
);
CREATE INDEX `idx_media_keep_paid_until` ON `media_keep` (`paid_until`);
CREATE INDEX `idx_media_keep_api_key_id` ON `media_keep` (`api_key_id`);
