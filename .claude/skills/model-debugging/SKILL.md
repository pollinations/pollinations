---
name: model-debugging
description: Debug and diagnose model errors in Pollinations services. Analyze logs, find error patterns, identify affected users. For taking action on user tiers, see tier-management skill.
---

# Model Debugging Skill

Use this skill when:
- Investigating model failures, high error rates, or service issues
- Finding users affected by errors (402 billing, 403 permissions, 500 backend)
- Analyzing Tinybird/Cloudflare logs for patterns
- Diagnosing specific request failures

**Related skill**: Use `tier-management` to upgrade users or check balances after identifying issues here.

---

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

### image.pollinations.ai (EC2 systemd)
```bash
# Real-time logs
ssh enter-services "sudo journalctl -u image-pollinations.service -f"

# Last 3 minutes
ssh enter-services "sudo journalctl -u image-pollinations.service --since '3 minutes ago' --no-pager" > image-service-logs.txt

# Recent errors only
ssh enter-services "sudo journalctl -u image-pollinations.service -p err -n 50"
```

### text.pollinations.ai (EC2 systemd)
```bash
# Real-time logs
ssh enter-services "sudo journalctl -u text-pollinations.service -f"

# Last 3 minutes
ssh enter-services "sudo journalctl -u text-pollinations.service --since '3 minutes ago' --no-pager" > text-service-logs.txt
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

## Veo No Video Data
**Error**: `No video data in response`
**Cause**: Vertex AI returned empty video response
**Impact**: 500 error
**Fix**: Check Vertex AI quota/status, may be transient

---

# Environment Variables to Check

## image.pollinations.ai
```bash
ssh enter-services "cat /home/ubuntu/pollinations/image.pollinations.ai/.env | grep -E 'AZURE|GOOGLE|CLOUDFLARE'"
```

Key variables:
- `AZURE_CONTENT_SAFETY_ENDPOINT` - Azure Content Safety API endpoint
- `AZURE_CONTENT_SAFETY_API_KEY` - Azure Content Safety API key
- `GOOGLE_PROJECT_ID` - Google Cloud project for Vertex AI
- `AZURE_MYCELI_FLUX_KONTEXT_ENDPOINT` - Azure Kontext model endpoint

## text.pollinations.ai
```bash
ssh enter-services "cat /home/ubuntu/pollinations/text.pollinations.ai/.env | grep -E 'AZURE|OPENAI|GOOGLE'"
```

---

# Updating Secrets

Secrets are stored encrypted with SOPS:
- `image.pollinations.ai/secrets/env.json`
- `text.pollinations.ai/secrets/env.json`

To update:
```bash
# Decrypt, edit, re-encrypt
sops image.pollinations.ai/secrets/env.json

# Deploy to server
sops --output-type dotenv -d image.pollinations.ai/secrets/env.json > /tmp/image.env
scp /tmp/image.env enter-services:/home/ubuntu/pollinations/image.pollinations.ai/.env
rm /tmp/image.env

# Restart service
ssh enter-services "sudo systemctl restart image-pollinations.service"
```

---

# Log Analysis Commands

```bash
# Count errors by type
grep -i "error" image-service-logs.txt | grep -oE "(Azure Flux Kontext|Vertex AI|No active translate|getaddrinfo ENOTFOUND)" | sort | uniq -c | sort -rn

# Find content filter rejections
grep -i "Content rejected" image-service-logs.txt | sort | uniq -c

# Check DNS resolution on server
ssh enter-services "nslookup gptimagemain1-resource.cognitiveservices.azure.com"
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

# Or from existing .env
grep CLOUDFLARE_ACCOUNT_ID image.pollinations.ai/.env
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

# Step 3: Re-encrypt (must rename to match .sops.yaml pattern)
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

For aggregated model health stats, query Tinybird directly:

```bash
# Get model health stats (last 5 minutes)
curl "https://api.europe-west2.gcp.tinybird.co/v0/pipes/model_health.json?token=$TINYBIRD_TOKEN" | jq '.data'

# Get detailed error breakdown
curl "https://api.europe-west2.gcp.tinybird.co/v0/pipes/model_errors.json?token=$TINYBIRD_TOKEN" | jq '.data'
```

The Tinybird token is a read-only public token found in:
- `apps/model-monitor/src/hooks/useModelMonitor.js`

---

# Debugging Workflow

1. **Check Model Monitor** - https://monitor.pollinations.ai
   - Identify which models have high error rates
   - Note the error code breakdown (401, 402, 403, 400, 500, etc.)

