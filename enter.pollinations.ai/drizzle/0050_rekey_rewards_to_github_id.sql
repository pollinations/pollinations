-- Custom SQL migration file, put your code below! --

-- Re-key per-person rewards from the account id to the GitHub id, so the key
-- still matches after the account row is deleted. Runs before the schema
-- migration, while the unique index on idempotency_key is still in place: a
-- collision aborts here, with nothing dropped or rebuilt.
-- Keys of any other shape ("quest:{issue}" bounties) are one-per-issue already
-- and are left alone; so are rows with no quest_id, user_id, or GitHub id,
-- because the comparison below is NULL for them.
UPDATE `rewards`
   SET `idempotency_key` = 'quest:' || `quest_id` || ':github:' ||
       (SELECT `github_id` FROM `user` WHERE `user`.`id` = `rewards`.`user_id`)
 WHERE `idempotency_key` = 'quest:' || `quest_id` || ':user:' || `user_id`
   AND (SELECT `github_id` FROM `user` WHERE `user`.`id` = `rewards`.`user_id`) IS NOT NULL;
