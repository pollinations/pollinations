-- GPT Realtime 2 now resolves to GPT Realtime 2.1. Replace the retired
-- canonical ID in restricted API-key allowlists so authorization continues to
-- match the resolved canonical model. Preserve unrelated permissions and model
-- order, and collapse only duplicates between the retired and replacement IDs.
-- Read-only audit on 2026-08-31: 1,011 production keys and 0 staging keys.
-- No stored OpenAI-prefixed aliases were found.
--
-- Prefilter with instr() inside CASE so JSON functions only inspect rows that
-- can contain the retired ID. json() preserves the array subtype across
-- json_set(), and aggregate ORDER BY preserves the original array order.

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
                      AND model.value IN ('gpt-realtime-2', 'openai/gpt-realtime-2', 'gpt-realtime-2.1')
                        THEN 'gpt-realtime-2.1'
                    ELSE model.value
                END AS model_id,
                CAST(model.key AS integer) AS position
            FROM json_each(apikey.permissions, '$.models') AS model
            WHERE NOT (
                model.type = 'text'
                AND model.value IN ('gpt-realtime-2', 'openai/gpt-realtime-2', 'gpt-realtime-2.1')
                AND EXISTS (
                    SELECT 1
                    FROM json_each(apikey.permissions, '$.models') AS earlier
                    WHERE CAST(earlier.key AS integer) < CAST(model.key AS integer)
                      AND earlier.type = 'text'
                      AND earlier.value IN ('gpt-realtime-2', 'openai/gpt-realtime-2', 'gpt-realtime-2.1')
                )
            )
        )
    ))
)
WHERE CASE
    WHEN instr(permissions, 'gpt-realtime-2') = 0 THEN 0
    WHEN NOT json_valid(permissions) THEN 0
    WHEN json_type(permissions, '$.models') != 'array' THEN 0
    ELSE EXISTS (
        SELECT 1
        FROM json_each(permissions, '$.models') AS model
        WHERE model.type = 'text'
          AND model.value IN ('gpt-realtime-2', 'openai/gpt-realtime-2')
    )
END;
