-- Gen's Azure sandboxes: what E2B would keep for each sandbox and Azure
-- doesn't. Azure keeps the box itself.
CREATE TABLE `azure_sandbox` (
    `sandbox_id` text PRIMARY KEY NOT NULL,
    `user_id` text NOT NULL,
    `template_id` text NOT NULL,
    `metadata` text NOT NULL,
    `envd_access_token` text NOT NULL,
    `started_at` integer NOT NULL,
    `end_at` integer NOT NULL
);
CREATE INDEX `azure_sandbox_user_id_idx` ON `azure_sandbox` (`user_id`);
