-- Canonicalize stored API-key model allowlists after the public model-ID
-- standardization. Preserve unknown/community IDs, unrelated permission
-- fields, and the first occurrence when an old and new ID both exist.
WITH alias_map(alias, canonical) AS (
    VALUES
        ('openai', 'openai/gpt-5.4-nano'),
        ('openai-fast', 'openai/gpt-5-nano'),
        ('gpt-oss', 'openai/gpt-oss-20b'),
        ('gpt-5.4', 'openai/gpt-5.4'),
        ('gpt-5.4-mini', 'openai/gpt-5.4-mini'),
        ('openai-large', 'openai/gpt-5.5'),
        ('gpt-5.6-sol', 'openai/gpt-5.6-sol'),
        ('gpt-5.6-terra', 'openai/gpt-5.6-terra'),
        ('gpt-5.6-luna', 'openai/gpt-5.6-luna'),
        ('mercury', 'inception/mercury-2'),
        ('command-a-plus', 'command-a-plus-05-2026'),
        ('qwen-coder', 'qwen/qwen3-coder-30b-a3b-instruct'),
        ('mistral-small-3.2', 'mistralai/mistral-small-3.2-24b-instruct'),
        ('mistral', 'mistralai/mistral-small-2603'),
        ('openai-audio', 'openai/gpt-audio-mini'),
        ('openai-audio-large', 'openai/gpt-audio-1.5'),
        ('gemini-3-flash', 'google/gemini-3-flash-preview'),
        ('gemini', 'google/gemini-3.6-flash'),
        ('gemini-flash-lite-3.5', 'google/gemini-3.5-flash-lite'),
        ('gemini-fast', 'google/gemini-2.5-flash-lite'),
        ('deepseek', 'deepseek/deepseek-v4-flash-0731'),
        ('gemma', 'google/gemma-4-26b-a4b-it'),
        ('gemma-4-31b', 'google/gemma-4-31b-it'),
        ('deepseek-pro', 'deepseek/deepseek-v4-pro'),
        ('grok-large', 'x-ai/grok-4.3'),
        ('grok-4.5', 'x-ai/grok-4.5'),
        ('claude-fast', 'anthropic/claude-haiku-4.5'),
        ('claude', 'anthropic/claude-sonnet-4.6'),
        ('claude-sonnet-5', 'anthropic/claude-sonnet-5'),
        ('claude-opus-4.6', 'anthropic/claude-opus-4.6'),
        ('claude-opus-4.7', 'anthropic/claude-opus-4.7'),
        ('claude-large', 'anthropic/claude-opus-5'),
        ('claude-fable-5', 'anthropic/claude-fable-5'),
        ('perplexity', 'perplexity/sonar-pro'),
        ('perplexity-reasoning', 'perplexity/sonar-reasoning-pro'),
        ('kimi', 'moonshotai/kimi-k2.6'),
        ('kimi-code', 'moonshotai/kimi-k2.7-code'),
        ('kimi-k3', 'moonshotai/kimi-k3'),
        ('laguna', 'poolside/laguna-s-2.1'),
        ('longcat', 'meituan/longcat-2.0'),
        ('inkling', 'thinkingmachines/inkling-small'),
        ('nemotron', 'nvidia/nemotron-3-ultra-550b-a55b'),
        ('mimo-v2.5', 'xiaomi/mimo-v2.5'),
        ('mimo-v2.5-pro', 'xiaomi/mimo-v2.5-pro'),
        ('gemini-large', 'google/gemini-3.1-pro-preview'),
        ('nova-fast', 'amazon/nova-micro-v1'),
        ('nova', 'amazon/nova-2-lite-v1'),
        ('glm', 'z-ai/glm-5.2'),
        ('llama', 'meta-llama/llama-3.3-70b-instruct'),
        ('llama-maverick', 'meta-llama/llama-4-maverick'),
        ('llama-scout', 'meta-llama/llama-4-scout'),
        ('minimax-m2.7', 'minimax/minimax-m2.7'),
        ('minimax', 'minimax/minimax-m3'),
        ('muse-spark-1.1', 'meta/muse-spark-1.1'),
        ('mistral-large', 'mistralai/mistral-large-2512'),
        ('qwen-coder-large', 'qwen/qwen3-coder-next'),
        ('qwen-large', 'qwen/qwen3.7-plus'),
        ('qwen3.7-max', 'qwen/qwen3.7-max'),
        ('qwen3.8-max', 'qwen/qwen3.8-max'),
        ('qwen3.7-flash', 'qwen/qwen3.7-flash'),
        ('qwen-vision', 'qwen/qwen3-vl-30b-a3b-instruct'),
        ('qwen-vision-pro', 'qwen/qwen3-vl-235b-a22b-thinking'),
        ('step-flash', 'stepfun/step-3.7-flash'),
        ('step-3.5-flash', 'stepfun/step-3.5-flash'),
        ('qwen-safety', 'qwen/qwen3guard-gen-8b'),
        ('krea', 'krea/krea-2-medium'),
        ('kontext', 'black-forest-labs/flux.1-kontext-pro'),
        ('nanobanana', 'google/gemini-2.5-flash-image'),
        ('nanobanana-2', 'google/gemini-3.1-flash-image'),
        ('nanobanana-2-lite', 'google/gemini-3.1-flash-lite-image'),
        ('nanobanana-pro', 'google/gemini-3-pro-image'),
        ('seedream5', 'bytedance/seedream-5-lite'),
        ('seedream5-pro', 'bytedance/seedream-5-pro'),
        ('seedream', 'bytedance/seedream-4'),
        ('seedream-pro', 'bytedance-seed/seedream-4.5'),
        ('ideogram-v4-turbo', 'ideogram-ai/ideogram-v4-turbo'),
        ('ideogram-v4-balanced', 'ideogram-ai/ideogram-v4-balanced'),
        ('ideogram-v4-quality', 'ideogram-ai/ideogram-v4-quality'),
        ('gptimage', 'openai/gpt-image-1-mini'),
        ('gptimage-large', 'openai/gpt-image-1.5'),
        ('gpt-image-2', 'openai/gpt-image-2'),
        ('flux', 'black-forest-labs/FLUX.1-schnell'),
        ('zimage', 'Tongyi-MAI/Z-Image-Turbo'),
        ('veo', 'google/veo-3.1-fast'),
        ('seedance-pro', 'bytedance/seedance-1-pro-fast'),
        ('seedance-2.0', 'bytedance/seedance-2.0'),
        ('wan', 'alibaba/wan-2.6'),
        ('wan-fast', 'wan-video/wan-2.2-fast'),
        ('wan-pro', 'alibaba/wan-2.7'),
        ('wan-image', 'wan-video/wan-2.7-image'),
        ('wan-image-pro', 'wan-video/wan-2.7-image-pro'),
        ('qwen-image', 'qwen/qwen-image'),
        ('grok-imagine', 'x-ai/grok-imagine-image'),
        ('grok-imagine-pro', 'x-ai/grok-imagine-image-quality'),
        ('recraft-v4.1-vector', 'recraft/recraft-v4.1-vector'),
        ('grok-video-pro', 'x-ai/grok-imagine-video'),
        ('grok-imagine-video-1.5', 'x-ai/grok-imagine-video-1.5'),
        ('happyhorse-1.1', 'alibaba/happyhorse-1.1'),
        ('klein', 'black-forest-labs/flux.2-klein-4b'),
        ('p-image', 'PrunaAI/p-image'),
        ('p-image-edit', 'PrunaAI/p-image-Edit'),
        ('p-video', 'prunaai/p-video'),
        ('nova-canvas', 'amazon.nova-canvas-v1:0'),
        ('nova-reel', 'amazon.nova-reel-v1:1'),
        ('elevenlabs', 'elevenlabs/eleven-v3'),
        ('elevenflash', 'elevenlabs/eleven-flash-v2.5'),
        ('eleven-multilingual-v2', 'elevenlabs/eleven-multilingual-v2'),
        ('elevenmusic', 'elevenlabs/music-v2'),
        ('lyria-3-clip', 'google/lyria-3-clip-preview'),
        ('eleven-sfx', 'elevenlabs/eleven-text-to-sound-v2'),
        ('whisper', 'openai/whisper-large-v3'),
        ('scribe', 'elevenlabs/scribe-v2'),
        ('universal-2', 'assemblyai/universal-2'),
        ('universal-3.5-pro', 'assemblyai/universal-3.5-pro'),
        ('stable-audio-3-medium', 'fal-ai/stable-audio-3/medium'),
        ('stable-audio-3-large', 'stable-audio-3'),
        ('qwen-tts', 'qwen/qwen3-tts-flash'),
        ('qwen-tts-instruct', 'qwen/qwen3-tts-instruct-flash'),
        ('csm-1b', 'sesame/csm-1b'),
        ('kokoro', 'hexgrad/kokoro-82m'),
        ('gemini-2', 'google/gemini-embedding-2'),
        ('openai-3-small', 'openai/text-embedding-3-small'),
        ('openai-3-large', 'openai/text-embedding-3-large'),
        ('cohere-embed-v4', 'embed-v4.0'),
        ('qwen3-embedding-8b', 'qwen/qwen3-embedding-8b'),
        ('gpt-realtime-2.1', 'openai/gpt-realtime-2.1'),
        ('gpt-realtime-2.1-mini', 'openai/gpt-realtime-2.1-mini'),
        ('gpt-realtime-2', 'openai/gpt-realtime-2')
),
-- Bound JSON expansion to rows that can contain a renamed canonical ID. The
-- apikey table is large, so expanding every permissions document exceeds D1's
-- migration CPU budget.
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
                                      instr(permissions, '"openai"') > 0
                                      OR
                                      instr(permissions, '"openai-fast"') > 0
                                  )
                                  OR
                                  (
                                      instr(permissions, '"gpt-oss"') > 0
                                      OR
                                      instr(permissions, '"gpt-5.4"') > 0
                                  )
                              )
                              OR
                              (
                                  (
                                      instr(permissions, '"gpt-5.4-mini"') > 0
                                      OR
                                      instr(permissions, '"openai-large"') > 0
                                  )
                                  OR
                                  (
                                      instr(permissions, '"gpt-5.6-sol"') > 0
                                      OR
                                      instr(permissions, '"gpt-5.6-terra"') > 0
                                  )
                              )
                          )
                          OR
                          (
                              (
                                  (
                                      instr(permissions, '"gpt-5.6-luna"') > 0
                                      OR
                                      instr(permissions, '"mercury"') > 0
                                  )
                                  OR
                                  (
                                      instr(permissions, '"command-a-plus"') > 0
                                      OR
                                      instr(permissions, '"qwen-coder"') > 0
                                  )
                              )
                              OR
                              (
                                  (
                                      instr(permissions, '"mistral-small-3.2"') > 0
                                      OR
                                      instr(permissions, '"mistral"') > 0
                                  )
                                  OR
                                  (
                                      instr(permissions, '"openai-audio"') > 0
                                      OR
                                      instr(permissions, '"openai-audio-large"') > 0
                                  )
                              )
                          )
                      )
                      OR
                      (
                          (
                              (
                                  (
                                      instr(permissions, '"gemini-3-flash"') > 0
                                      OR
                                      instr(permissions, '"gemini"') > 0
                                  )
                                  OR
                                  (
                                      instr(permissions, '"gemini-flash-lite-3.5"') > 0
                                      OR
                                      instr(permissions, '"gemini-fast"') > 0
                                  )
                              )
                              OR
                              (
                                  (
                                      instr(permissions, '"deepseek"') > 0
                                      OR
                                      instr(permissions, '"gemma"') > 0
                                  )
                                  OR
                                  (
                                      instr(permissions, '"gemma-4-31b"') > 0
                                      OR
                                      instr(permissions, '"deepseek-pro"') > 0
                                  )
                              )
                          )
                          OR
                          (
                              (
                                  (
                                      instr(permissions, '"grok-large"') > 0
                                      OR
                                      instr(permissions, '"grok-4.5"') > 0
                                  )
                                  OR
                                  (
                                      instr(permissions, '"claude-fast"') > 0
                                      OR
                                      instr(permissions, '"claude"') > 0
                                  )
                              )
                              OR
                              (
                                  (
                                      instr(permissions, '"claude-sonnet-5"') > 0
                                      OR
                                      instr(permissions, '"claude-opus-4.6"') > 0
                                  )
                                  OR
                                  (
                                      instr(permissions, '"claude-opus-4.7"') > 0
                                      OR
                                      instr(permissions, '"claude-large"') > 0
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
                                      instr(permissions, '"claude-fable-5"') > 0
                                      OR
                                      instr(permissions, '"perplexity"') > 0
                                  )
                                  OR
                                  (
                                      instr(permissions, '"perplexity-reasoning"') > 0
                                      OR
                                      instr(permissions, '"kimi"') > 0
                                  )
                              )
                              OR
                              (
                                  (
                                      instr(permissions, '"kimi-code"') > 0
                                      OR
                                      instr(permissions, '"kimi-k3"') > 0
                                  )
                                  OR
                                  (
                                      instr(permissions, '"laguna"') > 0
                                      OR
                                      instr(permissions, '"longcat"') > 0
                                  )
                              )
                          )
                          OR
                          (
                              (
                                  (
                                      instr(permissions, '"inkling"') > 0
                                      OR
                                      instr(permissions, '"nemotron"') > 0
                                  )
                                  OR
                                  (
                                      instr(permissions, '"mimo-v2.5"') > 0
                                      OR
                                      instr(permissions, '"mimo-v2.5-pro"') > 0
                                  )
                              )
                              OR
                              (
                                  (
                                      instr(permissions, '"gemini-large"') > 0
                                      OR
                                      instr(permissions, '"nova-fast"') > 0
                                  )
                                  OR
                                  (
                                      instr(permissions, '"nova"') > 0
                                      OR
                                      instr(permissions, '"glm"') > 0
                                  )
                              )
                          )
                      )
                      OR
                      (
                          (
                              (
                                  (
                                      instr(permissions, '"llama"') > 0
                                      OR
                                      instr(permissions, '"llama-maverick"') > 0
                                  )
                                  OR
                                  (
                                      instr(permissions, '"llama-scout"') > 0
                                      OR
                                      instr(permissions, '"minimax-m2.7"') > 0
                                  )
                              )
                              OR
                              (
                                  (
                                      instr(permissions, '"minimax"') > 0
                                      OR
                                      instr(permissions, '"muse-spark-1.1"') > 0
                                  )
                                  OR
                                  (
                                      instr(permissions, '"mistral-large"') > 0
                                      OR
                                      instr(permissions, '"qwen-coder-large"') > 0
                                  )
                              )
                          )
                          OR
                          (
                              (
                                  (
                                      instr(permissions, '"qwen-large"') > 0
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
                                      instr(permissions, '"qwen-vision"') > 0
                                      OR
                                      instr(permissions, '"qwen-vision-pro"') > 0
                                  )
                                  OR
                                  (
                                      instr(permissions, '"step-flash"') > 0
                                      OR
                                      instr(permissions, '"step-3.5-flash"') > 0
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
                                      instr(permissions, '"qwen-safety"') > 0
                                      OR
                                      instr(permissions, '"krea"') > 0
                                  )
                                  OR
                                  (
                                      instr(permissions, '"kontext"') > 0
                                      OR
                                      instr(permissions, '"nanobanana"') > 0
                                  )
                              )
                              OR
                              (
                                  (
                                      instr(permissions, '"nanobanana-2"') > 0
                                      OR
                                      instr(permissions, '"nanobanana-2-lite"') > 0
                                  )
                                  OR
                                  (
                                      instr(permissions, '"nanobanana-pro"') > 0
                                      OR
                                      instr(permissions, '"seedream5"') > 0
                                  )
                              )
                          )
                          OR
                          (
                              (
                                  (
                                      instr(permissions, '"seedream5-pro"') > 0
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
                                      instr(permissions, '"gptimage"') > 0
                                      OR
                                      instr(permissions, '"gptimage-large"') > 0
                                  )
                              )
                          )
                      )
                      OR
                      (
                          (
                              (
                                  (
                                      instr(permissions, '"gpt-image-2"') > 0
                                      OR
                                      instr(permissions, '"flux"') > 0
                                  )
                                  OR
                                  (
                                      instr(permissions, '"zimage"') > 0
                                      OR
                                      instr(permissions, '"veo"') > 0
                                  )
                              )
                              OR
                              (
                                  (
                                      instr(permissions, '"seedance-pro"') > 0
                                      OR
                                      instr(permissions, '"seedance-2.0"') > 0
                                  )
                                  OR
                                  (
                                      instr(permissions, '"wan"') > 0
                                      OR
                                      instr(permissions, '"wan-fast"') > 0
                                  )
                              )
                          )
                          OR
                          (
                              (
                                  (
                                      instr(permissions, '"wan-pro"') > 0
                                      OR
                                      instr(permissions, '"wan-image"') > 0
                                  )
                                  OR
                                  (
                                      instr(permissions, '"wan-image-pro"') > 0
                                      OR
                                      instr(permissions, '"qwen-image"') > 0
                                  )
                              )
                              OR
                              (
                                  (
                                      instr(permissions, '"grok-imagine"') > 0
                                      OR
                                      instr(permissions, '"grok-imagine-pro"') > 0
                                  )
                                  OR
                                  (
                                      instr(permissions, '"recraft-v4.1-vector"') > 0
                                      OR
                                      instr(permissions, '"grok-video-pro"') > 0
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
                                      instr(permissions, '"grok-imagine-video-1.5"') > 0
                                      OR
                                      instr(permissions, '"happyhorse-1.1"') > 0
                                  )
                                  OR
                                  (
                                      instr(permissions, '"klein"') > 0
                                      OR
                                      instr(permissions, '"p-image"') > 0
                                  )
                              )
                              OR
                              (
                                  (
                                      instr(permissions, '"p-image-edit"') > 0
                                      OR
                                      instr(permissions, '"p-video"') > 0
                                  )
                                  OR
                                  (
                                      instr(permissions, '"nova-canvas"') > 0
                                      OR
                                      instr(permissions, '"nova-reel"') > 0
                                  )
                              )
                          )
                          OR
                          (
                              (
                                  (
                                      instr(permissions, '"elevenlabs"') > 0
                                      OR
                                      instr(permissions, '"elevenflash"') > 0
                                  )
                                  OR
                                  (
                                      instr(permissions, '"eleven-multilingual-v2"') > 0
                                      OR
                                      instr(permissions, '"elevenmusic"') > 0
                                  )
                              )
                              OR
                              (
                                  (
                                      instr(permissions, '"lyria-3-clip"') > 0
                                      OR
                                      instr(permissions, '"eleven-sfx"') > 0
                                  )
                                  OR
                                  (
                                      instr(permissions, '"whisper"') > 0
                                      OR
                                      instr(permissions, '"scribe"') > 0
                                  )
                              )
                          )
                      )
                      OR
                      (
                          (
                              (
                                  (
                                      instr(permissions, '"universal-2"') > 0
                                      OR
                                      instr(permissions, '"universal-3.5-pro"') > 0
                                  )
                                  OR
                                  (
                                      instr(permissions, '"stable-audio-3-medium"') > 0
                                      OR
                                      instr(permissions, '"stable-audio-3-large"') > 0
                                  )
                              )
                              OR
                              (
                                  (
                                      instr(permissions, '"qwen-tts"') > 0
                                      OR
                                      instr(permissions, '"qwen-tts-instruct"') > 0
                                  )
                                  OR
                                  (
                                      instr(permissions, '"csm-1b"') > 0
                                      OR
                                      instr(permissions, '"kokoro"') > 0
                                  )
                              )
                          )
                          OR
                          (
                              (
                                  (
                                      instr(permissions, '"gemini-2"') > 0
                                      OR
                                      instr(permissions, '"openai-3-small"') > 0
                                  )
                                  OR
                                  (
                                      instr(permissions, '"openai-3-large"') > 0
                                      OR
                                      instr(permissions, '"cohere-embed-v4"') > 0
                                  )
                              )
                              OR
                              (
                                  (
                                      instr(permissions, '"qwen3-embedding-8b"') > 0
                                      OR
                                      instr(permissions, '"gpt-realtime-2.1-mini"') > 0
                                  )
                                  OR
                                  (
                                      instr(permissions, '"gpt-realtime-2.1"') > 0
                                      OR
                                      instr(permissions, '"gpt-realtime-2"') > 0
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
