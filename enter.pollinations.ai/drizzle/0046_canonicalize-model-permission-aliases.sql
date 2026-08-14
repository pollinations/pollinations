-- Authorization compares stored model permissions with the resolved canonical
-- registry ID. Canonicalize every alias currently present in production model
-- allowlists while preserving unrelated permission data and array order.
-- Read-only audit on 2026-08-14: 21 current aliases plus two pending canonical
-- renames across 1,863 production allowlists; staging contained none. This
-- migration must deploy with the Muse Spark 1.2 and Grok 4.6 registry changes,
-- not before.
WITH alias_map(alias, canonical) AS (
    VALUES
        ('gemini-flash-lite-3.1', 'gemini-flash-lite-3.5'),
        ('universal-3-pro', 'universal-3.5-pro'),
        ('sana', 'dreamshaper'),
        ('grok-reasoning', 'grok-large'),
        ('kimi-k2.7-code', 'kimi-code'),
        ('nova-micro', 'nova-fast'),
        ('kimi-k2.6', 'kimi'),
        ('gemini-3.5-flash', 'gemini'),
        ('qwen3-tts', 'qwen-tts'),
        ('gpt-5.5', 'openai-large'),
        ('mistral-4', 'mistral'),
        ('stable-audio-2.5', 'stable-audio-3-medium'),
        ('grok-4.3', 'grok-large'),
        ('claude-opus-4.8', 'claude-large'),
        ('minimax-m3', 'minimax'),
        ('nanobanana2', 'nanobanana-2'),
        ('deepseek-v4-pro', 'deepseek-pro'),
        ('nemotron-3-ultra', 'nemotron'),
        ('trellis-2-high', 'trellis-2'),
        ('trellis-2-low', 'trellis-2'),
        ('trellis-2-medium', 'trellis-2'),
        ('muse-spark-1.1', 'muse-spark-1.2'),
        ('grok-4.5', 'grok-4.6')
),
candidate_keys AS MATERIALIZED (
    SELECT id, permissions
    FROM apikey
    WHERE json_valid(permissions)
      AND json_type(permissions, '$.models') = 'array'
      AND (
           instr(permissions, '"gemini-flash-lite-3.1"') > 0
        OR instr(permissions, '"universal-3-pro"') > 0
        OR instr(permissions, '"sana"') > 0
        OR instr(permissions, '"grok-reasoning"') > 0
        OR instr(permissions, '"kimi-k2.7-code"') > 0
        OR instr(permissions, '"nova-micro"') > 0
        OR instr(permissions, '"kimi-k2.6"') > 0
        OR instr(permissions, '"gemini-3.5-flash"') > 0
        OR instr(permissions, '"qwen3-tts"') > 0
        OR instr(permissions, '"gpt-5.5"') > 0
        OR instr(permissions, '"mistral-4"') > 0
        OR instr(permissions, '"stable-audio-2.5"') > 0
        OR instr(permissions, '"grok-4.3"') > 0
        OR instr(permissions, '"claude-opus-4.8"') > 0
        OR instr(permissions, '"minimax-m3"') > 0
        OR instr(permissions, '"nanobanana2"') > 0
        OR instr(permissions, '"deepseek-v4-pro"') > 0
        OR instr(permissions, '"nemotron-3-ultra"') > 0
        OR instr(permissions, '"trellis-2-high"') > 0
        OR instr(permissions, '"trellis-2-low"') > 0
        OR instr(permissions, '"trellis-2-medium"') > 0
        OR instr(permissions, '"muse-spark-1.1"') > 0
        OR instr(permissions, '"grok-4.5"') > 0
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
