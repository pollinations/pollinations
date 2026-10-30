-- Accounts on private email domains, recorded at their first onboarding
-- (setup) reward and deleted after 30 days. Used to count sign-ups per domain;
-- no foreign key, so deleting accounts can't lower the count.
CREATE TABLE `setup_reward_signup` (
    `user_id` text PRIMARY KEY NOT NULL,
    `email_domain` text NOT NULL,
    `first_reward_at` integer NOT NULL
);
CREATE INDEX `idx_setup_reward_signup_domain` ON `setup_reward_signup` (`email_domain`, `first_reward_at`);
CREATE INDEX `idx_setup_reward_signup_time` ON `setup_reward_signup` (`first_reward_at`);

-- Private email domains that passed 30 accounts in 24 hours. While holds are
-- on, their accounts can't claim onboarding rewards until the account is
-- verified (a purchase or a linked GitHub account) or the domain is allowed.
CREATE TABLE `flagged_email_domain` (
    `domain` text PRIMARY KEY NOT NULL,
    `flagged_at` integer NOT NULL,
    `accounts` integer NOT NULL,
    `allowed_at` integer
);
