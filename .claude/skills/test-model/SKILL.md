---
name: test-model
description: Test any model (text, image, video, audio) locally and via enter integration tests
---

# Testing Any Model Locally

## Services Overview

| Service | Port | Models |
|---------|------|--------|
| `image.pollinations.ai` | 16384 | Image + Video models |
| `text.pollinations.ai` | 16385 | Text/LLM models |
| `enter.pollinations.ai` | 3000 | Gateway (routes to above + handles audio) |

## 1. Start services

```bash
# Image/Video models — start image service
cd image.pollinations.ai && npm run dev &

# Text models — start text service
cd text.pollinations.ai && npm run dev &

# Enter gateway (needed for audio, or to test full flow)
cd enter.pollinations.ai && npm run decrypt-vars && npm run dev &
```

## 2. Get tokens

```bash
# For direct image/text service calls
TOKEN=$(grep PLN_ENTER_TOKEN image.pollinations.ai/.env | cut -d= -f2)

# For enter gateway calls (use test API key)
API_KEY=$(grep ENTER_API_TOKEN_LOCAL enter.pollinations.ai/.testingtokens | cut -d= -f2)
```

---

## Test an Image Model

```bash
# Text-to-image
curl -s -o /tmp/test-image.jpg -w "HTTP %{http_code}, %{size_download} bytes\n" \
  "http://localhost:16384/prompt/a%20cute%20cat?model=MODEL_NAME&seed=42" \
  -H "x-enter-token: $TOKEN"

# Image editing (if model supports image input)
curl -s -o /tmp/test-edit.jpg -w "HTTP %{http_code}, %{size_download} bytes\n" \
  "http://localhost:16384/prompt/make%20it%20blue?model=MODEL_NAME&image=https://example.com/image.png" \
  -H "x-enter-token: $TOKEN"

file /tmp/test-image.jpg /tmp/test-edit.jpg
```

## Test a Video Model

```bash
curl -s -o /tmp/test-video.mp4 -w "HTTP %{http_code}, %{size_download} bytes\n" \
  "http://localhost:16384/prompt/a%20cat%20walking?model=MODEL_NAME&duration=3" \
  -H "x-enter-token: $TOKEN"

file /tmp/test-video.mp4
```

## Test a Text Model

```bash
# Via text service directly
curl -s -w "\nHTTP %{http_code}\n" \
  "http://localhost:16385/v1/chat/completions" \
  -H "Content-Type: application/json" \
  -H "x-enter-token: $TOKEN" \
  -d '{"model":"MODEL_NAME","messages":[{"role":"user","content":"Say hello"}],"max_tokens":50}'

# Via enter gateway
curl -s -w "\nHTTP %{http_code}\n" \
  "http://localhost:3000/api/generate/v1/chat/completions" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":"MODEL_NAME","messages":[{"role":"user","content":"Say hello"}],"max_tokens":50}'
```

## Test an Audio Model

Audio routes through enter gateway only (no standalone service).

```bash
# Text-to-speech
curl -s -o /tmp/test-audio.mp3 -w "HTTP %{http_code}, %{size_download} bytes\n" \
  "http://localhost:3000/api/generate/audio/Hello%20world?voice=alloy&model=MODEL_NAME" \
  -H "Authorization: Bearer $API_KEY"

# OpenAI-compatible TTS
curl -s -o /tmp/test-tts.mp3 -w "HTTP %{http_code}, %{size_download} bytes\n" \
  "http://localhost:3000/api/generate/v1/audio/speech" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":"MODEL_NAME","input":"Hello world","voice":"alloy"}'

# Speech-to-text (whisper/scribe)
curl -s -w "\nHTTP %{http_code}\n" \
  "http://localhost:3000/api/generate/v1/audio/transcriptions" \
  -H "Authorization: Bearer $API_KEY" \
  -F "file=@/tmp/test-audio.mp3" \
  -F "model=MODEL_NAME"

file /tmp/test-audio.mp3
```

---

# Enter Integration Tests

Tests in `enter.pollinations.ai/test/integration/`:

| File | Models |
|------|--------|
| `image.test.ts` | Image models |
| `video.test.ts` | Video models |
| `text.test.ts` | Text/LLM models |
| `audio.test.ts` | TTS, music, transcription |

## Run tests for a specific model

```bash
cd enter.pollinations.ai
npm run decrypt-vars
npx vitest run --testNamePattern="MODEL_NAME"
```

## Run all tests by type

```bash
npx vitest run test/integration/image.test.ts
npx vitest run test/integration/video.test.ts
npx vitest run test/integration/text.test.ts
npx vitest run test/integration/audio.test.ts
```

## Alias resolution tests (fast, no network)

```bash
cd enter.pollinations.ai && npx vitest run test/aliases.test.ts
```

---

# Key Files by Model Type

## Image / Video
| File | Purpose |
|------|---------|
| `image.pollinations.ai/src/models/` | Model handler implementations |
| `image.pollinations.ai/src/models.ts` | IMAGE_CONFIG (type, defaults, video flags) |
| `image.pollinations.ai/src/createAndReturnImages.ts` | Image model routing |
| `image.pollinations.ai/src/createAndReturnVideos.ts` | Video model routing |
| `shared/registry/image.ts` | Registry: pricing, provider, aliases |

## Text
| File | Purpose |
|------|---------|
| `text.pollinations.ai/configs/modelConfigs.ts` | Model routing config |
| `text.pollinations.ai/availableModels.ts` | Service name to config mapping |
| `shared/registry/text.ts` | Registry: pricing, provider, aliases |

## Audio
| File | Purpose |
|------|---------|
| `enter.pollinations.ai/src/routes/audio.ts` | Audio route handlers |
| `shared/registry/audio.ts` | Registry: pricing, voices, aliases |

## Shared
| File | Purpose |
|------|---------|
| `<service>/.env` | API keys |
| `<service>/secrets/env.json` | Encrypted keys (sops) |
| `enter.pollinations.ai/test/integration/` | All integration tests |
