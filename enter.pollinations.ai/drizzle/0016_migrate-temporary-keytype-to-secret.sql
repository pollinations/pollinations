-- Custom SQL migration file, put your code below! --
-- Migrate keyType: "temporary" to "secret" in metadata JSON
-- The "temporary" type was redundant - we now only have "secret" and "publishable"
-- The createdVia field already tracks key provenance (e.g., "redirect-auth")

UPDATE apikey 
SET metadata = json_replace(metadata, '$.keyType', 'secret')
WHERE json_extract(metadata, '$.keyType') = 'temporary';