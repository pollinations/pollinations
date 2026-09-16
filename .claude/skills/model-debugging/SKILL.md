---
name: model-debugging
description: Debug and diagnose model errors in Pollinations services. Analyze logs, find error patterns, identify affected users.
---

# Model Debugging Skill

Use this skill when:
- Investigating model failures, high error rates, or service issues
- Finding users affected by errors (402 billing, 403 permissions, 500 backend)
- Analyzing Tinybird/Cloudflare logs for patterns
- Diagnosing specific request failures

# Understanding Model Monitor Error Rates

**Why does the Model Monitor show high error rates when models work fine manually?**

The Model Monitor at https://monitor.pollinations.ai shows **all real-world traffic**, including:

- **401 errors**: Anonymous users without API keys (most common)
- **402 errors**: Users with insufficient pollen balance or exhausted API key budget
- **403 errors**: Users denied access to specific models (API key restrictions)
- **400 errors**: Invalid request parameters (e.g., `openai-audio` without `modalities` param)
- **429 errors**: Rate-limited requests
- **500/504 errors**: Actual backend failures (investigate these)

When you test manually with a valid secret key (`sk_`), you bypass auth/quota issues, so models appear to work fine.

**Key insight**: High 401/402/403/400 rates are **expected** from real-world usage. Focus investigation on 500/504 errors.

**Also watch for the invisible failure class**: a successful (200) response that is simply too slow for the client's own timeout never shows up in status-code rates, average latency, or p95 — the pain lives in the per-user latency tail. See "Slow-but-200 / Client-Side Timeout" below.

---

# Data Flow Architecture

```
User Request → enter.pollinations.ai (Cloudflare Worker)
                    ↓
              Logs to Cloudflare Workers Observability
                    ↓
              Events stored in D1 database
                    ↓
              Batched to Tinybird (async, 100-500 events)
                    ↓
              Model Monitor queries Tinybird (model_health.pipe)
```

**Structured Logging**: enter.pollinations.ai uses LogTape with:
- `requestId`: Unique per request (passed to downstream via `x-request-id` header)
- `status`, `body`: Full error response from downstream services
- Context: `method`, `routePath`, `userAgent`, `ipAddress`

---

# Quick Diagnostics

## 1. Check Model Monitor
View current model health at: https://monitor.pollinations.ai

## 2. Query Recent Errors from D1 Database
```bash
# Via enter.pollinations.ai worker (requires wrangler)
cd enter.pollinations.ai
npx wrangler d1 execute pollinations-db --remote --command "SELECT model_requested, response_status, error_message, COUNT(*) as count FROM event WHERE response_status >= 400 AND created_at > datetime('now', '-1 hour') GROUP BY model_requested, response_status, error_message ORDER BY count DESC LIMIT 20"
```

## 3. Capture Live Logs

### enter.pollinations.ai (Cloudflare Worker)
```bash
cd enter.pollinations.ai
wrangler tail --format json | tee logs.jsonl
# Or with formatting:
wrangler tail --format json | npx tsx scripts/format-logs.ts
```

### gen.pollinations.ai (image + text gateway)
Image and text generation now run inside the gen Cloudflare Worker (the legacy EC2 `image-pollinations` and `text-pollinations` services are decommissioned). Use `wrangler tail` from `gen.pollinations.ai/`:
```bash
cd gen.pollinations.ai
wrangler tail --format json | tee gen-logs.jsonl
```

### Legacy anonymous image (OVH)
Anonymous traffic to `image.pollinations.ai` still terminates on the OVH host:
```bash
# Real-time logs
ssh -i ~/.ssh/id_rsa_ovh ubuntu@57.130.31.42 "sudo journalctl -u image-pollinations -f"

# Last 3 minutes
ssh -i ~/.ssh/id_rsa_ovh ubuntu@57.130.31.42 "sudo journalctl -u image-pollinations --since '3 minutes ago' --no-pager" > legacy-image-logs.txt
```

---

# Common Error Patterns

## Azure Content Safety DNS Failure
**Error**: `getaddrinfo ENOTFOUND gptimagemain1-resource.cognitiveservices.azure.com`
**Cause**: Azure Content Safety resource deleted or misconfigured
**Impact**: Fail-open (content proceeds without safety check)
**Fix**: Create new Azure Content Safety resource and update `.env`:
```
AZURE_CONTENT_SAFETY_ENDPOINT=https://<new-resource>.cognitiveservices.azure.com/
AZURE_CONTENT_SAFETY_API_KEY=<new-key>
```

