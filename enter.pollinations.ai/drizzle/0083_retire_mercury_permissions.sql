-- Remove retired Mercury grants while preserving the order of other grants.
-- An empty models array continues to deny every model.
WITH retired_model(id) AS (
    VALUES ('inception/mercury-2'), ('inception/mercury-2.5-preview'),
           ('inception/mercury-3'), ('mercury-2'), ('inception'),
           ('inception-mercury'), ('mercury')
)
UPDATE apikey
SET permissions = json_set(
    permissions,
    '$.models',
    (
        SELECT json_group_array(model.value ORDER BY CAST(model.key AS integer))
        FROM json_each(apikey.permissions, '$.models') AS model
        WHERE model.value NOT IN (SELECT id FROM retired_model)
    )
)
WHERE CASE
    WHEN COALESCE(instr(permissions, 'mercury'), 0) = 0
        AND COALESCE(instr(permissions, '"inception"'), 0) = 0 THEN 0
    WHEN NOT json_valid(permissions) THEN 0
    WHEN json_type(permissions, '$.models') IS NOT 'array' THEN 0
    WHEN EXISTS (
        SELECT 1 FROM json_each(permissions, '$.models') WHERE type != 'text'
    ) THEN 0
    ELSE EXISTS (
        SELECT 1 FROM json_each(permissions, '$.models')
        WHERE value IN (SELECT id FROM retired_model)
    )
END;
