# Pollinations Model Changelog

## 2026-07-15

### Added
- `gpt-5.6-sol` (OpenAI, text) — text/image input; tool calling and reasoning.
- `gpt-5.6-terra` (OpenAI, text) — text/image input; tool calling and reasoning.
- `gpt-5.6-luna` (OpenAI, text) — text/image input; tool calling and reasoning.
- `claude-fable-5` (Anthropic, text) — text/image input; tool calling; paid-only.
- `muse-spark-1.1` (Meta, text) — text/image input; tool calling and reasoning; paid-only.
- `Spit-fires/diffusiongemma-26b-a4b-it` (Community, text) — alpha; text input/output.
- `morriszdweck/qwen-3.7-plus-cheap` (Community, text) — alpha; text input/output.
- `sharktide/inferenceport-ai-gpt-4.1` (Community, text) — alpha; text input/output.
- `Minor-fun/deepseek-v3.2` (Community, text) — alpha; text input/output.
- `Minor-fun/deepseek-v4-flash` (Community, text) — alpha; text input/output.
- `Spit-fires/step-3.5-flash-free` (Community, text) — alpha; text input/output.
- `Spit-fires/gpt-oss-20b-free` (Community, text) — alpha; text input/output.
- `MarcosFRG/glm-4.6v-flash` (Community, text) — alpha; text input/output.
- `smplstuff/falcon-h1-tiny` (Community, text) — alpha; text input/output.
- `Bakhshi7889/gemma-4-31b-it` (Community, text) — alpha; text input/output.
- `vendouple/kimi-k2.6` (Community, text) — alpha; text input/output.
- `Spit-fires/bonsai-image-512x512-4` (Community, text) — alpha; text input/output.
- `morriszdweck/kimi-k2.6-cheap` (Community, text) — alpha; text input/output.
- `Catniti/gpt-4.0` (Community, text) — alpha; text input/output.
- `vendouple/deepseek-v3.2` (Community, text) — alpha; text input/output.
- `Catniti/nemotron-3-ultra-550b-a55b` (Community, text) — alpha; text input/output.
- `Catniti/Laguna-xs-2.1` (Community, text) — alpha; text input/output.
- `MarcosFRG/minimax-m2.7` (Community, text) — alpha; text input/output.
- `mikl-shortcuts/ministral-3` (Community, text) — alpha; text input/output.
- `vendouple/gpt-5.6-sol` (Community, text) — alpha; text input/output.
- `MarcosFRG/gemini-3.1-pro-preview` (Community, text) — alpha; text input/output.
- `MarcosFRG/gemini-3.1-flash-lite` (Community, text) — alpha; text input/output.
- `Circuit-Overtime/lixsearch` (Community, text) — alpha; text input/output.
- `Catniti/openai-o4-mini` (Community, text) — alpha; text input/output.
- `Catniti/glm-4.7-flash` (Community, text) — alpha; text input/output.
- `vendouple/deepseek-v4-flash` (Community, text) — alpha; text input/output.
- `solarnode-developement/hy3` (Community, text) — alpha; text input/output.
- `Catniti/glm-4.7` (Community, text) — alpha; text input/output.
- `Catniti/agnes-2.0-flash` (Community, text) — alpha; text input/output.
- `vendouple/nemotron-3-ultra` (Community, text) — alpha; text input/output.
- `solarnode-developement/free` (Community, text) — alpha; text input/output.
- `vendouple/unlocked-deepseek` (Community, text) — alpha; text input/output.
- `vendouple/deepseek-v4-pro` (Community, text) — alpha; text input/output.
- `Catniti/claude-sonnet-4.6` (Community, text) — alpha; text input/output.
- `Catniti/gpt-oss-120b` (Community, text) — alpha; text input/output.
- `YoannDev90/diffusiongemma-26b-a4b-it` (Community, text) — alpha; text input/output.
- `solarnode-developement/glm-5.2-cheap` (Community, text) — alpha; text input/output.
- `MarcosFRG/glm-5.2` (Community, text) — alpha; text input/output.
- `Catniti/gpt-5.6-luna` (Community, text) — alpha; text input/output.
- `Spit-fires/free` (Community, text) — alpha; text input/output.
- `vendouple/gpt-5.6-terra` (Community, text) — alpha; text input/output.
- `vendouple/gemma-4-31B` (Community, text) — alpha; text input/output.
- `Minor-fun/gemma-4-31B-it` (Community, text) — alpha; text input/output.
- `Minor-fun/LongCat-2.0` (Community, text) — alpha; text input/output.
- `seedream5-pro` (ByteDance, image) — text/image input; image output; paid-only.

