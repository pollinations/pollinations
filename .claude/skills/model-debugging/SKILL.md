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

**Also watch for slow-but-200 failures**: a 200 that arrives after the client's own timeout never shows in error rates or p95 — it only shows in the per-user latency tail. See "Slow-but-200 / Client-Side Timeout" below.

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
**Error**: None server-side — 200, but users see a timeout or "no response"
**Cause**: The latency tail is above the client's own timeout (e.g. Roblox HttpService ~30s) while status rates and p95 look fine
**Impact**: Invisible on error dashboards; usually one user or one request shape (e.g. huge prompts)
**Fix**: Query the tail per user — `countIf(response_time>30000)`, `max(response_time)` (query in "Raw SQL Queries" below)

## Instant Rejection from a Per-Key Queue/Rate Limit
**Error**: `Queue full`, or a 402/429 on the user's very first request
**Cause**: An intended throttle, or leaked in-memory state (a slot never freed)
**Impact**: User blocked while the backend is idle
**Fix**: Compare the limiter's state with the backend's own load counters. Wait out the time window and send one request: if it clears, it was a live throttle. If a fix you predicted (e.g. a restart to clear memory) changes nothing, the diagnosis was wrong — re-check live state before trying a second fix. For IP-keyed limits, check how many distinct IPs the limiter actually sees: a proxy can collapse many clients onto one IP, which looks exactly like a leaked slot.

## Stream/Usage Errors (missing usage, dropped terminal SSE event)
**Error**: Missing token usage (`usage_missing`) or a missing terminal event (e.g. `[DONE]`)
**Cause**: Usually an upstream disconnect or transport error hidden downstream, not the provider omitting data
**Impact**: A transport/parsing bug gets blamed on the provider
**Fix**: Look at the last SSE chunks and the original transport error across provider → adapter → validator before blaming the provider; truncated logs often drop the end. If two components parse the same stream (e.g. validator and tracker), make sure they agree on end-of-stream — a stream ending with one trailing newline, not a blank line, is valid; a disagreement shows up as a phantom provider failure.

## Health-Check False Exclusions (402/403 During Automated Probing)
**Error**: A monitor excuses a failing model as "client noise" (402/403)
**Cause**: The same status can come from the probe's own wallet/auth or from the provider's credits, quota, or suspension
**Impact**: Real outages get vetoed, or probe problems look like outages
**Fix**: Before tuning thresholds, follow a few excluded cases through the decision log and find who actually failed — probe or provider

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

# Step 3: Re-encrypt. sops matches creation_rules against the INPUT file name,
# not the output, so rename first (as below) or use `sops --filename-override`.
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

> **Token**: the prod read token lives in SOPS (`enter.pollinations.ai/secrets/prod.vars.json` → `TINYBIRD_READ_TOKEN`) and works for pipes and raw SQL against `pollinations_enter`. Do not use `.tinyb`: it points at staging, which has no real traffic. For raw SQL, `enter.pollinations.ai/observability/scripts/tb-prod.sh "<sql>"` does the lookup for you (see Raw SQL Queries below). The public Model Monitor reads cached health data through `gen.pollinations.ai`; it does not expose a Tinybird token.

