# Replicate billing via REST API + web dashboard

Validated: **2026-05-07**. Re-validate if a command returns unexpected results.

## Requirements

- Single token in `gen.pollinations.ai/secrets/{dev,staging,prod}.vars.json` as `REPLICATE_API_TOKEN`.
- Same token used for runtime (predictions) and read-only management (account, model schema). Replicate has **no separate management API key** like OpenRouter.
- Tools: `curl`, `jq`, `sops`, optionally `replicate` CLI (`brew install replicate/tap/replicate`).

## Known identifiers

Production runtime token:

```bash
REPLICATE_API_TOKEN=$(sops -d gen.pollinations.ai/secrets/prod.vars.json | jq -r '.REPLICATE_API_TOKEN')
```

- **Org:** `myceli-ai` (organization, not personal account). All tokens scoped to this org.
- Verify auth: `curl -H "Authorization: Bearer $REPLICATE_API_TOKEN" https://api.replicate.com/v1/account` → expect `{"type":"organization","username":"myceli-ai",...}`.

Pollinations production models on Replicate (as of 2026-05-07):

- `bytedance/seedance-2.0.0` → registered as `seedance-2.0` (paid only)

## Querying spend and usage

### 1. Predictions list (operational, free)

```bash
curl -sS "https://api.replicate.com/v1/predictions?prediction_count=20" \
  -H "Authorization: Bearer $REPLICATE_API_TOKEN" |
  jq '.results[] | {id, model: .model, status, created_at, predict_time: .metrics.predict_time}'
```

Use to enumerate recent runs by model. Paginated via `next` URL.

- `metrics.predict_time` = GPU seconds Replicate charges them, **not** the per-second output pricing they charge us.

### 2. Account-level credit/balance

⚠️ **No public endpoint.** Web UI only:

- https://replicate.com/account/billing → MTD spend, invoices, payment method
- `GET /v1/account/api-tokens` returns 404 (no token CRUD API exposed)

For Pollinations operational tracking, use Tinybird (see Finance below).

### 3. Per-model schema and pricing

Schema lives in the model's OpenAPI:

```bash
MODEL=bytedance/seedance-2.0.0
curl -sS "https://api.replicate.com/v1/models/$MODEL" \
  -H "Authorization: Bearer $REPLICATE_API_TOKEN" |
  jq '.latest_version.openapi_schema.components.schemas.Input.properties'
```

Pricing is **not in the API**. Scrape from the public model page:

```bash
curl -sS "https://replicate.com/$MODEL" |
  python3 -c "
import sys, re, json
html = sys.stdin.read()
for m in re.finditer(r'(\\{[^{}]{0,200}\\\$[\\d.]+[^{}]{0,200}per second of output[^{}]*\\})', html):
    try: print(json.loads(m.group(1)))
    except: pass"
```

For Seedance 2.0 (validated empirically 2026-05-07 via two 720p predictions, one
T2V and one I2V — both came back tagged `metrics.model_variant: "non_video_in"`,
confirming the price categories below).

The 6 price tiers shown on the public model page split by **resolution × model
variant**, NOT by audio. Audio is free; image input is free.

| Mode | 480p | 720p | 1080p |
|---|---|---|---|
| **`non_video_in`** — T2V or I2V (no `reference_videos`) | $0.08/sec | $0.18/sec | $0.45/sec |
| **`video_in`** — V2V (`reference_videos` provided) | $0.10/sec | $0.22/sec | $0.55/sec |

Pollinations v1 only exposes the `non_video_in` tier at 720p ($0.18/sec cost,
$0.27/sec price = 1.5×). The handler rejects non-720p with HTTP 400 and never
sets `reference_videos`, so V2V can't be triggered.

The seedance-2.0 handler maps `safeParams.image` (existing pipe/comma-separated
array param) into one of three Replicate input modes:

- **0 images** → T2V (text only)
- **1 image, no `last_frame_image`** → I2V first frame
- **1 image + `last_frame_image`** → first + last frame interpolation
- **2-9 images** (no `last_frame_image`) → `reference_images` mode (character
  consistency / style guidance — model conditions on visuals, prompt with
  `[Image1]`, `[Image2]`, etc.)
- **2+ images + `last_frame_image`** → HTTP 400 (Replicate disallows mixing)

This mirrors the multi-image pattern already used by `flux-klein`, `qwen-image`,
and `seedream` — users just pipe-separate URLs in `?image=`.

Each completed prediction's `metrics` object includes `model_variant`,
`resolution_target`, and `video_output_duration_seconds` — useful for
reconciling Replicate's billing if a discrepancy ever shows up.

## Runtime smoke tests

Cheapest sanity check (~$0.32) — uses the official-model endpoint (no `version` field needed):

```bash
curl -sS -X POST "https://api.replicate.com/v1/models/bytedance/seedance-2.0.0/predictions" \
  -H "Authorization: Bearer $REPLICATE_API_TOKEN" \
  -H "Content-Type: application/json" \
  -H "Prefer: wait=60" \
  -d '{
    "input": {
      "prompt": "a single goldfish swimming in a glass bowl",
      "duration": 4,
      "resolution": "480p",
      "aspect_ratio": "16:9",
      "generate_audio": false
    }
  }' | jq '{id, status, predict_time: .metrics.predict_time, error}'
```

