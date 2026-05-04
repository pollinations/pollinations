-- Existing publishable app keys default to developer earnings enabled.
UPDATE `apikey`
SET `metadata` = json_set(
  CASE WHEN json_valid(`metadata`) THEN `metadata` ELSE '{}' END,
  '$.byopEnabled',
  json('true')
)
WHERE `prefix` = 'pk';
