-- MIDIjourney Large will become an alias of the canonical MIDIjourney agent.
-- Keep both IDs during the cross-worker rollout so restricted keys work before
-- the Gen change, after it, and if Gen is rolled back. A later cleanup migration
-- can remove the legacy ID after the new resolver is established in production.
-- Read-only audit on 2026-08-17: 1,259 production keys and 0 staging keys.
--
-- Prefilter with instr() inside CASE so JSON functions only inspect rows that
-- can contain the alias. json() preserves the array subtype across json_set(),
-- and aggregate ORDER BY preserves the original array order. Existing duplicate
-- IDs, including unrelated models, are intentionally left unchanged.

UPDATE apikey
SET permissions = json_set(
    permissions,
    '$.models',
    json((
        SELECT json_group_array(model_id ORDER BY position, inserted)
        FROM (
            SELECT
                model.value AS model_id,
                CAST(model.key AS integer) AS position,
                0 AS inserted
            FROM json_each(apikey.permissions, '$.models') AS model

            UNION ALL

            SELECT
                'midijourney' AS model_id,
                (
                    SELECT MIN(CAST(alias.key AS integer))
                    FROM json_each(apikey.permissions, '$.models') AS alias
                    WHERE alias.type = 'text'
                      AND alias.value = 'midijourney-large'
                ) AS position,
                1 AS inserted
            WHERE NOT EXISTS (
                SELECT 1
                FROM json_each(apikey.permissions, '$.models') AS canonical
                WHERE canonical.type = 'text'
                  AND canonical.value = 'midijourney'
            )
        )
    ))
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
