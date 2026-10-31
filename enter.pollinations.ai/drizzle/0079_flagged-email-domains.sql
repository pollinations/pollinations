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
-- verified (a purchase or a GitHub account at least 30 days old) or the
-- domain is allowed.
CREATE TABLE `flagged_email_domain` (
    `domain` text PRIMARY KEY NOT NULL,
    `flagged_at` integer NOT NULL,
    `accounts` integer NOT NULL,
    `allowed_at` integer
);

-- GitHub accounts bound to the setup reward they verified, one per quest.
-- Kept when accounts are deleted, so a GitHub account unlocks each setup
-- reward once while every reward keeps its original idempotency key.
CREATE TABLE `setup_reward_github_claim` (
    `github_id` integer NOT NULL,
    `quest_id` text NOT NULL,
    `reward_id` text NOT NULL,
    PRIMARY KEY (`github_id`, `quest_id`)
);

-- When the linked GitHub account was created.
ALTER TABLE `user` ADD `github_created_at` integer;
