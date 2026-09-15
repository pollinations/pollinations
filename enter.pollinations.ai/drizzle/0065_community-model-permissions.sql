-- Rename stored restrictions, not runtime permission checks. Include private,
-- hidden and agent endpoints; only exact IDs of existing models are changed.
-- The registration API rejects collisions with bundled model IDs/aliases.
-- Preserve other fields, first-occurrence order and empty/unrestricted keys.
WITH renames AS MATERIALIZED (
    SELECT
        u.github_username || '/' || ce.name AS old_id,
        'community/' || u.github_username || '/' || ce.name AS new_id
    FROM community_endpoint ce
    JOIN user u ON u.id = ce.owner_user_id
    WHERE u.github_username IS NOT NULL AND u.github_username != ''
)
UPDATE apikey
SET permissions = json_set(
    permissions,
    '$.models',
    (
        SELECT json_group_array(model_id ORDER BY position)
        FROM (
            SELECT
                COALESCE(renames.new_id, model.value) AS model_id,
                MIN(CAST(model.key AS integer)) AS position
            FROM json_each(apikey.permissions, '$.models') AS model
            LEFT JOIN renames ON model.value = renames.old_id
            GROUP BY COALESCE(renames.new_id, model.value)
        )
    )
)
WHERE CASE
    WHEN NOT json_valid(permissions) THEN 0
    WHEN json_type(permissions, '$.models') != 'array' THEN 0
    WHEN EXISTS (
        SELECT 1 FROM json_each(permissions, '$.models') WHERE type != 'text'
    ) THEN 0
    ELSE EXISTS (
        SELECT 1
        FROM json_each(permissions, '$.models') AS model
        JOIN renames ON model.value = renames.old_id
    )
END;
