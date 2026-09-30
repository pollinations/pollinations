-- Run immediately after the owner transfer is verified. Old-scoped keys cannot
-- call the renamed agents until this rewrite completes.

-- Safe to retry: each statement changes only exact old canonical IDs and deduplicates old/new pairs.

UPDATE apikey
SET permissions = json_set(
    permissions,
    '$.models',
    (
        SELECT json_group_array(model_id ORDER BY position)
        FROM (
            SELECT model_id, MIN(position) AS position
            FROM (
                SELECT
                    CASE model.value WHEN 'community/pollinations-router/floret' THEN 'community/pollinations-ai/floret' ELSE model.value END AS model_id,
                    CAST(model.key AS integer) AS position
                FROM json_each(apikey.permissions, '$.models') AS model
            )
            GROUP BY model_id
        )
    )
)
WHERE CASE
    WHEN instr(coalesce(permissions, ''), 'community/pollinations-router/floret') = 0 THEN 0
    WHEN NOT json_valid(permissions) THEN 0
    WHEN json_type(permissions, '$.models') != 'array' THEN 0
    WHEN EXISTS (SELECT 1 FROM json_each(permissions, '$.models') WHERE type != 'text') THEN 0
    ELSE EXISTS (
        SELECT 1 FROM json_each(permissions, '$.models')
        WHERE value = 'community/pollinations-router/floret'
    )
END;

UPDATE apikey
SET permissions = json_set(
    permissions,
    '$.models',
    (
        SELECT json_group_array(model_id ORDER BY position)
        FROM (
            SELECT model_id, MIN(position) AS position
            FROM (
                SELECT
                    CASE model.value WHEN 'community/pollinations-router/midijourney' THEN 'community/pollinations-ai/midijourney' ELSE model.value END AS model_id,
                    CAST(model.key AS integer) AS position
                FROM json_each(apikey.permissions, '$.models') AS model
            )
            GROUP BY model_id
        )
    )
)
WHERE CASE
    WHEN instr(coalesce(permissions, ''), 'community/pollinations-router/midijourney') = 0 THEN 0
    WHEN NOT json_valid(permissions) THEN 0
    WHEN json_type(permissions, '$.models') != 'array' THEN 0
    WHEN EXISTS (SELECT 1 FROM json_each(permissions, '$.models') WHERE type != 'text') THEN 0
    ELSE EXISTS (
        SELECT 1 FROM json_each(permissions, '$.models')
        WHERE value = 'community/pollinations-router/midijourney'
    )
END;

UPDATE apikey
SET permissions = json_set(
    permissions,
    '$.models',
    (
        SELECT json_group_array(model_id ORDER BY position)
        FROM (
            SELECT model_id, MIN(position) AS position
            FROM (
                SELECT
                    CASE model.value WHEN 'community/pollinations-router/polli' THEN 'community/pollinations-ai/polli' ELSE model.value END AS model_id,
                    CAST(model.key AS integer) AS position
                FROM json_each(apikey.permissions, '$.models') AS model
            )
            GROUP BY model_id
        )
    )
)
WHERE CASE
    WHEN instr(coalesce(permissions, ''), 'community/pollinations-router/polli') = 0 THEN 0
    WHEN NOT json_valid(permissions) THEN 0
    WHEN json_type(permissions, '$.models') != 'array' THEN 0
    WHEN EXISTS (SELECT 1 FROM json_each(permissions, '$.models') WHERE type != 'text') THEN 0
    ELSE EXISTS (
        SELECT 1 FROM json_each(permissions, '$.models')
        WHERE value = 'community/pollinations-router/polli'
    )
END;
