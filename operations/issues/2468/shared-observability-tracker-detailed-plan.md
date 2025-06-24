# 🛠️ Unified Observability – Detailed Implementation Plan

**Issue:** [#2468 – Log image requests to Tinybird](https://github.com/pollinations/pollinations/issues/2468)

> This document proposes a step-by-step roadmap to build a shared **observability layer** that captures *both* text **and** image generation telemetry, routes it to Tinybird in near-real-time, and removes all duplicated tracking logic across repositories.

---
## 0. Current State Analysis
| Service | Tracking today | Key file(s) |
|---------|----------------|-------------|
| `text.pollinations.ai` | ✅  Sends JSON events to Tinybird (`llm_events` datasource). | `text.pollinations.ai/observability/tinybirdTracker.js` |
| `image.pollinations.ai` | ❌  Writes prompts/errors to local log files; **no Tinybird ingestion**. | `image.pollinations.ai/src/utils/gptImageLogger.js` |
| `shared` | ‑ | _none_ |

Problems:
1. **DRY violation** – text service owns Tinybird client logic; image service duplicates log formatting.
2. **No holistic dashboard** – image usage & costs are not captured.
3. **Divergent schemas** – Tinybird only understands `chat_completion` events.

---
## 1. Goals
1. Centralise telemetry code in **`shared/observability/`**.
2. Support two event types out-of-the-box:
   * `text_generation` (existing behaviour)
   * `image_generation` (new)
3. Provide **cost attribution** for both modalities.
4. Maintain backwards-compatibility for text dashboards.
5. Ship with automated tests, dashboards, and a safe rollout path.

---
## 2. Architecture Overview
```
 ┌───────────────┐        trackEvent()         ┌──────────────────────┐
 │ text service  │ ───────────────────────────▶│ Tinybird – llm_events│
 └───────────────┘                             └──────────────────────┘
            │                                    ▲
            │                                    │ (Materialised view)
            ▼ trackEvent()                       │
 ┌───────────────┐                              │
 │ image service │ ─────────────────────────────┘
 └───────────────┘
```
*Both* services import the same **`trackEvent()`** helper which:
1. Normalises & augments the payload.
2. Computes cost.
3. Streams JSON (NDJSON) to Tinybird `/v0/events` with the correct datasource name (`llm_events`).

_Image events are flagged with `event_type = 'image_generation'` so they coexist in the existing datasource._

---
## 3. Implementation Phases

### Phase 1 – Create Shared Tracker
1. **Folder & file**: `shared/observability/tracker.js`
2. Export **single async API**:
   ```js
   /**
    * Unified telemetry publisher.
    * @param {('text_generation'|'image_generation')} eventType
    * @param {Object} rawData – un-normalised data captured by the caller.
    */
   export async function trackEvent(eventType, rawData) { /* … */ }
   ```
3. Internal steps:
   * Merge & refactor logic from `tinybirdTracker.js`.
   * Move provider lookup (`findModelByName`) into the shared file (import from text repo).
   * Read `TINYBIRD_API_URL` & `TINYBIRD_API_KEY` via **shared/env-loader.js** so both services inherit secret management.
   * 5 s timeout using `AbortController` (existing logic).

### Phase 2 – Define Unified Schema
| Column | Type | Notes |
|--------|------|-------|
| `event_type` | `String` | `text_generation` / `image_generation` |
| `model`      | `String` | e.g. `openai` / `gptimage` |
| `provider`   | `String` | `azure`, `cloudflare`, … |
| `duration`   | `UInt32` | ms end-to-end |
| `cost`       | `Float32`| $ approximate |
| `status`     | `Enum('success','error')` |
| `user_id`    | `String` | from `requestUtils` or HTTP params |
| `tier`       | `String` | seed / flower / nectar / anonymous |
| `timestamp`  | `DateTime64(3)` | `end_time` |
| **Text-only** | | – |
| `prompt_tokens`| `UInt32`| |
| `completion_tokens`|`UInt32`| |
| **Image-only**| | – |
| `image_width` | `UInt16` | px |
| `image_height`| `UInt16` | px |
| `num_images`  | `UInt8`  | usually 1 |

*Tinybird automatically adds ingestion metadata (`_time`, `_tb_version`).*

#### 2.1  Tinybird Migration
* Using a migration script or Tinybird UI:
  ```sql
  ALTER TABLE llm_events
    ADD COLUMN IF NOT EXISTS event_type String DEFAULT 'text_generation',
    ADD COLUMN IF NOT EXISTS image_width UInt16,
    ADD COLUMN IF NOT EXISTS image_height UInt16,
    ADD COLUMN IF NOT EXISTS num_images UInt8;
  ```
* Create two materialised views:
  * `text_events_mv` → filters `event_type='text_generation'`.
  * `image_events_mv` → filters `event_type='image_generation'`.

### Phase 3 – Cost Calculation Helper
1. **Text** – Re-use existing algorithm (per-million token rates from `availableModels.pricing`).
2. **Image** – Extend `availableModels.js` **or** create `shared/imageModels.js` with structure:
   ```js
   export const imageModelPricing = {
     gptimage: 0.04,  // per final image
     dreamshaper: 0.01,
     flux: 0.005
   };
   ```
3. `trackEvent()` selects the right formula based on `eventType`.

### Phase 4 – Integrate Into Services
#### 4.1  text.pollinations.ai
* Replace **all** `sendTinybirdEvent()` imports with `trackEvent()`:
  ```diff
  - import { sendTinybirdEvent } from './observability/tinybirdTracker.js';
  + import { trackEvent } from '../shared/observability/tracker.js';
  
  - await sendTinybirdEvent(eventData);
  + await trackEvent('text_generation', eventData);
  ```
* Delete old tracker once CI passes.

#### 4.2  image.pollinations.ai
* In `createAndReturnImageCached`:
  ```js
  import { trackEvent } from '../../shared/observability/tracker.js';

  const start = performance.now();
  let status = 'success', err;
  try {
     const result = await generateImage(...);
     return result;
  } catch(e) {
     status = 'error';
     err = e;
     throw e;
  } finally {
     const duration = performance.now() - start;
     await trackEvent('image_generation', {
        model: safeParams.model,
        duration,
        user: userInfo.userId,
        tier: userInfo.tier,
        image_width: safeParams.width,
        image_height: safeParams.height,
        num_images: safeParams.n || 1,
        status,
        error: err
     });
  }
  ```
* Remove `src/utils/gptImageLogger.js` (legacy local logging).

### Phase 5 – Tests & CI
1. **Unit** – Jest tests for `tracker.js` covering:
   * cost maths (token vs image).
   * graceful handling when `TINYBIRD_API_KEY` is undefined.
2. **Integration** – WireMock (or Tinybird test token) ensuring HTTP payload format.
3. **E2E** – Cypress smoke tests hitting `/generate` & `/create-image` endpoints and verifying events appear via Tinybird API.

### Phase 6 – Dashboards & Alerts
* Build Tinybird Pipes:
  * Top models by spend (across text+image).
  * Generation latency percentiles.
  * Error rate per service.
* Hook Grafana alerts (using Tinybird Webhooks) for:
  * 5-minute error rate > 2 %.
  * Daily cost anomaly (>3× rolling 7-day mean).

### Phase 7 – Rollout Strategy
| Step | Environment | Action |
|------|-------------|--------|
| 1 | **Staging** | Deploy shared tracker; mirror events only. |
| 2 | Staging | Flip env `ENABLE_TB_TRACKING_IMAGE=true`; verify dashboards. |
| 3 | **Prod Canary** | Enable for 10 % image traffic via feature flag. |
| 4 | Prod | Ramp to 100 % after 24 h if no regressions. |

Rollback: toggle feature flag & delete new columns via Tinybird UI (non-destructive).

---
## 4. Security & Compliance
* Secrets loaded via shared `.env` & Cloudflare Wrangler (`wrangler secret put TINYBIRD_API_KEY`).
* Pay-as-you-go exposure limited by 5 s timeout + retry-with-backoff (future work).
* Personally Identifiable Information (PII) **not** stored – only user IDs.

---
## 5. Timeline & Owners
| Phase | Owner | Estimate |
|-------|-------|----------|
| 1-2 Design & Tracker | Backend | 2 days |
| 3 Cost helper | Backend | 0.5 day |
| 4 Text refactor | Backend | 1 day |
| 4 Image integration | Backend | 1.5 days |
| 5 Tests & CI | QA | 1 day |
| 6 Dashboards | Data Eng | 1 day |
| 7 Rollout | DevOps | 0.5 day |
| **Total** |  | **~7 working days** |

---
## 6. Open Questions
1. **Image cost model** – flat rate per image vs tiered by resolution?
2. **High-volume throttling** – should tracker implement rate-limiting or rely on Tinybird quotas?
3. **Deletion of old logs** – retain or migrate legacy file logs to Tinybird?

---
✅ *End of plan – ready for review & execution*
