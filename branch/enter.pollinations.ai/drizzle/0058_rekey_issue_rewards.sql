-- Issue bounties used to be one reward per issue, so their keys omitted the
-- winner's identity. Re-key them before allowing every merged PR author to
-- earn the bounty. The NOT NULL and unique constraints abort if an identity is
-- missing or a key collides; exact-key matching makes this migration idempotent.
-- Read-only production audit on 2026-08-31: 37 legacy rows, 0 missing GitHub
-- identities, and 0 target-key collisions.
UPDATE `rewards`
   SET `idempotency_key` = `idempotency_key` || ':github:' ||
       (SELECT `github_id` FROM `user` WHERE `user`.`id` = `rewards`.`user_id`)
 WHERE `quest_id` LIKE 'github:issue:%'
   AND `idempotency_key` = 'quest:' || `quest_id`;
