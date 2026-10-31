-- Sites get their own account permission, split from `machines`. Keys that
-- have `machines` could publish sites, so they also get `sites` and keep
-- working. The LIKE skips the JSON work on the many keys without `machines`.
-- Rerunning this file changes nothing.
UPDATE apikey
SET permissions = json_insert(permissions, '$.account[#]', 'sites')
WHERE permissions LIKE '%"machines"%'
  AND json_valid(permissions)
  AND json_type(permissions, '$.account') = 'array'
  AND EXISTS (
    SELECT 1 FROM json_each(permissions, '$.account') WHERE value = 'machines'
  )
  AND NOT EXISTS (
    SELECT 1 FROM json_each(permissions, '$.account') WHERE value = 'sites'
  );
