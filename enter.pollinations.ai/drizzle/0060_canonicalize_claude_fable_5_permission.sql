-- Claude Fable 5 now resolves to Claude Fable 5.1. Replace each retired ID
-- independently in restricted API-key allowlists so every statement stays
-- within D1's CPU limit. Preserve unrelated permissions and model order, and
-- collapse only duplicates between each retired ID and the canonical ID.

UPDATE apikey
SET permissions = json_set(
    permissions,
    '$.models',
    json((
        SELECT json_group_array(model_id ORDER BY position)
        FROM (
            SELECT
                CASE
                    WHEN model.type = 'text'
                      AND model.value IN (
                          'claude-fable-5',
                          'anthropic/claude-fable-5.1'
                      )
                        THEN 'anthropic/claude-fable-5.1'
                    ELSE model.value
                END AS model_id,
                CAST(model.key AS integer) AS position
            FROM json_each(apikey.permissions, '$.models') AS model
            WHERE NOT (
                model.type = 'text'
                AND model.value IN (
                    'claude-fable-5',
                    'anthropic/claude-fable-5.1'
                )
                AND EXISTS (
                    SELECT 1
                    FROM json_each(apikey.permissions, '$.models') AS earlier
                    WHERE CAST(earlier.key AS integer) < CAST(model.key AS integer)
                      AND earlier.type = 'text'
                      AND earlier.value IN (
                          'claude-fable-5',
                          'anthropic/claude-fable-5.1'
                      )
                )
            )
        )
    ))
)
WHERE CASE
    WHEN instr(permissions, '"claude-fable-5"') = 0 THEN 0
    WHEN NOT json_valid(permissions) THEN 0
    WHEN json_type(permissions, '$.models') != 'array' THEN 0
    ELSE EXISTS (
        SELECT 1
        FROM json_each(permissions, '$.models') AS model
        WHERE model.type = 'text' AND model.value = 'claude-fable-5'
    )
END;

UPDATE apikey
SET permissions = json_set(
    permissions,
    '$.models',
    json((
        SELECT json_group_array(model_id ORDER BY position)
        FROM (
            SELECT
                CASE
                    WHEN model.type = 'text'
                      AND model.value IN (
                          'anthropic/claude-fable-5',
                          'anthropic/claude-fable-5.1'
                      )
                        THEN 'anthropic/claude-fable-5.1'
                    ELSE model.value
                END AS model_id,
                CAST(model.key AS integer) AS position
            FROM json_each(apikey.permissions, '$.models') AS model
            WHERE NOT (
                model.type = 'text'
                AND model.value IN (
                    'anthropic/claude-fable-5',
                    'anthropic/claude-fable-5.1'
                )
                AND EXISTS (
                    SELECT 1
                    FROM json_each(apikey.permissions, '$.models') AS earlier
                    WHERE CAST(earlier.key AS integer) < CAST(model.key AS integer)
                      AND earlier.type = 'text'
                      AND earlier.value IN (
                          'anthropic/claude-fable-5',
                          'anthropic/claude-fable-5.1'
                      )
                )
            )
        )
    ))
)
WHERE CASE
    WHEN instr(permissions, '"anthropic/claude-fable-5"') = 0 THEN 0
    WHEN NOT json_valid(permissions) THEN 0
    WHEN json_type(permissions, '$.models') != 'array' THEN 0
    ELSE EXISTS (
        SELECT 1
        FROM json_each(permissions, '$.models') AS model
        WHERE model.type = 'text'
          AND model.value = 'anthropic/claude-fable-5'
    )
END;

UPDATE apikey
SET permissions = json_set(
    permissions,
    '$.models',
    json((
        SELECT json_group_array(model_id ORDER BY position)
        FROM (
            SELECT
                CASE
                    WHEN model.type = 'text'
                      AND model.value IN (
                          'claude-fable-5.1',
                          'anthropic/claude-fable-5.1'
                      )
                        THEN 'anthropic/claude-fable-5.1'
                    ELSE model.value
                END AS model_id,
                CAST(model.key AS integer) AS position
            FROM json_each(apikey.permissions, '$.models') AS model
            WHERE NOT (
                model.type = 'text'
                AND model.value IN (
                    'claude-fable-5.1',
                    'anthropic/claude-fable-5.1'
                )
                AND EXISTS (
                    SELECT 1
                    FROM json_each(apikey.permissions, '$.models') AS earlier
                    WHERE CAST(earlier.key AS integer) < CAST(model.key AS integer)
                      AND earlier.type = 'text'
                      AND earlier.value IN (
                          'claude-fable-5.1',
                          'anthropic/claude-fable-5.1'
                      )
                )
            )
        )
    ))
)
WHERE CASE
    WHEN instr(permissions, '"claude-fable-5.1"') = 0 THEN 0
    WHEN NOT json_valid(permissions) THEN 0
    WHEN json_type(permissions, '$.models') != 'array' THEN 0
    ELSE EXISTS (
        SELECT 1
        FROM json_each(permissions, '$.models') AS model
        WHERE model.type = 'text' AND model.value = 'claude-fable-5.1'
    )
END;
