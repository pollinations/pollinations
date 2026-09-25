-- Authorization compares stored model permissions with the resolved canonical
-- registry ID. Canonicalize every alias currently present in production model
-- allowlists while preserving unrelated permission data and array order.
-- Read-only audit on 2026-08-14: 21 current aliases plus two pending canonical
-- renames across 1,863 production allowlists. Staging contained none. This
-- migration must deploy with the Muse Spark 1.2 and Grok 4.6 registry changes,
-- not before.
--
-- One statement per alias: a single-statement version exceeded D1's per-query
-- CPU limit (code 7429) on the ~153k-row production apikey table because
-- json_valid() ran on every row. Each statement below prefilters with a cheap
-- instr() inside CASE (guaranteed evaluation order), so JSON functions only
-- touch rows whose permissions text contains the alias.

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
                        WHEN model.type = 'text' AND model.value = 'gemini-flash-lite-3.1'
                            THEN 'gemini-flash-lite-3.5'
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
    WHEN instr(permissions, '"gemini-flash-lite-3.1"') = 0 THEN 0
    WHEN NOT json_valid(permissions) THEN 0
    WHEN json_type(permissions, '$.models') != 'array' THEN 0
    ELSE EXISTS (
        SELECT 1
        FROM json_each(permissions, '$.models') AS model
        WHERE model.type = 'text' AND model.value = 'gemini-flash-lite-3.1'
    )
END;
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
                        WHEN model.type = 'text' AND model.value = 'universal-3-pro'
                            THEN 'universal-3.5-pro'
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
    WHEN instr(permissions, '"universal-3-pro"') = 0 THEN 0
    WHEN NOT json_valid(permissions) THEN 0
    WHEN json_type(permissions, '$.models') != 'array' THEN 0
    ELSE EXISTS (
        SELECT 1
        FROM json_each(permissions, '$.models') AS model
        WHERE model.type = 'text' AND model.value = 'universal-3-pro'
    )
END;
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
                        WHEN model.type = 'text' AND model.value = 'sana'
                            THEN 'dreamshaper'
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
    WHEN instr(permissions, '"sana"') = 0 THEN 0
    WHEN NOT json_valid(permissions) THEN 0
    WHEN json_type(permissions, '$.models') != 'array' THEN 0
    ELSE EXISTS (
        SELECT 1
        FROM json_each(permissions, '$.models') AS model
        WHERE model.type = 'text' AND model.value = 'sana'
    )
END;
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
                        WHEN model.type = 'text' AND model.value = 'grok-reasoning'
                            THEN 'grok-large'
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
    WHEN instr(permissions, '"grok-reasoning"') = 0 THEN 0
    WHEN NOT json_valid(permissions) THEN 0
    WHEN json_type(permissions, '$.models') != 'array' THEN 0
    ELSE EXISTS (
        SELECT 1
        FROM json_each(permissions, '$.models') AS model
        WHERE model.type = 'text' AND model.value = 'grok-reasoning'
    )
END;
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
                        WHEN model.type = 'text' AND model.value = 'kimi-k2.7-code'
                            THEN 'kimi-code'
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
    WHEN instr(permissions, '"kimi-k2.7-code"') = 0 THEN 0
    WHEN NOT json_valid(permissions) THEN 0
    WHEN json_type(permissions, '$.models') != 'array' THEN 0
    ELSE EXISTS (
        SELECT 1
        FROM json_each(permissions, '$.models') AS model
        WHERE model.type = 'text' AND model.value = 'kimi-k2.7-code'
    )
END;
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
                        WHEN model.type = 'text' AND model.value = 'nova-micro'
                            THEN 'nova-fast'
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
    WHEN instr(permissions, '"nova-micro"') = 0 THEN 0
    WHEN NOT json_valid(permissions) THEN 0
    WHEN json_type(permissions, '$.models') != 'array' THEN 0
    ELSE EXISTS (
        SELECT 1
        FROM json_each(permissions, '$.models') AS model
        WHERE model.type = 'text' AND model.value = 'nova-micro'
    )
END;
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
                        WHEN model.type = 'text' AND model.value = 'kimi-k2.6'
                            THEN 'kimi'
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
    WHEN instr(permissions, '"kimi-k2.6"') = 0 THEN 0
    WHEN NOT json_valid(permissions) THEN 0
    WHEN json_type(permissions, '$.models') != 'array' THEN 0
    ELSE EXISTS (
        SELECT 1
        FROM json_each(permissions, '$.models') AS model
        WHERE model.type = 'text' AND model.value = 'kimi-k2.6'
    )
