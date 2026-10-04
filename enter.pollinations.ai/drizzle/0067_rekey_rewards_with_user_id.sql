-- Re-key per-person rewards so the account id leads the key:
--   quest:{id}:github:{githubId}
--     -> quest:{id}:user:{userId}:github:{githubId}
--
-- rewardKeyFor now returns the account-scoped key with the GitHub id appended,
-- which keeps an account's key stable when it later links GitHub. Rows written
-- before this migration used the GitHub id alone, so they are rewritten here to
-- the same shape rewardKeyFor produces; otherwise the next quest check would
-- not find them and would pay the same reward again.
--
-- Accounts with no GitHub id were never awarded these (rewardKey threw), so
-- only rows already carrying a GitHub id are touched. Rows with no quest_id or
-- user_id are skipped because the comparisons below are NULL for them.
--
-- scope:"once" keys ("quest:github:issue:{n}", and campaign grants) carry no
-- ':github:' segment, so the LIKE below cannot match them; their shared key is
-- left alone.
--
-- The unique index on idempotency_key is still in place, so a collision aborts
-- the migration rather than silently dropping a row.
UPDATE `rewards`
   SET `idempotency_key` =
           'quest:' || `quest_id` || ':user:' || `user_id` || ':github:' ||
           substr(
               `idempotency_key`,
               length('quest:' || `quest_id` || ':github:') + 1
           )
 WHERE `quest_id` IS NOT NULL
   AND `user_id` IS NOT NULL
   AND `idempotency_key` LIKE 'quest:%:github:%'
   AND `idempotency_key` NOT LIKE '%:user:%';
