-- zimage-fal is no longer a model identity. Fal is an internal provider route
-- for zimage, so stored allowlists must grant the public canonical model only.
-- Preserve unrelated permission data and model order while deduplicating a row
-- that already contains both names.

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
                    CASE
                        WHEN model.type = 'text' AND model.value = 'zimage-fal'
                            THEN 'zimage'
                        ELSE model.value
                    END AS model_id,
                    CAST(model.key AS integer) AS position
                FROM json_each(apikey.permissions, '$.models') AS model
            )
            GROUP BY model_id
        )
    )
)
WHERE CASE
    WHEN instr(permissions, '"zimage-fal"') = 0 THEN 0
    WHEN NOT json_valid(permissions) THEN 0
    WHEN json_type(permissions, '$.models') != 'array' THEN 0
    ELSE EXISTS (
        SELECT 1
        FROM json_each(permissions, '$.models') AS model
        WHERE model.type = 'text' AND model.value = 'zimage-fal'
    )
END;