END;
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
                        WHEN model.type = 'text' AND model.value = 'gemini-3.5-flash'
                            THEN 'gemini'
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
    WHEN instr(permissions, '"gemini-3.5-flash"') = 0 THEN 0
    WHEN NOT json_valid(permissions) THEN 0
    WHEN json_type(permissions, '$.models') != 'array' THEN 0
    ELSE EXISTS (
        SELECT 1
        FROM json_each(permissions, '$.models') AS model
        WHERE model.type = 'text' AND model.value = 'gemini-3.5-flash'
    )
END;
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
                        WHEN model.type = 'text' AND model.value = 'qwen3-tts'
                            THEN 'qwen-tts'
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
    WHEN instr(permissions, '"qwen3-tts"') = 0 THEN 0
    WHEN NOT json_valid(permissions) THEN 0
    WHEN json_type(permissions, '$.models') != 'array' THEN 0
    ELSE EXISTS (
        SELECT 1
        FROM json_each(permissions, '$.models') AS model
        WHERE model.type = 'text' AND model.value = 'qwen3-tts'
    )
END;
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
                        WHEN model.type = 'text' AND model.value = 'gpt-5.5'
                            THEN 'openai-large'
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
    WHEN instr(permissions, '"gpt-5.5"') = 0 THEN 0
    WHEN NOT json_valid(permissions) THEN 0
    WHEN json_type(permissions, '$.models') != 'array' THEN 0
    ELSE EXISTS (
        SELECT 1
        FROM json_each(permissions, '$.models') AS model
        WHERE model.type = 'text' AND model.value = 'gpt-5.5'
    )
END;
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
                        WHEN model.type = 'text' AND model.value = 'mistral-4'
                            THEN 'mistral'
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
    WHEN instr(permissions, '"mistral-4"') = 0 THEN 0
    WHEN NOT json_valid(permissions) THEN 0
    WHEN json_type(permissions, '$.models') != 'array' THEN 0
    ELSE EXISTS (
        SELECT 1
        FROM json_each(permissions, '$.models') AS model
        WHERE model.type = 'text' AND model.value = 'mistral-4'
    )
END;
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
                        WHEN model.type = 'text' AND model.value = 'stable-audio-2.5'
                            THEN 'stable-audio-3-medium'
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
    WHEN instr(permissions, '"stable-audio-2.5"') = 0 THEN 0
    WHEN NOT json_valid(permissions) THEN 0
    WHEN json_type(permissions, '$.models') != 'array' THEN 0
    ELSE EXISTS (
        SELECT 1
        FROM json_each(permissions, '$.models') AS model
        WHERE model.type = 'text' AND model.value = 'stable-audio-2.5'
    )
END;
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
                        WHEN model.type = 'text' AND model.value = 'grok-4.3'
                            THEN 'grok-large'
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
    WHEN instr(permissions, '"grok-4.3"') = 0 THEN 0
    WHEN NOT json_valid(permissions) THEN 0
    WHEN json_type(permissions, '$.models') != 'array' THEN 0
    ELSE EXISTS (
        SELECT 1
        FROM json_each(permissions, '$.models') AS model
        WHERE model.type = 'text' AND model.value = 'grok-4.3'
    )
END;
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
                        WHEN model.type = 'text' AND model.value = 'claude-opus-4.8'
                            THEN 'claude-large'
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
    WHEN instr(permissions, '"claude-opus-4.8"') = 0 THEN 0
    WHEN NOT json_valid(permissions) THEN 0
    WHEN json_type(permissions, '$.models') != 'array' THEN 0
    ELSE EXISTS (
        SELECT 1
        FROM json_each(permissions, '$.models') AS model
        WHERE model.type = 'text' AND model.value = 'claude-opus-4.8'
    )
END;
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
                        WHEN model.type = 'text' AND model.value = 'minimax-m3'
                            THEN 'minimax'
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
    WHEN instr(permissions, '"minimax-m3"') = 0 THEN 0
    WHEN NOT json_valid(permissions) THEN 0
    WHEN json_type(permissions, '$.models') != 'array' THEN 0
    ELSE EXISTS (
        SELECT 1
        FROM json_each(permissions, '$.models') AS model
        WHERE model.type = 'text' AND model.value = 'minimax-m3'
    )
