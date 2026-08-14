-- The Gemini Flash Lite 3.5 update changed the canonical registry ID while
-- retaining the 3.1 ID as an alias. Model permissions are checked against the
-- resolved canonical ID, so stored 3.1 allowlists must be migrated first.
WITH candidate_keys AS MATERIALIZED (
    SELECT id, permissions
    FROM apikey
    WHERE json_valid(permissions)
      AND json_type(permissions, '$.models') = 'array'
      AND instr(permissions, '"gemini-flash-lite-3.1"') > 0
),
canonicalized AS (
    SELECT
        candidate_keys.id,
        CAST(model.key AS integer) AS position,
        CASE
            WHEN model.type = 'text'
             AND model.value = 'gemini-flash-lite-3.1'
                THEN 'gemini-flash-lite-3.5'
            ELSE model.value
        END AS model_id,
        model.type = 'text'
            AND model.value = 'gemini-flash-lite-3.1' AS changed
    FROM candidate_keys
    JOIN json_each(candidate_keys.permissions, '$.models') AS model
),
deduplicated AS (
    SELECT id, model_id, MIN(position) AS position
    FROM canonicalized
    GROUP BY id, model_id
),
migrated AS (
    SELECT id, json_group_array(model_id) AS models
    FROM (
        SELECT id, model_id
        FROM deduplicated
        ORDER BY id, position
    )
    GROUP BY id
)
UPDATE apikey
SET permissions = json_set(
    permissions,
    '$.models',
    json((SELECT models FROM migrated WHERE migrated.id = apikey.id))
)
WHERE id IN (SELECT id FROM canonicalized WHERE changed);
