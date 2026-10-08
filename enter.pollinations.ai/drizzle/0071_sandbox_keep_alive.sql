-- Sandboxes opted into cron-maintained leases ("keep-alive"). One row per
-- sandbox: while it exists, the ticker extends or resumes the lease.
-- generation is a fresh UUID per enable and fences every ticker write against
-- stale work from a previous enable epoch. charged_until (unixepoch seconds)
-- is the watermark of lease time already paid by keep-alive.
-- claimed_at/claim_token are the ticker's expiring, token-fenced claim.
CREATE TABLE `sandbox_keep_alive` (
    `sandbox_id` text PRIMARY KEY NOT NULL,
    `user_id` text NOT NULL REFERENCES `user`(`id`) ON DELETE cascade,
    `generation` text NOT NULL,
    `charged_until` integer NOT NULL,
    `claimed_at` integer,
    `claim_token` text,
    `enabled_at` integer NOT NULL
);

-- Tick sweep state (the cursor). D1, not KV: the cursor advances per row and
-- KV throttles same-key writes to one per second.
CREATE TABLE `sandbox_keep_alive_meta` (
    `key` text PRIMARY KEY NOT NULL,
    `value` text NOT NULL
);