## Azure Kontext Content Filter
**Error**: `Content rejected due to sexual/hate/violence content detection`
**Cause**: Azure's content moderation blocking prompts/images
**Impact**: 400 error returned to user
**Fix**: User error - prompt violates content policy

## Vertex AI Invalid Image
**Error**: `Provided image is not valid`
**Cause**: User passing unsupported image URL (e.g., Google Drive links)
**Impact**: 400 error returned to user
**Fix**: User error - need direct image URL

## Translation Service Down
**Error**: `No active translate servers available`
**Cause**: Translation service unavailable
**Impact**: Prompts not translated (non-fatal)
**Fix**: Check translation service status

## OpenAI Audio Invalid Voice
**Error**: `Invalid value for audio.voice`
**Cause**: User requesting unsupported voice name
**Impact**: 400 error returned to user
**Fix**: User error - use supported voices: alloy, echo, fable, onyx, nova, shimmer, coral, verse, ballad, ash, sage, etc.

## Oversized Text Seed Surfaced as 500
**Error**: `'seed' must be Integer`, `invalid request error`, or a generic upstream 500
**Cause**: A client sent a seed above signed INT32 max (`2147483647`) to a strict provider
**Impact**: The provider may misclassify invalid client input as 500, inflating model health errors
**Fix**: Reject oversized seeds as 400 at gateway validation; group incidents by user, API key, and request shape before treating them as a model outage

## Veo No Video Data
**Error**: `No video data in response`
**Cause**: Vertex AI returned empty video response
**Impact**: 500 error
**Fix**: Check Vertex AI quota/status, may be transient

## Slow-but-200 / Client-Side Timeout
**Error**: None server-side — the request completes with 200, but users report "no response" or a timeout
**Cause**: Server-side latency tail exceeds the *client's* own timeout (e.g. Roblox HttpService ~30s), even though status-code rates and average/p95 latency look healthy
**Impact**: Invisible to error-rate dashboards; usually concentrated on one user or request shape (e.g. very large prompts)
**Fix**: Query the latency tail directly, grouped by user — `countIf(response_time>30000)` and `max(response_time)` — not just error rate or p95

## Instant Rejection from a Per-Key Queue/Rate Limit
**Error**: `Queue full`, or a 402/429 rejected on the user's very first request
**Cause**: Could be an intended throttle, or leaked in-memory state (a slot never reaped)
**Impact**: User blocked even though the backend is idle
**Fix**: Compare the guard's state against the backend's own idle/load counters to localize the rejection. Waiting out any time-based window and firing exactly one request distinguishes a live interval throttle (clears) from something else (still rejected) — but treat the fix itself as an experiment: if a predicted fix (e.g. restarting to clear in-memory state) doesn't change the behavior, that's disconfirming evidence for the diagnosis, not a deployment problem — re-open with live state before trying a second fix. For any per-key limit keyed by client IP, check the distinct-IP cardinality the limiter actually sees; a multi-hop proxy can collapse many clients onto one egress IP, which looks identical to a leaked slot from the outside.

## Stream/Usage Errors (missing usage, dropped terminal SSE event)
**Error**: Missing token usage (`usage_missing`) or a dropped terminal event (e.g. `[DONE]`) at the end of a stream
**Cause**: Often an upstream disconnect or transport error masked downstream, not the provider omitting data
**Impact**: Can misattribute a transport/parsing bug to the provider
**Fix**: Inspect the terminal SSE evidence and the original transport error across provider → adapter → validator before blaming the provider — truncated error logs can retain only early chunks and miss the terminal evidence. When two components parse the same SSE body (e.g. a validator and a tracker), confirm they agree on end-of-stream handling (a stream closed with a single trailing newline, not a blank line, is a valid provider shape) — a disagreement between them shows up as a phantom provider failure.

