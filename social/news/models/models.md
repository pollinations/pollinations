# Pollinations Model Changelog

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
