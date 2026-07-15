# Model Rename Confirmation Contract

Status: Awaiting explicit user approval

Baseline: `main` at `e5e23011d98721b053b9b750e94c573aeba3e04c`

Source proposal: closed PR [#12342](https://github.com/pollinations/pollinations/pull/12342), re-audited against current `main`

## Purpose

Approve the public rename and compatibility contract before any model identifier is edited. This document contains 73 proposed renames. Models not listed remain unchanged.

This contract changes names and aliases only. It does not change prices, paid access, provider routing, GPU hosting, fallbacks, brand, category, modalities, family/version metadata, or Tinybird.

## Evidence and definitions

- Every current public name and alias is present either as the proposed canonical name or as a preserved alias: **100% coverage**.
- `paidOnly: No` includes registry entries where the optional field is absent; runtime semantics normalize absence to false.
- **GPU** means Pollinations operates the production inference deployment. It does not mean merely that a managed provider uses GPUs.
- **Provider** is the current registry provider for the configured primary route.
- **Primary route** is the current runtime handler/config and upstream deployment or model ID.
- **Fallback** is an actual alternate route. Regional endpoints within Azure remain the same provider.
- No affected model currently declares registry `fallbackProvider`. Flux has an explicit runtime fallback to Fireworks.
- All values are snapshots from the baseline commit above and must be rechecked if `main` changes before implementation.

## Compatibility decisions requiring approval

- [ ] Use each **Proposed** value below as the new canonical public name.
- [ ] Keep every listed alias working indefinitely unless a separate deprecation is approved and announced.
- [ ] Add exact upstream identifiers as aliases only where listed; alias collisions remain a CI failure.
- [ ] Return the resolved canonical name in public model fields when no different fallback model served the request.
- [ ] If a different fallback model served the request, return that model's canonical name as the used model.
- [ ] Keep the exact requested alias only in internal requested-model tracking.
- [ ] Apply the same requested/resolved/used rule to response bodies, `x-model-used`, embeddings, image metadata, and model statistics.

## Confirmation matrix

### Text (44)

| Current | Proposed | Preserved aliases | Multiplier | Paid | GPU | Provider | Primary route | Fallback |
|---|---|---|---:|---|---|---|---|---|
| `openai` | `gpt-5.4-nano` | `openai` | 0.75 | No | No | `azure` | Azure myceli-prod-eastus/gpt-5.4-nano | none |
| `openai-fast` | `gpt-5-nano` | `openai-fast`<br>`gpt-5-nano-2025-08-07` | 0.75 | No | No | `azure` | Azure myceli-prod-eastus/gpt-5-nano | none |
| `openai-large` | `gpt-5.5` | `openai-large`<br>`gpt-5.5-reasoning`<br>`openai-reasoning` | 1 | No | No | `azure` | Azure myceli-prod-swedencentral/gpt-5.5 | none |
| `mercury` | `mercury-2` | `mercury`<br>`inception`<br>`inception-mercury` | 1 | Yes | No | `inception` | https://api.inceptionlabs.ai/v1 model=mercury-2 | none |
| `qwen-coder` | `qwen3-coder` | `qwen-coder`<br>`qwen3-coder-30b-a3b-instruct` | 1 | No | No | `ovhcloud` | https://qwen-3-coder-30b-a3b-instruct.endpoints.kepler.ai.cloud.ovh.net/api/openai_compat/v1 model=Qwen3-Coder-30B-A3B-Instruct | none |
| `mistral` | `mistral-small-4` | `mistral`<br>`mistral-4`<br>`mistral-small`<br>`mistral-small-2603` | 1 | No | No | `openrouter` | https://openrouter.ai/api/v1 model=mistralai/mistral-small-2603 | none |
| `openai-audio` | `gpt-audio-mini` | `openai-audio`<br>`gpt-audio-mini-2025-12-15`<br>`gpt-4o-mini-audio-preview`<br>`gpt-4o-mini-audio-preview-2024-12-17` | 1 | No | No | `azure` | Azure myceli-prod-swedencentral/gpt-audio-mini | none |
| `openai-audio-large` | `gpt-audio-1.5` | `openai-audio-large`<br>`gpt-audio`<br>`gpt-audio-2025-12-15` | 1 | No | No | `azure` | Azure myceli-prod-swedencentral/gpt-audio-1.5 | none |
| `gemini` | `gemini-3.5-flash` | `gemini` | 1 | Yes | No | `google` | Vertex global/gemini-3.5-flash | none |
| `gemini-flash-lite-3.1` | `gemini-3.1-flash-lite` | `gemini-flash-lite-3.1`<br>`gemini-3.1-flash-lite-preview`<br>`gemini-flash-lite` | 1 | Yes | No | `google` | Vertex global/gemini-3.1-flash-lite | none |
| `gemini-fast` | `gemini-2.5-flash-lite` | `gemini-fast` | 1 | Yes | No | `google` | Vertex global/gemini-2.5-flash-lite | none |
| `deepseek` | `deepseek-v4-flash` | `deepseek`<br>`deepseek-v4`<br>`deepseek-v4-lite`<br>`deepseek-lite`<br>`deepseek-flash` | 1 | No | No | `fireworks` | https://api.fireworks.ai/inference/v1 model=accounts/fireworks/models/deepseek-v4-flash | none |
| `gemma` | `gemma-4-26b` | `gemma`<br>`gemma-4`<br>`gemma-4-26b-a4b`<br>`gemma-4-26b-a4b-it` | 1 | No | No | `openrouter` | https://openrouter.ai/api/v1 model=google/gemma-4-26b-a4b-it | none |
| `deepseek-pro` | `deepseek-v4-pro` | `deepseek-pro` | 1 | No | No | `fireworks` | https://api.fireworks.ai/inference/v1 model=accounts/fireworks/models/deepseek-v4-pro | none |
| `grok` | `grok-4.20` | `grok`<br>`grok-fast`<br>`grok-4-1-fast`<br>`grok-4-1-fast-non-reasoning`<br>`grok-legacy`<br>`grok-4`<br>`grok-4-fast`<br>`grok-4-20-non-reasoning`<br>`grok-non-reasoning` | 1 | No | No | `azure` | Azure myceli-prod-eastus/grok-4-20-non-reasoning | none |
| `grok-4-20-reasoning` | `grok-4.20-reasoning` | `grok-4-20-reasoning`<br>`grok-4-20`<br>`grok-4-1-fast-reasoning` | 1 | No | No | `azure` | Azure myceli-prod-eastus/grok-4-20-reasoning | none |
| `grok-large` | `grok-4.3` | `grok-large`<br>`grok-4-3`<br>`grok-reasoning` | 1 | No | No | `azure` | Azure myceli-prod-eastus/grok-4.3 | none |
| `gemini-search` | `gemini-2.5-flash-lite-search` | `gemini-search`<br>`gemini-2.5-flash-search` | 1 | Yes | No | `google` | Vertex global/gemini-2.5-flash-lite | none |
| `gemini-search-fast` | `gemini-3.1-flash-lite-search` | `gemini-search-fast` | 1 | Yes | No | `google` | Vertex global/gemini-3.1-flash-lite | none |
| `gemini-search-large` | `gemini-3.5-flash-search` | `gemini-search-large` | 1 | Yes | No | `google` | Vertex global/gemini-3.5-flash | none |
| `claude-fast` | `claude-haiku-4.5` | `claude-fast`<br>`claude-haiku` | 1 | Yes | No | `bedrock` | Bedrock global.anthropic.claude-haiku-4-5-20251001-v1:0 | none |
| `claude` | `claude-sonnet-4.6` | `claude`<br>`claude-sonnet` | 1 | Yes | No | `bedrock` | Bedrock global.anthropic.claude-sonnet-4-6 | none |
| `claude-large` | `claude-opus-4.8` | `claude-large`<br>`claude-opus` | 1 | Yes | No | `bedrock` | Bedrock us.anthropic.claude-opus-4-8 | none |
| `perplexity-fast` | `sonar` | `perplexity-fast` | 1 | No | No | `perplexity` | perplexity-ai model=sonar | none |
| `perplexity-deep` | `sonar-deep` | `perplexity-deep` | 1 | No | No | `perplexity` | perplexity-ai model=sonar | none |
| `perplexity` | `sonar-pro` | `perplexity`<br>`perplexity-pro` | 1 | No | No | `perplexity` | perplexity-ai model=sonar-pro | none |
| `perplexity-reasoning` | `sonar-reasoning-pro` | `perplexity-reasoning`<br>`sonar-reasoning` | 1 | No | No | `perplexity` | perplexity-ai model=sonar-reasoning-pro | none |
| `kimi` | `kimi-k2.6` | `kimi`<br>`kimi-k2p6`<br>`kimi-reasoning`<br>`kimi-large`<br>`kimi-thinking` | 1 | No | No | `fireworks` | https://api.fireworks.ai/inference/v1 model=accounts/fireworks/models/kimi-k2p6 | none |
| `kimi-code` | `kimi-k2.7-code` | `kimi-code`<br>`kimi-k2.7`<br>`kimi-k2p7` | 1 | No | No | `fireworks` | https://api.fireworks.ai/inference/v1 model=accounts/fireworks/models/kimi-k2p7-code | none |
| `gemini-large` | `gemini-3.1-pro` | `gemini-large`<br>`gemini-2.5-pro` | 1 | Yes | No | `google` | Vertex global/gemini-3.1-pro-preview | none |
| `nova-fast` | `nova-micro` | `nova-fast`<br>`amazon-nova-micro` | 1 | No | No | `bedrock` | Bedrock us.amazon.nova-micro-v1:0 | none |
| `nova` | `nova-2-lite` | `nova`<br>`amazon-nova-2-lite`<br>`nova-2` | 1 | No | No | `bedrock` | Bedrock us.amazon.nova-2-lite-v1:0 | none |
| `glm` | `glm-5.2` | `glm`<br>`glm-5p2` | 1 | No | No | `fireworks` | https://api.fireworks.ai/inference/v1 model=accounts/fireworks/models/glm-5p2 | none |
| `llama` | `llama-3.3-70b` | `llama`<br>`llama-3.3`<br>`llama-v3p3-70b-instruct` | 0.75 | No | No | `azure` | Azure myceli-prod-eastus/Llama-3.3-70B-Instruct | none |
| `llama-maverick` | `llama-4-maverick` | `llama-maverick`<br>`llama-4`<br>`llama-maverick-17b`<br>`llama-4-maverick-17b-128e-instruct-fp8` | 0.75 | Yes | No | `azure` | Azure myceli-prod-eastus/Llama-4-Maverick-17B-128E-Instruct-FP8 | none |
| `llama-scout` | `llama-4-scout` | `llama-scout`<br>`llama-scout-17b`<br>`llama-4-scout-17b-16e-instruct` | 1 | No | No | `openrouter` | https://openrouter.ai/api/v1 model=meta-llama/llama-4-scout | none |
| `minimax` | `minimax-m3` | `minimax`<br>`minimax3`<br>`minimax-3` | 1 | No | No | `fireworks` | https://api.fireworks.ai/inference/v1 model=accounts/fireworks/models/minimax-m3 | none |
| `mistral-large` | `mistral-large-3` | `mistral-large` | 0.75 | No | No | `azure` | Azure myceli-prod-eastus/Mistral-Large-3 | none |
| `qwen-coder-large` | `qwen3-coder-next` | `qwen-coder-large` | 1 | Yes | No | `openrouter` | https://openrouter.ai/api/v1 model=qwen/qwen3-coder-next | none |
| `qwen-large` | `qwen3.7-plus` | `qwen-large`<br>`qwen3.7`<br>`qwen3p7-plus`<br>`qwen3.6`<br>`qwen3.6-plus`<br>`qwen3p6-plus` | 1 | No | No | `fireworks` | https://api.fireworks.ai/inference/v1 model=accounts/fireworks/models/qwen3p7-plus | none |
| `qwen-vision` | `qwen3-vl-30b` | `qwen-vision`<br>`qwen3-vl`<br>`qwen3-vl-30b-a3b-instruct`<br>`qwen3-vl-instruct`<br>`qwen3-vl-plus`<br>`qwen-vl` | 1 | No | No | `openrouter` | https://openrouter.ai/api/v1 model=qwen/qwen3-vl-30b-a3b-instruct | none |
| `qwen-vision-pro` | `qwen3-vl-235b` | `qwen-vision-pro`<br>`qwen3-vl-pro`<br>`qwen3-vl-235b-a22b-thinking`<br>`qwen-vl-pro` | 1 | No | No | `openrouter` | https://openrouter.ai/api/v1 model=qwen/qwen3-vl-235b-a22b-thinking | none |
| `step-flash` | `step-3.7-flash` | `step-flash`<br>`stepfun-flash`<br>`step-flash-3.7` | 1 | No | No | `openrouter` | https://openrouter.ai/api/v1 model=stepfun/step-3.7-flash | none |
| `qwen-safety` | `qwen3guard` | `qwen-safety`<br>`qwen3guard-gen-8b` | 1 | No | No | `ovhcloud` | https://oai.endpoints.kepler.ai.cloud.ovh.net/v1 model=Qwen3Guard-Gen-8B | none |

### Image (13)

| Current | Proposed | Preserved aliases | Multiplier | Paid | GPU | Provider | Primary route | Fallback |
|---|---|---|---:|---|---|---|---|---|
| `kontext` | `flux-kontext` | `kontext` | 1 | No | No | `azure` | Azure myceli-prod-swedencentral/FLUX.1-Kontext-pro; model=flux.1-kontext-pro | none |
| `seedream5` | `seedream-5-lite` | `seedream5` | 1 | Yes | No | `replicate` | Replicate bytedance/seedream-5-lite | none |
| `seedream5-pro` | `seedream-5-pro` | `seedream5-pro`<br>`seedream-pro-5` | 1 | Yes | No | `replicate` | Replicate bytedance/seedream-5-pro | none |
| `seedream` | `seedream-4` | `seedream` | 1 | Yes | No | `replicate` | Replicate bytedance/seedream-4 | none |
| `seedream-pro` | `seedream-4.5-pro` | `seedream-pro` | 1 | Yes | No | `replicate` | Replicate bytedance/seedream-4.5 | none |
| `gptimage` | `gpt-image-1-mini` | `gptimage`<br>`gpt-image` | 0.75 | No | No | `azure` | Azure gpt-image-1-mini; swedencentral then westus3 | Azure westus3 regional endpoint (same provider) |
| `gptimage-large` | `gpt-image-1.5` | `gptimage-large`<br>`gpt-image-large` | 1 | No | No | `azure` | Azure gpt-image-1.5; swedencentral then westus3 | Azure westus3 regional endpoint (same provider) |
| `flux` | `flux-schnell` | `flux` | 1.25 | No | Yes | `vast` | Pollinations GPU registry pool type=flux | Fireworks flux-1-schnell-fp8 |
| `zimage` | `z-image-turbo` | `zimage`<br>`z-image` | 1 | No | Yes | `runpod` | Pollinations GPU registry pool type=zimage | none |
| `wan-image` | `wan-2.7-image` | `wan-image`<br>`wan2.7-image`<br>`wan-img` | 1 | Yes | No | `replicate` | Replicate wan-video/wan-2.7-image | none |
| `wan-image-pro` | `wan-2.7-image-pro` | `wan-image-pro`<br>`wan2.7-image-pro`<br>`wan-img-pro` | 1 | Yes | No | `replicate` | Replicate wan-video/wan-2.7-image-pro | none |
| `qwen-image` | `qwen-image-plus` | `qwen-image`<br>`qwen-image-2512`<br>`qwen-image-edit`<br>`qwen-image-edit-plus` | 1 | Yes | No | `replicate` | Replicate qwen/qwen-image or qwen/qwen-image-edit-plus | none |
| `klein` | `flux-klein` | `klein` | 1 | No | Yes | `vast` | Pollinations Flux Klein deployment through Vast VPC | none |

### Video (6)

| Current | Proposed | Preserved aliases | Multiplier | Paid | GPU | Provider | Primary route | Fallback |
|---|---|---|---:|---|---|---|---|---|
| `veo` | `veo-3.1-fast` | `veo`<br>`video` | 1 | Yes | No | `google` | Vertex AI veo-3.1-fast-generate-001 | none |
| `wan` | `wan-2.6` | `wan`<br>`wan2.6`<br>`wan-i2v` | 1 | Yes | No | `replicate` | Replicate wan-video/wan-2.6-t2v or wan-2.6-i2v | none |
| `wan-fast` | `wan-2.2` | `wan-fast`<br>`wan2.2` | 1 | Yes | No | `replicate` | Replicate wan-video/wan-2.2-t2v-fast or wan-2.2-i2v-fast | none |
| `wan-pro` | `wan-2.7` | `wan-pro`<br>`wan2.7` | 1 | Yes | No | `replicate` | Replicate wan-video/wan-2.7-t2v or wan-2.7-i2v at 720p | none |
| `wan-pro-1080p` | `wan-2.7-1080p` | `wan-pro-1080p`<br>`wan2.7-1080p`<br>`wan-pro-1080` | 1 | Yes | No | `replicate` | Replicate wan-video/wan-2.7-t2v or wan-2.7-i2v at 1080p | none |
| `ltx-2` | `ltx-2.3` | `ltx-2`<br>`ltx2`<br>`ltxvideo`<br>`ltx-video` | 1 | No | Yes | `lambda` | Pollinations LTX-2 deployment on Lambda Labs GH200 via LTX2_BASE_URL | none |

### Audio (7)

| Current | Proposed | Preserved aliases | Multiplier | Paid | GPU | Provider | Primary route | Fallback |
|---|---|---|---:|---|---|---|---|---|
| `elevenlabs` | `eleven-v3` | `elevenlabs`<br>`tts`<br>`text-to-speech`<br>`eleven`<br>`tts-1`<br>`tts-1-hd` | 1 | Yes | No | `elevenlabs` | ElevenLabs text-to-speech; model=eleven_v3 | none |
| `elevenflash` | `eleven-flash-v2.5` | `elevenflash`<br>`tts-flash`<br>`eleven-flash`<br>`flash` | 1 | Yes | No | `elevenlabs` | ElevenLabs text-to-speech; model=eleven_flash_v2_5 | none |
| `elevenmusic` | `eleven-music` | `elevenmusic`<br>`music` | 1 | Yes | No | `elevenlabs` | ElevenLabs music; model=music_v2 | none |
| `whisper` | `whisper-large-v3` | `whisper`<br>`whisper-1` | 1 | No | No | `ovhcloud` | OVHcloud OpenAI-compatible transcription; model=whisper-large-v3 | none |
| `scribe` | `scribe-v2` | `scribe`<br>`scribe_v2` | 1 | Yes | No | `elevenlabs` | ElevenLabs speech-to-text; model=scribe_v2 | none |
| `qwen-tts` | `qwen3-tts-flash` | `qwen-tts`<br>`qwen3-tts` | 1 | Yes | No | `alibaba` | Alibaba DashScope TTS; model=qwen3-tts-flash | none |
| `qwen-tts-instruct` | `qwen3-tts-instruct` | `qwen-tts-instruct`<br>`qwen3-tts-instruct-flash` | 1 | Yes | No | `alibaba` | Alibaba DashScope TTS; model=qwen3-tts-instruct-flash | none |

### Embeddings (3)

| Current | Proposed | Preserved aliases | Multiplier | Paid | GPU | Provider | Primary route | Fallback |
|---|---|---|---:|---|---|---|---|---|
| `gemini-2` | `gemini-embedding-2` | `gemini-2`<br>`embedding` | 1 | Yes | No | `google` | Vertex us-central1/gemini-embedding-2-preview | none |
| `openai-3-small` | `text-embedding-3-small` | `openai-3-small`<br>`embedding-small` | 1 | No | No | `openai` | OpenAI embeddings; model=text-embedding-3-small | none |
| `openai-3-large` | `text-embedding-3-large` | `openai-3-large`<br>`embedding-large` | 1 | No | No | `openai` | OpenAI embeddings; model=text-embedding-3-large | none |

## Explicit approval gate

- [ ] All 73 rows are explicitly approved.
- [ ] The response-label policy is explicitly approved.
- [ ] No row contains an unresolved or assumed value.

Please confirm: for every row above, the canonical name and aliases are correct, the price multiplier is correct, paid-only status is correct, Pollinations-operated GPU status is correct, the registry provider is correct, the primary inference route is correct, and the fallback route is correct. Are all of these correct?

If any value is wrong or uncertain, identify the model and corrected value. No rename implementation begins until this gate is complete.
