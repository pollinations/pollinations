-- One row per account, written at its first setup (onboarding) reward: the
-- request's network (IPv4 /24, IPv6 /48), the email domain, and whether 30 or
-- more other accounts had already been recorded on that network or private
-- domain in the previous 24 hours. A held_reason blocks claiming setup rewards
-- until an operator clears it. After 30 days the row of a live account keeps
-- only its decision (network and domain are cleared), and the row of a deleted
-- account is removed. No foreign key: deleting accounts must not lower the
-- 24-hour count.
CREATE TABLE `setup_reward_decision` (
    `user_id` text PRIMARY KEY NOT NULL,
    `network` text,
    `email_domain` text,
    `first_reward_at` integer NOT NULL,
    `candidate_reason` text,
    `held_reason` text
);
CREATE INDEX `idx_setup_reward_decision_network` ON `setup_reward_decision` (`network`, `first_reward_at`);
CREATE INDEX `idx_setup_reward_decision_domain` ON `setup_reward_decision` (`email_domain`, `first_reward_at`);
-- Only rows that still hold a network or domain, so cleanup skips cleared rows.
-- Time-range reads add `email_domain IS NOT NULL` to use it.
CREATE INDEX `idx_setup_reward_decision_time` ON `setup_reward_decision` (`first_reward_at`) WHERE `email_domain` IS NOT NULL;
