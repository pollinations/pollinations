---
name: test-model
description: Test any model (text, image, video, audio) locally and via gen integration tests
---

# Testing Any Model Locally

## Services Overview

| Service | Port | Models |
|---------|------|--------|
| `image.pollinations.ai` | 16384 | Image + Video models |
| `gen.pollinations.ai` | 8788 | Public gateway: Text, Audio, Image/Video proxy |
| `enter.pollinations.ai` | 3000 | Auth/billing control plane |

## 1. Start services

```bash
# Image/Video models — start image service
cd image.pollinations.ai && npm run dev &

# Public generation gateway (text/audio + image/video proxy)
cd gen.pollinations.ai && npm run dev &

# Enter app (needed when testing auth/account flows directly)
cd enter.pollinations.ai && npm run decrypt-vars && npm run dev &
```

## 2. Get tokens

```bash
# For direct image service calls
TOKEN=$(grep '^PLN_ENTER_TOKEN=' image.pollinations.ai/.env | cut -d= -f2-)

# For gen gateway calls (use local token if present, otherwise remote test token)
API_KEY=$(grep '^ENTER_API_TOKEN_LOCAL=' enter.pollinations.ai/.testingtokens | cut -d= -f2-)
[ -n "$API_KEY" ] || API_KEY=$(grep '^ENTER_API_TOKEN_REMOTE=' enter.pollinations.ai/.testingtokens | cut -d= -f2-)
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
# Via gen gateway
curl -s -w "\nHTTP %{http_code}\n" \
  "http://localhost:8788/v1/chat/completions" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":"MODEL_NAME","messages":[{"role":"user","content":"Say hello"}],"max_tokens":50}'
```

## Test an Audio Model

Audio routes through gen gateway only (no standalone service).

```bash
# Text-to-speech
curl -s -o /tmp/test-audio.audio -w "HTTP %{http_code}, %{size_download} bytes\n" \
  "http://localhost:8788/audio/Hello%20world?voice=alloy&model=MODEL_NAME" \
  -H "Authorization: Bearer $API_KEY"

# OpenAI-compatible TTS
curl -s -o /tmp/test-tts.audio -w "HTTP %{http_code}, %{size_download} bytes\n" \
  "http://localhost:8788/v1/audio/speech" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":"MODEL_NAME","input":"Hello world","voice":"alloy"}'

# Speech-to-text (whisper/scribe)
curl -s -w "\nHTTP %{http_code}\n" \
  "http://localhost:8788/v1/audio/transcriptions" \
  -H "Authorization: Bearer $API_KEY" \
  -F "file=@/tmp/test-audio.audio" \
  -F "model=MODEL_NAME"

file /tmp/test-audio.audio /tmp/test-tts.audio
```

---

# Gen Integration Tests

Tests in `gen.pollinations.ai/test/`:

| File | Models |
|------|--------|
| `index.test.ts` | Routing and model endpoint smoke tests |
| `generation-vcr.test.ts` | VCR-backed text/image/audio generation paths |
| `audio-*.test.ts` | Focused audio regressions when present |

## Run tests for a specific model

```bash
cd gen.pollinations.ai
npx vitest run --testNamePattern="MODEL_NAME"
```

## Run all tests by type

```bash
npx vitest run test/index.test.ts
npx vitest run test/generation-vcr.test.ts
```

## Alias resolution tests (fast, no network)

```bash
cd gen.pollinations.ai && npx vitest run test/model-permissions.test.ts
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
| `gen.pollinations.ai/src/text/configs/modelConfigs.ts` | Model routing config |
| `gen.pollinations.ai/src/text/availableModels.ts` | Service name to config mapping |
| `shared/registry/text.ts` | Registry: pricing, provider, aliases |

## Audio
| File | Purpose |
|------|---------|
| `gen.pollinations.ai/src/routes/audio.ts` | OpenAI-compatible audio route handlers |
| `gen.pollinations.ai/src/routes/proxy.ts` | Simple `/audio/{text}` route |
| `shared/registry/audio.ts` | Registry: pricing, voices, aliases |

## Shared
| File | Purpose |
|------|---------|
| `<service>/.env` | API keys |
| `<service>/secrets/env.json` | Encrypted keys (sops) |
| `gen.pollinations.ai/test/` | Gen gateway tests |
