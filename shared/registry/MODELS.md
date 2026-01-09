# Model → Provider Mapping

Maps each public model to its provider/account. Last updated: **Dec 2025**

## Summary

| Provider              | Text   | Image | Video | Models                                                                                                              |
| --------------------- | ------ | ----- | ----- | ------------------------------------------------------------------------------------------------------------------- |
| Azure (Myceli)        | 5      | 1     | -     | `openai`, `openai-large`, `openai-audio`, `deepseek`, `grok`, `kontext`                                             |
| Azure-2 (PointsFlyer) | 2      | 1     | -     | `openai-fast`, `midijourney`, `gptimage`                                                                            |
| AWS                   | 3      | -     | -     | `claude-fast`, `chickytutor`, `nova-fast`                                                                           |
| Google                | 7      | 2     | 1     | `gemini`, `gemini-fast`, `gemini-large`, `gemini-search`, `kimi-k2-thinking`, `claude`, `claude-large`, `nanobanana`, `nanobanana-pro`, `veo` |
| Scaleway              | 2      | 1     | -     | `qwen-coder`, `mistral`, `turbo`                                                                                    |
| Perplexity            | 2      | -     | -     | `perplexity-fast`, `perplexity-reasoning`                                                                           |
| ByteDance             | -      | 2     | 2     | `seedream`, `seedream-pro`, `seedance`, `seedance-pro`                                                              |
| io.net                | -      | 2     | -     | `flux`, `zimage`                                                                                                    |
| **Total**             | **21** | **9** | **3** |                                                                                                                     |

---

## Azure (Myceli)

| Model          | Service | Underlying modelId                     | Env Key                       | Infra |
| -------------- | ------- | -------------------------------------- | ----------------------------- | ----- |
| `openai`       | text    | `gpt-5-mini-2025-08-07`                | `AZURE_MYCELI_GPT5MINI_*`     | API   |
| `openai-large` | text    | `gpt-5.2-2025-12-11`                   | `AZURE_MYCELI_GPT52_*`        | API   |
| `openai-audio` | text    | `gpt-4o-mini-audio-preview-2024-12-17` | `AZURE_MYCELI_GPT4O_AUDIO_*`  | API   |
| `deepseek`     | text    | `DeepSeek-V3.1`                        | `AZURE_MYCELI_DEEPSEEK_R1_*`  | API   |
| `grok`         | text    | `grok-4-fast-non-reasoning`            | `AZURE_MYCELI_GROK4_*`        | API   |
| `kontext`      | image   | `kontext`                              | `AZURE_MYCELI_FLUX_KONTEXT_*` | API   |

## Azure-2 (PointsFlyer)

| Model         | Service | Underlying modelId      | Env Key               | Infra |
| ------------- | ------- | ----------------------- | --------------------- | ----- |
| `openai-fast` | text    | `gpt-5-nano-2025-08-07` | `AZURE_PF_GPT5NANO_*` | API   |
| `midijourney` | text    | `gpt-4.1-2025-04-14`    | `AZURE_PF_GPT41_*`    | API   |
| `gptimage`    | image   | `gptimage`              | `AZURE_PF_GPTIMAGE_*` | API   |

## AWS

| Model          | Service | Underlying modelId                               | Env Key | Infra |
| -------------- | ------- | ------------------------------------------------ | ------- | ----- |
| `claude-fast`  | text    | `us.anthropic.claude-haiku-4-5-20251001-v1:0`    | `AWS_*` | API   |
| `chickytutor`  | text    | `us.anthropic.claude-3-5-haiku-20241022-v1:0`    | `AWS_*` | API   |
| `nova-fast`    | text    | `amazon.nova-micro-v1:0`                         | `AWS_*` | API   |

## Google (Vertex AI)

| Model              | Service | Underlying modelId                 | Env Key    | Infra |
| ------------------ | ------- | ---------------------------------- | ---------- | ----- |
| `gemini`           | text    | `gemini-3-flash-preview`           | `GOOGLE_*` | API   |
| `gemini-fast`      | text    | `gemini-2.5-flash-lite`            | `GOOGLE_*` | API   |
| `gemini-large`     | text    | `gemini-3-pro-preview`             | `GOOGLE_*` | API   |
| `gemini-search`    | text    | `gemini-3-flash-preview` + search  | `GOOGLE_*` | API   |
| `kimi-k2-thinking` | text    | `moonshotai/kimi-k2-thinking-maas` | `GOOGLE_*` | API   |
| `claude`           | text    | `anthropic.claude-sonnet-4-5@20250929` | `GOOGLE_*` | API   |
| `claude-large`     | text    | `anthropic.claude-opus-4-5@20251101`   | `GOOGLE_*` | API   |
| `nanobanana`       | image   | `nanobanana`                       | `GOOGLE_*` | API   |
| `nanobanana-pro`   | image   | `nanobanana-pro`                   | `GOOGLE_*` | API   |
| `veo`              | video   | `veo`                              | `GOOGLE_*` | API   |

## Scaleway

| Model        | Service | Underlying modelId                    | Env Key      | Infra |
| ------------ | ------- | ------------------------------------- | ------------ | ----- |
| `qwen-coder` | text    | `qwen3-coder-30b-a3b-instruct`        | `SCALEWAY_*` | API   |
| `mistral`    | text    | `mistral-small-3.2-24b-instruct-2506` | `SCALEWAY_*` | API   |
| `turbo`      | image   | `turbo`                               | `SCALEWAY_*` | Fleet |

## Perplexity

| Model                  | Service | Underlying modelId | Env Key        | Infra |
| ---------------------- | ------- | ------------------ | -------------- | ----- |
| `perplexity-fast`      | text    | `sonar`            | `PERPLEXITY_*` | API   |
| `perplexity-reasoning` | text    | `sonar-reasoning`  | `PERPLEXITY_*` | API   |

## ByteDance

| Model          | Service | Underlying modelId | Env Key       | Infra |
| -------------- | ------- | ------------------ | ------------- | ----- |
| `seedream`     | image   | `seedream`         | `BYTEDANCE_*` | API   |
| `seedream-pro` | image   | `seedream-pro`     | `BYTEDANCE_*` | API   |
| `seedance`     | video   | `seedance`         | `BYTEDANCE_*` | API   |
| `seedance-pro` | video   | `seedance-pro`     | `BYTEDANCE_*` | API   |

## io.net

| Model    | Service | Underlying modelId | Env Key   | Infra |
| -------- | ------- | ------------------ | --------- | ----- |
| `flux`   | image   | `flux`             | (workers) | Fleet |
| `zimage` | image   | `zimage`           | (workers) | Fleet |