## Health-Check False Exclusions (402/403 During Automated Probing)
**Error**: An automated health monitor excuses a failing candidate as "client noise" (e.g. 402 payment required, 403)
**Cause**: The same status/wording can come from different failing actors — the probe's own wallet or gateway auth, vs. the upstream provider's own credits, quota, or hosting suspension
**Impact**: Genuine provider outages get vetoed from being flagged (or the reverse: probe-side issues get misread as a provider outage)
**Fix**: Before tuning any success threshold, trace each excluded candidate through the actual decision/veto log and attribute the failure to its real origin (probe-wallet/payer vs. upstream provider) rather than keying policy off the status code or phrase alone

---

# Environment Variables to Check

Image and text env vars now live in the gen Worker secrets (`gen.pollinations.ai/secrets/{dev,staging,prod}.vars.json`, SOPS-encrypted). Decrypt to inspect:
```bash
sops -d gen.pollinations.ai/secrets/prod.vars.json | jq 'keys[] | select(test("AZURE|GOOGLE|CLOUDFLARE|OPENAI"))'
```

Key variables:
- `AZURE_CONTENT_SAFETY_ENDPOINT` - Azure Content Safety API endpoint
- `AZURE_CONTENT_SAFETY_API_KEY` - Azure Content Safety API key
- `GOOGLE_PROJECT_ID` - Google Cloud project for Vertex AI
- `AZURE_MYCELI_PROD_SWEDEN_API_KEY` - Shared Azure API key (Kontext, GPT Image, GPT Image 1.5)

---

# Updating Secrets

Secrets are stored encrypted with SOPS:
- `gen.pollinations.ai/secrets/{dev,staging,prod}.vars.json`
- `enter.pollinations.ai/secrets/{dev,staging,prod}.vars.json`

To update:
```bash
# Decrypt, edit, re-encrypt
sops gen.pollinations.ai/secrets/prod.vars.json

# Deploy to the gen Worker (secrets ship with the deploy)
cd gen.pollinations.ai && npm run deploy
```

---

# Log Analysis Commands

```bash
# Count errors by type (against captured wrangler-tail JSON)
jq -r '.logs[]?.message[]? // .message? // empty' gen-logs.jsonl | grep -oE "(Azure Flux Kontext|Vertex AI|No active translate|getaddrinfo ENOTFOUND)" | sort | uniq -c | sort -rn

# Find content filter rejections
jq -r '.logs[]?.message[]? // .message? // empty' gen-logs.jsonl | grep -i "Content rejected" | sort | uniq -c
```

---

# Model-Specific Debugging

| Model | Backend | Common Issues |
|-------|---------|---------------|
| `flux` | Azure/Replicate | Rate limits, content filter |
| `kontext` | Azure Flux Kontext | Content filter (strict) |
| `nanobanana` | Vertex AI Gemini | Invalid image URLs, content filter |
| `seedream-pro` | ByteDance ARK | NSFW filter, API key issues |
| `veo` | Vertex AI | Quota, empty responses |
| `openai-audio` | Azure OpenAI | Invalid voice names |
| `deepseek` | DeepSeek API | Rate limits, API key |

---

# Cloudflare Workers Observability API

The enter.pollinations.ai worker has structured logging enabled. You can query logs programmatically via the Cloudflare Workers Observability API.

## Prerequisites

### 1. Get Account ID
```bash
# From wrangler.toml
grep account_id enter.pollinations.ai/wrangler.toml
```

### 2. Create API Token with Workers Observability Permission

**Via Cloudflare Dashboard:**
1. Go to https://dash.cloudflare.com/profile/api-tokens
2. Click **Create Token**
3. Click **Create Custom Token**
4. Configure:
   - **Token name**: `Workers Observability Read`
   - **Permissions**:
     - Account → Workers Scripts → Read
     - Account → Workers Observability → Edit (required for query API)
   - **Account Resources**: Include → Your Account
5. Click **Continue to summary** → **Create Token**
6. Copy the token immediately (shown only once)

### 3. Store Token Securely

The token is stored in SOPS-encrypted secrets:
- **Location**: `enter.pollinations.ai/secrets/env.json`
- **Key**: `CLOUDFLARE_OBSERVABILITY_TOKEN`

