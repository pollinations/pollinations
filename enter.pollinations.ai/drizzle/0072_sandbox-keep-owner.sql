-- A keep set from the dashboard has no key: gen's cron renews it as the
-- sandbox's owner. SQLite can't drop NOT NULL in place, so rebuild the table.
CREATE TABLE `sandbox_keep_new` (
    `sandbox_id` text PRIMARY KEY NOT NULL,
    `api_key_id` text REFERENCES `apikey`(`id`) ON DELETE cascade,
    `until` integer NOT NULL
);
INSERT INTO `sandbox_keep_new` SELECT `sandbox_id`, `api_key_id`, `until` FROM `sandbox_keep`;
DROP TABLE `sandbox_keep`;
ALTER TABLE `sandbox_keep_new` RENAME TO `sandbox_keep`;
