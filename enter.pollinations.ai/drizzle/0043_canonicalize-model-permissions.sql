-- Model permissions are stored as JSON arrays inside apikey.permissions.
-- Canonicalize names consolidated by the cost-variants rollout while
-- preserving unrelated permission fields and unknown/community model IDs.
WITH alias_map(alias, canonical) AS (
    VALUES
        ('veo-1080p', 'veo'),
        ('wan-pro-1080p', 'wan-pro'),
        ('p-video-720p', 'p-video'),
        ('p-video-1080p', 'p-video')
),
-- Avoid expanding and grouping the permissions JSON for every API key. The
-- production table is large, while only keys containing retired aliases need
-- the canonicalization below.
candidate_keys AS MATERIALIZED (
    SELECT id, permissions
    FROM apikey
    WHERE instr(permissions, '"veo-1080p"') > 0
       OR instr(permissions, '"wan-pro-1080p"') > 0
       OR instr(permissions, '"p-video-720p"') > 0
       OR instr(permissions, '"p-video-1080p"') > 0
),
canonicalized AS (
    SELECT
        candidate_keys.id,
        CAST(model.key AS integer) AS position,
        COALESCE(alias_map.canonical, model.value) AS model_id,
        alias_map.canonical IS NOT NULL AS changed
    FROM candidate_keys
    JOIN json_each(candidate_keys.permissions, '$.models') AS model
    LEFT JOIN alias_map
        ON model.type = 'text' AND model.value = alias_map.alias
    WHERE json_valid(candidate_keys.permissions)
      AND json_type(candidate_keys.permissions, '$.models') = 'array'
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