To add/update:
```bash
# Step 1: Decrypt to temp file
cd /path/to/pollinations
sops -d enter.pollinations.ai/secrets/env.json > /tmp/env.json

# Step 2: Add the token (use jq)
jq '. + {"CLOUDFLARE_OBSERVABILITY_TOKEN": "your_token"}' /tmp/env.json > /tmp/env_updated.json

# Step 3: Re-encrypt (must rename to match .sops.yaml pattern — sops matches
# creation_rules against the INPUT file path, not the output redirect, so a
# plaintext file whose name doesn't match e.g. `env\.json$` has no rule to
# apply; rename it first as below, or use `sops --filename-override`)
cp /tmp/env_updated.json /tmp/env.json
sops -e /tmp/env.json > enter.pollinations.ai/secrets/env.json

# Step 4: Cleanup
rm /tmp/env.json /tmp/env_updated.json

# Verify
sops -d enter.pollinations.ai/secrets/env.json | jq 'keys'
```

**Note**: The `.sops.yaml` config requires filenames matching `env.json$` pattern.

## API Endpoint

```
POST https://api.cloudflare.com/client/v4/accounts/{account_id}/workers/observability/telemetry/query
```

## Query Examples

### Setup: Get Credentials from SOPS

```bash
# Extract credentials from encrypted secrets
ACCOUNT_ID=$(sops -d enter.pollinations.ai/secrets/env.json | jq -r '.CLOUDFLARE_ACCOUNT_ID')
API_TOKEN=$(sops -d enter.pollinations.ai/secrets/env.json | jq -r '.CLOUDFLARE_OBSERVABILITY_TOKEN')
```

### List Available Log Keys (Working)

This endpoint works and shows what fields are available:

```bash
curl -s "https://api.cloudflare.com/client/v4/accounts/$ACCOUNT_ID/workers/observability/telemetry/keys" \
  -H "Authorization: Bearer $API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"timeframe": {"from": '$(( $(date +%s) - 86400 ))'000, "to": '$(date +%s)'000}, "datasets": ["workers"]}' | jq '.result[:10]'
```

### Query Recent Errors (Last 15 Minutes)

**Note**: The `/query` endpoint requires a saved `queryId`. For ad-hoc queries, use the Cloudflare Dashboard Query Builder or `wrangler tail`.

```bash
# This format requires a saved query ID

# Query errors with status >= 400
curl -s "https://api.cloudflare.com/client/v4/accounts/$ACCOUNT_ID/workers/observability/telemetry/query" \
  -H "Authorization: Bearer $API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "timeframe": {
      "from": '$(( $(date +%s) - 900 ))'000,
      "to": '$(date +%s)'000
    },
    "parameters": {
      "datasets": ["workers"],
      "filters": [
        {"key": "$workers.scriptName", "operation": "eq", "type": "string", "value": "enter-pollinations-ai"},
        {"key": "$metadata.statusCode", "operation": "gte", "type": "number", "value": 400}
      ],
      "calculations": [{"operator": "count"}],
      "groupBys": [
        {"type": "string", "value": "$metadata.statusCode"},
        {"type": "string", "value": "$metadata.error"}
      ],
      "limit": 50
    }
  }' | jq '.result.events.events[:20]'
```

### Query Errors by Model

```bash
curl -s "https://api.cloudflare.com/client/v4/accounts/$ACCOUNT_ID/workers/observability/telemetry/query" \
  -H "Authorization: Bearer $API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "timeframe": {
      "from": '$(( $(date +%s) - 3600 ))'000,
      "to": '$(date +%s)'000
    },
    "parameters": {
      "datasets": ["workers"],
      "filters": [
        {"key": "$workers.scriptName", "operation": "eq", "type": "string", "value": "enter-pollinations-ai"},
        {"key": "$metadata.statusCode", "operation": "gte", "type": "number", "value": 400}
      ],
      "calculations": [{"operator": "count"}],
      "groupBys": [
        {"type": "string", "value": "model"},
        {"type": "string", "value": "$metadata.statusCode"}
      ],
      "limit": 100
    }
  }' | jq '.result.calculations[0].aggregates'
```

### Get Raw Error Events with Full Details

```bash
curl -s "https://api.cloudflare.com/client/v4/accounts/$ACCOUNT_ID/workers/observability/telemetry/query" \
  -H "Authorization: Bearer $API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "timeframe": {
      "from": '$(( $(date +%s) - 900 ))'000,
      "to": '$(date +%s)'000
    },
    "parameters": {
      "datasets": ["workers"],
      "filters": [
        {"key": "$workers.scriptName", "operation": "eq", "type": "string", "value": "enter-pollinations-ai"},
        {"key": "$metadata.statusCode", "operation": "gte", "type": "number", "value": 500}
      ],
      "limit": 20
    }
  }' | jq '.result.events.events[] | {
    timestamp: .timestamp,
    statusCode: ."$metadata".statusCode,
    error: ."$metadata".error,
    message: ."$metadata".message,
    requestId: ."$workers".requestId,
    url: ."$metadata".url
  }'
```