### Changed
- `gpt-image-2` — now free.
- `claude-sonnet-5` — price cut ~35%.
- `CloudCompile/gemma-4-e2b` — price cut ~90%.
- `MarcosFRG/mimo-v2.5` — price cut ~30%.
- `grok-imagine-pro` — image price cut ~30%.
- `eleven-sfx` — audio price cut 50%.
- `qwen-tts` — audio price cut ~25%.
- `qwen-tts-instruct` — audio price cut ~10%.
- `mistral-small-3.2` — removed cached-input pricing.
- `mistral` — cached-input price cut 90%.
- `gemini-3-flash` — added prompt cache-write pricing.
- `gemini` — added prompt cache-write pricing.
- `gemini-flash-lite-3.1` — added prompt cache-write pricing.
- `gemini-fast` — added prompt cache-write pricing.
- `deepseek` — cached-input price increased ~115%.
- `gemini-search` — added prompt cache-write pricing.
- `gemini-search-fast` — added prompt cache-write pricing.
- `gemini-search-large` — added prompt cache-write pricing.
- `gemini-large` — added prompt cache-write, audio, image, and video input pricing.
- `nova-fast` — added cached-input pricing.
- `nova` — added cached-input pricing.
- `glm` — cached-input price cut 50%.
- `llama-scout` — prompt price +25%.
- `qwen-coder-large` — added cached-input pricing.
- `step-3.5-flash` — prompt price +10%; removed cached-input pricing.
- `tomdacatto/ezra` — price +100%.
- `MarcosFRG/gemma-4-31b` — price +~190%.
- `MarcosFRG/deepseek-v4-flash` — price +~180%.
- `MarcosFRG/gemini-2.5-flash-lite` — price +50%.
- `MarcosFRG/deepseek-v4-pro` — price +~105%.
- `MarcosFRG/gemini-3-flash-preview` — price +50%.
- `MarcosFRG/minimax-m3` — price +200%.
- `MarcosFRG/deepseek-v3.2` — price +5%.
- `MarcosFRG/gemma-3-27b` — price +~80%.
- `MarcosFRG/step-3.5-flash` — price +25%.
- `nanobanana` — added completion text pricing.
- `nanobanana-pro` — prompt input pricing increased 60%.
- `grok-imagine` — added image-input pricing.
- `grok-video-pro` — video output price +40%; added image-input pricing.

### Removed
- `Spit-fires/LFM2.5-230M` (was: text)
- `smplstuff/qwen3-0.6b` (was: text)
- `skullcrushercmd/gemini-3.1-pro-preview` (was: text)
- `MarcosFRG/llama-4-scout` (was: text)
- `Spit-fires/Supra-1.5-50M-instruct` (was: text)
- `MarcosFRG/cosmosrp-2.1` (was: text)
- `MarcosFRG/qwen3-coder-30b-a3b` (was: text)
- `MarcosFRG/grok-4.20-non-reasoning` (was: text)
- `MarcosFRG/grok-4.20-reasoning` (was: text)
- `MarcosFRG/grok-4.3` (was: text)
- `MarcosFRG/step-3.7-flash` (was: text)
- `MarcosFRG/gpt-5-nano` (was: text)
- `MarcosFRG/gpt-5.4-nano` (was: text)
- `MarcosFRG/mistral-large-3` (was: text)
- `MarcosFRG/kimi-k2.6` (was: text)
- `sharktide/inferenceport-ai-kimi-k2.6` (was: text)

## 2026-07-01

