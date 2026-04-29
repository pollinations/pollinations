-- Custom SQL migration file, put your code below! --
-- Backfill BYOP attribution for secret keys created before byop_client_key_id
-- became a first-class column.

UPDATE `apikey`
SET `byop_client_key_id` = json_extract(`metadata`, '$.clientId')
WHERE `byop_client_key_id` IS NULL
  AND `prefix` = 'sk'
  AND json_valid(`metadata`)
  AND json_extract(`metadata`, '$.clientId') IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM `apikey` AS `client_key`
    WHERE `client_key`.`id` = json_extract(`apikey`.`metadata`, '$.clientId')
      AND `client_key`.`prefix` = 'pk'
      AND COALESCE(`client_key`.`enabled`, 1) = 1
      AND (
        `client_key`.`expires_at` IS NULL
        OR `client_key`.`expires_at` > CAST(strftime('%s', 'now') AS integer)
      )
  );

--> statement-breakpoint

-- Existing publishable keys only opt into developer earnings when their owner
-- is eligible to receive rewards.
UPDATE `apikey`
SET `metadata` = json_set(
  CASE WHEN json_valid(`metadata`) THEN `metadata` ELSE '{}' END,
  '$.byopEnabled',
  json('true')
)
WHERE `prefix` = 'pk'
  AND EXISTS (
    SELECT 1
    FROM `user`
    WHERE `user`.`id` = `apikey`.`user_id`
      AND `user`.`tier` IN ('seed', 'flower', 'nectar', 'router')
  )
  AND (
    (
      json_valid(`metadata`)
      AND json_array_length(json_extract(`metadata`, '$.redirectUris')) > 0
    )
    OR EXISTS (
      SELECT 1
      FROM `apikey` AS `secret_key`
      WHERE `secret_key`.`byop_client_key_id` = `apikey`.`id`
    )
  );
