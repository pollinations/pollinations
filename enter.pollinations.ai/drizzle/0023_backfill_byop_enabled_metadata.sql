-- Preserve current BYOP earning behavior for existing app keys. Future app
-- keys write metadata.byopEnabled explicitly through dashboard/API creation.
UPDATE `apikey`
SET `metadata` = json_set(
  CASE WHEN json_valid(`metadata`) THEN `metadata` ELSE '{}' END,
  '$.byopEnabled',
  json('true')
)
WHERE `prefix` = 'pk'
  AND (
    (
      json_valid(`metadata`)
      AND json_extract(`metadata`, '$.appUrl') IS NOT NULL
    )
    OR EXISTS (
      SELECT 1
      FROM `apikey` AS `secret_key`
      WHERE `secret_key`.`byop_client_key_id` = `apikey`.`id`
    )
  );
