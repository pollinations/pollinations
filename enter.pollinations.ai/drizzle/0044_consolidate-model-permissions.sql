-- Canonicalize model permissions for model entries consolidated in the
-- registry while preserving unknown/community IDs and array order.
WITH alias_map(alias, canonical) AS (
    VALUES
        ('trellis-2-low', 'trellis-2'),
        ('trellis-2-medium', 'trellis-2'),
        ('trellis-2-high', 'trellis-2'),
        ('sonar', 'perplexity-fast'),
        ('perplexity-high', 'perplexity-fast'),
        ('perplexity-deep', 'perplexity-fast'),
        ('sonar-deep', 'perplexity-fast'),
        ('grok-fast', 'grok'),
        ('grok-4-1-fast', 'grok'),
        ('grok-4-1-fast-non-reasoning', 'grok'),
        ('grok-legacy', 'grok'),
        ('grok-4', 'grok'),
        ('grok-4-fast', 'grok'),
        ('grok-4-20-non-reasoning', 'grok'),
        ('grok-non-reasoning', 'grok'),
        ('grok-4-20-reasoning', 'grok'),
        ('grok-4-20', 'grok'),
        ('grok-4-1-fast-reasoning', 'grok'),
        ('gemini-search-fast', 'gemini-flash-lite-3.5'),
        ('gemini-3.1-flash-lite-search', 'gemini-flash-lite-3.5'),
        ('gemini-3.5-flash-lite-search', 'gemini-flash-lite-3.5'),
        ('gemini-search-large', 'gemini'),
        ('gemini-3.6-flash-search', 'gemini'),
        ('gemini-3.5-flash-search', 'gemini')
),
-- Avoid expanding and grouping the permissions JSON for every API key. Only
-- valid model allowlists containing a retired ID need consolidation.
candidate_keys AS MATERIALIZED (
    SELECT id, permissions
    FROM apikey
    WHERE json_valid(permissions)
      AND json_type(permissions, '$.models') = 'array'
      AND (
           instr(permissions, '"trellis-2-low"') > 0
        OR instr(permissions, '"trellis-2-medium"') > 0
        OR instr(permissions, '"trellis-2-high"') > 0
        OR instr(permissions, '"sonar"') > 0
        OR instr(permissions, '"perplexity-high"') > 0
        OR instr(permissions, '"perplexity-deep"') > 0
        OR instr(permissions, '"sonar-deep"') > 0
        OR instr(permissions, '"grok-fast"') > 0
        OR instr(permissions, '"grok-4-1-fast"') > 0
        OR instr(permissions, '"grok-4-1-fast-non-reasoning"') > 0
        OR instr(permissions, '"grok-legacy"') > 0
        OR instr(permissions, '"grok-4"') > 0
        OR instr(permissions, '"grok-4-fast"') > 0
        OR instr(permissions, '"grok-4-20-non-reasoning"') > 0
        OR instr(permissions, '"grok-non-reasoning"') > 0
        OR instr(permissions, '"grok-4-20-reasoning"') > 0
        OR instr(permissions, '"grok-4-20"') > 0
        OR instr(permissions, '"grok-4-1-fast-reasoning"') > 0
        OR instr(permissions, '"gemini-search-fast"') > 0
        OR instr(permissions, '"gemini-3.1-flash-lite-search"') > 0
        OR instr(permissions, '"gemini-3.5-flash-lite-search"') > 0
        OR instr(permissions, '"gemini-search-large"') > 0
        OR instr(permissions, '"gemini-3.6-flash-search"') > 0
        OR instr(permissions, '"gemini-3.5-flash-search"') > 0
      )
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
