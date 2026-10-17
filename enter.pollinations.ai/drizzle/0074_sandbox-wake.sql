-- Sandboxes E2B resumes on traffic without asking gen: gen's cron charges each
-- woken run past `paid_until` (ms) to the key that created the sandbox, or to
-- its owner. No foreign key, so deleting the key gets the sandbox killed
-- instead of waking for free.
CREATE TABLE `sandbox_wake` (
    `sandbox_id` text PRIMARY KEY NOT NULL,
    `api_key_id` text,
    `paid_until` integer NOT NULL
);