### Added
- `claude-sonnet-5` (Anthropic, text) — vision + tool calling.
- `voodoohop/anyvm-deepseek-chat` (Community, text) — text model.
- `voodoohop/airforce-qwen3-max` (Community, text) — text model.
- `voodoohop/airforce-doubao-pro` (Community, text) — text model.
- `voodoohop/airforce-grok-4-fast` (Community, text) — text model.
- `CloudCompile/gemma-4-e2b` (Community, text) — text model.
- `sharktide/inferenceport.ai-gpt-oss-20b` (Community, text) — text model.
- `sharktide/inferenceport.ai-gpt-5-chat-latest` (Community, text) — text model.
- `Spit-fires/LFM2.5-230M` (Community, text) — text model.
- `smplstuff/qwen3-0.6b` (Community, text) — text model.
- `tomdacatto/ezra` (Community, text) — text model.
- `skullcrushercmd/gemini-3.1-pro-preview` (Community, text) — text model.
- `MarcosFRG/gemma-4-31b` (Community, text) — text model.
- `MarcosFRG/deepseek-v4-flash` (Community, text) — text model.
- `MarcosFRG/deepseek-v3.2` (Community, text) — text model.
- `MarcosFRG/gemini-2.5-flash-lite` (Community, text) — text model.
- `MarcosFRG/llama-4-scout` (Community, text) — text model.
- `Spit-fires/Supra-1.5-50M-instruct` (Community, text) — text model.
- `MarcosFRG/cosmosrp-2.1` (Community, text) — text model.
- `MarcosFRG/qwen3-coder-30b-a3b` (Community, text) — text model.
- `MarcosFRG/grok-4.20-non-reasoning` (Community, text) — text model.
- `MarcosFRG/grok-4.20-reasoning` (Community, text) — text model.
- `MarcosFRG/grok-4.3` (Community, text) — text model.
- `MarcosFRG/step-3.5-flash` (Community, text) — text model.
- `MarcosFRG/step-3.7-flash` (Community, text) — text model.
- `MarcosFRG/gpt-5-nano` (Community, text) — text model.
- `MarcosFRG/deepseek-v4-pro` (Community, text) — text model.
- `MarcosFRG/minimax-m3` (Community, text) — text model.
- `MarcosFRG/gpt-5.4-nano` (Community, text) — text model.
- `MarcosFRG/mistral-large-3` (Community, text) — text model.
- `MarcosFRG/mimo-v2.5` (Community, text) — text model.
- `MarcosFRG/kimi-k2.6` (Community, text) — text model.
- `MarcosFRG/gemma-3-27b` (Community, text) — text model.
- `sharktide/inferenceport-ai-command-r-plus` (Community, text) — text model.
- `sharktide/inferenceport-ai-mimo-v2.5` (Community, text) — text model.
- `sharktide/inferenceport-ai-kimi-k2.6` (Community, text) — text model.
- `MarcosFRG/gemini-3-flash-preview` (Community, text) — text model.
- `nanobanana-2-lite` (Google, image) — vision input.

### Changed
- `glm` — price +100%.

## 2026-06-24

### Added
- `gpt-5.4` (OpenAI, text) — vision, tool calling, and reasoning.
- `mercury` (Inception, text) — tool calling.
- `mistral-small-3.2` (Mistral, text) — vision and tool calling.
- `gemini-3-flash` (Google, text) — vision, audio/video input, tool calling, web search, and code execution.
- `grok-4-20-reasoning` (xAI, text) — vision, tool calling, and reasoning.
- `claude-opus-4.6` (Anthropic, text) — vision and tool calling.
- `kimi-code` (Moonshot AI, text) — vision, tool calling, and reasoning.
- `minimax-m2.7` (MiniMax, text) — tool calling and reasoning.
- `eleven-multilingual-v2` (ElevenLabs, audio) — TTS.
- `eleven-sfx` (ElevenLabs, audio) — TTS.
- `stable-audio-3-medium` (Stability AI, audio) — TTS.
- `stable-audio-3-large` (Stability AI, audio) — TTS.

### Changed
- `grok-large` — price cut ~60%.
- `glm` — price cut ~30%.
- `elevenlabs` — price cut ~40%.
- `elevenflash` — price cut ~40%.
- `elevenmusic` — price cut ~50%, added audio input.
- `openai-large` — price +100%.
- `mistral` — price +200%, added reasoning.
- `gemini` — price +200%.
- `kimi` — price +35%.
- `minimax` — added image input.

### Removed
- `gpt-5.5` (was: text)
- `mistral-4` (was: text)
- `gemini-3.5-flash` (was: text)
- `grok-4.3` (was: text)
- `claude-opus-4.8` (was: text)
- `kimi-k2.6` (was: text)
- `kimi-k2.7-code` (was: text)
- `minimax-m3` (was: text)

## 2026-06-17

### Text
- `kimi-k2.7-code` (Moonshot AI) — agentic coding model with CoT reasoning
- `openai-large` (OpenAI) — increased context length to 1,050,000
- `gpt-5.5` (OpenAI) — increased context length to 1,050,000
- `gemini-flash-lite-3.1` (Google) — added video input support
- `gemini-fast` (Google) — added video input support
- `grok-4.3` (xAI) — increased context length to 1,048,576
- `gemini-search` (Google) — added video input support
- `gemini-search-fast` (Google) — added video input support
- `claude` (Anthropic) — increased context length to 1,000,000
- `claude-large` (Anthropic) — increased context length to 1,000,000
- `claude-opus-4.7` (Anthropic) — increased context length to 1,000,000
- `qwen-large` (Qwen) — added qwen3.7 aliases and decreased context length to 262,000
- `minimax-m3` (MiniMax) — decreased context length to 524,288
- `polly` (Pollinations) — now in alpha

