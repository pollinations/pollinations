---
name: model-management
description: "Add, update, or remove text/image/video models. Handles any provider."
---

# Checklist

1. Update `.env` and `secrets/env.json` (sops) with credentials
2. Update config/handler with model routing
3. Update registry with **pricing**, **provider**, and **`addedDate`**
4. Run tests (see [Testing](#testing) below)

> ⚠️ **Pricing depends on BOTH model AND provider.** Always verify pricing on the provider's website.

> ⚠️ **`addedDate` is set once and NEVER updated.** It drives the NEW chip on the dashboard (7-day window). Use `new Date("YYYY-MM-DD").getTime()` with today's date. Do not touch it when changing pricing, endpoint, or provider later — only the cost array gets new entries.

---

# Files to Update

## Text Models

| File | Purpose |
|------|---------|
| `gen.pollinations.ai/secrets/{dev,staging,prod}.vars.json` | Encrypted text+image provider keys (use sops) |
| `gen.pollinations.ai/src/text/configs/modelConfigs.ts` | Model routing config |
| `gen.pollinations.ai/src/text/availableModels.ts` | Service name → config mapping |
| `shared/registry/text.ts` | **Pricing**, provider, aliases, description |

## Image/Video Models

| File | Purpose |
|------|---------|
| `image.pollinations.ai/.env` | API keys, endpoints |
| `gen.pollinations.ai/secrets/prod.vars.json` | Encrypted secrets (use sops) |
| `image.pollinations.ai/src/createAndReturnImages.ts` | Model handlers |
| `shared/registry/image.ts` | **Pricing**, provider, aliases, description |

---

# Description Style

Format: `<Model Name> - <what it does or what makes it distinct>`. Keep it under ~70 chars when possible.

- Say what the model **does** or what makes it **different** (e.g. "Fast & affordable image generation", "Long-context MoE for retrieval", "Speech to text transcription"). Capability over branding.
- **No provider/inference attribution** in the description — no "(OpenRouter)", "via DashScope", "ByteDance ARK", "OpenAI's", "Google's", "Bedrock", etc. The `provider` and `brand` fields already carry that.
- **No filler.** "X - Image Generation Model" tells the reader nothing they didn't already get from the model name. If you can't say something specific, say less ("FLUX.2 Klein 4B - Fast image generation and editing" beats "FLUX.2 Klein 4B - Advanced Model").

---

# Quick Actions

| Action | `.env` | Config/Handler | Registry |
|--------|--------|----------------|----------|
| New model | ✅ | ✅ | ✅ (pricing!) |
| Change endpoint only | ✅ | - | - |
| Change provider | ✅ | ✅ | ✅ (pricing!) |
| Make paid-only | - | - | ✅ (`paidOnly: true`) |
| Disable model | - | ✅ (remove) | ✅ (remove) |
| Upgrade model | ✅ (if provider changes) | ✅ | ✅ (pricing!) |

---

# Testing — battle-test before merge

> **Mandatory.** Any time you add a new model OR change the endpoint/provider/modelId of an existing one, every test below MUST pass locally before opening a PR. Unit tests don't catch upstream behavior changes. Boot the worker and hit it.

## 1. Boot the local gen worker

```bash
cd gen.pollinations.ai
npm run decrypt-vars         # if .dev.vars not yet decrypted
npx vite build --mode=development
npx wrangler dev --port 8788 --local --persist-to .wrangler/state --show-interactive-dev-session false
# wait for: until curl -sf http://localhost:8788/v1/models -o /dev/null; do sleep 2; done
```

Seed a paid local key (`scripts/seed-key.mjs` or equivalent) and export `SK=sk_…` for the requests below.

## 2. Modality matrix — verify every capability the registry claims

For each model, run every test that matches its declared `inputModalities` / `outputModalities` / `tools` / `reasoning`:

| Capability | What to test |
|---|---|
| **text-only** | plain prompt → finish=stop, content present, usage.completion_tokens > 0 |
| **image input** | `content: [{type:text}, {type:image_url, image_url:{url:…}}]` with a public image — answer should reference the image |
| **multi-image** | 2+ `image_url` entries in one message — model should reason over both |
| **tools** | request with `tools:[{type:function, function:{…}}]` and a prompt that triggers it → finish=tool_calls, valid JSON args |
| **streaming** | `stream:true` → count SSE chunks, last `data:` line should have finish_reason set, `data: [DONE]` present |
| **max_tokens edge** | `max_tokens:1` → finish=length (NOT 4xx; PR #10968 only triggers when `completion_tokens=0`) |
| **reasoning** | for thinking models, verify `usage.completion_tokens_details.reasoning_tokens > 0` |
| **audio in/out** | only if model declares `audio` modality — send/expect base64-encoded audio |

Use a **public, hot-link-friendly image URL** (Wikipedia blocks hot-linking; pollinations.ai images work):
```
IMG="https://image.pollinations.ai/prompt/a%20cat?width=512&height=512&seed=1&nologo=true"
```

## 3. Error-path matrix — every malformed request MUST return 4xx, never opaque 5xx

| Path | Expected |
|---|---|
| unreachable image URL (404 source) | 400 with provider error message |
| malformed image URL ("not-a-url") | 400 |
| out-of-range temperature (e.g. 99) | 400 "JSON body validation failed" |
| invalid tool schema (parameters not an object) | 400 |
| empty `messages: []` | 400 "Messages must be a non-empty array" |
| oversized prompt (beyond contextLength) | 400 |

If any returns 5xx, the model wiring is leaking an upstream error — fix the classification before merging.

## 4. Burst test — scale to real production load

Sample current peak load before deciding concurrency:
```bash
TINYBIRD_TOKEN="..."  # public read token from apps/model-monitor/src/hooks/useModelMonitor.js
curl -s "https://api.europe-west2.gcp.tinybird.co/v0/pipes/model_health.json?token=$TINYBIRD_TOKEN&window_minutes=60" \
  | jq '.data[] | select(.model=="<model-name>") | {requests, errors_5xx, latency_p95_ms}'
```

Pick concurrency that matches or moderately exceeds observed peak per minute. For low-volume new models, default `n=5,15,30`. **You should TRY to touch the limit** so you know where it is — but document any 429s in the PR rather than letting them hide.

```bash
# Cache-bust each request — the local worker has a TEXT-CACHE that returns
# in <100ms and will hide real upstream latency otherwise.
for n in 5 15 30; do
  for i in $(seq 1 $n); do
    NONCE="$(uuidgen)-$i"
    (curl -s -o /tmp/burst-$i.body \
      -w "$i %{http_code} %{time_total}\n" \
      --max-time 90 http://localhost:8788/v1/chat/completions \
      -H "Authorization: Bearer $SK" -H "Content-Type: application/json" \
      -d "{\"model\":\"<model>\",\"messages\":[{\"role\":\"user\",\"content\":\"echo: $NONCE\"}],\"max_tokens\":80}") &
  done
  wait
done
```

**Acceptance gates:**
- **0 5xx** at the chosen concurrency. If any 5xx, investigate before merging.
- **No unexpected 429s.** A 429 only at very high n (well past production peak) is acceptable but document it.
- **p95 latency** in line with the model class — text <5s, vision <15s, thinking <60s. Anything slower is a concern.
- **Timeouts at exactly the worker `DEFAULT_UPSTREAM_TIMEOUT_MS` (90s)** are usually genuine upstream slowness on novel prompts (especially thinking models), not infra problems. Note the rate.

## 5. Snapshot tests (after the live battle-test passes)

Run from `enter.pollinations.ai/`:
```bash
npx vitest run test/aliases.test.ts                                                    # alias resolution
npx vitest run test/integration/text.test.ts --testNamePattern="<service-name> "       # VCR snapshots
```

VCR snapshots are auto-recorded on first run when the upstream is reachable. Run `npm run decrypt-vars` first if needed.

---

# Secrets (sops)

```bash
# Decrypt, inspect keys
sops --decrypt gen.pollinations.ai/secrets/prod.vars.json | python3 -c "import json,sys; [print(k) for k in json.load(sys.stdin)]"

# Add/update a key
sops set gen.pollinations.ai/secrets/prod.vars.json '["KEY_NAME"]' '"value"'

# Decrypt to .env (used before local dev/tests)
npm run decrypt-vars   # from image.pollinations.ai/
```

---

# Azure OpenAI Resources (gptimage)

## Current resources

| Resource | Region | Used for |
|----------|--------|----------|
| `myceli-prod-eastus2` | East US 2 | `gptimage` (gpt-image-1-mini), `gptimage-large` (gpt-image-1.5) |
| `myceli-prod-swedencentral` | Sweden Central | Flux Kontext, text models |

Env var: `AZURE_MYCELI_PROD_EASTUS2_API_KEY` (in `gen.pollinations.ai/secrets/prod.vars.json`)

## Login

```bash
brew install azure-cli   # if not installed
az login --use-device-code
# Use thomas@myceli.ai account
```

## If a resource gets content-policy blocked

Azure blocks the whole resource (not just one deployment). Signs: all gptimage calls return 403 with *"temporarily blocked because we detected behavior that may violate our content policy"*.

Recovery steps:
1. Check which region supports the model: `az cognitiveservices model list -l <region> --query "[?model.name=='gpt-image-1-mini']" -o json`
2. Create new resource: `az cognitiveservices account create --name myceli-prod-<region> --resource-group rg-myceli-prod --kind AIServices --sku S0 --location <region>`
3. Deploy model: `az cognitiveservices account deployment create --name <resource> --resource-group rg-myceli-prod --deployment-name gpt-image-1-mini --model-name gpt-image-1-mini --model-version 2025-10-06 --model-format OpenAI --sku-capacity 60 --sku-name GlobalStandard`
4. Get key: `az cognitiveservices account keys list --name <resource> --resource-group rg-myceli-prod --query 'key1' -o tsv`
5. Add to SOPS: `sops set gen.pollinations.ai/secrets/prod.vars.json '["AZURE_MYCELI_PROD_EASTUS2_API_KEY"]' '"<key>"'`
6. Update endpoint URLs in `createAndReturnImages.ts` (`AZURE_GPTIMAGE_CONFIGS`)
7. Delete broken deployments from old resource to free quota: `az cognitiveservices account deployment delete --name <old-resource> --resource-group rg-myceli-prod --deployment-name <deployment>`
8. Test locally: `npm run dev` then `curl -H "x-enter-token: $PLN_ENTER_TOKEN" "http://localhost:16384/prompt/a+cat?model=gptimage"`
