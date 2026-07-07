-- Backfill provider-neutral handle + per-account username from the legacy
-- user.github_username column. GitHub usernames are unique, so handles are unique.
-- Idempotent: only fills rows that are still NULL.

--> statement-breakpoint
UPDATE `account`
SET `username` = (
  SELECT `user`.`github_username`
  FROM `user`
  WHERE `user`.`id` = `account`.`user_id`
)
WHERE `account`.`provider_id` = 'github'
  AND `account`.`username` IS NULL;

--> statement-breakpoint
UPDATE `user`
SET `handle` = `github_username`
WHERE `handle` IS NULL
  AND `github_username` IS NOT NULL;
