-- Existing publishable app keys default to developer earnings enabled.
UPDATE `apikey`
SET `metadata` = json_set(
  COALESCE(`metadata`, '{}'),
  '$.earningsEnabled',
  json('true')
)
WHERE `prefix` = 'pk';
