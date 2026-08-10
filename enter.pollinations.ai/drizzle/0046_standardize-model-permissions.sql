-- Canonicalize every known model alias stored in API-key allowlists. Preserve
-- unknown/community IDs, unrelated permission fields, array order, and the
-- first occurrence when aliases and canonical IDs resolve to the same model.
-- The mapping is split into bounded statements to stay below D1's SQL-size
-- limit while avoiding JSON expansion for unaffected API keys.
WITH alias_map(alias, canonical) AS (
    VALUES
        ('gpt-5.4-nano', 'openai/gpt-5.4-nano'),
        ('openai', 'openai/gpt-5.4-nano'),
        ('gpt-5-nano', 'openai/gpt-5-nano'),
        ('gpt-5-nano-2025-08-07', 'openai/gpt-5-nano'),
        ('openai-fast', 'openai/gpt-5-nano'),
        ('gpt-oss-20b', 'openai/gpt-oss-20b'),
        ('ovh-reasoning', 'openai/gpt-oss-20b'),
        ('gpt-oss', 'openai/gpt-oss-20b'),
        ('gpt-5.4-reasoning', 'openai/gpt-5.4'),
        ('gpt-5.2', 'openai/gpt-5.4'),
        ('gpt-5.2-reasoning', 'openai/gpt-5.4'),
        ('gpt-5.4', 'openai/gpt-5.4'),
        ('gpt-5-mini', 'openai/gpt-5.4-mini'),
        ('openai-mini', 'openai/gpt-5.4-mini'),
        ('gpt-5.4-mini', 'openai/gpt-5.4-mini'),
        ('gpt-5.5', 'openai/gpt-5.5'),
        ('gpt-5.5-reasoning', 'openai/gpt-5.5'),
        ('openai-reasoning', 'openai/gpt-5.5'),
        ('openai-large', 'openai/gpt-5.5'),
        ('chatgpt-sol', 'openai/gpt-5.6-sol'),
        ('chatgpt-5.6-sol', 'openai/gpt-5.6-sol'),
        ('gpt-5.6-sol', 'openai/gpt-5.6-sol'),
        ('chatgpt-terra', 'openai/gpt-5.6-terra'),
        ('chatgpt-5.6-terra', 'openai/gpt-5.6-terra'),
        ('gpt-5.6-terra', 'openai/gpt-5.6-terra'),
        ('chatgpt-luna', 'openai/gpt-5.6-luna'),
        ('chatgpt-5.6-luna', 'openai/gpt-5.6-luna'),
        ('gpt-5.6-luna', 'openai/gpt-5.6-luna'),
        ('mercury-2', 'inception/mercury-2'),
        ('inception', 'inception/mercury-2'),
        ('inception-mercury', 'inception/mercury-2'),
        ('mercury', 'inception/mercury-2'),
        ('cohere-command-a-plus', 'command-a-plus-05-2026'),
        ('cohere-command-a-plus-05-2026', 'command-a-plus-05-2026'),
        ('command-a-plus', 'command-a-plus-05-2026'),
        ('qwen3-coder', 'qwen/qwen3-coder-30b-a3b-instruct'),
        ('qwen3-coder-30b-a3b-instruct', 'qwen/qwen3-coder-30b-a3b-instruct'),
        ('qwen-coder', 'qwen/qwen3-coder-30b-a3b-instruct'),
        ('mistral-small-3.1', 'mistralai/mistral-small-3.2-24b-instruct'),
        ('mistral-small-2503', 'mistralai/mistral-small-3.2-24b-instruct'),
        ('mistral-small-3.2-24b-instruct-2506', 'mistralai/mistral-small-3.2-24b-instruct'),
        ('mistral-small-3.2', 'mistralai/mistral-small-3.2-24b-instruct'),
        ('mistral-4', 'mistralai/mistral-small-2603'),
        ('mistral-small', 'mistralai/mistral-small-2603'),
        ('mistral-small-4', 'mistralai/mistral-small-2603'),
        ('mistral-small-2603', 'mistralai/mistral-small-2603'),
        ('mistral', 'mistralai/mistral-small-2603'),
        ('gpt-audio-mini', 'openai/gpt-audio-mini'),
        ('gpt-audio-mini-2025-12-15', 'openai/gpt-audio-mini'),
        ('gpt-4o-mini-audio-preview', 'openai/gpt-audio-mini'),
        ('gpt-4o-mini-audio-preview-2024-12-17', 'openai/gpt-audio-mini'),
        ('openai-audio', 'openai/gpt-audio-mini'),
        ('gpt-audio', 'openai/gpt-audio-1.5'),
        ('gpt-audio-1.5', 'openai/gpt-audio-1.5'),
        ('gpt-audio-2025-12-15', 'openai/gpt-audio-1.5'),
        ('openai-audio-large', 'openai/gpt-audio-1.5'),
        ('gemini-3-flash-preview', 'google/gemini-3-flash-preview'),
        ('gemini-3-flash', 'google/gemini-3-flash-preview'),
        ('gemini-3.6-flash', 'google/gemini-3.6-flash'),
        ('gemini-3.5-flash', 'google/gemini-3.6-flash'),
        ('gemini', 'google/gemini-3.6-flash'),
        ('gemini-flash-lite-3.1', 'google/gemini-3.5-flash-lite'),
        ('gemini-3.1-flash-lite', 'google/gemini-3.5-flash-lite'),
        ('gemini-3.1-flash-lite-preview', 'google/gemini-3.5-flash-lite'),
        ('gemini-flash-lite', 'google/gemini-3.5-flash-lite'),
        ('gemini-3.5-flash-lite', 'google/gemini-3.5-flash-lite'),
        ('gemini-flash-lite-3.5', 'google/gemini-3.5-flash-lite'),
        ('gemini-2.5-flash-lite', 'google/gemini-2.5-flash-lite'),
        ('gemini-fast', 'google/gemini-2.5-flash-lite'),
        ('deepseek-v4', 'deepseek/deepseek-v4-flash-0731'),
        ('deepseek-v4-flash', 'deepseek/deepseek-v4-flash-0731'),
        ('deepseek-v4-lite', 'deepseek/deepseek-v4-flash-0731'),
        ('deepseek-lite', 'deepseek/deepseek-v4-flash-0731'),
        ('deepseek-flash', 'deepseek/deepseek-v4-flash-0731'),
        ('deepseek', 'deepseek/deepseek-v4-flash-0731'),
        ('gemma-4', 'google/gemma-4-26b-a4b-it'),
        ('gemma-4-26b', 'google/gemma-4-26b-a4b-it'),
        ('gemma-4-26b-a4b', 'google/gemma-4-26b-a4b-it'),
        ('gemma-4-26b-a4b-it', 'google/gemma-4-26b-a4b-it'),
        ('gemma', 'google/gemma-4-26b-a4b-it'),
        ('gemma-large', 'google/gemma-4-31b-it'),
        ('gemma-4-31b-it', 'google/gemma-4-31b-it'),
        ('gemma-4-31b', 'google/gemma-4-31b-it'),
        ('deepseek-v4-pro', 'deepseek/deepseek-v4-pro'),
        ('deepseek-pro', 'deepseek/deepseek-v4-pro'),
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
        ('grok-4.3', 'x-ai/grok-4.3'),
        ('grok-4-3', 'x-ai/grok-4.3'),
        ('grok-reasoning', 'x-ai/grok-4.3'),
        ('grok-large', 'x-ai/grok-4.3'),
        ('grok-4-5', 'x-ai/grok-4.5'),
        ('grok-4.5', 'x-ai/grok-4.5'),
        ('gemini-2.5-flash-search', 'gemini-search'),
        ('gemini-2.5-flash-lite-search', 'gemini-search'),
        ('gemini-search-fast', 'gemini-search'),
        ('gemini-3.1-flash-lite-search', 'gemini-search'),
        ('gemini-3.5-flash-lite-search', 'gemini-search'),
        ('gemini-search-large', 'gemini-search'),
        ('gemini-3.6-flash-search', 'gemini-search'),
        ('gemini-3.5-flash-search', 'gemini-search'),
        ('claude-haiku-4.5', 'anthropic/claude-haiku-4.5'),
        ('claude-haiku', 'anthropic/claude-haiku-4.5'),
        ('claude-fast', 'anthropic/claude-haiku-4.5'),
        ('claude-sonnet-4.6', 'anthropic/claude-sonnet-4.6'),
        ('claude-sonnet', 'anthropic/claude-sonnet-4.6'),
        ('claude', 'anthropic/claude-sonnet-4.6'),
        ('sonnet-5', 'anthropic/claude-sonnet-5'),
        ('claude-sonnet-5', 'anthropic/claude-sonnet-5'),
        ('claude-opus-4.5', 'anthropic/claude-opus-4.6'),
        ('claude-opus-4.6', 'anthropic/claude-opus-4.6'),
        ('claude-opus-4.7', 'anthropic/claude-opus-4.7'),
        ('claude-opus-5', 'anthropic/claude-opus-5'),
        ('claude-opus-4.8', 'anthropic/claude-opus-5'),
        ('claude-opus', 'anthropic/claude-opus-5'),
        ('claude-large', 'anthropic/claude-opus-5'),
        ('claude-fable-5', 'anthropic/claude-fable-5'),
        ('sonar', 'perplexity-fast'),
        ('perplexity-high', 'perplexity-fast'),
        ('perplexity-deep', 'perplexity-fast'),
        ('sonar-deep', 'perplexity-fast'),
        ('sonar-pro', 'perplexity/sonar-pro'),
        ('perplexity-pro', 'perplexity/sonar-pro'),
        ('perplexity', 'perplexity/sonar-pro'),
        ('sonar-reasoning', 'perplexity/sonar-reasoning-pro'),
        ('sonar-reasoning-pro', 'perplexity/sonar-reasoning-pro'),
        ('perplexity-reasoning', 'perplexity/sonar-reasoning-pro'),
        ('kimi-k2.6', 'moonshotai/kimi-k2.6'),
        ('kimi-k2p6', 'moonshotai/kimi-k2.6'),
        ('kimi-reasoning', 'moonshotai/kimi-k2.6'),
        ('kimi-large', 'moonshotai/kimi-k2.6'),
        ('kimi-thinking', 'moonshotai/kimi-k2.6'),
        ('kimi', 'moonshotai/kimi-k2.6'),
        ('kimi-k2.7-code', 'moonshotai/kimi-k2.7-code'),
        ('kimi-k2.7', 'moonshotai/kimi-k2.7-code'),
        ('kimi-k2p7', 'moonshotai/kimi-k2.7-code'),
        ('kimi-code', 'moonshotai/kimi-k2.7-code'),
        ('kimi-k3', 'moonshotai/kimi-k3'),
        ('laguna-s-2.1', 'poolside/laguna-s-2.1'),
        ('laguna-s2.1', 'poolside/laguna-s-2.1'),
        ('poolside-laguna-s-2.1', 'poolside/laguna-s-2.1')
),
candidate_keys AS MATERIALIZED (
    SELECT id, permissions
    FROM apikey
    WHERE json_valid(permissions)
      AND json_type(permissions, '$.models') = 'array'
      AND (
          (
              (
                  (
                      (
                          (
                              (
                                  (
                                      (
                                          instr(permissions, '"gpt-5.4-nano"') > 0
                                          OR
                                          instr(permissions, '"openai"') > 0
                                      )
                                      OR
                                      instr(permissions, '"gpt-5-nano"') > 0
                                  )
                                  OR
                                  (
                                      instr(permissions, '"gpt-5-nano-2025-08-07"') > 0
                                      OR
                                      instr(permissions, '"openai-fast"') > 0
                                  )
                              )
                              OR
                              (
                                  (
                                      (
                                          instr(permissions, '"gpt-oss-20b"') > 0
                                          OR
                                          instr(permissions, '"ovh-reasoning"') > 0
                                      )
                                      OR
                                      instr(permissions, '"gpt-oss"') > 0
                                  )
                                  OR
                                  (
                                      instr(permissions, '"gpt-5.4-reasoning"') > 0
                                      OR
                                      instr(permissions, '"gpt-5.2"') > 0
                                  )
                              )
                          )
                          OR
                          (
                              (
                                  (
                                      (
                                          instr(permissions, '"gpt-5.2-reasoning"') > 0
                                          OR
                                          instr(permissions, '"gpt-5.4"') > 0
                                      )
                                      OR
                                      instr(permissions, '"gpt-5-mini"') > 0
                                  )
                                  OR
                                  (
                                      instr(permissions, '"openai-mini"') > 0
                                      OR
                                      instr(permissions, '"gpt-5.4-mini"') > 0
                                  )
                              )
                              OR
                              (
                                  (
                                      instr(permissions, '"gpt-5.5"') > 0
                                      OR
                                      instr(permissions, '"gpt-5.5-reasoning"') > 0
                                  )
                                  OR
                                  (
                                      instr(permissions, '"openai-reasoning"') > 0
                                      OR
                                      instr(permissions, '"openai-large"') > 0
                                  )
                              )
                          )
                      )
                      OR
                      (
                          (
                              (
                                  (
                                      (
                                          instr(permissions, '"chatgpt-sol"') > 0
                                          OR
                                          instr(permissions, '"chatgpt-5.6-sol"') > 0
                                      )
                                      OR
                                      instr(permissions, '"gpt-5.6-sol"') > 0
                                  )
                                  OR
                                  (
                                      instr(permissions, '"chatgpt-terra"') > 0
                                      OR
                                      instr(permissions, '"chatgpt-5.6-terra"') > 0
                                  )
                              )
                              OR
                              (
                                  (
                                      (
                                          instr(permissions, '"gpt-5.6-terra"') > 0
                                          OR
                                          instr(permissions, '"chatgpt-luna"') > 0
                                      )
                                      OR
                                      instr(permissions, '"chatgpt-5.6-luna"') > 0
                                  )
                                  OR
                                  (
                                      instr(permissions, '"gpt-5.6-luna"') > 0
                                      OR
                                      instr(permissions, '"mercury-2"') > 0
                                  )
                              )
                          )
                          OR
                          (
                              (
                                  (
                                      (
                                          instr(permissions, '"inception"') > 0
                                          OR
                                          instr(permissions, '"inception-mercury"') > 0
                                      )
                                      OR
                                      instr(permissions, '"mercury"') > 0
                                  )
                                  OR
                                  (
                                      instr(permissions, '"cohere-command-a-plus"') > 0
                                      OR
                                      instr(permissions, '"cohere-command-a-plus-05-2026"') > 0
                                  )
                              )
                              OR
                              (
                                  (
                                      instr(permissions, '"command-a-plus"') > 0
                                      OR
                                      instr(permissions, '"qwen3-coder"') > 0
                                  )
                                  OR
                                  (
                                      instr(permissions, '"qwen3-coder-30b-a3b-instruct"') > 0
                                      OR
                                      instr(permissions, '"qwen-coder"') > 0
                                  )
                              )
                          )
                      )
                  )
                  OR
                  (
                      (
                          (
                              (
                                  (
                                      (
                                          instr(permissions, '"mistral-small-3.1"') > 0
                                          OR
                                          instr(permissions, '"mistral-small-2503"') > 0
                                      )
                                      OR
                                      instr(permissions, '"mistral-small-3.2-24b-instruct-2506"') > 0
                                  )
                                  OR
                                  (
                                      instr(permissions, '"mistral-small-3.2"') > 0
                                      OR
                                      instr(permissions, '"mistral-4"') > 0
                                  )
                              )
                              OR
                              (
                                  (
                                      (
                                          instr(permissions, '"mistral-small"') > 0
                                          OR
                                          instr(permissions, '"mistral-small-4"') > 0
                                      )
                                      OR
                                      instr(permissions, '"mistral-small-2603"') > 0
                                  )
                                  OR
                                  (
                                      instr(permissions, '"mistral"') > 0
                                      OR
                                      instr(permissions, '"gpt-audio-mini"') > 0
                                  )
                              )
                          )
                          OR
                          (
                              (
                                  (
                                      (
                                          instr(permissions, '"gpt-audio-mini-2025-12-15"') > 0
                                          OR
                                          instr(permissions, '"gpt-4o-mini-audio-preview"') > 0
                                      )
                                      OR
                                      instr(permissions, '"gpt-4o-mini-audio-preview-2024-12-17"') > 0
                                  )
                                  OR
                                  (
                                      instr(permissions, '"openai-audio"') > 0
                                      OR
                                      instr(permissions, '"gpt-audio"') > 0
                                  )
                              )
                              OR
                              (
                                  (
                                      instr(permissions, '"gpt-audio-1.5"') > 0
                                      OR
                                      instr(permissions, '"gpt-audio-2025-12-15"') > 0
                                  )
                                  OR
                                  (
                                      instr(permissions, '"openai-audio-large"') > 0
                                      OR
                                      instr(permissions, '"gemini-3-flash-preview"') > 0
                                  )
                              )
                          )
                      )
                      OR
                      (
                          (
                              (
                                  (
                                      (
                                          instr(permissions, '"gemini-3-flash"') > 0
                                          OR
                                          instr(permissions, '"gemini-3.6-flash"') > 0
                                      )
                                      OR
                                      instr(permissions, '"gemini-3.5-flash"') > 0
                                  )
                                  OR
                                  (
                                      instr(permissions, '"gemini"') > 0
                                      OR
                                      instr(permissions, '"gemini-flash-lite-3.1"') > 0
                                  )
                              )
                              OR
                              (
                                  (
                                      instr(permissions, '"gemini-3.1-flash-lite"') > 0
                                      OR
                                      instr(permissions, '"gemini-3.1-flash-lite-preview"') > 0
                                  )
                                  OR
                                  (
                                      instr(permissions, '"gemini-flash-lite"') > 0
                                      OR
                                      instr(permissions, '"gemini-3.5-flash-lite"') > 0
                                  )
                              )
                          )
                          OR
                          (
                              (
                                  (
                                      (
                                          instr(permissions, '"gemini-flash-lite-3.5"') > 0
                                          OR
                                          instr(permissions, '"gemini-2.5-flash-lite"') > 0
                                      )
                                      OR
                                      instr(permissions, '"gemini-fast"') > 0
                                  )
                                  OR
                                  (
                                      instr(permissions, '"deepseek-v4"') > 0
                                      OR
                                      instr(permissions, '"deepseek-v4-flash"') > 0
                                  )
                              )
                              OR
                              (
                                  (
                                      instr(permissions, '"deepseek-v4-lite"') > 0
                                      OR
                                      instr(permissions, '"deepseek-lite"') > 0
                                  )
                                  OR
                                  (
                                      instr(permissions, '"deepseek-flash"') > 0
                                      OR
                                      instr(permissions, '"deepseek"') > 0
                                  )
                              )
                          )
                      )
                  )
              )
              OR
              (
                  (
                      (
                          (
                              (
                                  (
                                      (
                                          instr(permissions, '"gemma-4"') > 0
                                          OR
                                          instr(permissions, '"gemma-4-26b"') > 0
                                      )
                                      OR
                                      instr(permissions, '"gemma-4-26b-a4b"') > 0
                                  )
                                  OR
                                  (
                                      instr(permissions, '"gemma-4-26b-a4b-it"') > 0
                                      OR
                                      instr(permissions, '"gemma"') > 0
                                  )
                              )
                              OR
                              (
                                  (
                                      (
                                          instr(permissions, '"gemma-large"') > 0
                                          OR
                                          instr(permissions, '"gemma-4-31b-it"') > 0
                                      )
                                      OR
                                      instr(permissions, '"gemma-4-31b"') > 0
                                  )
                                  OR
                                  (
                                      instr(permissions, '"deepseek-v4-pro"') > 0
                                      OR
                                      instr(permissions, '"deepseek-pro"') > 0
                                  )
                              )
                          )
                          OR
                          (
                              (
                                  (
                                      (
                                          instr(permissions, '"grok-fast"') > 0
                                          OR
                                          instr(permissions, '"grok-4-1-fast"') > 0
                                      )
                                      OR
                                      instr(permissions, '"grok-4-1-fast-non-reasoning"') > 0
                                  )
                                  OR
                                  (
                                      instr(permissions, '"grok-legacy"') > 0
                                      OR
                                      instr(permissions, '"grok-4"') > 0
                                  )
                              )
                              OR
                              (
                                  (
                                      instr(permissions, '"grok-4-fast"') > 0
                                      OR
                                      instr(permissions, '"grok-4-20-non-reasoning"') > 0
                                  )
                                  OR
                                  (
                                      instr(permissions, '"grok-non-reasoning"') > 0
                                      OR
                                      instr(permissions, '"grok-4-20-reasoning"') > 0
                                  )
                              )
                          )
                      )
                      OR
                      (
                          (
                              (
                                  (
                                      (
                                          instr(permissions, '"grok-4-20"') > 0
                                          OR
                                          instr(permissions, '"grok-4-1-fast-reasoning"') > 0
                                      )
                                      OR
                                      instr(permissions, '"grok-4.3"') > 0
                                  )
                                  OR
                                  (
                                      instr(permissions, '"grok-4-3"') > 0
                                      OR
                                      instr(permissions, '"grok-reasoning"') > 0
                                  )
                              )
                              OR
                              (
                                  (
                                      (
                                          instr(permissions, '"grok-large"') > 0
                                          OR
                                          instr(permissions, '"grok-4-5"') > 0
                                      )
                                      OR
                                      instr(permissions, '"grok-4.5"') > 0
                                  )
                                  OR
                                  (
                                      instr(permissions, '"gemini-2.5-flash-search"') > 0
                                      OR
                                      instr(permissions, '"gemini-2.5-flash-lite-search"') > 0
                                  )
                              )
                          )
                          OR
                          (
                              (
                                  (
                                      (
                                          instr(permissions, '"gemini-search-fast"') > 0
                                          OR
                                          instr(permissions, '"gemini-3.1-flash-lite-search"') > 0
                                      )
                                      OR
                                      instr(permissions, '"gemini-3.5-flash-lite-search"') > 0
                                  )
                                  OR
                                  (
                                      instr(permissions, '"gemini-search-large"') > 0
                                      OR
                                      instr(permissions, '"gemini-3.6-flash-search"') > 0
                                  )
                              )
                              OR
                              (
                                  (
                                      instr(permissions, '"gemini-3.5-flash-search"') > 0
                                      OR
                                      instr(permissions, '"claude-haiku-4.5"') > 0
                                  )
                                  OR
                                  (
                                      instr(permissions, '"claude-haiku"') > 0
                                      OR
                                      instr(permissions, '"claude-fast"') > 0
                                  )
                              )
                          )
                      )
                  )
                  OR
                  (
                      (
                          (
                              (
                                  (
                                      (
                                          instr(permissions, '"claude-sonnet-4.6"') > 0
                                          OR
                                          instr(permissions, '"claude-sonnet"') > 0
                                      )
                                      OR
                                      instr(permissions, '"claude"') > 0
                                  )
                                  OR
                                  (
                                      instr(permissions, '"sonnet-5"') > 0
                                      OR
                                      instr(permissions, '"claude-sonnet-5"') > 0
                                  )
                              )
                              OR
                              (
                                  (
                                      (
                                          instr(permissions, '"claude-opus-4.5"') > 0
                                          OR
                                          instr(permissions, '"claude-opus-4.6"') > 0
                                      )
                                      OR
                                      instr(permissions, '"claude-opus-4.7"') > 0
                                  )
                                  OR
                                  (
                                      instr(permissions, '"claude-opus-5"') > 0
                                      OR
                                      instr(permissions, '"claude-opus-4.8"') > 0
                                  )
                              )
                          )
                          OR
                          (
                              (
                                  (
                                      (
                                          instr(permissions, '"claude-opus"') > 0
                                          OR
                                          instr(permissions, '"claude-large"') > 0
                                      )
                                      OR
                                      instr(permissions, '"claude-fable-5"') > 0
                                  )
                                  OR
                                  (
                                      instr(permissions, '"sonar"') > 0
                                      OR
                                      instr(permissions, '"perplexity-high"') > 0
                                  )
                              )
                              OR
                              (
                                  (
                                      instr(permissions, '"perplexity-deep"') > 0
                                      OR
                                      instr(permissions, '"sonar-deep"') > 0
                                  )
                                  OR
                                  (
                                      instr(permissions, '"sonar-pro"') > 0
                                      OR
                                      instr(permissions, '"perplexity-pro"') > 0
                                  )
                              )
                          )
                      )
                      OR
                      (
                          (
                              (
                                  (
                                      (
                                          instr(permissions, '"perplexity"') > 0
                                          OR
                                          instr(permissions, '"sonar-reasoning"') > 0
                                      )
                                      OR
                                      instr(permissions, '"sonar-reasoning-pro"') > 0
                                  )
                                  OR
                                  (
                                      instr(permissions, '"perplexity-reasoning"') > 0
                                      OR
                                      instr(permissions, '"kimi-k2.6"') > 0
                                  )
                              )
                              OR
                              (
                                  (
                                      instr(permissions, '"kimi-k2p6"') > 0
                                      OR
                                      instr(permissions, '"kimi-reasoning"') > 0
                                  )
                                  OR
                                  (
                                      instr(permissions, '"kimi-large"') > 0
                                      OR
                                      instr(permissions, '"kimi-thinking"') > 0
                                  )
                              )
                          )
                          OR
                          (
                              (
                                  (
                                      (
                                          instr(permissions, '"kimi"') > 0
                                          OR
                                          instr(permissions, '"kimi-k2.7-code"') > 0
                                      )
                                      OR
                                      instr(permissions, '"kimi-k2.7"') > 0
                                  )
                                  OR
                                  (
                                      instr(permissions, '"kimi-k2p7"') > 0
                                      OR
                                      instr(permissions, '"kimi-code"') > 0
                                  )
                              )
                              OR
                              (
                                  (
                                      instr(permissions, '"kimi-k3"') > 0
                                      OR
                                      instr(permissions, '"laguna-s-2.1"') > 0
                                  )
                                  OR
                                  (
                                      instr(permissions, '"laguna-s2.1"') > 0
                                      OR
                                      instr(permissions, '"poolside-laguna-s-2.1"') > 0
                                  )
                              )
                          )
                      )
                  )
              )
          )
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
    SELECT id, json_group_array(model_id ORDER BY position) AS models
    FROM deduplicated
    GROUP BY id
)
UPDATE apikey
SET permissions = json_set(
    apikey.permissions,
    '$.models',
    json(migrated.models)
)
FROM migrated
WHERE apikey.id = migrated.id
  AND migrated.id IN (SELECT id FROM canonicalized WHERE changed);
--> statement-breakpoint
WITH alias_map(alias, canonical) AS (
    VALUES
        ('laguna', 'poolside/laguna-s-2.1'),
        ('longcat-2.0', 'meituan/longcat-2.0'),
        ('longcat-2', 'meituan/longcat-2.0'),
        ('longcat', 'meituan/longcat-2.0'),
        ('inkling-small', 'thinkingmachines/inkling-small'),
        ('inkling-small-20260730', 'thinkingmachines/inkling-small'),
        ('inkling', 'thinkingmachines/inkling-small'),
        ('nemotron-3-ultra', 'nvidia/nemotron-3-ultra-550b-a55b'),
        ('nvidia-nemotron-3-ultra', 'nvidia/nemotron-3-ultra-550b-a55b'),
        ('nemotron-3-ultra-550b-a55b', 'nvidia/nemotron-3-ultra-550b-a55b'),
        ('nemotron', 'nvidia/nemotron-3-ultra-550b-a55b'),
        ('mimo', 'xiaomi/mimo-v2.5'),
        ('mimo-2.5', 'xiaomi/mimo-v2.5'),
        ('mimo-v2.5', 'xiaomi/mimo-v2.5'),
        ('mimo-pro', 'xiaomi/mimo-v2.5-pro'),
        ('mimo-2.5-pro', 'xiaomi/mimo-v2.5-pro'),
        ('mimo-v2.5-pro', 'xiaomi/mimo-v2.5-pro'),
        ('gemini-3.1-pro', 'google/gemini-3.1-pro-preview'),
        ('gemini-2.5-pro', 'google/gemini-3.1-pro-preview'),
        ('gemini-large', 'google/gemini-3.1-pro-preview'),
        ('amazon-nova-micro', 'amazon/nova-micro-v1'),
        ('nova-micro', 'amazon/nova-micro-v1'),
        ('nova-fast', 'amazon/nova-micro-v1'),
        ('nova-2-lite', 'amazon/nova-2-lite-v1'),
        ('amazon-nova-2-lite', 'amazon/nova-2-lite-v1'),
        ('nova-2', 'amazon/nova-2-lite-v1'),
        ('nova', 'amazon/nova-2-lite-v1'),
        ('glm-5.2', 'z-ai/glm-5.2'),
        ('glm-5p2', 'z-ai/glm-5.2'),
        ('glm', 'z-ai/glm-5.2'),
        ('llama-3.3', 'meta-llama/llama-3.3-70b-instruct'),
        ('llama-3.3-70b', 'meta-llama/llama-3.3-70b-instruct'),
        ('llama-v3p3-70b-instruct', 'meta-llama/llama-3.3-70b-instruct'),
        ('llama', 'meta-llama/llama-3.3-70b-instruct'),
        ('llama-4', 'meta-llama/llama-4-maverick'),
        ('llama-4-maverick', 'meta-llama/llama-4-maverick'),
        ('llama-maverick-17b', 'meta-llama/llama-4-maverick'),
        ('llama-4-maverick-17b-128e-instruct-fp8', 'meta-llama/llama-4-maverick'),
        ('llama-maverick', 'meta-llama/llama-4-maverick'),
        ('llama-4-scout', 'meta-llama/llama-4-scout'),
        ('llama-scout-17b', 'meta-llama/llama-4-scout'),
        ('llama-4-scout-17b-16e-instruct', 'meta-llama/llama-4-scout'),
        ('llama-scout', 'meta-llama/llama-4-scout'),
        ('minimax-m2p7', 'minimax/minimax-m2.7'),
        ('minimax-m2.5', 'minimax/minimax-m2.7'),
        ('minimax-m2p5', 'minimax/minimax-m2.7'),
        ('minimax-m2.7', 'minimax/minimax-m2.7'),
        ('minimax-m3', 'minimax/minimax-m3'),
        ('minimax3', 'minimax/minimax-m3'),
        ('minimax-3', 'minimax/minimax-m3'),
        ('minimax', 'minimax/minimax-m3'),
        ('muse-spark', 'meta/muse-spark-1.1'),
        ('spark', 'meta/muse-spark-1.1'),
        ('spark-1.1', 'meta/muse-spark-1.1'),
        ('muse-spark-1.1', 'meta/muse-spark-1.1'),
        ('mistral-large-3', 'mistralai/mistral-large-2512'),
        ('mistral-large', 'mistralai/mistral-large-2512'),
        ('qwen3-coder-next', 'qwen/qwen3-coder-next'),
        ('qwen-coder-large', 'qwen/qwen3-coder-next'),
        ('qwen3.7', 'qwen/qwen3.7-plus'),
        ('qwen3.7-plus', 'qwen/qwen3.7-plus'),
        ('qwen3p7-plus', 'qwen/qwen3.7-plus'),
        ('qwen3.6', 'qwen/qwen3.7-plus'),
        ('qwen3.6-plus', 'qwen/qwen3.7-plus'),
        ('qwen3p6-plus', 'qwen/qwen3.7-plus'),
        ('qwen-large', 'qwen/qwen3.7-plus'),
        ('qwen-max', 'qwen/qwen3.7-max'),
        ('qwen3p7-max', 'qwen/qwen3.7-max'),
        ('qwen3.7-max', 'qwen/qwen3.7-max'),
        ('qwen3.8-max', 'qwen/qwen3.8-max'),
        ('qwen3.7-flash', 'qwen/qwen3.7-flash'),
        ('qwen3-vl', 'qwen/qwen3-vl-30b-a3b-instruct'),
        ('qwen3-vl-30b-a3b-instruct', 'qwen/qwen3-vl-30b-a3b-instruct'),
        ('qwen3-vl-instruct', 'qwen/qwen3-vl-30b-a3b-instruct'),
        ('qwen3-vl-plus', 'qwen/qwen3-vl-30b-a3b-instruct'),
        ('qwen-vl', 'qwen/qwen3-vl-30b-a3b-instruct'),
        ('qwen-vision', 'qwen/qwen3-vl-30b-a3b-instruct'),
        ('qwen3-vl-pro', 'qwen/qwen3-vl-235b-a22b-thinking'),
        ('qwen3-vl-235b', 'qwen/qwen3-vl-235b-a22b-thinking'),
        ('qwen3-vl-235b-a22b-thinking', 'qwen/qwen3-vl-235b-a22b-thinking'),
        ('qwen-vl-pro', 'qwen/qwen3-vl-235b-a22b-thinking'),
        ('qwen-vision-pro', 'qwen/qwen3-vl-235b-a22b-thinking'),
        ('stepfun-flash', 'stepfun/step-3.7-flash'),
        ('step-3.7-flash', 'stepfun/step-3.7-flash'),
        ('step-flash-3.7', 'stepfun/step-3.7-flash'),
        ('step-flash', 'stepfun/step-3.7-flash'),
        ('stepfun-3.5-flash', 'stepfun/step-3.5-flash'),
        ('step-flash-3.5', 'stepfun/step-3.5-flash'),
        ('step-3.5-flash', 'stepfun/step-3.5-flash'),
        ('qwen3guard-gen-8b', 'qwen/qwen3guard-gen-8b'),
        ('qwen-safety', 'qwen/qwen3guard-gen-8b'),
        ('krea-2', 'krea/krea-2-medium'),
        ('krea', 'krea/krea-2-medium'),
        ('sana', 'dreamshaper'),
        ('kontext', 'black-forest-labs/flux.1-kontext-pro'),
        ('nanobanana', 'google/gemini-2.5-flash-image'),
        ('nanobanana2', 'google/gemini-3.1-flash-image'),
        ('nanobanana-2', 'google/gemini-3.1-flash-image'),
        ('nanobanana2lite', 'google/gemini-3.1-flash-lite-image'),
        ('nanobanana-lite', 'google/gemini-3.1-flash-lite-image'),
        ('nanobanana-2-lite', 'google/gemini-3.1-flash-lite-image'),
        ('nanobanana-pro', 'google/gemini-3-pro-image'),
        ('seedream5', 'bytedance/seedream-5-lite'),
        ('seedream-5-pro', 'bytedance/seedream-5-pro'),
        ('seedream-pro-5', 'bytedance/seedream-5-pro'),
        ('seedream5-pro', 'bytedance/seedream-5-pro'),
        ('seedream', 'bytedance/seedream-4'),
        ('seedream-pro', 'bytedance-seed/seedream-4.5'),
        ('ideogram-v4-turbo', 'ideogram-ai/ideogram-v4-turbo'),
        ('ideogram-v4-balanced', 'ideogram-ai/ideogram-v4-balanced'),
        ('ideogram-v4-quality', 'ideogram-ai/ideogram-v4-quality'),
        ('gpt-image', 'openai/gpt-image-1-mini'),
        ('gpt-image-1-mini', 'openai/gpt-image-1-mini'),
        ('gptimage', 'openai/gpt-image-1-mini'),
        ('gpt-image-1.5', 'openai/gpt-image-1.5'),
        ('gpt-image-large', 'openai/gpt-image-1.5'),
        ('gptimage-large', 'openai/gpt-image-1.5'),
        ('gpt-image-2', 'openai/gpt-image-2'),
        ('flux', 'black-forest-labs/FLUX.1-schnell'),
        ('z-image', 'Tongyi-MAI/Z-Image-Turbo'),
        ('z-image-turbo', 'Tongyi-MAI/Z-Image-Turbo'),
        ('zimage', 'Tongyi-MAI/Z-Image-Turbo'),
        ('veo-3.1-fast', 'google/veo-3.1-fast'),
        ('veo-720p', 'google/veo-3.1-fast'),
        ('video', 'google/veo-3.1-fast'),
        ('veo-1080p', 'google/veo-3.1-fast'),
        ('veo-3.1-fast-1080p', 'google/veo-3.1-fast'),
        ('veo-1080', 'google/veo-3.1-fast'),
        ('veo', 'google/veo-3.1-fast'),
        ('seedance-pro', 'bytedance/seedance-1-pro-fast'),
        ('seedance-2', 'bytedance/seedance-2.0'),
        ('seedance-2.0', 'bytedance/seedance-2.0'),
        ('wan2.6', 'alibaba/wan-2.6'),
        ('wan-i2v', 'alibaba/wan-2.6'),
        ('wan', 'alibaba/wan-2.6'),
        ('wan2.2', 'wan-video/wan-2.2-fast'),
        ('wan-2.2', 'wan-video/wan-2.2-fast'),
        ('wan-fast', 'wan-video/wan-2.2-fast'),
        ('wan2.7', 'alibaba/wan-2.7'),
        ('wan-2.7', 'alibaba/wan-2.7'),
        ('wan-pro-1080p', 'alibaba/wan-2.7'),
        ('wan2.7-1080p', 'alibaba/wan-2.7'),
        ('wan-pro-1080', 'alibaba/wan-2.7'),
        ('wan-pro', 'alibaba/wan-2.7'),
        ('wan2.7-image', 'wan-video/wan-2.7-image'),
        ('wan-img', 'wan-video/wan-2.7-image'),
        ('wan-image', 'wan-video/wan-2.7-image'),
        ('wan2.7-image-pro', 'wan-video/wan-2.7-image-pro'),
        ('wan-img-pro', 'wan-video/wan-2.7-image-pro'),
        ('wan-image-pro', 'wan-video/wan-2.7-image-pro')
),
candidate_keys AS MATERIALIZED (
    SELECT id, permissions
    FROM apikey
    WHERE json_valid(permissions)
      AND json_type(permissions, '$.models') = 'array'
      AND (
          (
              (
                  (
                      (
                          (
                              (
                                  (
                                      (
                                          instr(permissions, '"laguna"') > 0
                                          OR
                                          instr(permissions, '"longcat-2.0"') > 0
                                      )
                                      OR
                                      instr(permissions, '"longcat-2"') > 0
                                  )
                                  OR
                                  (
                                      instr(permissions, '"longcat"') > 0
                                      OR
                                      instr(permissions, '"inkling-small"') > 0
                                  )
                              )
                              OR
                              (
                                  (
                                      (
                                          instr(permissions, '"inkling-small-20260730"') > 0
                                          OR
                                          instr(permissions, '"inkling"') > 0
                                      )
                                      OR
                                      instr(permissions, '"nemotron-3-ultra"') > 0
                                  )
                                  OR
                                  (
                                      instr(permissions, '"nvidia-nemotron-3-ultra"') > 0
                                      OR
                                      instr(permissions, '"nemotron-3-ultra-550b-a55b"') > 0
                                  )
                              )
                          )
                          OR
                          (
                              (
                                  (
                                      (
                                          instr(permissions, '"nemotron"') > 0
                                          OR
                                          instr(permissions, '"mimo"') > 0
                                      )
                                      OR
                                      instr(permissions, '"mimo-2.5"') > 0
                                  )
                                  OR
                                  (
                                      instr(permissions, '"mimo-v2.5"') > 0
                                      OR
                                      instr(permissions, '"mimo-pro"') > 0
                                  )
                              )
                              OR
                              (
                                  (
                                      instr(permissions, '"mimo-2.5-pro"') > 0
                                      OR
                                      instr(permissions, '"mimo-v2.5-pro"') > 0
                                  )
                                  OR
                                  (
                                      instr(permissions, '"gemini-3.1-pro"') > 0
                                      OR
                                      instr(permissions, '"gemini-2.5-pro"') > 0
                                  )
                              )
                          )
                      )
                      OR
                      (
                          (
                              (
                                  (
                                      (
                                          instr(permissions, '"gemini-large"') > 0
                                          OR
                                          instr(permissions, '"amazon-nova-micro"') > 0
                                      )
                                      OR
                                      instr(permissions, '"nova-micro"') > 0
                                  )
                                  OR
                                  (
                                      instr(permissions, '"nova-fast"') > 0
                                      OR
                                      instr(permissions, '"nova-2-lite"') > 0
                                  )
                              )
                              OR
                              (
                                  (
                                      (
                                          instr(permissions, '"amazon-nova-2-lite"') > 0
                                          OR
                                          instr(permissions, '"nova-2"') > 0
                                      )
                                      OR
                                      instr(permissions, '"nova"') > 0
                                  )
                                  OR
                                  (
                                      instr(permissions, '"glm-5.2"') > 0
                                      OR
                                      instr(permissions, '"glm-5p2"') > 0
                                  )
                              )
                          )
                          OR
                          (
                              (
                                  (
                                      (
                                          instr(permissions, '"glm"') > 0
                                          OR
                                          instr(permissions, '"llama-3.3"') > 0
                                      )
                                      OR
                                      instr(permissions, '"llama-3.3-70b"') > 0
                                  )
                                  OR
                                  (
                                      instr(permissions, '"llama-v3p3-70b-instruct"') > 0
                                      OR
                                      instr(permissions, '"llama"') > 0
                                  )
                              )
                              OR
                              (
                                  (
                                      instr(permissions, '"llama-4"') > 0
                                      OR
                                      instr(permissions, '"llama-4-maverick"') > 0
                                  )
                                  OR
                                  (
                                      instr(permissions, '"llama-maverick-17b"') > 0
                                      OR
                                      instr(permissions, '"llama-4-maverick-17b-128e-instruct-fp8"') > 0
                                  )
                              )
                          )
                      )
                  )
                  OR
                  (
                      (
                          (
                              (
                                  (
                                      (
                                          instr(permissions, '"llama-maverick"') > 0
                                          OR
                                          instr(permissions, '"llama-4-scout"') > 0
                                      )
                                      OR
                                      instr(permissions, '"llama-scout-17b"') > 0
                                  )
                                  OR
                                  (
                                      instr(permissions, '"llama-4-scout-17b-16e-instruct"') > 0
                                      OR
                                      instr(permissions, '"llama-scout"') > 0
                                  )
                              )
                              OR
                              (
                                  (
                                      (
                                          instr(permissions, '"minimax-m2p7"') > 0
                                          OR
                                          instr(permissions, '"minimax-m2.5"') > 0
                                      )
                                      OR
                                      instr(permissions, '"minimax-m2p5"') > 0
                                  )
                                  OR
                                  (
                                      instr(permissions, '"minimax-m2.7"') > 0
                                      OR
                                      instr(permissions, '"minimax-m3"') > 0
                                  )
                              )
                          )
                          OR
                          (
                              (
                                  (
                                      (
                                          instr(permissions, '"minimax3"') > 0
                                          OR
                                          instr(permissions, '"minimax-3"') > 0
                                      )
                                      OR
                                      instr(permissions, '"minimax"') > 0
                                  )
                                  OR
                                  (
                                      instr(permissions, '"muse-spark"') > 0
                                      OR
                                      instr(permissions, '"spark"') > 0
                                  )
                              )
                              OR
                              (
                                  (
                                      instr(permissions, '"spark-1.1"') > 0
                                      OR
                                      instr(permissions, '"muse-spark-1.1"') > 0
                                  )
                                  OR
                                  (
                                      instr(permissions, '"mistral-large-3"') > 0
                                      OR
                                      instr(permissions, '"mistral-large"') > 0
                                  )
                              )
                          )
                      )
                      OR
                      (
                          (
                              (
                                  (
                                      (
                                          instr(permissions, '"qwen3-coder-next"') > 0
                                          OR
                                          instr(permissions, '"qwen-coder-large"') > 0
                                      )
                                      OR
                                      instr(permissions, '"qwen3.7"') > 0
                                  )
                                  OR
                                  (
                                      instr(permissions, '"qwen3.7-plus"') > 0
                                      OR
                                      instr(permissions, '"qwen3p7-plus"') > 0
                                  )
                              )
                              OR
                              (
                                  (
                                      instr(permissions, '"qwen3.6"') > 0
                                      OR
                                      instr(permissions, '"qwen3.6-plus"') > 0
                                  )
                                  OR
                                  (
                                      instr(permissions, '"qwen3p6-plus"') > 0
                                      OR
                                      instr(permissions, '"qwen-large"') > 0
                                  )
                              )
                          )
                          OR
                          (
                              (
                                  (
                                      (
                                          instr(permissions, '"qwen-max"') > 0
                                          OR
                                          instr(permissions, '"qwen3p7-max"') > 0
                                      )
                                      OR
                                      instr(permissions, '"qwen3.7-max"') > 0
                                  )
                                  OR
                                  (
                                      instr(permissions, '"qwen3.8-max"') > 0
                                      OR
                                      instr(permissions, '"qwen3.7-flash"') > 0
                                  )
                              )
                              OR
                              (
                                  (
                                      instr(permissions, '"qwen3-vl"') > 0
                                      OR
                                      instr(permissions, '"qwen3-vl-30b-a3b-instruct"') > 0
                                  )
                                  OR
                                  (
                                      instr(permissions, '"qwen3-vl-instruct"') > 0
                                      OR
                                      instr(permissions, '"qwen3-vl-plus"') > 0
                                  )
                              )
                          )
                      )
                  )
              )
              OR
              (
                  (
                      (
                          (
                              (
                                  (
                                      (
                                          instr(permissions, '"qwen-vl"') > 0
                                          OR
                                          instr(permissions, '"qwen-vision"') > 0
                                      )
                                      OR
                                      instr(permissions, '"qwen3-vl-pro"') > 0
                                  )
                                  OR
                                  (
                                      instr(permissions, '"qwen3-vl-235b"') > 0
                                      OR
                                      instr(permissions, '"qwen3-vl-235b-a22b-thinking"') > 0
                                  )
                              )
                              OR
                              (
                                  (
                                      (
                                          instr(permissions, '"qwen-vl-pro"') > 0
                                          OR
                                          instr(permissions, '"qwen-vision-pro"') > 0
                                      )
                                      OR
                                      instr(permissions, '"stepfun-flash"') > 0
                                  )
                                  OR
                                  (
                                      instr(permissions, '"step-3.7-flash"') > 0
                                      OR
                                      instr(permissions, '"step-flash-3.7"') > 0
                                  )
                              )
                          )
                          OR
                          (
                              (
                                  (
                                      (
                                          instr(permissions, '"step-flash"') > 0
                                          OR
                                          instr(permissions, '"stepfun-3.5-flash"') > 0
                                      )
                                      OR
                                      instr(permissions, '"step-flash-3.5"') > 0
                                  )
                                  OR
                                  (
                                      instr(permissions, '"step-3.5-flash"') > 0
                                      OR
                                      instr(permissions, '"qwen3guard-gen-8b"') > 0
                                  )
                              )
                              OR
                              (
                                  (
                                      instr(permissions, '"qwen-safety"') > 0
                                      OR
                                      instr(permissions, '"krea-2"') > 0
                                  )
                                  OR
                                  (
                                      instr(permissions, '"krea"') > 0
                                      OR
                                      instr(permissions, '"sana"') > 0
                                  )
                              )
                          )
                      )
                      OR
                      (
                          (
                              (
                                  (
                                      (
                                          instr(permissions, '"kontext"') > 0
                                          OR
                                          instr(permissions, '"nanobanana"') > 0
                                      )
                                      OR
                                      instr(permissions, '"nanobanana2"') > 0
                                  )
                                  OR
                                  (
                                      instr(permissions, '"nanobanana-2"') > 0
                                      OR
                                      instr(permissions, '"nanobanana2lite"') > 0
                                  )
                              )
                              OR
                              (
                                  (
                                      (
                                          instr(permissions, '"nanobanana-lite"') > 0
                                          OR
                                          instr(permissions, '"nanobanana-2-lite"') > 0
                                      )
                                      OR
                                      instr(permissions, '"nanobanana-pro"') > 0
                                  )
                                  OR
                                  (
                                      instr(permissions, '"seedream5"') > 0
                                      OR
                                      instr(permissions, '"seedream-5-pro"') > 0
                                  )
                              )
                          )
                          OR
                          (
                              (
                                  (
                                      (
                                          instr(permissions, '"seedream-pro-5"') > 0
                                          OR
                                          instr(permissions, '"seedream5-pro"') > 0
                                      )
                                      OR
                                      instr(permissions, '"seedream"') > 0
                                  )
                                  OR
                                  (
                                      instr(permissions, '"seedream-pro"') > 0
                                      OR
                                      instr(permissions, '"ideogram-v4-turbo"') > 0
                                  )
                              )
                              OR
                              (
                                  (
                                      instr(permissions, '"ideogram-v4-balanced"') > 0
                                      OR
                                      instr(permissions, '"ideogram-v4-quality"') > 0
                                  )
                                  OR
                                  (
                                      instr(permissions, '"gpt-image"') > 0
                                      OR
                                      instr(permissions, '"gpt-image-1-mini"') > 0
                                  )
                              )
                          )
                      )
                  )
                  OR
                  (
                      (
                          (
                              (
                                  (
                                      (
                                          instr(permissions, '"gptimage"') > 0
                                          OR
                                          instr(permissions, '"gpt-image-1.5"') > 0
                                      )
                                      OR
                                      instr(permissions, '"gpt-image-large"') > 0
                                  )
                                  OR
                                  (
                                      instr(permissions, '"gptimage-large"') > 0
                                      OR
                                      instr(permissions, '"gpt-image-2"') > 0
                                  )
                              )
                              OR
                              (
                                  (
                                      (
                                          instr(permissions, '"flux"') > 0
                                          OR
                                          instr(permissions, '"z-image"') > 0
                                      )
                                      OR
                                      instr(permissions, '"z-image-turbo"') > 0
                                  )
                                  OR
                                  (
                                      instr(permissions, '"zimage"') > 0
                                      OR
                                      instr(permissions, '"veo-3.1-fast"') > 0
                                  )
                              )
                          )
                          OR
                          (
                              (
                                  (
                                      (
                                          instr(permissions, '"veo-720p"') > 0
                                          OR
                                          instr(permissions, '"video"') > 0
                                      )
                                      OR
                                      instr(permissions, '"veo-1080p"') > 0
                                  )
                                  OR
                                  (
                                      instr(permissions, '"veo-3.1-fast-1080p"') > 0
                                      OR
                                      instr(permissions, '"veo-1080"') > 0
                                  )
                              )
                              OR
                              (
                                  (
                                      instr(permissions, '"veo"') > 0
                                      OR
                                      instr(permissions, '"seedance-pro"') > 0
                                  )
                                  OR
                                  (
                                      instr(permissions, '"seedance-2"') > 0
                                      OR
                                      instr(permissions, '"seedance-2.0"') > 0
                                  )
                              )
                          )
                      )
                      OR
                      (
                          (
                              (
                                  (
                                      (
                                          instr(permissions, '"wan2.6"') > 0
                                          OR
                                          instr(permissions, '"wan-i2v"') > 0
                                      )
                                      OR
                                      instr(permissions, '"wan"') > 0
                                  )
                                  OR
                                  (
                                      instr(permissions, '"wan2.2"') > 0
                                      OR
                                      instr(permissions, '"wan-2.2"') > 0
                                  )
                              )
                              OR
                              (
                                  (
                                      instr(permissions, '"wan-fast"') > 0
                                      OR
                                      instr(permissions, '"wan2.7"') > 0
                                  )
                                  OR
                                  (
                                      instr(permissions, '"wan-2.7"') > 0
                                      OR
                                      instr(permissions, '"wan-pro-1080p"') > 0
                                  )
                              )
                          )
                          OR
                          (
                              (
                                  (
                                      (
                                          instr(permissions, '"wan2.7-1080p"') > 0
                                          OR
                                          instr(permissions, '"wan-pro-1080"') > 0
                                      )
                                      OR
                                      instr(permissions, '"wan-pro"') > 0
                                  )
                                  OR
                                  (
                                      instr(permissions, '"wan2.7-image"') > 0
                                      OR
                                      instr(permissions, '"wan-img"') > 0
                                  )
                              )
                              OR
                              (
                                  (
                                      instr(permissions, '"wan-image"') > 0
                                      OR
                                      instr(permissions, '"wan2.7-image-pro"') > 0
                                  )
                                  OR
                                  (
                                      instr(permissions, '"wan-img-pro"') > 0
                                      OR
                                      instr(permissions, '"wan-image-pro"') > 0
                                  )
                              )
                          )
                      )
                  )
              )
          )
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
    SELECT id, json_group_array(model_id ORDER BY position) AS models
    FROM deduplicated
    GROUP BY id
)
UPDATE apikey
SET permissions = json_set(
    apikey.permissions,
    '$.models',
    json(migrated.models)
)
FROM migrated
WHERE apikey.id = migrated.id
  AND migrated.id IN (SELECT id FROM canonicalized WHERE changed);
--> statement-breakpoint
WITH alias_map(alias, canonical) AS (
    VALUES
        ('qwen-image-plus', 'qwen/qwen-image'),
        ('qwen-image-2512', 'qwen/qwen-image'),
        ('qwen-image-edit', 'qwen/qwen-image'),
        ('qwen-image-edit-plus', 'qwen/qwen-image'),
        ('qwen-image', 'qwen/qwen-image'),
        ('grok-imagine-image', 'x-ai/grok-imagine-image'),
        ('grok-imagine', 'x-ai/grok-imagine-image'),
        ('grok-aurora', 'x-ai/grok-imagine-image-quality'),
        ('aurora', 'x-ai/grok-imagine-image-quality'),
        ('grok-imagine-image-quality', 'x-ai/grok-imagine-image-quality'),
        ('grok-imagine-image-pro', 'x-ai/grok-imagine-image-quality'),
        ('grok-imagine-pro', 'x-ai/grok-imagine-image-quality'),
        ('recraft-vector', 'recraft/recraft-v4.1-vector'),
        ('recraft-svg', 'recraft/recraft-v4.1-vector'),
        ('recraft-v4.1-svg', 'recraft/recraft-v4.1-vector'),
        ('recraft-v4.1-vector', 'recraft/recraft-v4.1-vector'),
        ('grok-imagine-video', 'x-ai/grok-imagine-video'),
        ('grok-video-pro', 'x-ai/grok-imagine-video'),
        ('grok-imagine-video-1.5', 'x-ai/grok-imagine-video-1.5'),
        ('happyhorse', 'alibaba/happyhorse-1.1'),
        ('happy-horse-1.1', 'alibaba/happyhorse-1.1'),
        ('happyhorse-1.1', 'alibaba/happyhorse-1.1'),
        ('flux-klein', 'black-forest-labs/flux.2-klein-4b'),
        ('klein', 'black-forest-labs/flux.2-klein-4b'),
        ('pruna-image', 'PrunaAI/p-image'),
        ('pruna', 'PrunaAI/p-image'),
        ('p-image', 'PrunaAI/p-image'),
        ('pruna-edit', 'PrunaAI/p-image-Edit'),
        ('pruna-image-edit', 'PrunaAI/p-image-Edit'),
        ('p-image-edit', 'PrunaAI/p-image-Edit'),
        ('pruna-video', 'prunaai/p-video'),
        ('p-video-720p', 'prunaai/p-video'),
        ('p-video-1080p', 'prunaai/p-video'),
        ('pruna-video-1080p', 'prunaai/p-video'),
        ('p-video', 'prunaai/p-video'),
        ('amazon-nova-canvas', 'amazon.nova-canvas-v1:0'),
        ('nova-canvas', 'amazon.nova-canvas-v1:0'),
        ('amazon-nova-reel', 'amazon.nova-reel-v1:1'),
        ('nova-reel', 'amazon.nova-reel-v1:1'),
        ('tts', 'elevenlabs/eleven-v3'),
        ('text-to-speech', 'elevenlabs/eleven-v3'),
        ('eleven', 'elevenlabs/eleven-v3'),
        ('tts-1', 'elevenlabs/eleven-v3'),
        ('tts-1-hd', 'elevenlabs/eleven-v3'),
        ('elevenlabs', 'elevenlabs/eleven-v3'),
        ('tts-flash', 'elevenlabs/eleven-flash-v2.5'),
        ('eleven-flash', 'elevenlabs/eleven-flash-v2.5'),
        ('flash', 'elevenlabs/eleven-flash-v2.5'),
        ('elevenflash', 'elevenlabs/eleven-flash-v2.5'),
        ('multilingual-v2', 'elevenlabs/eleven-multilingual-v2'),
        ('eleven-v2', 'elevenlabs/eleven-multilingual-v2'),
        ('tts-multilingual', 'elevenlabs/eleven-multilingual-v2'),
        ('eleven-multilingual-v2', 'elevenlabs/eleven-multilingual-v2'),
        ('dialogue', 'eleven-dialogue'),
        ('text-to-dialogue', 'eleven-dialogue'),
        ('voice-changer', 'eleven-voice-changer'),
        ('speech-to-speech', 'eleven-voice-changer'),
        ('voice-isolator', 'eleven-voice-isolator'),
        ('audio-cleanup', 'eleven-voice-isolator'),
        ('music', 'elevenlabs/music-v2'),
        ('elevenmusic', 'elevenlabs/music-v2'),
        ('lyria', 'google/lyria-3-clip-preview'),
        ('lyria-3', 'google/lyria-3-clip-preview'),
        ('lyria-3-clip', 'google/lyria-3-clip-preview'),
        ('sfx', 'elevenlabs/eleven-text-to-sound-v2'),
        ('sound-effects', 'elevenlabs/eleven-text-to-sound-v2'),
        ('eleven-sound-effects', 'elevenlabs/eleven-text-to-sound-v2'),
        ('eleven-sfx', 'elevenlabs/eleven-text-to-sound-v2'),
        ('whisper-1', 'openai/whisper-large-v3'),
        ('whisper-large-v3', 'openai/whisper-large-v3'),
        ('whisper', 'openai/whisper-large-v3'),
        ('scribe_v2', 'elevenlabs/scribe-v2'),
        ('scribe-v2', 'elevenlabs/scribe-v2'),
        ('scribe', 'elevenlabs/scribe-v2'),
        ('assemblyai-universal-2', 'assemblyai/universal-2'),
        ('assemblyai-u2', 'assemblyai/universal-2'),
        ('universal-2', 'assemblyai/universal-2'),
        ('universal-3-pro', 'assemblyai/universal-3.5-pro'),
        ('universal-3-5-pro', 'assemblyai/universal-3.5-pro'),
        ('assemblyai-universal-3.5-pro', 'assemblyai/universal-3.5-pro'),
        ('assemblyai-universal-3-5-pro', 'assemblyai/universal-3.5-pro'),
        ('assemblyai-u3.5-pro', 'assemblyai/universal-3.5-pro'),
        ('assemblyai-universal-3-pro', 'assemblyai/universal-3.5-pro'),
        ('assemblyai-u3-pro', 'assemblyai/universal-3.5-pro'),
        ('assemblyai-pro', 'assemblyai/universal-3.5-pro'),
        ('universal-3.5-pro', 'assemblyai/universal-3.5-pro'),
        ('stable-audio', 'fal-ai/stable-audio-3/medium'),
        ('stability-audio', 'fal-ai/stable-audio-3/medium'),
        ('stable-audio-2.5', 'fal-ai/stable-audio-3/medium'),
        ('stable-audio-3-medium', 'fal-ai/stable-audio-3/medium'),
        ('stable-audio-large', 'stable-audio-3'),
        ('stable-audio-3-large', 'stable-audio-3'),
        ('qwen3-tts', 'qwen/qwen3-tts-flash'),
        ('qwen3-tts-flash', 'qwen/qwen3-tts-flash'),
        ('qwen-tts', 'qwen/qwen3-tts-flash'),
        ('qwen3-tts-instruct', 'qwen/qwen3-tts-instruct-flash'),
        ('qwen3-tts-instruct-flash', 'qwen/qwen3-tts-instruct-flash'),
        ('qwen-tts-instruct', 'qwen/qwen3-tts-instruct-flash'),
        ('csm', 'sesame/csm-1b'),
        ('sesame-csm', 'sesame/csm-1b'),
        ('sesame-csm-1b', 'sesame/csm-1b'),
        ('csm-1b', 'sesame/csm-1b'),
        ('kokoro-82m', 'hexgrad/kokoro-82m'),
        ('kokoro-tts', 'hexgrad/kokoro-82m'),
        ('hexgrad-kokoro-82m', 'hexgrad/kokoro-82m'),
        ('kokoro', 'hexgrad/kokoro-82m'),
        ('embedding', 'google/gemini-embedding-2'),
        ('gemini-2', 'google/gemini-embedding-2'),
        ('embedding-small', 'openai/text-embedding-3-small'),
        ('openai-3-small', 'openai/text-embedding-3-small'),
        ('embedding-large', 'openai/text-embedding-3-large'),
        ('openai-3-large', 'openai/text-embedding-3-large'),
        ('embed-v-4-0', 'embed-v4.0'),
        ('cohere-embed-v-4-0', 'embed-v4.0'),
        ('cohere-embed-v4', 'embed-v4.0'),
        ('qwen3-embedding', 'qwen/qwen3-embedding-8b'),
        ('qwen3-embedding-8b', 'qwen/qwen3-embedding-8b'),
        ('gpt-realtime-2.1', 'openai/gpt-realtime-2.1'),
        ('gpt-realtime-2.1-mini', 'openai/gpt-realtime-2.1-mini'),
        ('gpt-realtime-2', 'openai/gpt-realtime-2'),
        ('trellis-2-low', 'trellis-2'),
        ('trellis-2-medium', 'trellis-2'),
        ('trellis-2-high', 'trellis-2'),
        ('rodin', 'hyper3d-rodin')
),
candidate_keys AS MATERIALIZED (
    SELECT id, permissions
    FROM apikey
    WHERE json_valid(permissions)
      AND json_type(permissions, '$.models') = 'array'
      AND (
          (
              (
                  (
                      (
                          (
                              (
                                  (
                                      instr(permissions, '"qwen-image-plus"') > 0
                                      OR
                                      instr(permissions, '"qwen-image-2512"') > 0
                                  )
                                  OR
                                  (
                                      instr(permissions, '"qwen-image-edit"') > 0
                                      OR
                                      instr(permissions, '"qwen-image-edit-plus"') > 0
                                  )
                              )
                              OR
                              (
                                  (
                                      instr(permissions, '"qwen-image"') > 0
                                      OR
                                      instr(permissions, '"grok-imagine-image"') > 0
                                  )
                                  OR
                                  (
                                      instr(permissions, '"grok-imagine"') > 0
                                      OR
                                      instr(permissions, '"grok-aurora"') > 0
                                  )
                              )
                          )
                          OR
                          (
                              (
                                  (
                                      instr(permissions, '"aurora"') > 0
                                      OR
                                      instr(permissions, '"grok-imagine-image-quality"') > 0
                                  )
                                  OR
                                  (
                                      instr(permissions, '"grok-imagine-image-pro"') > 0
                                      OR
                                      instr(permissions, '"grok-imagine-pro"') > 0
                                  )
                              )
                              OR
                              (
                                  (
                                      instr(permissions, '"recraft-vector"') > 0
                                      OR
                                      instr(permissions, '"recraft-svg"') > 0
                                  )
                                  OR
                                  (
                                      instr(permissions, '"recraft-v4.1-svg"') > 0
                                      OR
                                      instr(permissions, '"recraft-v4.1-vector"') > 0
                                  )
                              )
                          )
                      )
                      OR
                      (
                          (
                              (
                                  (
                                      instr(permissions, '"grok-imagine-video"') > 0
                                      OR
                                      instr(permissions, '"grok-video-pro"') > 0
                                  )
                                  OR
                                  (
                                      instr(permissions, '"grok-imagine-video-1.5"') > 0
                                      OR
                                      instr(permissions, '"happyhorse"') > 0
                                  )
                              )
                              OR
                              (
                                  (
                                      instr(permissions, '"happy-horse-1.1"') > 0
                                      OR
                                      instr(permissions, '"happyhorse-1.1"') > 0
                                  )
                                  OR
                                  (
                                      instr(permissions, '"flux-klein"') > 0
                                      OR
                                      instr(permissions, '"klein"') > 0
                                  )
                              )
                          )
                          OR
                          (
                              (
                                  (
                                      instr(permissions, '"pruna-image"') > 0
                                      OR
                                      instr(permissions, '"pruna"') > 0
                                  )
                                  OR
                                  (
                                      instr(permissions, '"p-image"') > 0
                                      OR
                                      instr(permissions, '"pruna-edit"') > 0
                                  )
                              )
                              OR
                              (
                                  (
                                      instr(permissions, '"pruna-image-edit"') > 0
                                      OR
                                      instr(permissions, '"p-image-edit"') > 0
                                  )
                                  OR
                                  instr(permissions, '"pruna-video"') > 0
                              )
                          )
                      )
                  )
                  OR
                  (
                      (
                          (
                              (
                                  (
                                      instr(permissions, '"p-video-720p"') > 0
                                      OR
                                      instr(permissions, '"p-video-1080p"') > 0
                                  )
                                  OR
                                  (
                                      instr(permissions, '"pruna-video-1080p"') > 0
                                      OR
                                      instr(permissions, '"p-video"') > 0
                                  )
                              )
                              OR
                              (
                                  (
                                      instr(permissions, '"amazon-nova-canvas"') > 0
                                      OR
                                      instr(permissions, '"nova-canvas"') > 0
                                  )
                                  OR
                                  (
                                      instr(permissions, '"amazon-nova-reel"') > 0
                                      OR
                                      instr(permissions, '"nova-reel"') > 0
                                  )
                              )
                          )
                          OR
                          (
                              (
                                  (
                                      instr(permissions, '"tts"') > 0
                                      OR
                                      instr(permissions, '"text-to-speech"') > 0
                                  )
                                  OR
                                  (
                                      instr(permissions, '"eleven"') > 0
                                      OR
                                      instr(permissions, '"tts-1"') > 0
                                  )
                              )
                              OR
                              (
                                  (
                                      instr(permissions, '"tts-1-hd"') > 0
                                      OR
                                      instr(permissions, '"elevenlabs"') > 0
                                  )
                                  OR
                                  (
                                      instr(permissions, '"tts-flash"') > 0
                                      OR
                                      instr(permissions, '"eleven-flash"') > 0
                                  )
                              )
                          )
                      )
                      OR
                      (
                          (
                              (
                                  (
                                      instr(permissions, '"flash"') > 0
                                      OR
                                      instr(permissions, '"elevenflash"') > 0
                                  )
                                  OR
                                  (
                                      instr(permissions, '"multilingual-v2"') > 0
                                      OR
                                      instr(permissions, '"eleven-v2"') > 0
                                  )
                              )
                              OR
                              (
                                  (
                                      instr(permissions, '"tts-multilingual"') > 0
                                      OR
                                      instr(permissions, '"eleven-multilingual-v2"') > 0
                                  )
                                  OR
                                  (
                                      instr(permissions, '"dialogue"') > 0
                                      OR
                                      instr(permissions, '"text-to-dialogue"') > 0
                                  )
                              )
                          )
                          OR
                          (
                              (
                                  (
                                      instr(permissions, '"voice-changer"') > 0
                                      OR
                                      instr(permissions, '"speech-to-speech"') > 0
                                  )
                                  OR
                                  (
                                      instr(permissions, '"voice-isolator"') > 0
                                      OR
                                      instr(permissions, '"audio-cleanup"') > 0
                                  )
                              )
                              OR
                              (
                                  (
                                      instr(permissions, '"music"') > 0
                                      OR
                                      instr(permissions, '"elevenmusic"') > 0
                                  )
                                  OR
                                  instr(permissions, '"lyria"') > 0
                              )
                          )
                      )
                  )
              )
              OR
              (
                  (
                      (
                          (
                              (
                                  (
                                      instr(permissions, '"lyria-3"') > 0
                                      OR
                                      instr(permissions, '"lyria-3-clip"') > 0
                                  )
                                  OR
                                  (
                                      instr(permissions, '"sfx"') > 0
                                      OR
                                      instr(permissions, '"sound-effects"') > 0
                                  )
                              )
                              OR
                              (
                                  (
                                      instr(permissions, '"eleven-sound-effects"') > 0
                                      OR
                                      instr(permissions, '"eleven-sfx"') > 0
                                  )
                                  OR
                                  (
                                      instr(permissions, '"whisper-1"') > 0
                                      OR
                                      instr(permissions, '"whisper-large-v3"') > 0
                                  )
                              )
                          )
                          OR
                          (
                              (
                                  (
                                      instr(permissions, '"whisper"') > 0
                                      OR
                                      instr(permissions, '"scribe_v2"') > 0
                                  )
                                  OR
                                  (
                                      instr(permissions, '"scribe-v2"') > 0
                                      OR
                                      instr(permissions, '"scribe"') > 0
                                  )
                              )
                              OR
                              (
                                  (
                                      instr(permissions, '"assemblyai-universal-2"') > 0
                                      OR
                                      instr(permissions, '"assemblyai-u2"') > 0
                                  )
                                  OR
                                  (
                                      instr(permissions, '"universal-2"') > 0
                                      OR
                                      instr(permissions, '"universal-3-pro"') > 0
                                  )
                              )
                          )
                      )
                      OR
                      (
                          (
                              (
                                  (
                                      instr(permissions, '"universal-3-5-pro"') > 0
                                      OR
                                      instr(permissions, '"assemblyai-universal-3.5-pro"') > 0
                                  )
                                  OR
                                  (
                                      instr(permissions, '"assemblyai-universal-3-5-pro"') > 0
                                      OR
                                      instr(permissions, '"assemblyai-u3.5-pro"') > 0
                                  )
                              )
                              OR
                              (
                                  (
                                      instr(permissions, '"assemblyai-universal-3-pro"') > 0
                                      OR
                                      instr(permissions, '"assemblyai-u3-pro"') > 0
                                  )
                                  OR
                                  (
                                      instr(permissions, '"assemblyai-pro"') > 0
                                      OR
                                      instr(permissions, '"universal-3.5-pro"') > 0
                                  )
                              )
                          )
                          OR
                          (
                              (
                                  (
                                      instr(permissions, '"stable-audio"') > 0
                                      OR
                                      instr(permissions, '"stability-audio"') > 0
                                  )
                                  OR
                                  (
                                      instr(permissions, '"stable-audio-2.5"') > 0
                                      OR
                                      instr(permissions, '"stable-audio-3-medium"') > 0
                                  )
                              )
                              OR
                              (
                                  (
                                      instr(permissions, '"stable-audio-large"') > 0
                                      OR
                                      instr(permissions, '"stable-audio-3-large"') > 0
                                  )
                                  OR
                                  instr(permissions, '"qwen3-tts"') > 0
                              )
                          )
                      )
                  )
                  OR
                  (
                      (
                          (
                              (
                                  (
                                      instr(permissions, '"qwen3-tts-flash"') > 0
                                      OR
                                      instr(permissions, '"qwen-tts"') > 0
                                  )
                                  OR
                                  (
                                      instr(permissions, '"qwen3-tts-instruct"') > 0
                                      OR
                                      instr(permissions, '"qwen3-tts-instruct-flash"') > 0
                                  )
                              )
                              OR
                              (
                                  (
                                      instr(permissions, '"qwen-tts-instruct"') > 0
                                      OR
                                      instr(permissions, '"csm"') > 0
                                  )
                                  OR
                                  (
                                      instr(permissions, '"sesame-csm"') > 0
                                      OR
                                      instr(permissions, '"sesame-csm-1b"') > 0
                                  )
                              )
                          )
                          OR
                          (
                              (
                                  (
                                      instr(permissions, '"csm-1b"') > 0
                                      OR
                                      instr(permissions, '"kokoro-82m"') > 0
                                  )
                                  OR
                                  (
                                      instr(permissions, '"kokoro-tts"') > 0
                                      OR
                                      instr(permissions, '"hexgrad-kokoro-82m"') > 0
                                  )
                              )
                              OR
                              (
                                  (
                                      instr(permissions, '"kokoro"') > 0
                                      OR
                                      instr(permissions, '"embedding"') > 0
                                  )
                                  OR
                                  (
                                      instr(permissions, '"gemini-2"') > 0
                                      OR
                                      instr(permissions, '"embedding-small"') > 0
                                  )
                              )
                          )
                      )
                      OR
                      (
                          (
                              (
                                  (
                                      instr(permissions, '"openai-3-small"') > 0
                                      OR
                                      instr(permissions, '"embedding-large"') > 0
                                  )
                                  OR
                                  (
                                      instr(permissions, '"openai-3-large"') > 0
                                      OR
                                      instr(permissions, '"embed-v-4-0"') > 0
                                  )
                              )
                              OR
                              (
                                  (
                                      instr(permissions, '"cohere-embed-v-4-0"') > 0
                                      OR
                                      instr(permissions, '"cohere-embed-v4"') > 0
                                  )
                                  OR
                                  (
                                      instr(permissions, '"qwen3-embedding"') > 0
                                      OR
                                      instr(permissions, '"qwen3-embedding-8b"') > 0
                                  )
                              )
                          )
                          OR
                          (
                              (
                                  (
                                      instr(permissions, '"gpt-realtime-2.1"') > 0
                                      OR
                                      instr(permissions, '"gpt-realtime-2.1-mini"') > 0
                                  )
                                  OR
                                  (
                                      instr(permissions, '"gpt-realtime-2"') > 0
                                      OR
                                      instr(permissions, '"trellis-2-low"') > 0
                                  )
                              )
                              OR
                              (
                                  (
                                      instr(permissions, '"trellis-2-medium"') > 0
                                      OR
                                      instr(permissions, '"trellis-2-high"') > 0
                                  )
                                  OR
                                  instr(permissions, '"rodin"') > 0
                              )
                          )
                      )
                  )
              )
          )
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
    SELECT id, json_group_array(model_id ORDER BY position) AS models
    FROM deduplicated
    GROUP BY id
)
UPDATE apikey
SET permissions = json_set(
    apikey.permissions,
    '$.models',
    json(migrated.models)
)
FROM migrated
WHERE apikey.id = migrated.id
  AND migrated.id IN (SELECT id FROM canonicalized WHERE changed);
