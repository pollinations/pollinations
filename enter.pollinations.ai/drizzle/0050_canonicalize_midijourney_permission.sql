-- MIDIjourney Large is now an alias of the canonical MIDIjourney agent.
-- Authorization compares stored model permissions with the resolved canonical
-- registry ID, so existing restricted keys must store the canonical ID.
-- Read-only audit on 2026-08-17: 1,259 production keys and 0 staging keys.
--
-- Prefilter with instr() inside CASE so JSON functions only inspect rows that
-- can contain the alias. Grouping removes a duplicate when both IDs exist.

UPDATE apikey
SET permissions = json_set(
    permissions,
    '$.models',
    (
        SELECT json_group_array(model_id)
        FROM (
            SELECT model_id
            FROM (
                SELECT
                    CASE
                        WHEN model.type = 'text' AND model.value = 'midijourney-large'
                            THEN 'midijourney'
                        ELSE model.value
                    END AS model_id,
                    CAST(model.key AS integer) AS position
                FROM json_each(apikey.permissions, '$.models') AS model
            )
            GROUP BY model_id
            ORDER BY MIN(position)
        )
    )
)
WHERE CASE
    WHEN instr(permissions, '"midijourney-large"') = 0 THEN 0
    WHEN NOT json_valid(permissions) THEN 0
    WHEN json_type(permissions, '$.models') != 'array' THEN 0
    ELSE EXISTS (
        SELECT 1
        FROM json_each(permissions, '$.models') AS model
        WHERE model.type = 'text' AND model.value = 'midijourney-large'
    )
END;