### Image
- `ideogram-v4-turbo` (Ideogram) — fast text-to-image with accurate typography
- `ideogram-v4-balanced` (Ideogram) — text-to-image with accurate typography
- `ideogram-v4-quality` (Ideogram) — high-fidelity text-to-image with typography
- `wan-pro-1080p` (Alibaba) — text/image-to-video with bundled audio (1080p)
- `p-video-720p` (Pruna) — text/image-to-video generation (720p)
- `p-video-1080p` (Pruna) — text/image-to-video generation (1080p)
- `wan-pro` (Alibaba) — added end_frame video capability
- `klein` (Black Forest Labs) — now in alpha
- `ltx-2` (Lightricks) — now in alpha

### Audio
- `elevenlabs` (ElevenLabs) — now in alpha
- `elevenflash` (ElevenLabs) — now in alpha
- `elevenmusic` (ElevenLabs) — now in alpha
- `whisper` (OpenAI) — now in alpha
- `acestep` (ACE-Step) — now in alpha

### Removed
- `p-video` (was: image)

## 2026-06-03

### Text
- `claude-opus-4.8` (Claude) — added as paid-only.
- `perplexity-deep` (Perplexity).
- `perplexity` (Perplexity).
- `minimax-m3` (MiniMax) — includes reasoning support.
- `step-flash` (StepFun) — includes reasoning support.
- `step-3.5-flash` (StepFun) — includes reasoning support.
- `mistral-4` — added reasoning support.
- `claude-fast` — now paid-only.
- `perplexity-fast` — removed vision support.
- `perplexity-reasoning` — removed vision support.
- `qwen-coder-large` — now paid-only.

### Image
- `wan-image` — now paid-only.
- `qwen-image` — now paid-only.

### Audio
- `qwen-tts` — now paid-only.

## 2026-05-27

### Text
- `grok-4.3` (Grok) — added with multimodal and reasoning support.
- `gemini-search-fast` (Gemini) — added as paid-only.
- `gemini-search-large` (Gemini) — added as paid-only.
- `gpt-5.5` — no longer paid-only.
- `gemma` — no longer paid-only.
- `deepseek-pro` — no longer paid-only.
- `grok-large` (Grok) — no longer paid-only.
- `midijourney-large` — no longer paid-only.

### Image
- `wan-pro` (Alibaba) — added as paid-only with video and audio output.
- `nova-canvas` (Amazon) — no longer paid-only.

### Audio
- `universal-3-pro` (AssemblyAI) — no longer paid-only.

### Embeddings
- `cohere-embed-v4` (Cohere) — added with 128K context.
- `qwen3-embedding-8b` (Qwen3) — added with 32K context.

## 2026-05-20

### Text
- `gemini-3.5-flash` (Gemini) — paid-only, supports text, image, audio, and video inputs
- `gemini-fast` (Gemini) — now paid-only
- `gemini-search` (Google) — now paid-only

### Audio
- `scribe` — now paid-only

## 2026-05-19

### Text
- `gpt-5.4-mini` (OpenAI)
- `mistral-4` (Mistral)
- `qwen-vision-pro` (Qwen) — includes reasoning support
- `openai` — removed `gpt-5-mini` alias
- `mistral` — updated to version 3.2, context length decreased to 128k
- `openai-audio` — removed vision support
- `openai-audio-large` — removed vision support
- `deepseek` — no longer paid-only
- `perplexity-fast` — added vision support
- `perplexity-reasoning` — added vision support
- `nova` — added vision support
- `llama-scout` — added tool calling, context length decreased to 327k
- `qwen-vision` — removed reasoning support, context length decreased to 131k

### Image
- `seedream` — paid-only
- `seedream-pro` — paid-only
- `veo` — added video capabilities (start/end frame, audio output)
- `seedance-pro` — added video capabilities (start frame)
- `seedance-2.0` — added video capabilities (start/end frame, audio output)
- `wan` — added video capabilities (start frame, audio output)
- `wan-fast` — added video capabilities (start/end frame)
- `grok-video-pro` — added video capabilities (start frame)
- `ltx-2` — added vision support and video capabilities (start frame)
- `p-video` — added video capabilities (start frame)
- `nova-reel` — added video capabilities (start frame)

### Audio
- `elevenflash` (ElevenLabs) — paid-only

### Removed
- `seedance` (was: image)