```bash
TB=$(sops -d enter.pollinations.ai/secrets/prod.vars.json | jq -r '.TINYBIRD_READ_TOKEN')
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

**Before diving in**: the user's framing ("the instance was turned off", "the model always fails") is a hypothesis, not a fact. Check the premise cheaply first, and be ready to report "you said X, reality is Y."

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
   - Use a unique prompt (timestamp/nonce) when checking credentials or connectivity — a cached response returns 200 even with a dead key. Identical bodies/ids across calls means cache, not health.

---

# Diagnosing Timeouts Across a Multi-Hop Path

Users can report timeouts that Tinybird/Worker logs don't show, because the failure is at a hop you don't log.

1. **Try to disprove the suspected deploy, not confirm it.** Bucket the symptom hourly across the deploy time; if it existed before, the deploy is cleared. If a proxy/CDN hop is suspected, measure it: compare TTFB via the public host against TTFB direct to origin.

2. **Check the outermost edge.** A CDN in front of the Worker has its own logs of origin-connection failures that never reach Tinybird. "Dashboard green, users time out" means look one hop further out.

3. **Use TTFB to narrow, then confirm with A/B.** TTFB≈0 → connection failure; TTFB≈timeout → origin hang. But that only describes the hop whose logs you're reading. Confirm with many *sequential* requests (parallel batches cause fake client-side failures) direct vs via the proxy, from the region production traffic uses — for anycast systems the answer depends on where you test from. Use an existing probe host rather than paying for a new one.

4. **Re-check hours after the fix.** Removing one hanging call can look like a full fix until load shifts and the next awaited call on the same path dominates. If the fix is per-route, list every awaited external dependency on that route (rate limiter, DB, KV, service bindings), not just the first one found.

---

# Diagnosing "the Output/Display Is Wrong" Reports

Reading code gives plausible causes, not a verdict. If the suspect logic is a pure exported function, import it in a scratch script, run it over real inputs, and diff the result against the source-of-truth field for every row. Mismatches → that's the bug. Zero mismatches → look elsewhere, unless the sample was incomplete.

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

## Raw SQL Queries (Tinybird)

`tb-prod.sh` below is `enter.pollinations.ai/observability/scripts/tb-prod.sh`: prod workspace, token from SOPS, no row cap.

```bash
# Find users with frequent 403 errors (last 24 hours)
tb-prod.sh "SELECT ge.user_id, any(users.github_username) AS github_username, argMax(ge.user_tier, ge.start_time) AS user_tier, count() as error_403_count
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
tb-prod.sh "SELECT ge.user_id, any(users.github_username) AS github_username, ge.model_requested, ge.error_message, count() as error_count
FROM generation_event_v2 ge
LEFT JOIN (SELECT id, github_username FROM d1_user WHERE synced_at = (SELECT max(synced_at) FROM d1_user)) users ON ge.user_id = users.id
WHERE ge.response_status >= 500
  AND ge.start_time > now() - interval 24 hour
GROUP BY ge.user_id, ge.model_requested, ge.error_message
ORDER BY error_count DESC
LIMIT 20"

# Check specific user's recent errors
tb-prod.sh "SELECT start_time, response_status, model_requested, error_message
FROM generation_event_v2
WHERE user_id = 'USER_ID_HERE'
  AND start_time > now() - interval 24 hour
ORDER BY start_time DESC
LIMIT 50"

# Daily 5xx timeline — run this first; a multi-week aggregate hides incident days.
# Canonical definition: exclude 4xx and cache hits.
tb-prod.sh "SELECT toDate(start_time) AS day, countIf(response_status >= 500 AND cache_hit = 0) AS errors_5xx, count() AS total
FROM generation_event_v2
WHERE start_time > now() - interval 28 day
GROUP BY day
ORDER BY day"

# Slow-but-200 tail: users whose successful requests exceeded a client timeout
tb-prod.sh "SELECT user_id, countIf(response_time > 30000) AS slow_count, max(response_time) AS max_ms
FROM generation_event_v2
WHERE start_time > now() - interval 24 hour
GROUP BY user_id
HAVING slow_count > 0
ORDER BY max_ms DESC
LIMIT 20"
```

Look at the per-day series before trusting an aggregate — spikes are the story, and rollups hide them.

### Datasource Schema

The `generation_event_v2` datasource is defined in `enter.pollinations.ai/observability/datasources/generation_event_v2.datasource` and includes:
- `user_id`, `user_tier` (join `d1_user.id` for the current GitHub display name)
- `response_status`, `error_message`, `error_response_code`
- `model_requested`, `model_used`
- `total_price`, `total_cost`
- `start_time`, `end_time`, `response_time`

**Check token scope before designing a data path.** A token that runs `SELECT 1` may still be `PIPES:READ` only and reject datasource queries ("needs DATASOURCES:READ"). Try a SELECT on a known datasource first; if rejected, build a pipe with the right token instead.

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