### List Available Log Keys

```bash
curl -s "https://api.cloudflare.com/client/v4/accounts/$ACCOUNT_ID/workers/observability/telemetry/keys" \
  -H "Authorization: Bearer $API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "timeframe": {
      "from": '$(( $(date +%s) - 3600 ))'000,
      "to": '$(date +%s)'000
    },
    "datasets": ["workers"],
    "filters": [
      {"key": "$workers.scriptName", "operation": "eq", "type": "string", "value": "enter-pollinations-ai"}
    ]
  }' | jq '.result.keys'
```

## Structured Logging in enter.pollinations.ai

The worker uses LogTape for structured logging with these key fields:

- **requestId**: Unique ID per request (first 8 chars shown in logs)
- **method**: HTTP method (GET, POST)
- **routePath**: Request URL
- **status**: Response status code
- **duration**: Request duration in ms

Downstream errors are logged with:
```typescript
log.warn("Chat completions error {status}: {body}", {
    status: response.status,
    body: responseText,
});
```

## Tinybird Analytics (Alternative)

For aggregated model health stats, query Tinybird directly.

> **⚠️ Use the prod read token from SOPS — do NOT use `.tinyb`.** The `.tinyb` in `enter.pollinations.ai/observability/` points to the **staging** workspace (`pollinations_enter_staging`), which has ~no real traffic, so prod queries come back empty. Get the prod token instead:
> ```bash
> TB=$(sops -d enter.pollinations.ai/secrets/prod.vars.json | jq -r '.TINYBIRD_READ_TOKEN')
> ```
> This single token works for **both** pipes (`/v0/pipes/...`) and raw SQL (`/v0/sql`) against the prod workspace (`pollinations_enter`). The public Model Monitor reads cached health data through `gen.pollinations.ai`; it does not expose a Tinybird token.

```bash
H="https://api.europe-west2.gcp.tinybird.co"

# Get model health stats — pass minutes (default pipe window is short; use 240 for last 4h)
curl -s "$H/v0/pipes/model_health.json?token=$TB&minutes=240" | jq '.data'

# Detailed server-side error breakdown (full messages, upstream status/body, user attribution)
curl -s "$H/v0/pipes/recent_server_errors.json?token=$TB&minutes=240&limit=500" -o /tmp/errs.json
```

**`model_health` columns** (note: NOT `error_count`/`error_rate`): `model`, `event_type`, `provider`, `model_used`, `total_requests`, `status_2xx`, `errors_4xx`, `errors_5xx`, `last_error_at`, `latency_p50_ms`, `latency_p95_ms`, `avg_latency_ms`, `last_request_at`. Sort by `errors_5xx` to find backend issues.

**`recent_server_errors`** is the go-to pipe for root-causing (defined in `enter.pollinations.ai/observability/endpoints/recent_server_errors.pipe`, params `minutes` default 1440, `limit` default 200). It returns `timestamp, status, upstream_status, upstream_host, upstream_body, message, error_code, error_class, model_requested, route_path, request_inputs, user_id, user_tier, api_key_id`. There is **no** `model_errors` pipe.

> **JSON quirk**: `recent_server_errors` rows contain raw newlines in `stack`/`message`, which break `jq`. Parse with Python instead: `python3 -c "import json; d=json.load(open('/tmp/errs.json'),strict=False); ..."`.

> **Reading 5xx**: `upstream_status` reveals the true cause. `502 (up 429)` = provider throttle (e.g. Bedrock "Too many tokens" — account-level TPM quota, often a peak-traffic spike across many users, not one abuser). `502 (up 403)` from `api.openai.com` with `unsupported_country_region_territory` = Cloudflare egress PoP in an OpenAI-blocked country. `500 (up 500)` from Vertex/xAI = provider-side transient ("high load"/"Internal error") — no action.

---

# Debugging Workflow

