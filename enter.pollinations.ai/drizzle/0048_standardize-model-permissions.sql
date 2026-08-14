-- Promote the 128 canonical model IDs introduced by this release in stored
-- API-key allowlists. The preceding 0046 migration canonicalized all known
-- aliases at rest, and write paths now canonicalize recognized IDs, so this
-- migration only rewrites the canonical IDs from the pre-rename registry.
-- Unknown/community IDs, unrelated fields, array order, and first occurrence
-- are preserved.
--
-- One statement per promoted ID keeps each query below D1 CPU limits. The
-- instr() prefilter is intentionally first inside CASE so JSON functions only
-- inspect rows that can contain the old canonical ID.

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
                        WHEN model.type = 'text' AND model.value = 'claude'
                            THEN 'anthropic/claude-sonnet-4.6'
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
    WHEN instr(permissions, '"claude"') = 0 THEN 0
    WHEN NOT json_valid(permissions) THEN 0
    WHEN json_type(permissions, '$.models') != 'array' THEN 0
    ELSE EXISTS (
        SELECT 1
        FROM json_each(permissions, '$.models') AS model
        WHERE model.type = 'text' AND model.value = 'claude'
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
                        WHEN model.type = 'text' AND model.value = 'claude-fable-5'
                            THEN 'anthropic/claude-fable-5'
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
    WHEN instr(permissions, '"claude-fable-5"') = 0 THEN 0
    WHEN NOT json_valid(permissions) THEN 0
    WHEN json_type(permissions, '$.models') != 'array' THEN 0
    ELSE EXISTS (
        SELECT 1
        FROM json_each(permissions, '$.models') AS model
        WHERE model.type = 'text' AND model.value = 'claude-fable-5'
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
                        WHEN model.type = 'text' AND model.value = 'claude-fast'
                            THEN 'anthropic/claude-haiku-4.5'
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
    WHEN instr(permissions, '"claude-fast"') = 0 THEN 0
    WHEN NOT json_valid(permissions) THEN 0
    WHEN json_type(permissions, '$.models') != 'array' THEN 0
    ELSE EXISTS (
        SELECT 1
        FROM json_each(permissions, '$.models') AS model
        WHERE model.type = 'text' AND model.value = 'claude-fast'
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
                        WHEN model.type = 'text' AND model.value = 'claude-large'
                            THEN 'anthropic/claude-opus-5'
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
    WHEN instr(permissions, '"claude-large"') = 0 THEN 0
    WHEN NOT json_valid(permissions) THEN 0
    WHEN json_type(permissions, '$.models') != 'array' THEN 0
    ELSE EXISTS (
        SELECT 1
        FROM json_each(permissions, '$.models') AS model
        WHERE model.type = 'text' AND model.value = 'claude-large'
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
                        WHEN model.type = 'text' AND model.value = 'claude-opus-4.6'
                            THEN 'anthropic/claude-opus-4.6'
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
    WHEN instr(permissions, '"claude-opus-4.6"') = 0 THEN 0
    WHEN NOT json_valid(permissions) THEN 0
    WHEN json_type(permissions, '$.models') != 'array' THEN 0
    ELSE EXISTS (
        SELECT 1
        FROM json_each(permissions, '$.models') AS model
        WHERE model.type = 'text' AND model.value = 'claude-opus-4.6'
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
                        WHEN model.type = 'text' AND model.value = 'claude-opus-4.7'
                            THEN 'anthropic/claude-opus-4.7'
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
    WHEN instr(permissions, '"claude-opus-4.7"') = 0 THEN 0
    WHEN NOT json_valid(permissions) THEN 0
    WHEN json_type(permissions, '$.models') != 'array' THEN 0
    ELSE EXISTS (
        SELECT 1
        FROM json_each(permissions, '$.models') AS model
        WHERE model.type = 'text' AND model.value = 'claude-opus-4.7'
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
                        WHEN model.type = 'text' AND model.value = 'claude-sonnet-5'
                            THEN 'anthropic/claude-sonnet-5'
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
    WHEN instr(permissions, '"claude-sonnet-5"') = 0 THEN 0
    WHEN NOT json_valid(permissions) THEN 0
    WHEN json_type(permissions, '$.models') != 'array' THEN 0
    ELSE EXISTS (
        SELECT 1
        FROM json_each(permissions, '$.models') AS model
        WHERE model.type = 'text' AND model.value = 'claude-sonnet-5'
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
                        WHEN model.type = 'text' AND model.value = 'cohere-embed-v4'
                            THEN 'embed-v4.0'
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
    WHEN instr(permissions, '"cohere-embed-v4"') = 0 THEN 0
    WHEN NOT json_valid(permissions) THEN 0
    WHEN json_type(permissions, '$.models') != 'array' THEN 0
    ELSE EXISTS (
        SELECT 1
        FROM json_each(permissions, '$.models') AS model
        WHERE model.type = 'text' AND model.value = 'cohere-embed-v4'
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
                        WHEN model.type = 'text' AND model.value = 'command-a-plus'
                            THEN 'command-a-plus-05-2026'
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
    WHEN instr(permissions, '"command-a-plus"') = 0 THEN 0
    WHEN NOT json_valid(permissions) THEN 0
    WHEN json_type(permissions, '$.models') != 'array' THEN 0
    ELSE EXISTS (
        SELECT 1
        FROM json_each(permissions, '$.models') AS model
        WHERE model.type = 'text' AND model.value = 'command-a-plus'
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
                        WHEN model.type = 'text' AND model.value = 'csm-1b'
                            THEN 'sesame/csm-1b'
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
    WHEN instr(permissions, '"csm-1b"') = 0 THEN 0
    WHEN NOT json_valid(permissions) THEN 0
    WHEN json_type(permissions, '$.models') != 'array' THEN 0
    ELSE EXISTS (
        SELECT 1
        FROM json_each(permissions, '$.models') AS model
        WHERE model.type = 'text' AND model.value = 'csm-1b'
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
                        WHEN model.type = 'text' AND model.value = 'deepseek'
                            THEN 'deepseek/deepseek-v4-flash-0731'
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
    WHEN instr(permissions, '"deepseek"') = 0 THEN 0
    WHEN NOT json_valid(permissions) THEN 0
    WHEN json_type(permissions, '$.models') != 'array' THEN 0
    ELSE EXISTS (
        SELECT 1
        FROM json_each(permissions, '$.models') AS model
        WHERE model.type = 'text' AND model.value = 'deepseek'
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
                        WHEN model.type = 'text' AND model.value = 'deepseek-pro'
                            THEN 'deepseek/deepseek-v4-pro-0813'
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
    WHEN instr(permissions, '"deepseek-pro"') = 0 THEN 0
    WHEN NOT json_valid(permissions) THEN 0
    WHEN json_type(permissions, '$.models') != 'array' THEN 0
    ELSE EXISTS (
        SELECT 1
        FROM json_each(permissions, '$.models') AS model
        WHERE model.type = 'text' AND model.value = 'deepseek-pro'
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
                        WHEN model.type = 'text' AND model.value = 'eleven-multilingual-v2'
                            THEN 'elevenlabs/eleven-multilingual-v2'
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
    WHEN instr(permissions, '"eleven-multilingual-v2"') = 0 THEN 0
    WHEN NOT json_valid(permissions) THEN 0
    WHEN json_type(permissions, '$.models') != 'array' THEN 0
    ELSE EXISTS (
        SELECT 1
        FROM json_each(permissions, '$.models') AS model
        WHERE model.type = 'text' AND model.value = 'eleven-multilingual-v2'
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
                        WHEN model.type = 'text' AND model.value = 'eleven-sfx'
                            THEN 'elevenlabs/eleven-text-to-sound-v2'
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
    WHEN instr(permissions, '"eleven-sfx"') = 0 THEN 0
    WHEN NOT json_valid(permissions) THEN 0
    WHEN json_type(permissions, '$.models') != 'array' THEN 0
    ELSE EXISTS (
        SELECT 1
        FROM json_each(permissions, '$.models') AS model
        WHERE model.type = 'text' AND model.value = 'eleven-sfx'
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
                        WHEN model.type = 'text' AND model.value = 'flux'
                            THEN 'black-forest-labs/FLUX.1-schnell'
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
    WHEN instr(permissions, '"flux"') = 0 THEN 0
    WHEN NOT json_valid(permissions) THEN 0
    WHEN json_type(permissions, '$.models') != 'array' THEN 0
    ELSE EXISTS (
        SELECT 1
        FROM json_each(permissions, '$.models') AS model
        WHERE model.type = 'text' AND model.value = 'flux'
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
                        WHEN model.type = 'text' AND model.value = 'gemini'
                            THEN 'google/gemini-3.7-flash'
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
    WHEN instr(permissions, '"gemini"') = 0 THEN 0
    WHEN NOT json_valid(permissions) THEN 0
    WHEN json_type(permissions, '$.models') != 'array' THEN 0
    ELSE EXISTS (
        SELECT 1
        FROM json_each(permissions, '$.models') AS model
        WHERE model.type = 'text' AND model.value = 'gemini'
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
                        WHEN model.type = 'text' AND model.value = 'gemini-2'
                            THEN 'google/gemini-embedding-2'
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
    WHEN instr(permissions, '"gemini-2"') = 0 THEN 0
    WHEN NOT json_valid(permissions) THEN 0
    WHEN json_type(permissions, '$.models') != 'array' THEN 0
    ELSE EXISTS (
        SELECT 1
        FROM json_each(permissions, '$.models') AS model
        WHERE model.type = 'text' AND model.value = 'gemini-2'
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
                        WHEN model.type = 'text' AND model.value = 'gemini-3-flash'
                            THEN 'google/gemini-3-flash-preview'
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
    WHEN instr(permissions, '"gemini-3-flash"') = 0 THEN 0
    WHEN NOT json_valid(permissions) THEN 0
    WHEN json_type(permissions, '$.models') != 'array' THEN 0
    ELSE EXISTS (
        SELECT 1
        FROM json_each(permissions, '$.models') AS model
        WHERE model.type = 'text' AND model.value = 'gemini-3-flash'
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
                        WHEN model.type = 'text' AND model.value = 'gemini-fast'
                            THEN 'google/gemini-2.5-flash-lite'
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
    WHEN instr(permissions, '"gemini-fast"') = 0 THEN 0
    WHEN NOT json_valid(permissions) THEN 0
    WHEN json_type(permissions, '$.models') != 'array' THEN 0
    ELSE EXISTS (
        SELECT 1
        FROM json_each(permissions, '$.models') AS model
        WHERE model.type = 'text' AND model.value = 'gemini-fast'
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
                        WHEN model.type = 'text' AND model.value = 'gemini-flash-lite-3.5'
                            THEN 'google/gemini-3.5-flash-lite'
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
    WHEN instr(permissions, '"gemini-flash-lite-3.5"') = 0 THEN 0
    WHEN NOT json_valid(permissions) THEN 0
    WHEN json_type(permissions, '$.models') != 'array' THEN 0
    ELSE EXISTS (
        SELECT 1
        FROM json_each(permissions, '$.models') AS model
        WHERE model.type = 'text' AND model.value = 'gemini-flash-lite-3.5'
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
                        WHEN model.type = 'text' AND model.value = 'gemini-large'
                            THEN 'google/gemini-3.1-pro-preview'
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
    WHEN instr(permissions, '"gemini-large"') = 0 THEN 0
    WHEN NOT json_valid(permissions) THEN 0
    WHEN json_type(permissions, '$.models') != 'array' THEN 0
    ELSE EXISTS (
        SELECT 1
        FROM json_each(permissions, '$.models') AS model
        WHERE model.type = 'text' AND model.value = 'gemini-large'
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
                        WHEN model.type = 'text' AND model.value = 'gemma'
                            THEN 'google/gemma-4-26b-a4b-it'
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
    WHEN instr(permissions, '"gemma"') = 0 THEN 0
    WHEN NOT json_valid(permissions) THEN 0
    WHEN json_type(permissions, '$.models') != 'array' THEN 0
    ELSE EXISTS (
        SELECT 1
        FROM json_each(permissions, '$.models') AS model
        WHERE model.type = 'text' AND model.value = 'gemma'
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
                        WHEN model.type = 'text' AND model.value = 'gemma-4-31b'
                            THEN 'google/gemma-4-31b-it'
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
    WHEN instr(permissions, '"gemma-4-31b"') = 0 THEN 0
    WHEN NOT json_valid(permissions) THEN 0
    WHEN json_type(permissions, '$.models') != 'array' THEN 0
    ELSE EXISTS (
        SELECT 1
        FROM json_each(permissions, '$.models') AS model
        WHERE model.type = 'text' AND model.value = 'gemma-4-31b'
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
                        WHEN model.type = 'text' AND model.value = 'glm'
                            THEN 'z-ai/glm-5.2'
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
    WHEN instr(permissions, '"glm"') = 0 THEN 0
    WHEN NOT json_valid(permissions) THEN 0
    WHEN json_type(permissions, '$.models') != 'array' THEN 0
    ELSE EXISTS (
        SELECT 1
        FROM json_each(permissions, '$.models') AS model
        WHERE model.type = 'text' AND model.value = 'glm'
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
                        WHEN model.type = 'text' AND model.value = 'gpt-5.4'
                            THEN 'openai/gpt-5.4'
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
    WHEN instr(permissions, '"gpt-5.4"') = 0 THEN 0
    WHEN NOT json_valid(permissions) THEN 0
    WHEN json_type(permissions, '$.models') != 'array' THEN 0
    ELSE EXISTS (
        SELECT 1
        FROM json_each(permissions, '$.models') AS model
        WHERE model.type = 'text' AND model.value = 'gpt-5.4'
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
                        WHEN model.type = 'text' AND model.value = 'gpt-5.4-mini'
                            THEN 'openai/gpt-5.4-mini'
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
    WHEN instr(permissions, '"gpt-5.4-mini"') = 0 THEN 0
    WHEN NOT json_valid(permissions) THEN 0
    WHEN json_type(permissions, '$.models') != 'array' THEN 0
    ELSE EXISTS (
        SELECT 1
        FROM json_each(permissions, '$.models') AS model
        WHERE model.type = 'text' AND model.value = 'gpt-5.4-mini'
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
                        WHEN model.type = 'text' AND model.value = 'gpt-5.6-luna'
                            THEN 'openai/gpt-5.6-luna'
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
    WHEN instr(permissions, '"gpt-5.6-luna"') = 0 THEN 0
    WHEN NOT json_valid(permissions) THEN 0
    WHEN json_type(permissions, '$.models') != 'array' THEN 0
    ELSE EXISTS (
        SELECT 1
        FROM json_each(permissions, '$.models') AS model
        WHERE model.type = 'text' AND model.value = 'gpt-5.6-luna'
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
                        WHEN model.type = 'text' AND model.value = 'gpt-5.6-sol'
                            THEN 'openai/gpt-5.6-sol'
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
    WHEN instr(permissions, '"gpt-5.6-sol"') = 0 THEN 0
    WHEN NOT json_valid(permissions) THEN 0
    WHEN json_type(permissions, '$.models') != 'array' THEN 0
    ELSE EXISTS (
        SELECT 1
        FROM json_each(permissions, '$.models') AS model
        WHERE model.type = 'text' AND model.value = 'gpt-5.6-sol'
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
                        WHEN model.type = 'text' AND model.value = 'gpt-5.6-terra'
                            THEN 'openai/gpt-5.6-terra'
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
    WHEN instr(permissions, '"gpt-5.6-terra"') = 0 THEN 0
    WHEN NOT json_valid(permissions) THEN 0
    WHEN json_type(permissions, '$.models') != 'array' THEN 0
    ELSE EXISTS (
        SELECT 1
        FROM json_each(permissions, '$.models') AS model
        WHERE model.type = 'text' AND model.value = 'gpt-5.6-terra'
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
                        WHEN model.type = 'text' AND model.value = 'gpt-image-2'
                            THEN 'openai/gpt-image-2'
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
    WHEN instr(permissions, '"gpt-image-2"') = 0 THEN 0
    WHEN NOT json_valid(permissions) THEN 0
    WHEN json_type(permissions, '$.models') != 'array' THEN 0
    ELSE EXISTS (
        SELECT 1
        FROM json_each(permissions, '$.models') AS model
        WHERE model.type = 'text' AND model.value = 'gpt-image-2'
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
                        WHEN model.type = 'text' AND model.value = 'gpt-oss'
                            THEN 'openai/gpt-oss-20b'
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
    WHEN instr(permissions, '"gpt-oss"') = 0 THEN 0
    WHEN NOT json_valid(permissions) THEN 0
    WHEN json_type(permissions, '$.models') != 'array' THEN 0
    ELSE EXISTS (
        SELECT 1
        FROM json_each(permissions, '$.models') AS model
        WHERE model.type = 'text' AND model.value = 'gpt-oss'
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
                        WHEN model.type = 'text' AND model.value = 'gpt-realtime-2'
                            THEN 'openai/gpt-realtime-2'
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
    WHEN instr(permissions, '"gpt-realtime-2"') = 0 THEN 0
    WHEN NOT json_valid(permissions) THEN 0
    WHEN json_type(permissions, '$.models') != 'array' THEN 0
    ELSE EXISTS (
        SELECT 1
        FROM json_each(permissions, '$.models') AS model
        WHERE model.type = 'text' AND model.value = 'gpt-realtime-2'
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
                        WHEN model.type = 'text' AND model.value = 'gpt-realtime-2.1-mini'
                            THEN 'openai/gpt-realtime-2.1-mini'
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
    WHEN instr(permissions, '"gpt-realtime-2.1-mini"') = 0 THEN 0
    WHEN NOT json_valid(permissions) THEN 0
    WHEN json_type(permissions, '$.models') != 'array' THEN 0
    ELSE EXISTS (
        SELECT 1
        FROM json_each(permissions, '$.models') AS model
        WHERE model.type = 'text' AND model.value = 'gpt-realtime-2.1-mini'
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
                        WHEN model.type = 'text' AND model.value = 'gptimage'
                            THEN 'openai/gpt-image-1-mini'
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
    WHEN instr(permissions, '"gptimage"') = 0 THEN 0
    WHEN NOT json_valid(permissions) THEN 0
    WHEN json_type(permissions, '$.models') != 'array' THEN 0
    ELSE EXISTS (
        SELECT 1
        FROM json_each(permissions, '$.models') AS model
        WHERE model.type = 'text' AND model.value = 'gptimage'
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
                        WHEN model.type = 'text' AND model.value = 'gptimage-large'
                            THEN 'openai/gpt-image-1.5'
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
    WHEN instr(permissions, '"gptimage-large"') = 0 THEN 0
    WHEN NOT json_valid(permissions) THEN 0
    WHEN json_type(permissions, '$.models') != 'array' THEN 0
    ELSE EXISTS (
        SELECT 1
        FROM json_each(permissions, '$.models') AS model
        WHERE model.type = 'text' AND model.value = 'gptimage-large'
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
                        WHEN model.type = 'text' AND model.value = 'grok-4.6'
                            THEN 'x-ai/grok-4.6'
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
    WHEN instr(permissions, '"grok-4.6"') = 0 THEN 0
    WHEN NOT json_valid(permissions) THEN 0
    WHEN json_type(permissions, '$.models') != 'array' THEN 0
    ELSE EXISTS (
        SELECT 1
        FROM json_each(permissions, '$.models') AS model
        WHERE model.type = 'text' AND model.value = 'grok-4.6'
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
                        WHEN model.type = 'text' AND model.value = 'grok-imagine'
                            THEN 'x-ai/grok-imagine-image'
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
    WHEN instr(permissions, '"grok-imagine"') = 0 THEN 0
    WHEN NOT json_valid(permissions) THEN 0
    WHEN json_type(permissions, '$.models') != 'array' THEN 0
    ELSE EXISTS (
        SELECT 1
        FROM json_each(permissions, '$.models') AS model
        WHERE model.type = 'text' AND model.value = 'grok-imagine'
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
                        WHEN model.type = 'text' AND model.value = 'grok-imagine-image-2.0'
                            THEN 'x-ai/grok-imagine-image-2.0'
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
    WHEN instr(permissions, '"grok-imagine-image-2.0"') = 0 THEN 0
    WHEN NOT json_valid(permissions) THEN 0
    WHEN json_type(permissions, '$.models') != 'array' THEN 0
    ELSE EXISTS (
        SELECT 1
        FROM json_each(permissions, '$.models') AS model
        WHERE model.type = 'text' AND model.value = 'grok-imagine-image-2.0'
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
                        WHEN model.type = 'text' AND model.value = 'grok-imagine-pro'
                            THEN 'x-ai/grok-imagine-image-quality'
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
    WHEN instr(permissions, '"grok-imagine-pro"') = 0 THEN 0
    WHEN NOT json_valid(permissions) THEN 0
    WHEN json_type(permissions, '$.models') != 'array' THEN 0
    ELSE EXISTS (
        SELECT 1
        FROM json_each(permissions, '$.models') AS model
        WHERE model.type = 'text' AND model.value = 'grok-imagine-pro'
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
                        WHEN model.type = 'text' AND model.value = 'grok-imagine-video-1.5'
                            THEN 'x-ai/grok-imagine-video-1.5'
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
    WHEN instr(permissions, '"grok-imagine-video-1.5"') = 0 THEN 0
    WHEN NOT json_valid(permissions) THEN 0
    WHEN json_type(permissions, '$.models') != 'array' THEN 0
    ELSE EXISTS (
        SELECT 1
        FROM json_each(permissions, '$.models') AS model
        WHERE model.type = 'text' AND model.value = 'grok-imagine-video-1.5'
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
                        WHEN model.type = 'text' AND model.value = 'grok-large'
                            THEN 'x-ai/grok-4.3'
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
    WHEN instr(permissions, '"grok-large"') = 0 THEN 0
    WHEN NOT json_valid(permissions) THEN 0
    WHEN json_type(permissions, '$.models') != 'array' THEN 0
    ELSE EXISTS (
        SELECT 1
        FROM json_each(permissions, '$.models') AS model
        WHERE model.type = 'text' AND model.value = 'grok-large'
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
                        WHEN model.type = 'text' AND model.value = 'grok-video-pro'
                            THEN 'x-ai/grok-imagine-video'
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
    WHEN instr(permissions, '"grok-video-pro"') = 0 THEN 0
    WHEN NOT json_valid(permissions) THEN 0
    WHEN json_type(permissions, '$.models') != 'array' THEN 0
    ELSE EXISTS (
        SELECT 1
        FROM json_each(permissions, '$.models') AS model
        WHERE model.type = 'text' AND model.value = 'grok-video-pro'
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
                        WHEN model.type = 'text' AND model.value = 'happyhorse-1.1'
                            THEN 'alibaba/happyhorse-1.1'
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
    WHEN instr(permissions, '"happyhorse-1.1"') = 0 THEN 0
    WHEN NOT json_valid(permissions) THEN 0
    WHEN json_type(permissions, '$.models') != 'array' THEN 0
    ELSE EXISTS (
        SELECT 1
        FROM json_each(permissions, '$.models') AS model
        WHERE model.type = 'text' AND model.value = 'happyhorse-1.1'
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
                        WHEN model.type = 'text' AND model.value = 'ideogram-v4-balanced'
                            THEN 'ideogram-ai/ideogram-v4-balanced'
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
    WHEN instr(permissions, '"ideogram-v4-balanced"') = 0 THEN 0
    WHEN NOT json_valid(permissions) THEN 0
    WHEN json_type(permissions, '$.models') != 'array' THEN 0
    ELSE EXISTS (
        SELECT 1
        FROM json_each(permissions, '$.models') AS model
        WHERE model.type = 'text' AND model.value = 'ideogram-v4-balanced'
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
                        WHEN model.type = 'text' AND model.value = 'ideogram-v4-quality'
                            THEN 'ideogram-ai/ideogram-v4-quality'
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
    WHEN instr(permissions, '"ideogram-v4-quality"') = 0 THEN 0
    WHEN NOT json_valid(permissions) THEN 0
    WHEN json_type(permissions, '$.models') != 'array' THEN 0
    ELSE EXISTS (
        SELECT 1
        FROM json_each(permissions, '$.models') AS model
        WHERE model.type = 'text' AND model.value = 'ideogram-v4-quality'
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
                        WHEN model.type = 'text' AND model.value = 'ideogram-v4-turbo'
                            THEN 'ideogram-ai/ideogram-v4-turbo'
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
    WHEN instr(permissions, '"ideogram-v4-turbo"') = 0 THEN 0
    WHEN NOT json_valid(permissions) THEN 0
    WHEN json_type(permissions, '$.models') != 'array' THEN 0
    ELSE EXISTS (
        SELECT 1
        FROM json_each(permissions, '$.models') AS model
        WHERE model.type = 'text' AND model.value = 'ideogram-v4-turbo'
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
                        WHEN model.type = 'text' AND model.value = 'inkling'
                            THEN 'thinkingmachines/inkling-small'
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
    WHEN instr(permissions, '"inkling"') = 0 THEN 0
    WHEN NOT json_valid(permissions) THEN 0
    WHEN json_type(permissions, '$.models') != 'array' THEN 0
    ELSE EXISTS (
        SELECT 1
        FROM json_each(permissions, '$.models') AS model
        WHERE model.type = 'text' AND model.value = 'inkling'
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
                        WHEN model.type = 'text' AND model.value = 'kimi'
                            THEN 'moonshotai/kimi-k2.6'
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
    WHEN instr(permissions, '"kimi"') = 0 THEN 0
    WHEN NOT json_valid(permissions) THEN 0
    WHEN json_type(permissions, '$.models') != 'array' THEN 0
    ELSE EXISTS (
        SELECT 1
        FROM json_each(permissions, '$.models') AS model
        WHERE model.type = 'text' AND model.value = 'kimi'
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
                        WHEN model.type = 'text' AND model.value = 'kimi-code'
                            THEN 'moonshotai/kimi-k2.7-code'
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
    WHEN instr(permissions, '"kimi-code"') = 0 THEN 0
    WHEN NOT json_valid(permissions) THEN 0
    WHEN json_type(permissions, '$.models') != 'array' THEN 0
    ELSE EXISTS (
        SELECT 1
        FROM json_each(permissions, '$.models') AS model
        WHERE model.type = 'text' AND model.value = 'kimi-code'
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
                        WHEN model.type = 'text' AND model.value = 'kimi-k3'
                            THEN 'moonshotai/kimi-k3'
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
    WHEN instr(permissions, '"kimi-k3"') = 0 THEN 0
    WHEN NOT json_valid(permissions) THEN 0
    WHEN json_type(permissions, '$.models') != 'array' THEN 0
    ELSE EXISTS (
        SELECT 1
        FROM json_each(permissions, '$.models') AS model
        WHERE model.type = 'text' AND model.value = 'kimi-k3'
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
                        WHEN model.type = 'text' AND model.value = 'klein'
                            THEN 'black-forest-labs/flux.2-klein-4b'
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
    WHEN instr(permissions, '"klein"') = 0 THEN 0
    WHEN NOT json_valid(permissions) THEN 0
    WHEN json_type(permissions, '$.models') != 'array' THEN 0
    ELSE EXISTS (
        SELECT 1
        FROM json_each(permissions, '$.models') AS model
        WHERE model.type = 'text' AND model.value = 'klein'
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
                        WHEN model.type = 'text' AND model.value = 'kontext'
                            THEN 'black-forest-labs/flux.1-kontext-pro'
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
    WHEN instr(permissions, '"kontext"') = 0 THEN 0
    WHEN NOT json_valid(permissions) THEN 0
    WHEN json_type(permissions, '$.models') != 'array' THEN 0
    ELSE EXISTS (
        SELECT 1
        FROM json_each(permissions, '$.models') AS model
        WHERE model.type = 'text' AND model.value = 'kontext'
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
                        WHEN model.type = 'text' AND model.value = 'krea'
                            THEN 'krea/krea-2-medium'
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
    WHEN instr(permissions, '"krea"') = 0 THEN 0
    WHEN NOT json_valid(permissions) THEN 0
    WHEN json_type(permissions, '$.models') != 'array' THEN 0
    ELSE EXISTS (
        SELECT 1
        FROM json_each(permissions, '$.models') AS model
        WHERE model.type = 'text' AND model.value = 'krea'
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
                        WHEN model.type = 'text' AND model.value = 'laguna'
                            THEN 'poolside/laguna-s-2.1'
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
    WHEN instr(permissions, '"laguna"') = 0 THEN 0
    WHEN NOT json_valid(permissions) THEN 0
    WHEN json_type(permissions, '$.models') != 'array' THEN 0
    ELSE EXISTS (
        SELECT 1
        FROM json_each(permissions, '$.models') AS model
        WHERE model.type = 'text' AND model.value = 'laguna'
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
                        WHEN model.type = 'text' AND model.value = 'llama'
                            THEN 'meta-llama/llama-3.3-70b-instruct'
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
    WHEN instr(permissions, '"llama"') = 0 THEN 0
    WHEN NOT json_valid(permissions) THEN 0
    WHEN json_type(permissions, '$.models') != 'array' THEN 0
    ELSE EXISTS (
        SELECT 1
        FROM json_each(permissions, '$.models') AS model
        WHERE model.type = 'text' AND model.value = 'llama'
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
                        WHEN model.type = 'text' AND model.value = 'llama-maverick'
                            THEN 'meta-llama/llama-4-maverick'
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
    WHEN instr(permissions, '"llama-maverick"') = 0 THEN 0
    WHEN NOT json_valid(permissions) THEN 0
    WHEN json_type(permissions, '$.models') != 'array' THEN 0
    ELSE EXISTS (
        SELECT 1
        FROM json_each(permissions, '$.models') AS model
        WHERE model.type = 'text' AND model.value = 'llama-maverick'
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
                        WHEN model.type = 'text' AND model.value = 'llama-scout'
                            THEN 'meta-llama/llama-4-scout'
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
    WHEN instr(permissions, '"llama-scout"') = 0 THEN 0
    WHEN NOT json_valid(permissions) THEN 0
    WHEN json_type(permissions, '$.models') != 'array' THEN 0
    ELSE EXISTS (
        SELECT 1
        FROM json_each(permissions, '$.models') AS model
        WHERE model.type = 'text' AND model.value = 'llama-scout'
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
                        WHEN model.type = 'text' AND model.value = 'longcat'
                            THEN 'meituan/longcat-2.0'
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
    WHEN instr(permissions, '"longcat"') = 0 THEN 0
    WHEN NOT json_valid(permissions) THEN 0
    WHEN json_type(permissions, '$.models') != 'array' THEN 0
    ELSE EXISTS (
        SELECT 1
        FROM json_each(permissions, '$.models') AS model
        WHERE model.type = 'text' AND model.value = 'longcat'
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
                        WHEN model.type = 'text' AND model.value = 'lyria-3-clip'
                            THEN 'google/lyria-3-clip-preview'
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
    WHEN instr(permissions, '"lyria-3-clip"') = 0 THEN 0
    WHEN NOT json_valid(permissions) THEN 0
    WHEN json_type(permissions, '$.models') != 'array' THEN 0
    ELSE EXISTS (
        SELECT 1
        FROM json_each(permissions, '$.models') AS model
        WHERE model.type = 'text' AND model.value = 'lyria-3-clip'
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
                        WHEN model.type = 'text' AND model.value = 'mercury'
                            THEN 'inception/mercury-2'
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
    WHEN instr(permissions, '"mercury"') = 0 THEN 0
    WHEN NOT json_valid(permissions) THEN 0
    WHEN json_type(permissions, '$.models') != 'array' THEN 0
    ELSE EXISTS (
        SELECT 1
        FROM json_each(permissions, '$.models') AS model
        WHERE model.type = 'text' AND model.value = 'mercury'
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
                        WHEN model.type = 'text' AND model.value = 'mimo-v2.5'
                            THEN 'xiaomi/mimo-v2.5'
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
    WHEN instr(permissions, '"mimo-v2.5"') = 0 THEN 0
    WHEN NOT json_valid(permissions) THEN 0
    WHEN json_type(permissions, '$.models') != 'array' THEN 0
    ELSE EXISTS (
        SELECT 1
        FROM json_each(permissions, '$.models') AS model
        WHERE model.type = 'text' AND model.value = 'mimo-v2.5'
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
                        WHEN model.type = 'text' AND model.value = 'mimo-v2.5-pro'
                            THEN 'xiaomi/mimo-v2.5-pro'
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
    WHEN instr(permissions, '"mimo-v2.5-pro"') = 0 THEN 0
    WHEN NOT json_valid(permissions) THEN 0
    WHEN json_type(permissions, '$.models') != 'array' THEN 0
    ELSE EXISTS (
        SELECT 1
        FROM json_each(permissions, '$.models') AS model
        WHERE model.type = 'text' AND model.value = 'mimo-v2.5-pro'
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
                        WHEN model.type = 'text' AND model.value = 'minimax'
                            THEN 'minimax/minimax-m3'
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
    WHEN instr(permissions, '"minimax"') = 0 THEN 0
    WHEN NOT json_valid(permissions) THEN 0
    WHEN json_type(permissions, '$.models') != 'array' THEN 0
    ELSE EXISTS (
        SELECT 1
        FROM json_each(permissions, '$.models') AS model
        WHERE model.type = 'text' AND model.value = 'minimax'
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
                        WHEN model.type = 'text' AND model.value = 'minimax-h3'
                            THEN 'minimax/minimax-h3'
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
    WHEN instr(permissions, '"minimax-h3"') = 0 THEN 0
    WHEN NOT json_valid(permissions) THEN 0
    WHEN json_type(permissions, '$.models') != 'array' THEN 0
    ELSE EXISTS (
        SELECT 1
        FROM json_each(permissions, '$.models') AS model
        WHERE model.type = 'text' AND model.value = 'minimax-h3'
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
                        WHEN model.type = 'text' AND model.value = 'minimax-m2.7'
                            THEN 'minimax/minimax-m2.7'
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
    WHEN instr(permissions, '"minimax-m2.7"') = 0 THEN 0
    WHEN NOT json_valid(permissions) THEN 0
    WHEN json_type(permissions, '$.models') != 'array' THEN 0
    ELSE EXISTS (
        SELECT 1
        FROM json_each(permissions, '$.models') AS model
        WHERE model.type = 'text' AND model.value = 'minimax-m2.7'
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
                        WHEN model.type = 'text' AND model.value = 'mistral'
                            THEN 'mistralai/mistral-small-2603'
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
    WHEN instr(permissions, '"mistral"') = 0 THEN 0
    WHEN NOT json_valid(permissions) THEN 0
    WHEN json_type(permissions, '$.models') != 'array' THEN 0
    ELSE EXISTS (
        SELECT 1
        FROM json_each(permissions, '$.models') AS model
        WHERE model.type = 'text' AND model.value = 'mistral'
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
                        WHEN model.type = 'text' AND model.value = 'mistral-large'
                            THEN 'mistralai/mistral-large-2512'
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
    WHEN instr(permissions, '"mistral-large"') = 0 THEN 0
    WHEN NOT json_valid(permissions) THEN 0
    WHEN json_type(permissions, '$.models') != 'array' THEN 0
    ELSE EXISTS (
        SELECT 1
        FROM json_each(permissions, '$.models') AS model
        WHERE model.type = 'text' AND model.value = 'mistral-large'
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
                        WHEN model.type = 'text' AND model.value = 'mistral-small-3.2'
                            THEN 'mistralai/mistral-small-3.2-24b-instruct'
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
    WHEN instr(permissions, '"mistral-small-3.2"') = 0 THEN 0
    WHEN NOT json_valid(permissions) THEN 0
    WHEN json_type(permissions, '$.models') != 'array' THEN 0
    ELSE EXISTS (
        SELECT 1
        FROM json_each(permissions, '$.models') AS model
        WHERE model.type = 'text' AND model.value = 'mistral-small-3.2'
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
                        WHEN model.type = 'text' AND model.value = 'muse-glimmer'
                            THEN 'meta/muse-glimmer-30b'
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
    WHEN instr(permissions, '"muse-glimmer"') = 0 THEN 0
    WHEN NOT json_valid(permissions) THEN 0
    WHEN json_type(permissions, '$.models') != 'array' THEN 0
    ELSE EXISTS (
        SELECT 1
        FROM json_each(permissions, '$.models') AS model
        WHERE model.type = 'text' AND model.value = 'muse-glimmer'
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
                        WHEN model.type = 'text' AND model.value = 'muse-spark-1.2'
                            THEN 'meta/muse-spark-1.2'
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
    WHEN instr(permissions, '"muse-spark-1.2"') = 0 THEN 0
    WHEN NOT json_valid(permissions) THEN 0
    WHEN json_type(permissions, '$.models') != 'array' THEN 0
    ELSE EXISTS (
        SELECT 1
        FROM json_each(permissions, '$.models') AS model
        WHERE model.type = 'text' AND model.value = 'muse-spark-1.2'
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
                        WHEN model.type = 'text' AND model.value = 'nanobanana'
                            THEN 'google/gemini-2.5-flash-image'
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
    WHEN instr(permissions, '"nanobanana"') = 0 THEN 0
    WHEN NOT json_valid(permissions) THEN 0
    WHEN json_type(permissions, '$.models') != 'array' THEN 0
    ELSE EXISTS (
        SELECT 1
        FROM json_each(permissions, '$.models') AS model
        WHERE model.type = 'text' AND model.value = 'nanobanana'
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
                        WHEN model.type = 'text' AND model.value = 'nanobanana-2'
                            THEN 'google/gemini-3.1-flash-image'
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
    WHEN instr(permissions, '"nanobanana-2"') = 0 THEN 0
    WHEN NOT json_valid(permissions) THEN 0
    WHEN json_type(permissions, '$.models') != 'array' THEN 0
    ELSE EXISTS (
        SELECT 1
        FROM json_each(permissions, '$.models') AS model
        WHERE model.type = 'text' AND model.value = 'nanobanana-2'
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
                        WHEN model.type = 'text' AND model.value = 'nanobanana-2-lite'
                            THEN 'google/gemini-3.1-flash-lite-image'
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
    WHEN instr(permissions, '"nanobanana-2-lite"') = 0 THEN 0
    WHEN NOT json_valid(permissions) THEN 0
    WHEN json_type(permissions, '$.models') != 'array' THEN 0
    ELSE EXISTS (
        SELECT 1
        FROM json_each(permissions, '$.models') AS model
        WHERE model.type = 'text' AND model.value = 'nanobanana-2-lite'
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
                        WHEN model.type = 'text' AND model.value = 'nanobanana-pro'
                            THEN 'google/gemini-3-pro-image'
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
    WHEN instr(permissions, '"nanobanana-pro"') = 0 THEN 0
    WHEN NOT json_valid(permissions) THEN 0
    WHEN json_type(permissions, '$.models') != 'array' THEN 0
    ELSE EXISTS (
        SELECT 1
        FROM json_each(permissions, '$.models') AS model
        WHERE model.type = 'text' AND model.value = 'nanobanana-pro'
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
                        WHEN model.type = 'text' AND model.value = 'nemotron'
                            THEN 'nvidia/nemotron-3-ultra-550b-a55b'
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
    WHEN instr(permissions, '"nemotron"') = 0 THEN 0
    WHEN NOT json_valid(permissions) THEN 0
    WHEN json_type(permissions, '$.models') != 'array' THEN 0
    ELSE EXISTS (
        SELECT 1
        FROM json_each(permissions, '$.models') AS model
        WHERE model.type = 'text' AND model.value = 'nemotron'
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
                        WHEN model.type = 'text' AND model.value = 'nova'
                            THEN 'amazon/nova-2-lite-v1'
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
    WHEN instr(permissions, '"nova"') = 0 THEN 0
    WHEN NOT json_valid(permissions) THEN 0
    WHEN json_type(permissions, '$.models') != 'array' THEN 0
    ELSE EXISTS (
        SELECT 1
        FROM json_each(permissions, '$.models') AS model
        WHERE model.type = 'text' AND model.value = 'nova'
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
                        WHEN model.type = 'text' AND model.value = 'nova-canvas'
                            THEN 'amazon.nova-canvas-v1:0'
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
    WHEN instr(permissions, '"nova-canvas"') = 0 THEN 0
    WHEN NOT json_valid(permissions) THEN 0
    WHEN json_type(permissions, '$.models') != 'array' THEN 0
    ELSE EXISTS (
        SELECT 1
        FROM json_each(permissions, '$.models') AS model
        WHERE model.type = 'text' AND model.value = 'nova-canvas'
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
                        WHEN model.type = 'text' AND model.value = 'nova-fast'
                            THEN 'amazon/nova-micro-v1'
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
    WHEN instr(permissions, '"nova-fast"') = 0 THEN 0
    WHEN NOT json_valid(permissions) THEN 0
    WHEN json_type(permissions, '$.models') != 'array' THEN 0
    ELSE EXISTS (
        SELECT 1
        FROM json_each(permissions, '$.models') AS model
        WHERE model.type = 'text' AND model.value = 'nova-fast'
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
                        WHEN model.type = 'text' AND model.value = 'nova-reel'
                            THEN 'amazon.nova-reel-v1:1'
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
    WHEN instr(permissions, '"nova-reel"') = 0 THEN 0
    WHEN NOT json_valid(permissions) THEN 0
    WHEN json_type(permissions, '$.models') != 'array' THEN 0
    ELSE EXISTS (
        SELECT 1
        FROM json_each(permissions, '$.models') AS model
        WHERE model.type = 'text' AND model.value = 'nova-reel'
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
                        WHEN model.type = 'text' AND model.value = 'openai'
                            THEN 'openai/gpt-5.4-nano'
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
    WHEN instr(permissions, '"openai"') = 0 THEN 0
    WHEN NOT json_valid(permissions) THEN 0
    WHEN json_type(permissions, '$.models') != 'array' THEN 0
    ELSE EXISTS (
        SELECT 1
        FROM json_each(permissions, '$.models') AS model
        WHERE model.type = 'text' AND model.value = 'openai'
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
                        WHEN model.type = 'text' AND model.value = 'openai-3-large'
                            THEN 'openai/text-embedding-3-large'
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
    WHEN instr(permissions, '"openai-3-large"') = 0 THEN 0
    WHEN NOT json_valid(permissions) THEN 0
    WHEN json_type(permissions, '$.models') != 'array' THEN 0
    ELSE EXISTS (
        SELECT 1
        FROM json_each(permissions, '$.models') AS model
        WHERE model.type = 'text' AND model.value = 'openai-3-large'
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
                        WHEN model.type = 'text' AND model.value = 'openai-3-small'
                            THEN 'openai/text-embedding-3-small'
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
    WHEN instr(permissions, '"openai-3-small"') = 0 THEN 0
    WHEN NOT json_valid(permissions) THEN 0
    WHEN json_type(permissions, '$.models') != 'array' THEN 0
    ELSE EXISTS (
        SELECT 1
        FROM json_each(permissions, '$.models') AS model
        WHERE model.type = 'text' AND model.value = 'openai-3-small'
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
                        WHEN model.type = 'text' AND model.value = 'openai-audio'
                            THEN 'openai/gpt-audio-mini'
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
    WHEN instr(permissions, '"openai-audio"') = 0 THEN 0
    WHEN NOT json_valid(permissions) THEN 0
    WHEN json_type(permissions, '$.models') != 'array' THEN 0
    ELSE EXISTS (
        SELECT 1
        FROM json_each(permissions, '$.models') AS model
        WHERE model.type = 'text' AND model.value = 'openai-audio'
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
                        WHEN model.type = 'text' AND model.value = 'openai-audio-large'
                            THEN 'openai/gpt-audio-1.5'
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
    WHEN instr(permissions, '"openai-audio-large"') = 0 THEN 0
    WHEN NOT json_valid(permissions) THEN 0
    WHEN json_type(permissions, '$.models') != 'array' THEN 0
    ELSE EXISTS (
        SELECT 1
        FROM json_each(permissions, '$.models') AS model
        WHERE model.type = 'text' AND model.value = 'openai-audio-large'
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
                        WHEN model.type = 'text' AND model.value = 'openai-fast'
                            THEN 'openai/gpt-5-nano'
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
    WHEN instr(permissions, '"openai-fast"') = 0 THEN 0
    WHEN NOT json_valid(permissions) THEN 0
    WHEN json_type(permissions, '$.models') != 'array' THEN 0
    ELSE EXISTS (
        SELECT 1
        FROM json_each(permissions, '$.models') AS model
        WHERE model.type = 'text' AND model.value = 'openai-fast'
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
                        WHEN model.type = 'text' AND model.value = 'openai-large'
                            THEN 'openai/gpt-5.5'
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
    WHEN instr(permissions, '"openai-large"') = 0 THEN 0
    WHEN NOT json_valid(permissions) THEN 0
    WHEN json_type(permissions, '$.models') != 'array' THEN 0
    ELSE EXISTS (
        SELECT 1
        FROM json_each(permissions, '$.models') AS model
        WHERE model.type = 'text' AND model.value = 'openai-large'
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
                        WHEN model.type = 'text' AND model.value = 'p-image'
                            THEN 'PrunaAI/p-image'
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
    WHEN instr(permissions, '"p-image"') = 0 THEN 0
    WHEN NOT json_valid(permissions) THEN 0
    WHEN json_type(permissions, '$.models') != 'array' THEN 0
    ELSE EXISTS (
        SELECT 1
        FROM json_each(permissions, '$.models') AS model
        WHERE model.type = 'text' AND model.value = 'p-image'
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
                        WHEN model.type = 'text' AND model.value = 'p-image-edit'
                            THEN 'PrunaAI/p-image-Edit'
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
    WHEN instr(permissions, '"p-image-edit"') = 0 THEN 0
    WHEN NOT json_valid(permissions) THEN 0
    WHEN json_type(permissions, '$.models') != 'array' THEN 0
    ELSE EXISTS (
        SELECT 1
        FROM json_each(permissions, '$.models') AS model
        WHERE model.type = 'text' AND model.value = 'p-image-edit'
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
                        WHEN model.type = 'text' AND model.value = 'p-video'
                            THEN 'prunaai/p-video'
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
    WHEN instr(permissions, '"p-video"') = 0 THEN 0
    WHEN NOT json_valid(permissions) THEN 0
    WHEN json_type(permissions, '$.models') != 'array' THEN 0
    ELSE EXISTS (
        SELECT 1
        FROM json_each(permissions, '$.models') AS model
        WHERE model.type = 'text' AND model.value = 'p-video'
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
                        WHEN model.type = 'text' AND model.value = 'perplexity'
                            THEN 'perplexity/sonar-pro'
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
    WHEN instr(permissions, '"perplexity"') = 0 THEN 0
    WHEN NOT json_valid(permissions) THEN 0
    WHEN json_type(permissions, '$.models') != 'array' THEN 0
    ELSE EXISTS (
        SELECT 1
        FROM json_each(permissions, '$.models') AS model
        WHERE model.type = 'text' AND model.value = 'perplexity'
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
                        WHEN model.type = 'text' AND model.value = 'perplexity-reasoning'
                            THEN 'perplexity/sonar-reasoning-pro'
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
    WHEN instr(permissions, '"perplexity-reasoning"') = 0 THEN 0
    WHEN NOT json_valid(permissions) THEN 0
    WHEN json_type(permissions, '$.models') != 'array' THEN 0
    ELSE EXISTS (
        SELECT 1
        FROM json_each(permissions, '$.models') AS model
        WHERE model.type = 'text' AND model.value = 'perplexity-reasoning'
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
                        WHEN model.type = 'text' AND model.value = 'qwen-coder'
                            THEN 'qwen/qwen3-coder-30b-a3b-instruct'
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
    WHEN instr(permissions, '"qwen-coder"') = 0 THEN 0
    WHEN NOT json_valid(permissions) THEN 0
    WHEN json_type(permissions, '$.models') != 'array' THEN 0
    ELSE EXISTS (
        SELECT 1
        FROM json_each(permissions, '$.models') AS model
        WHERE model.type = 'text' AND model.value = 'qwen-coder'
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
                        WHEN model.type = 'text' AND model.value = 'qwen-coder-large'
                            THEN 'qwen/qwen3-coder-next'
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
    WHEN instr(permissions, '"qwen-coder-large"') = 0 THEN 0
    WHEN NOT json_valid(permissions) THEN 0
    WHEN json_type(permissions, '$.models') != 'array' THEN 0
    ELSE EXISTS (
        SELECT 1
        FROM json_each(permissions, '$.models') AS model
        WHERE model.type = 'text' AND model.value = 'qwen-coder-large'
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
                        WHEN model.type = 'text' AND model.value = 'qwen-image'
                            THEN 'qwen/qwen-image'
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
    WHEN instr(permissions, '"qwen-image"') = 0 THEN 0
    WHEN NOT json_valid(permissions) THEN 0
    WHEN json_type(permissions, '$.models') != 'array' THEN 0
    ELSE EXISTS (
        SELECT 1
        FROM json_each(permissions, '$.models') AS model
        WHERE model.type = 'text' AND model.value = 'qwen-image'
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
                        WHEN model.type = 'text' AND model.value = 'qwen-image-3'
                            THEN 'qwen/qwen-image-3'
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
    WHEN instr(permissions, '"qwen-image-3"') = 0 THEN 0
    WHEN NOT json_valid(permissions) THEN 0
    WHEN json_type(permissions, '$.models') != 'array' THEN 0
    ELSE EXISTS (
        SELECT 1
        FROM json_each(permissions, '$.models') AS model
        WHERE model.type = 'text' AND model.value = 'qwen-image-3'
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
                        WHEN model.type = 'text' AND model.value = 'qwen-large'
                            THEN 'qwen/qwen3.7-plus'
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
    WHEN instr(permissions, '"qwen-large"') = 0 THEN 0
    WHEN NOT json_valid(permissions) THEN 0
    WHEN json_type(permissions, '$.models') != 'array' THEN 0
    ELSE EXISTS (
        SELECT 1
        FROM json_each(permissions, '$.models') AS model
        WHERE model.type = 'text' AND model.value = 'qwen-large'
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
                        WHEN model.type = 'text' AND model.value = 'qwen-safety'
                            THEN 'qwen/qwen3guard-gen-8b'
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
    WHEN instr(permissions, '"qwen-safety"') = 0 THEN 0
    WHEN NOT json_valid(permissions) THEN 0
    WHEN json_type(permissions, '$.models') != 'array' THEN 0
    ELSE EXISTS (
        SELECT 1
        FROM json_each(permissions, '$.models') AS model
        WHERE model.type = 'text' AND model.value = 'qwen-safety'
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
                        WHEN model.type = 'text' AND model.value = 'qwen-tts'
                            THEN 'qwen/qwen3-tts-flash'
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
    WHEN instr(permissions, '"qwen-tts"') = 0 THEN 0
    WHEN NOT json_valid(permissions) THEN 0
    WHEN json_type(permissions, '$.models') != 'array' THEN 0
    ELSE EXISTS (
        SELECT 1
        FROM json_each(permissions, '$.models') AS model
        WHERE model.type = 'text' AND model.value = 'qwen-tts'
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
                        WHEN model.type = 'text' AND model.value = 'qwen-tts-instruct'
                            THEN 'qwen/qwen3-tts-instruct-flash'
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
    WHEN instr(permissions, '"qwen-tts-instruct"') = 0 THEN 0
    WHEN NOT json_valid(permissions) THEN 0
    WHEN json_type(permissions, '$.models') != 'array' THEN 0
    ELSE EXISTS (
        SELECT 1
        FROM json_each(permissions, '$.models') AS model
        WHERE model.type = 'text' AND model.value = 'qwen-tts-instruct'
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
                        WHEN model.type = 'text' AND model.value = 'qwen-vision'
                            THEN 'qwen/qwen3-vl-30b-a3b-instruct'
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
    WHEN instr(permissions, '"qwen-vision"') = 0 THEN 0
    WHEN NOT json_valid(permissions) THEN 0
    WHEN json_type(permissions, '$.models') != 'array' THEN 0
    ELSE EXISTS (
        SELECT 1
        FROM json_each(permissions, '$.models') AS model
        WHERE model.type = 'text' AND model.value = 'qwen-vision'
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
                        WHEN model.type = 'text' AND model.value = 'qwen-vision-pro'
                            THEN 'qwen/qwen3-vl-235b-a22b-thinking'
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
    WHEN instr(permissions, '"qwen-vision-pro"') = 0 THEN 0
    WHEN NOT json_valid(permissions) THEN 0
    WHEN json_type(permissions, '$.models') != 'array' THEN 0
    ELSE EXISTS (
        SELECT 1
        FROM json_each(permissions, '$.models') AS model
        WHERE model.type = 'text' AND model.value = 'qwen-vision-pro'
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
                        WHEN model.type = 'text' AND model.value = 'qwen3-embedding-8b'
                            THEN 'qwen/qwen3-embedding-8b'
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
    WHEN instr(permissions, '"qwen3-embedding-8b"') = 0 THEN 0
    WHEN NOT json_valid(permissions) THEN 0
    WHEN json_type(permissions, '$.models') != 'array' THEN 0
    ELSE EXISTS (
        SELECT 1
        FROM json_each(permissions, '$.models') AS model
        WHERE model.type = 'text' AND model.value = 'qwen3-embedding-8b'
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
                        WHEN model.type = 'text' AND model.value = 'qwen3.7-flash'
                            THEN 'qwen/qwen3.7-flash'
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
    WHEN instr(permissions, '"qwen3.7-flash"') = 0 THEN 0
    WHEN NOT json_valid(permissions) THEN 0
    WHEN json_type(permissions, '$.models') != 'array' THEN 0
    ELSE EXISTS (
        SELECT 1
        FROM json_each(permissions, '$.models') AS model
        WHERE model.type = 'text' AND model.value = 'qwen3.7-flash'
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
                        WHEN model.type = 'text' AND model.value = 'qwen3.7-max'
                            THEN 'qwen/qwen3.7-max'
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
    WHEN instr(permissions, '"qwen3.7-max"') = 0 THEN 0
    WHEN NOT json_valid(permissions) THEN 0
    WHEN json_type(permissions, '$.models') != 'array' THEN 0
    ELSE EXISTS (
        SELECT 1
        FROM json_each(permissions, '$.models') AS model
        WHERE model.type = 'text' AND model.value = 'qwen3.7-max'
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
                        WHEN model.type = 'text' AND model.value = 'qwen3.8-max'
                            THEN 'qwen/qwen3.8-max'
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
    WHEN instr(permissions, '"qwen3.8-max"') = 0 THEN 0
    WHEN NOT json_valid(permissions) THEN 0
    WHEN json_type(permissions, '$.models') != 'array' THEN 0
    ELSE EXISTS (
        SELECT 1
        FROM json_each(permissions, '$.models') AS model
        WHERE model.type = 'text' AND model.value = 'qwen3.8-max'
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
                        WHEN model.type = 'text' AND model.value = 'recraft-v4.1-vector'
                            THEN 'recraft/recraft-v4.1-vector'
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
    WHEN instr(permissions, '"recraft-v4.1-vector"') = 0 THEN 0
    WHEN NOT json_valid(permissions) THEN 0
    WHEN json_type(permissions, '$.models') != 'array' THEN 0
    ELSE EXISTS (
        SELECT 1
        FROM json_each(permissions, '$.models') AS model
        WHERE model.type = 'text' AND model.value = 'recraft-v4.1-vector'
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
                        WHEN model.type = 'text' AND model.value = 'seedance-2.0'
                            THEN 'bytedance/seedance-2.0'
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
    WHEN instr(permissions, '"seedance-2.0"') = 0 THEN 0
    WHEN NOT json_valid(permissions) THEN 0
    WHEN json_type(permissions, '$.models') != 'array' THEN 0
    ELSE EXISTS (
        SELECT 1
        FROM json_each(permissions, '$.models') AS model
        WHERE model.type = 'text' AND model.value = 'seedance-2.0'
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
                        WHEN model.type = 'text' AND model.value = 'seedance-2.0-fast'
                            THEN 'bytedance/seedance-2.0-fast'
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
    WHEN instr(permissions, '"seedance-2.0-fast"') = 0 THEN 0
    WHEN NOT json_valid(permissions) THEN 0
    WHEN json_type(permissions, '$.models') != 'array' THEN 0
    ELSE EXISTS (
        SELECT 1
        FROM json_each(permissions, '$.models') AS model
        WHERE model.type = 'text' AND model.value = 'seedance-2.0-fast'
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
                        WHEN model.type = 'text' AND model.value = 'seedance-2.0-mini'
                            THEN 'bytedance/seedance-2.0-mini'
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
    WHEN instr(permissions, '"seedance-2.0-mini"') = 0 THEN 0
    WHEN NOT json_valid(permissions) THEN 0
    WHEN json_type(permissions, '$.models') != 'array' THEN 0
    ELSE EXISTS (
        SELECT 1
        FROM json_each(permissions, '$.models') AS model
        WHERE model.type = 'text' AND model.value = 'seedance-2.0-mini'
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
                        WHEN model.type = 'text' AND model.value = 'seedance-2.5'
                            THEN 'bytedance/seedance-2.5'
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
    WHEN instr(permissions, '"seedance-2.5"') = 0 THEN 0
    WHEN NOT json_valid(permissions) THEN 0
    WHEN json_type(permissions, '$.models') != 'array' THEN 0
    ELSE EXISTS (
        SELECT 1
        FROM json_each(permissions, '$.models') AS model
        WHERE model.type = 'text' AND model.value = 'seedance-2.5'
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
                        WHEN model.type = 'text' AND model.value = 'seedance-pro'
                            THEN 'bytedance/seedance-1-pro-fast'
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
    WHEN instr(permissions, '"seedance-pro"') = 0 THEN 0
    WHEN NOT json_valid(permissions) THEN 0
    WHEN json_type(permissions, '$.models') != 'array' THEN 0
    ELSE EXISTS (
        SELECT 1
        FROM json_each(permissions, '$.models') AS model
        WHERE model.type = 'text' AND model.value = 'seedance-pro'
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
                        WHEN model.type = 'text' AND model.value = 'seedream'
                            THEN 'bytedance/seedream-4'
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
    WHEN instr(permissions, '"seedream"') = 0 THEN 0
    WHEN NOT json_valid(permissions) THEN 0
    WHEN json_type(permissions, '$.models') != 'array' THEN 0
    ELSE EXISTS (
        SELECT 1
        FROM json_each(permissions, '$.models') AS model
        WHERE model.type = 'text' AND model.value = 'seedream'
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
                        WHEN model.type = 'text' AND model.value = 'seedream-pro'
                            THEN 'bytedance-seed/seedream-4.5'
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
    WHEN instr(permissions, '"seedream-pro"') = 0 THEN 0
    WHEN NOT json_valid(permissions) THEN 0
    WHEN json_type(permissions, '$.models') != 'array' THEN 0
    ELSE EXISTS (
        SELECT 1
        FROM json_each(permissions, '$.models') AS model
        WHERE model.type = 'text' AND model.value = 'seedream-pro'
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
                        WHEN model.type = 'text' AND model.value = 'seedream5'
                            THEN 'bytedance/seedream-5-lite'
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
    WHEN instr(permissions, '"seedream5"') = 0 THEN 0
    WHEN NOT json_valid(permissions) THEN 0
    WHEN json_type(permissions, '$.models') != 'array' THEN 0
    ELSE EXISTS (
        SELECT 1
        FROM json_each(permissions, '$.models') AS model
        WHERE model.type = 'text' AND model.value = 'seedream5'
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
                        WHEN model.type = 'text' AND model.value = 'seedream5-pro'
                            THEN 'bytedance/seedream-5-pro'
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
    WHEN instr(permissions, '"seedream5-pro"') = 0 THEN 0
    WHEN NOT json_valid(permissions) THEN 0
    WHEN json_type(permissions, '$.models') != 'array' THEN 0
    ELSE EXISTS (
        SELECT 1
        FROM json_each(permissions, '$.models') AS model
        WHERE model.type = 'text' AND model.value = 'seedream5-pro'
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
                        WHEN model.type = 'text' AND model.value = 'stable-audio-3-large'
                            THEN 'stable-audio-3'
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
    WHEN instr(permissions, '"stable-audio-3-large"') = 0 THEN 0
    WHEN NOT json_valid(permissions) THEN 0
    WHEN json_type(permissions, '$.models') != 'array' THEN 0
    ELSE EXISTS (
        SELECT 1
        FROM json_each(permissions, '$.models') AS model
        WHERE model.type = 'text' AND model.value = 'stable-audio-3-large'
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
                        WHEN model.type = 'text' AND model.value = 'stable-audio-3-medium'
                            THEN 'fal-ai/stable-audio-3/medium'
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
    WHEN instr(permissions, '"stable-audio-3-medium"') = 0 THEN 0
    WHEN NOT json_valid(permissions) THEN 0
    WHEN json_type(permissions, '$.models') != 'array' THEN 0
    ELSE EXISTS (
        SELECT 1
        FROM json_each(permissions, '$.models') AS model
        WHERE model.type = 'text' AND model.value = 'stable-audio-3-medium'
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
                        WHEN model.type = 'text' AND model.value = 'step-3.5-flash'
                            THEN 'stepfun/step-3.5-flash'
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
    WHEN instr(permissions, '"step-3.5-flash"') = 0 THEN 0
    WHEN NOT json_valid(permissions) THEN 0
    WHEN json_type(permissions, '$.models') != 'array' THEN 0
    ELSE EXISTS (
        SELECT 1
        FROM json_each(permissions, '$.models') AS model
        WHERE model.type = 'text' AND model.value = 'step-3.5-flash'
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
                        WHEN model.type = 'text' AND model.value = 'step-flash'
                            THEN 'stepfun/step-3.7-flash'
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
    WHEN instr(permissions, '"step-flash"') = 0 THEN 0
    WHEN NOT json_valid(permissions) THEN 0
    WHEN json_type(permissions, '$.models') != 'array' THEN 0
    ELSE EXISTS (
        SELECT 1
        FROM json_each(permissions, '$.models') AS model
        WHERE model.type = 'text' AND model.value = 'step-flash'
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
                        WHEN model.type = 'text' AND model.value = 'universal-2'
                            THEN 'assemblyai/universal-2'
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
    WHEN instr(permissions, '"universal-2"') = 0 THEN 0
    WHEN NOT json_valid(permissions) THEN 0
    WHEN json_type(permissions, '$.models') != 'array' THEN 0
    ELSE EXISTS (
        SELECT 1
        FROM json_each(permissions, '$.models') AS model
        WHERE model.type = 'text' AND model.value = 'universal-2'
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
                        WHEN model.type = 'text' AND model.value = 'universal-3.5-pro'
                            THEN 'assemblyai/universal-3.5-pro'
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
    WHEN instr(permissions, '"universal-3.5-pro"') = 0 THEN 0
    WHEN NOT json_valid(permissions) THEN 0
    WHEN json_type(permissions, '$.models') != 'array' THEN 0
    ELSE EXISTS (
        SELECT 1
        FROM json_each(permissions, '$.models') AS model
        WHERE model.type = 'text' AND model.value = 'universal-3.5-pro'
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
                        WHEN model.type = 'text' AND model.value = 'veo'
                            THEN 'google/veo-3.1-fast'
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
    WHEN instr(permissions, '"veo"') = 0 THEN 0
    WHEN NOT json_valid(permissions) THEN 0
    WHEN json_type(permissions, '$.models') != 'array' THEN 0
    ELSE EXISTS (
        SELECT 1
        FROM json_each(permissions, '$.models') AS model
        WHERE model.type = 'text' AND model.value = 'veo'
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
                        WHEN model.type = 'text' AND model.value = 'wan'
                            THEN 'alibaba/wan-2.6'
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
    WHEN instr(permissions, '"wan"') = 0 THEN 0
    WHEN NOT json_valid(permissions) THEN 0
    WHEN json_type(permissions, '$.models') != 'array' THEN 0
    ELSE EXISTS (
        SELECT 1
        FROM json_each(permissions, '$.models') AS model
        WHERE model.type = 'text' AND model.value = 'wan'
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
                        WHEN model.type = 'text' AND model.value = 'wan-fast'
                            THEN 'wan-video/wan-2.2-fast'
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
    WHEN instr(permissions, '"wan-fast"') = 0 THEN 0
    WHEN NOT json_valid(permissions) THEN 0
    WHEN json_type(permissions, '$.models') != 'array' THEN 0
    ELSE EXISTS (
        SELECT 1
        FROM json_each(permissions, '$.models') AS model
        WHERE model.type = 'text' AND model.value = 'wan-fast'
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
                        WHEN model.type = 'text' AND model.value = 'wan-image'
                            THEN 'wan-video/wan-2.7-image'
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
    WHEN instr(permissions, '"wan-image"') = 0 THEN 0
    WHEN NOT json_valid(permissions) THEN 0
    WHEN json_type(permissions, '$.models') != 'array' THEN 0
    ELSE EXISTS (
        SELECT 1
        FROM json_each(permissions, '$.models') AS model
        WHERE model.type = 'text' AND model.value = 'wan-image'
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
                        WHEN model.type = 'text' AND model.value = 'wan-image-pro'
                            THEN 'wan-video/wan-2.7-image-pro'
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
    WHEN instr(permissions, '"wan-image-pro"') = 0 THEN 0
    WHEN NOT json_valid(permissions) THEN 0
    WHEN json_type(permissions, '$.models') != 'array' THEN 0
    ELSE EXISTS (
        SELECT 1
        FROM json_each(permissions, '$.models') AS model
        WHERE model.type = 'text' AND model.value = 'wan-image-pro'
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
                        WHEN model.type = 'text' AND model.value = 'wan-pro'
                            THEN 'alibaba/wan-2.7'
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
    WHEN instr(permissions, '"wan-pro"') = 0 THEN 0
    WHEN NOT json_valid(permissions) THEN 0
    WHEN json_type(permissions, '$.models') != 'array' THEN 0
    ELSE EXISTS (
        SELECT 1
        FROM json_each(permissions, '$.models') AS model
        WHERE model.type = 'text' AND model.value = 'wan-pro'
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
                        WHEN model.type = 'text' AND model.value = 'zimage'
                            THEN 'Tongyi-MAI/Z-Image-Turbo'
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
    WHEN instr(permissions, '"zimage"') = 0 THEN 0
    WHEN NOT json_valid(permissions) THEN 0
    WHEN json_type(permissions, '$.models') != 'array' THEN 0
    ELSE EXISTS (
        SELECT 1
        FROM json_each(permissions, '$.models') AS model
        WHERE model.type = 'text' AND model.value = 'zimage'
    )
END;
