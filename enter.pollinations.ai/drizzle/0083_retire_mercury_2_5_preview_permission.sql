-- Drop the retired model grant while preserving other grants and their order.
-- An empty models array still denies all models.
UPDATE apikey
SET permissions = json_set(
    permissions,
    '$.models',
    (
        SELECT json_group_array(model.value ORDER BY CAST(model.key AS integer))
        FROM json_each(apikey.permissions, '$.models') AS model
        WHERE model.value != 'inception/mercury-2.5-preview'
    )
)
WHERE CASE
    WHEN COALESCE(instr(permissions, '"inception/mercury-2.5-preview"'), 0) = 0 THEN 0
    WHEN NOT json_valid(permissions) THEN 0
    WHEN json_type(permissions, '$.models') IS NOT 'array' THEN 0
    WHEN EXISTS (
        SELECT 1 FROM json_each(permissions, '$.models') WHERE type != 'text'
    ) THEN 0
    ELSE EXISTS (
        SELECT 1 FROM json_each(permissions, '$.models')
        WHERE value = 'inception/mercury-2.5-preview'
    )
END;