**Before diving in**: a user's framing of the failure (e.g. "the instance was turned off", "the model always fails") is a hypothesis embedded in the report, not a fact. A cheap ground-truth check against the user's stated premise up front can save a long investigation down a wrong framing — be prepared to report "your premise is X but reality is Y."

1. **Check Model Monitor** - https://monitor.pollinations.ai
   - Identify which models have high error rates
   - Note the error code breakdown (401, 402, 403, 400, 500, etc.)

2. **Query Cloudflare Logs** - Use the API queries above
   - Get raw error events with full details
   - Look for patterns in error messages
   - Group by `user_id`, `api_key_id`, route, and sanitized `request_inputs` before calling the pattern a model-wide outage
   - A concentrated burst from one caller can be invalid input even when the upstream reports 500

3. **Correlate with Request ID** - If you have a specific request ID:
   ```bash
   # Filter by request ID
   curl -s "https://api.cloudflare.com/client/v4/accounts/$ACCOUNT_ID/workers/observability/telemetry/query" \
     -H "Authorization: Bearer $API_TOKEN" \
     -H "Content-Type: application/json" \
     -d '{
       "timeframe": {"from": '$(( $(date +%s) - 86400 ))'000, "to": '$(date +%s)'000},
       "parameters": {
         "datasets": ["workers"],
         "filters": [
           {"key": "$workers.requestId", "operation": "eq", "type": "string", "value": "REQUEST_ID_HERE"}
         ],
         "limit": 100
       }
     }' | jq '.result.events.events'
   ```

4. **Check Gateway Logs** - Tail the gen Worker (image + text both run here):
   ```bash
   cd gen.pollinations.ai && wrangler tail --format json | tee gen-logs.jsonl
   ```

5. **Test Model Directly** - Verify if model is actually broken:
   ```bash
   TOKEN=$(grep ENTER_API_TOKEN_REMOTE enter.pollinations.ai/.testingtokens | cut -d= -f2)

   # Test text model
   curl -s 'https://gen.pollinations.ai/v1/chat/completions' \
     -H "Authorization: Bearer $TOKEN" \
     -H 'Content-Type: application/json' \
     -d '{"model": "MODEL_NAME", "messages": [{"role": "user", "content": "Test"}]}' \
     -w "\nHTTP: %{http_code}\n"

   # Test image model
   curl -s 'https://gen.pollinations.ai/image/test?model=MODEL_NAME&width=256&height=256' \
     -H "Authorization: Bearer $TOKEN" \
     -w "\nHTTP: %{http_code}\n" -o /dev/null
   ```
   - Use a unique prompt (embed a timestamp/nonce) when verifying credentials or connectivity specifically — a cached response can return 200 even when the underlying API key is dead. Identical response bodies/ids across repeated calls is a caching tell, not a health signal.

---

# Diagnosing Latency / Hang Incidents Across a Multi-Hop Path

Users can report timeouts that Tinybird/Worker telemetry doesn't show as errors at all, because the failure is happening at a hop your own logs can't see.

1. **Rule out a suspected deploy by falsifying it, not confirming it.** Bucket the symptom metric hourly across the deploy boundary — a pre-existing, evenly-distributed signal exonerates the change. If a proxy/CDN hop is suspected, measure it directly: compare the public host's TTFB against the origin host's TTFB to quantify the hop's real contribution instead of assuming.

2. **Check the outermost edge, not just your app's logs.** If the service sits behind an additional CDN/edge layer in front of the Worker, that layer's own access logs can show origin-connection failures (origin-comm errors, connect errors) that never reach Tinybird or the Worker — the request may look fast and successful downstream, or not be logged at all. "Dashboard is green but users time out" means look one hop further out than your app logs.

3. **Triage by TTFB signature, then confirm with A/B isolation — the signature alone doesn't tell you which hop is at fault.** ttfb≈0 (fails fast) points at a connection-level problem (dead socket, connect error); ttfb≈the read/response timeout (accepted, then went silent) points at an origin-side hang. But the signature only reflects the hop whose logs you're reading — confirm by isolating: run many sequential requests (not parallel; parallel batches produce spurious client-side failures that look like origin errors) direct-to-origin vs. via the suspected proxy/CDN, from the same network/egress region production actually uses. For anycast/multi-colo systems, "is the origin healthy?" has no single answer — a test from the wrong vantage point can invert the conclusion. Prefer an existing authorized probe location over spinning up a new paid cloud resource just to get the right vantage.

