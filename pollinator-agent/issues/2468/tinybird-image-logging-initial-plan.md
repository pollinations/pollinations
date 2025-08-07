# 🚀 Implementation Plan: Log Image Requests to Tinybird

Issue: [#2468 – Log image requests to Tinybird](https://github.com/pollinations/pollinations/issues/2468)

## 1. Goals
1. Capture rich observability data for **all image generation requests** served by `image.pollinations.ai` (success & error cases).
2. Stream these events to **Tinybird** in near-real-time, re-using the existing Tinybird pipeline used for text requests where practical.
3. Keep code **DRY & thin-proxy-friendly** by extracting shared observability logic to `shared/observability/`.
4. Avoid any performance regression (<1 ms overhead per request) and guarantee graceful degradation when `TINYBIRD_API_KEY` is absent.

## 2. Scope
✅ `image.pollinations.ai`
✅ `text.pollinations.ai` (refactor to shared util / remove dead code)
✅ `shared/observability/`
✅ Tinybird schemas & pipes
⬜ Other services (out-of-scope for this PR)

## 3. High-level Architecture
```
┌───────────────┐  Tinybird event (JSON)   ┌──────────────┐
│   Services    │ ───────────────────────▶ │  Tinybird    │
│  text.ai,img  │                         │  Workspace   │
└──────┬────────┘                         └──────────────┘
       │              shared/observability
       ▼
┌──────────────────────────────────────────────────────────┐
│ sendTinybirdEvent(event)                                 │
│   • Adds defaults, cost calc, provider lookup            │
│   • POSTs to /v0/events?name=<dataset>                   │
│   • 5 s timeout, silent-fail when disabled               │
└──────────────────────────────────────────────────────────┘
```

## 4. Tinybird Dataset Design
We will create a **new dataset** (`image_events`) to keep query costs low and leverage Tinybird’s automatic schema inference.

| Column                | Type      | Notes                                                  |
|-----------------------|-----------|--------------------------------------------------------|
| `id`                  | string    | `pllns_<random>`                                       |
| `user_id`             | string    | Pollinations user id or `anonymous`                    |
| `username`            | string    | GitHub username, if known                              |
| `tier`                | string    | seed / flower / nectar                                 |
| `model`               | string    | User-facing model name (e.g. `gptimage`)               |
| `provider`            | string    | `Stability`, `OpenAI`, …                               |
| `start_time`          | datetime  | ISO8601                                               |
| `end_time`            | datetime  | ISO8601                                               |
| `duration_ms`         | int       | `(end-start)`                                          |
| `status`              | string    | `success` / `error`                                    |
| `error_message`       | string    | Optional                                               |
| `prompt`              | string    | Sanitised prompt (first 120 chars)                     |
| `width`               | int       | final image width                                      |
| `height`              | int       | final image height                                     |
| `steps`               | int       | diffusion steps / inference steps                      |
| `cached`              | bool      | true if served from cache                              |
| `cost_usd`            | float     | calculated (*)                                         |
| `referrer`            | string    | request referrer, sanitized                            |
| `ip`                  | string    | anonymised / hashed (keep first 3 octets)              |

(*) **Cost formula**: replicate text logic – each `MODELS[model].pricing.{prompt,completion}` already exists for many image models; extend as needed or set `0` if unknown.

## 5. Detailed Steps

### 5.1 Extract Shared Observability Utility
1. Create `shared/observability/tinybird.js` (moved & renamed from `text.pollinations.ai/observability/tinybirdTracker.js`).
2. Convert to TypeScript-friendly JSDoc but remain JS for consistency.
3. Generalise `sendTinybirdEvent(event, { dataset = 'llm_events' })`.
4. Expose helper `getProviderName(modelName)` using `shared/model-utils.js` (new) that searches both `text.ai/availableModels.js` **and** `image.ai/models.js`.
5. Add **cost calculator** that accepts `usage` (tokens) *or* `imageParams` (size, steps) & model pricing map.
6. Preserve timeout, debug logging, env var handling.
7. Ensure zero required deps beyond existing (`debug`, `dotenv`, `node:fetch`).

### 5.2 Refactor Text Service
1. Delete unused `observability/tinybirdTracker.js` in `text.pollinations.ai`.
2. Import new util in `server.js` and wire calls:
   • **Success path** – right after `sendOpenAIResponse`.
   • **Error path** – inside `sendErrorResponse`.
3. Confirm no double-logging.

### 5.3 Instrument Image Service
1. Identify success hook: end of `checkCacheAndGenerate` just before `res.end(buffer)`.
2. Gather metrics:
   ```js
   const event = {
     id: requestId,
     startTime: timingInfo[0].timestamp,
     endTime: Date.now(),
     duration: Date.now() - timingInfo[0].timestamp,
     model: safeParams.model || 'default',
     prompt: originalPrompt.slice(0,120),
     width: safeParams.width,
     height: safeParams.height,
     steps: safeParams.steps,
     cached: cacheHit,
     user: authResult.userId,
     username: authResult.username,
     tier: authResult.tier,
     status: 'success',
   };
   sendTinybirdEvent(event, { dataset: 'image_events' });
   ```
3. Error hook: within catch block of `imageGen`; populate `status: 'error'` & `error: error.message`.
4. Cost calculation: extend `MODELS` with `pricing: { image: 0.02 }` etc; util will compute.

### 5.4 Update Shared Schemas & Model Maps
1. Add pricing metadata for each image model inside `image.pollinations.ai/src/models.js`.
2. Export helper to retrieve provider/pricing.
3. If Tinybird requires explicit schema, run:
   ```sql
   CREATE TABLE image_events (...) ENGINE = ReplacingMergeTree ...
   ```
   or via Tinybird UI.

### 5.5 Environment & Secrets
1. Ensure `TINYBIRD_API_KEY` & `TINYBIRD_API_URL` are loaded by `shared/env-loader.js` (already handles dotenv).
2. Document new env vars in root `README.md` & `.dev.vars.example`.

### 5.6 Testing
1. **Unit tests** for `shared/observability/tinybird.js` using mocked `fetch` (Jest).
2. **Integration tests**:
   • spin up `image` service locally, hit `/prompt/...`, assert `fetch` called once.
3. Ensure graceful skip when no API key.

### 5.7 Deployment
1. Merge PR → GitHub Actions build.
2. Set `TINYBIRD_API_KEY` secret in Cloudflare Wrangler for both workers.
3. Monitor Tinybird dataset growth.

### 5.8 Rollback Strategy
* Util is non-blocking; failures only log errors. Worst case we can set `TINYBIRD_API_KEY=""` to disable.

## 6. Timeline & Owners
| Day | Task | Owner |
|-----|------|-------|
| D0  | Agree plan, create dataset on Tinybird           | @data-team |
| D1  | Build shared util + refactor text service        | @backend-1 |
| D2  | Instrument image service & add pricing metadata  | @backend-2 |
| D3  | Tests & docs, PR review                          | @backend-team |
| D4  | Deploy to staging → production                   | @ops |

## 7. Risks & Mitigations
* **Tinybird downtime** – util aborts after 5 s, no impact on user path.
* **Payload size** – keep prompt truncated, strip binary data.
* **PII leakage** – hash IPs, truncate prompts, never send full token.

---
*Document generated on 2025-06-18.*