END;
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
                        WHEN model.type = 'text' AND model.value = 'nanobanana2'
                            THEN 'nanobanana-2'
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
    WHEN instr(permissions, '"nanobanana2"') = 0 THEN 0
    WHEN NOT json_valid(permissions) THEN 0
    WHEN json_type(permissions, '$.models') != 'array' THEN 0
    ELSE EXISTS (
        SELECT 1
        FROM json_each(permissions, '$.models') AS model
        WHERE model.type = 'text' AND model.value = 'nanobanana2'
    )
END;
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
                        WHEN model.type = 'text' AND model.value = 'deepseek-v4-pro'
                            THEN 'deepseek-pro'
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
    WHEN instr(permissions, '"deepseek-v4-pro"') = 0 THEN 0
    WHEN NOT json_valid(permissions) THEN 0
    WHEN json_type(permissions, '$.models') != 'array' THEN 0
    ELSE EXISTS (
        SELECT 1
        FROM json_each(permissions, '$.models') AS model
        WHERE model.type = 'text' AND model.value = 'deepseek-v4-pro'
    )
END;
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
                        WHEN model.type = 'text' AND model.value = 'nemotron-3-ultra'
                            THEN 'nemotron'
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
    WHEN instr(permissions, '"nemotron-3-ultra"') = 0 THEN 0
    WHEN NOT json_valid(permissions) THEN 0
    WHEN json_type(permissions, '$.models') != 'array' THEN 0
    ELSE EXISTS (
        SELECT 1
        FROM json_each(permissions, '$.models') AS model
        WHERE model.type = 'text' AND model.value = 'nemotron-3-ultra'
    )
END;
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
                        WHEN model.type = 'text' AND model.value = 'trellis-2-high'
                            THEN 'trellis-2'
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
    WHEN instr(permissions, '"trellis-2-high"') = 0 THEN 0
    WHEN NOT json_valid(permissions) THEN 0
    WHEN json_type(permissions, '$.models') != 'array' THEN 0
    ELSE EXISTS (
        SELECT 1
        FROM json_each(permissions, '$.models') AS model
        WHERE model.type = 'text' AND model.value = 'trellis-2-high'
    )
END;
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
                        WHEN model.type = 'text' AND model.value = 'trellis-2-low'
                            THEN 'trellis-2'
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
    WHEN instr(permissions, '"trellis-2-low"') = 0 THEN 0
    WHEN NOT json_valid(permissions) THEN 0
    WHEN json_type(permissions, '$.models') != 'array' THEN 0
    ELSE EXISTS (
        SELECT 1
        FROM json_each(permissions, '$.models') AS model
        WHERE model.type = 'text' AND model.value = 'trellis-2-low'
    )
END;
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
                        WHEN model.type = 'text' AND model.value = 'trellis-2-medium'
                            THEN 'trellis-2'
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
    WHEN instr(permissions, '"trellis-2-medium"') = 0 THEN 0
    WHEN NOT json_valid(permissions) THEN 0
    WHEN json_type(permissions, '$.models') != 'array' THEN 0
    ELSE EXISTS (
        SELECT 1
        FROM json_each(permissions, '$.models') AS model
        WHERE model.type = 'text' AND model.value = 'trellis-2-medium'
    )
END;
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
                        WHEN model.type = 'text' AND model.value = 'muse-spark-1.1'
                            THEN 'muse-spark-1.2'
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
    WHEN instr(permissions, '"muse-spark-1.1"') = 0 THEN 0
    WHEN NOT json_valid(permissions) THEN 0
    WHEN json_type(permissions, '$.models') != 'array' THEN 0
    ELSE EXISTS (
        SELECT 1
        FROM json_each(permissions, '$.models') AS model
        WHERE model.type = 'text' AND model.value = 'muse-spark-1.1'
    )
END;
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
                        WHEN model.type = 'text' AND model.value = 'grok-4.5'
                            THEN 'grok-4.6'
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
    WHEN instr(permissions, '"grok-4.5"') = 0 THEN 0
    WHEN NOT json_valid(permissions) THEN 0
    WHEN json_type(permissions, '$.models') != 'array' THEN 0
    ELSE EXISTS (
        SELECT 1
        FROM json_each(permissions, '$.models') AS model
        WHERE model.type = 'text' AND model.value = 'grok-4.5'
    )
END;