4. **After deploying a fix, re-check hours later, not just immediately.** Removing one hanging call can look like a full fix until load shifts and the next serially-awaited call on the same path starts dominating. When a fix addresses a route/path rather than a single call, enumerate every serially-awaited external/regional dependency on that path (rate limiters, DB, KV, service bindings) rather than stopping at the first one found.

---

# Diagnosing "the Output/Display Is Wrong" Reports

Reading code produces plausible causes but no verdict. When the report is "X is wrong" and the suspect logic is a pure, exported transform function, import it into a scratch script and run it over the real inputs (fetch the minimum needed), then diff the derived field against the authoritative source-of-truth field across every row. A count of mismatches is a fix; a count of zero redirects the investigation — but zero mismatches over the fetched sample is not exhaustive proof if the live data set is incomplete.

---

# Current Status & Limitations

## Cloudflare Observability API

**What works:**
- `/telemetry/keys` - List available log fields ✅
- `/telemetry/values` - Get unique values for a field ✅
- Token stored in SOPS: `enter.pollinations.ai/secrets/env.json` ✅

**Limitations:**
- `/telemetry/query` requires a saved `queryId` from the dashboard
- For ad-hoc queries, use **Cloudflare Dashboard** → Workers & Pages → pollinations-enter → Observability → Investigate
- Or use `wrangler tail` for real-time logs

## Alternative: Tinybird (Recommended for Aggregates)

Tinybird provides pre-aggregated model health stats and raw event data.

### Token Locations

- **Prod read token (use this)**: `enter.pollinations.ai/secrets/prod.vars.json` → `TINYBIRD_READ_TOKEN` (via SOPS). Works for both pipes and raw `/v0/sql` against prod (`pollinations_enter`).
- **`.tinyb`** = **staging** workspace (`pollinations_enter_staging`) — empty of prod traffic. Only use for staging-specific debugging.

### Basic Queries

```bash
# Prod read token from SOPS — works for pipes AND raw SQL
TB=$(sops -d enter.pollinations.ai/secrets/prod.vars.json | jq -r '.TINYBIRD_READ_TOKEN')

# Get model health (last 4h)
curl -s "https://api.europe-west2.gcp.tinybird.co/v0/pipes/model_health.json?token=$TB&minutes=240" | jq '.data'
```

### Raw SQL Queries

The prod `TINYBIRD_READ_TOKEN` above can query the raw `generation_event_v2` datasource directly via `/v0/sql` (verified). Reuse `$TB`:

```bash
# Find users with frequent 403 errors (last 24 hours)
curl -s "https://api.europe-west2.gcp.tinybird.co/v0/sql?token=$TB" \
  --data-urlencode "q=SELECT ge.user_id, any(users.github_username) AS github_username, argMax(ge.user_tier, ge.start_time) AS user_tier, count() as error_403_count
FROM generation_event_v2 ge
LEFT JOIN (SELECT id, github_username FROM d1_user WHERE synced_at = (SELECT max(synced_at) FROM d1_user)) users ON ge.user_id = users.id
WHERE ge.response_status = 403
  AND ge.start_time > now() - interval 24 hour
  AND ge.user_id != ''
  AND ge.user_id != 'undefined'
GROUP BY ge.user_id
ORDER BY error_403_count DESC
LIMIT 20"

# Find users with 500 errors (actual backend issues)
curl -s "https://api.europe-west2.gcp.tinybird.co/v0/sql?token=$TB" \
  --data-urlencode "q=SELECT ge.user_id, any(users.github_username) AS github_username, ge.model_requested, ge.error_message, count() as error_count
FROM generation_event_v2 ge
LEFT JOIN (SELECT id, github_username FROM d1_user WHERE synced_at = (SELECT max(synced_at) FROM d1_user)) users ON ge.user_id = users.id
WHERE ge.response_status >= 500
  AND ge.start_time > now() - interval 24 hour
GROUP BY ge.user_id, ge.model_requested, ge.error_message
ORDER BY error_count DESC
LIMIT 20"

# Check specific user's recent errors
curl -s "https://api.europe-west2.gcp.tinybird.co/v0/sql?token=$TB" \
  --data-urlencode "q=SELECT start_time, response_status, model_requested, error_message
FROM generation_event_v2
WHERE user_id = 'USER_ID_HERE'
  AND start_time > now() - interval 24 hour
ORDER BY start_time DESC
LIMIT 50"

# Daily error-rate timeline (recommended first query for rate analysis — a multi-week
# aggregate hides incident-day spikes). Canonical definition: exclude 4xx, exclude cache hits.
curl -s "https://api.europe-west2.gcp.tinybird.co/v0/sql?token=$TB" \
  --data-urlencode "q=SELECT toDate(start_time) AS day, countIf(response_status >= 500 AND cache_hit = 0) AS errors_5xx, count() AS total
FROM generation_event_v2
WHERE start_time > now() - interval 28 day
GROUP BY day
ORDER BY day"

# Slow-but-200 tail: users with successful requests exceeding a client timeout threshold
curl -s "https://api.europe-west2.gcp.tinybird.co/v0/sql?token=$TB" \
  --data-urlencode "q=SELECT user_id, countIf(response_time > 30000) AS slow_count, max(response_time) AS max_ms
FROM generation_event_v2
WHERE start_time > now() - interval 24 hour
GROUP BY user_id
HAVING slow_count > 0
ORDER BY max_ms DESC
LIMIT 20"
```

