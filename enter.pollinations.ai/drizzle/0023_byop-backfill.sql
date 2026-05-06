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
