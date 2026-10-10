-- Sandboxes kept running past E2B's 24-hour run: gen's cron renews each one
-- until `until` with the key that set its timeout.
CREATE TABLE `sandbox_keep` (
    `sandbox_id` text PRIMARY KEY NOT NULL,
    `api_key_id` text NOT NULL REFERENCES `apikey`(`id`) ON DELETE cascade,
    `until` integer NOT NULL
);