Pull the per-day series before concluding from an aggregate — spikes are usually the actionable story, and monthly/weekly rollups hide them.

### Datasource Schema

The `generation_event_v2` datasource is defined in `enter.pollinations.ai/observability/datasources/generation_event_v2.datasource` and includes:
- `user_id`, `user_tier` (join `d1_user.id` for the current GitHub display name)
- `response_status`, `error_message`, `error_response_code`
- `model_requested`, `model_used`
- `total_price`, `total_cost`
- `start_time`, `end_time`, `response_time`

**Verify token scope empirically before designing a new data path.** A token that can hit `/v0/sql` (e.g. `SELECT 1` succeeds) may still be scoped to `PIPES:READ` only, which rejects any datasource query — `generation_event_v2`, `d1_user`, etc. — with "needs DATASOURCES:READ". Probe with a known datasource SELECT before assuming raw-SQL access; if it's rejected, build a dedicated pipe with the appropriate token grant instead.

---

# Scripts

Helper scripts for common debugging tasks. Run from repo root.

## Find Users with 403 Errors (Quota Issues)

```bash
# Find users with >10 403 errors in last 24 hours
.claude/skills/model-debugging/scripts/find-403-users.sh 24 10
```

## Find 500 Errors (Backend Issues)

```bash
# Find 500+ errors grouped by user/model/message
.claude/skills/model-debugging/scripts/find-500-errors.sh 24
```

## Check Specific User's Errors

```bash
# See a user's recent errors by internal user ID
.claude/skills/model-debugging/scripts/check-user-errors.sh USER_ID_HERE 24
```

---

# Notes

- **401 errors**: User authentication issues (no API key) - **expected from anonymous traffic**
- **402 errors**: Pollen/billing issues (user ran out of credits or key budget) - **expected**
- **403 errors**: Permission issues (model not allowed for API key) - **expected**
- **400 errors**: Usually user input errors (bad prompts, invalid params) - **expected**
- **500 errors**: Backend/infrastructure issues - **investigate these**
- **504 errors**: Timeouts (model too slow or hung) - **investigate these**

---

# Tested Models (All Working as of 2025-12-22)

| Model | Type | Endpoint | Status |
|-------|------|----------|--------|
| `openai` | text | POST /v1/chat/completions | ✅ |
| `openai-fast` | text | POST /v1/chat/completions | ✅ |
| `openai-large` | text | POST /v1/chat/completions | ✅ |
| `openai-audio` | text | GET /text/{prompt}?model=openai-audio&voice=alloy | ✅ (MP3) |
| `claude` | text | POST /v1/chat/completions | ✅ |
| `gemini-fast` | text | POST /v1/chat/completions | ✅ |
| `flux` | image | GET /image/{prompt} | ✅ |
| `nanobanana-pro` | image | GET /image/{prompt} | ✅ |
| `seedream-pro` | image | GET /image/{prompt} | ✅ |
| `seedance-pro` | video | GET /image/{prompt} | ✅ (MP4) |
