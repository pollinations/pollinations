-- Opt-in idle pause for kept sandboxes (gen's routes/e2b.ts): the cron pauses
-- a sandbox after `idle_timeout` seconds without activity.
ALTER TABLE `sandbox_keep` ADD `idle_timeout` integer;
ALTER TABLE `sandbox_keep` ADD `active_at` integer;

-- Sandbox ports gen serves at <port>-<sandbox id>.pollinations.app: a request
-- with the share's secret in `header` wakes the sandbox, and the key that
-- shared the port, or without one the owner, pays the lease.
CREATE TABLE `sandbox_port` (
    `sandbox_id` text NOT NULL,
    `port` integer NOT NULL,
    `api_key_id` text REFERENCES `apikey`(`id`) ON DELETE cascade,
    `header` text NOT NULL,
    `secret_hash` text NOT NULL,
    PRIMARY KEY (`sandbox_id`, `port`)
);