> ⚠️ Two endpoints exist:
> - `POST /v1/models/{owner}/{name}/predictions` — official models, latest version (no `version` in body)
> - `POST /v1/predictions` — community models OR pinned version (requires `version` hash in body)
>
> Sending `model` as a body field to `/v1/predictions` returns HTTP 422 (`version is required`).
> Seedance 2.0 requires `duration` in `[4, 15]` or `-1` (intelligent duration).

End-to-end via Pollinations:

```bash
TOKEN=$(grep ENTER_API_TOKEN_REMOTE enter.pollinations.ai/.testingtokens | cut -d= -f2)
curl -s "https://gen.pollinations.ai/image/seedance-2.0-test?model=seedance-2.0&width=854&height=480&duration=2&audio=false" \
  -H "Authorization: Bearer $TOKEN" \
  -o /tmp/seedance2-smoke.mp4 \
  -w "HTTP: %{http_code}, size: %{size_download} bytes\n"
file /tmp/seedance2-smoke.mp4  # expect: ISO Media, MP4
```

## Key rotation

**Constraint:** Replicate has no public token CRUD API (`POST/DELETE /v1/account/api-tokens` → 404). Token lifecycle is web-UI-only.

**Semi-automated flow:** `tools/scripts/rotation/rotate-genai-replicate.sh`

```
PHASE 1 (manual, ~30s)
  Operator: visit https://replicate.com/account/api-tokens
            create token "pollinations-gen-rotated-YYYYMMDD-HHMMSS"
            export REPLICATE_NEW_TOKEN=r8_xxx

PHASE 2 (automated, ~3-5min)
  REPLICATE_NEW_TOKEN=r8_xxx \
    POLLINATIONS_SK_TOKEN=sk_xxx \
    ./tools/scripts/rotation/rotate-genai-replicate.sh --execute
  → validate → SOPS update → direct smoke → PR + auto-merge → deploy → e2e smoke

PHASE 3 (manual, ~30s)
  Operator: visit https://replicate.com/account/api-tokens
            delete the token whose prefix matches the OLD_TOKEN printed at end
```

Cost per rotation cycle: ~$0.32 (direct smoke + e2e smoke).

## Credit / discount handling

Pay-as-you-go via Wise (international card payment). No credit pool, no live balance API.

Finance pool entry (`apps/operation/finance/secrets/vendors.json`):

```json
{
  "_pools": {
    "Replicate": {
      "provider": "replicate",
      "kind": "cash",
      "single_row": true,
      "vendor_canonical": "Replicate"
    }
  }
}
```

The `single_row: true` flag (introduced in #10712) renders Replicate as a plain Wise-cash vendor row — no balance/credit math.

## Tinybird MTD query (operational, optional)

For margin analysis dashboards, not finance reconciliation. Admin token at `enter.pollinations.ai/observability/.tinyb`.

```bash
TINYBIRD_ADMIN_TOKEN=$(jq -r '.token' enter.pollinations.ai/observability/.tinyb)

curl -s "https://api.europe-west2.gcp.tinybird.co/v0/sql?token=$TINYBIRD_ADMIN_TOKEN" \
  --data-urlencode "q=SELECT
    SUM(total_cost) AS mtd_cost_usd,
    SUM(total_price) AS mtd_price_usd,
    count() AS request_count
  FROM generation_event
  WHERE model_provider = 'replicate'
    AND start_time >= toStartOfMonth(now())"
```

Use `model_used IN ('seedance-2.0', ...)` if `model_provider` filter ever returns empty.

## Gotchas

- **No token CRUD API.** `/v1/account/api-tokens` returns 404. Only the web UI can create or delete tokens.
- **`Prefer: wait` maxes at 60 seconds.** Predictions over 60s require polling — `replicateClient.ts` polls every 5s until terminal. No app-level timeout; relies on Worker platform limits.
- **`metrics.predict_time` ≠ user-facing pricing.** Replicate charges per-second of output (or per-image/etc.), but `predict_time` is GPU wall-clock for their internal accounting. Use it for margin analysis only.
- **Pricing varies by resolution + audio for video models.** The registry stores a flat anchor rate (720p+audio for Seedance 2.0); 480p under-bills users (~50% of cost), 1080p is blocked at the model handler to avoid eating margin (~60% loss). Revisit per-resolution cost schema only when rule #3 (variant-tier with users spanning tiers) hits twice.
- **Same token across dev/staging/prod.** Replicate doesn't support per-environment scoping without separate orgs; we accept this trade-off. Document if isolation becomes important.
- **Org name matters in rotation.** Rotation script refuses to deploy a new token unless `GET /v1/account` returns `username == "myceli-ai"`.

## Question -> query cheat sheet

| Question | Endpoint / Source |
|---|---|
| Is the token valid? | `GET /v1/account` |
| Who is this token bound to? | `GET /v1/account` → `username` |
| What's running right now? | `GET /v1/predictions?prediction_count=20` |
| How much have we spent MTD? | https://replicate.com/account/billing (UI), or Tinybird query above |
| What does model X cost? | Scrape https://replicate.com/{owner}/{name} (no API) |
| What inputs does model X take? | `GET /v1/models/{owner}/{name}` → `latest_version.openapi_schema` |
| Is model X healthy? | POST a tiny prediction with `Prefer: wait=60`; check `status: succeeded` |
| What tokens exist? | UI only — https://replicate.com/account/api-tokens |

## Known unknowns

- No invoice export endpoint. Monthly reconciliation: Wise feed (auto) + manual UI cross-check.
- No per-token attribution. If we ever issue multiple tokens, no API tells us which token spent what.
- No per-model spend API. Tinybird `generation_event.total_cost` is our authoritative per-model attribution.
