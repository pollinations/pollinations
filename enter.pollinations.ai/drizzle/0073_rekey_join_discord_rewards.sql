-- Join Discord used one reward per GitHub identity, so a Discord account
-- relinked to other Pollinations accounts earned it again on each. Re-key it
-- per Discord account, like the level quests. Rows whose owner has since
-- unlinked Discord keep their GitHub key: the Discord id left with the account
-- row. The unique constraint aborts on a key collision; matching only GitHub
-- keys makes this migration idempotent.
-- Read-only production audit on 2026-10-13: 906 rows, all GitHub-keyed; 822
-- owners still linked, each to a different Discord account; no Discord account
-- linked to more than one user.
UPDATE `rewards`
   SET `idempotency_key` = 'quest:join_discord:discord:' ||
       (SELECT `account_id` FROM `account`
         WHERE `account`.`user_id` = `rewards`.`user_id`
           AND `account`.`provider_id` = 'discord')
 WHERE `quest_id` = 'join_discord'
   AND `idempotency_key` LIKE 'quest:join_discord:github:%'
   AND EXISTS (SELECT 1 FROM `account`
                WHERE `account`.`user_id` = `rewards`.`user_id`
                  AND `account`.`provider_id` = 'discord');
