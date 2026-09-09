-- Migrate publishable key metadata from legacy appUrl to redirectUris[].
-- Metadata is stored as TEXT JSON in D1. Some historical rows may be
-- double-serialized, so normalize those before applying JSON mutations.

WITH normalized AS (
  SELECT
    id,
    CASE
      WHEN json_valid(metadata)
        AND json_type(metadata) = 'text'
        AND json_valid(json_extract(metadata, '$'))
      THEN json_extract(metadata, '$')
      ELSE metadata
    END AS meta
  FROM apikey
  WHERE metadata IS NOT NULL
),
migrated AS (
  SELECT
    id,
    json_remove(
      CASE
        WHEN json_type(meta, '$.redirectUris') = 'array'
          AND json_array_length(meta, '$.redirectUris') > 0
        THEN meta
        WHEN json_type(meta, '$.appUrl') = 'text'
          AND json_extract(meta, '$.appUrl') <> ''
        THEN json_set(
          meta,
          '$.redirectUris',
          json_array(json_extract(meta, '$.appUrl'))
        )
        ELSE meta
      END,
      '$.appUrl'
    ) AS meta
  FROM normalized
  WHERE json_valid(meta)
    AND (
      json_type(meta, '$.appUrl') IS NOT NULL
      OR json_type(meta, '$.redirectUris') IS NOT NULL
    )
)
UPDATE apikey
SET metadata = (
  SELECT meta FROM migrated WHERE migrated.id = apikey.id
)
WHERE id IN (SELECT id FROM migrated);