2. **Query Cloudflare Logs** - Use the API queries above
   - Get raw error events with full details
   - Look for patterns in error messages

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

4. **Check Backend Logs** - If error is from downstream service:
   ```bash
   # Image service
   ssh enter-services "sudo journalctl -u image-pollinations.service --since '5 minutes ago'"
   
   # Text service
   ssh enter-services "sudo journalctl -u text-pollinations.service --since '5 minutes ago'"
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

1. **Public read-only token** (for pipes only): `apps/model-monitor/src/hooks/useModelMonitor.js`
2. **Admin token** (for raw SQL queries): `enter.pollinations.ai/observability/.tinyb` (in `token` field)

### Basic Queries (Public Token)

```bash
# Public read-only token from apps/model-monitor
TINYBIRD_TOKEN="p.eyJ1IjogImFjYTYzZjc5LThjNTYtNDhlNC05NWJjLWEyYmFjMTY0NmJkMyIsICJpZCI6ICJmZTRjODM1Ni1iOTYwLTQ0ZTYtODE1Mi1kY2UwYjc0YzExNjQiLCAiaG9zdCI6ICJnY3AtZXVyb3BlLXdlc3QyIn0.Wc49vYoVYI_xd4JSsH_Fe8mJk7Oc9hx0IIldwc1a44g"

# Get model health (last 5 min)
curl -s "https://api.europe-west2.gcp.tinybird.co/v0/pipes/model_health.json?token=$TINYBIRD_TOKEN" | jq '.data'
```

### Raw SQL Queries (Admin Token)

For querying the raw `generation_event` datasource, use the admin token from `.tinyb`:

```bash
# Get admin token from .tinyb file
TINYBIRD_ADMIN_TOKEN=$(jq -r '.token' enter.pollinations.ai/observability/.tinyb)

# Find users with frequent 403 errors (last 24 hours)
curl -s "https://api.europe-west2.gcp.tinybird.co/v0/sql?token=$TINYBIRD_ADMIN_TOKEN" \
  --data-urlencode "q=SELECT user_id, user_github_username, user_tier, count() as error_403_count 
FROM generation_event 
WHERE response_status = 403 
  AND start_time > now() - interval 24 hour 
  AND user_id != '' 
  AND user_id != 'undefined' 
GROUP BY user_id, user_github_username, user_tier 
ORDER BY error_403_count DESC 
LIMIT 20"

# Find users with 500 errors (actual backend issues)
curl -s "https://api.europe-west2.gcp.tinybird.co/v0/sql?token=$TINYBIRD_ADMIN_TOKEN" \
  --data-urlencode "q=SELECT user_github_username, model_requested, error_message, count() as error_count 
FROM generation_event 
WHERE response_status >= 500 
  AND start_time > now() - interval 24 hour 
GROUP BY user_github_username, model_requested, error_message 
ORDER BY error_count DESC 
LIMIT 20"

# Check specific user's recent errors
curl -s "https://api.europe-west2.gcp.tinybird.co/v0/sql?token=$TINYBIRD_ADMIN_TOKEN" \
  --data-urlencode "q=SELECT start_time, response_status, model_requested, error_message 
FROM generation_event 
WHERE user_github_username = 'USERNAME_HERE' 
  AND start_time > now() - interval 24 hour 
ORDER BY start_time DESC 
LIMIT 50"
```

### Datasource Schema

The `generation_event` datasource is defined in `enter.pollinations.ai/observability/datasources/generation_event.datasource` and includes:
- `user_id`, `user_github_username`, `user_tier`
- `response_status`, `error_message`, `error_response_code`
- `model_requested`, `model_used`
- `total_price`, `total_cost`
- `start_time`, `end_time`, `response_time`

---

# Scripts

Helper scripts for common debugging tasks. Run from repo root.

## Find Users with 403 Errors (Quota Issues)

```bash
# Find users with >10 403 errors in last 24 hours
.claude/skills/model-debugging/scripts/find-403-users.sh 24 10

# Filter by tier (e.g., only spore users)
.claude/skills/model-debugging/scripts/find-403-users.sh 24 10 spore
```

## Find 500 Errors (Backend Issues)

```bash
# Find 500+ errors grouped by user/model/message
.claude/skills/model-debugging/scripts/find-500-errors.sh 24
```

## Check Specific User's Errors

```bash
# See a user's recent errors
.claude/skills/model-debugging/scripts/check-user-errors.sh superbrainai 24
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
