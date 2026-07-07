---
name: model-management
description: "Add, update, or remove text/image/video/audio/embeddings models. Covers the full lifecycle: files to touch, what to verify, and how to test empirically before merging."
---

> **Read top to bottom on first use.** Then bookmark §6 ([Change matrix](#6-change-matrix--if-you-change-x-verify-y)) and §7 ([Test matrix](#7-test-matrix--if-model-claims-x-run-y)) — those are the daily-driver tables. §9 ([Field-parity audit](#9-field-parity-audit--mandatory-on-new-model--provider-change)) is **mandatory** for new model and provider-change PRs.

---

# 1. What are you doing?

| You're… | Jump to |
|---|---|
| Adding a new model | §3 → §5 → §6 (row "Add") → §7 (full matrix) → §9 (field-parity) → §10 (PR checklist) |
| Changing pricing only | §6 (row "Pricing") → §8 (usage + Tinybird) |
| Changing provider or modelId | §6 (row "Provider") → §7 (full modality matrix) → §9 (field-parity) |
| Changing modalities / capabilities | §6 (row "Modalities") → §7 (relevant rows only) |
| Changing name / slug / aliases | §6 (row "Slug/alias") → §7 (alias test) |
| Changing description | §6 (row "Description") |
| Deleting a model | §6 (row "Delete") |
| Debugging a live issue | See `model-debugging` skill (currently stale — scheduled for rewrite) |

## Related skills — when to hand off

This skill is self-contained for the model lifecycle. Hand off to a dedicated skill when the work clearly belongs elsewhere:

| If you're doing… | Use this skill instead | What stays here |
|---|---|---|
| Adding/modifying a Tinybird **pipe or datasource schema** | `tinybird-deploy` | Querying existing pipes/SQL to verify billing rows |
| Investigating a live model error in prod (logs, error patterns, affected users) | `model-debugging` | Pre-merge empirical testing |
| Verifying provider invoice ↔ our cost block math, monthly spend rollups | `provider-billing` | Setting the cost block from provider's posted rates |
| Deploying gen/enter workers themselves | `enter-services` | Local-only testing before merge |

**Things kept inline (not extracted into their own skills) on purpose:**
- **SOPS / secrets ops** for provider keys (§11.1) — three commands tightly scoped to `gen.pollinations.ai/secrets/`. Extracting it would add indirection without saving content.
- **The test matrix (§7)** — we just absorbed `test-model` back into this skill because the change matrix (§6) and test matrix (§7) only make sense read together. Splitting them again would recreate drift.

---

# 2. Empirical over documentation

**Trust the live upstream response over vendor docs, marketing pages, and your own memory.** Vendor docs lie about deployment-specific behavior — region variants strip vision, preview-vs-GA capability gaps, wrapper layers silently drop content types. Before declaring `inputModalities`, supported aspect ratios, cached-token behavior, or anything else in the registry, **send the actual request and read the actual response.** When docs disagree with the API, the API wins. Note any discrepancy in the PR.

Every row in the [Change matrix](#6-change-matrix--if-you-change-x-verify-y) and [Test matrix](#7-test-matrix--if-model-claims-x-run-y) refers back to this. There is no "the docs say it supports X, ship it."

---

# 3. Local topology & which token to use

```
client → gen.pollinations.ai → upstream provider
                ↓ (only for: proxy fallback, docs, auto-top-up trigger)
         enter.pollinations.ai (dashboard, auth, Stripe surfaces)
```

**Generation does not go through Enter, and neither does billing tracking.** Gen reads the shared D1/KV bindings directly to validate tokens, check balances, and apply model permissions. Gen also sends the `generation_event` directly to Tinybird (`gen.pollinations.ai/src/middleware/track.ts:290`). The `ENTER` service binding is invoked in only three places:

| File:line | Call site purpose |
|---|---|
| `gen.pollinations.ai/src/index.ts:78` | Proxy fallback for paths gen doesn't own (dashboard, auth UI, account APIs) |
| `gen.pollinations.ai/src/routes/docs.ts:531` | Forward docs paths to enter |
| `gen.pollinations.ai/src/middleware/track.ts:330` | Trigger Stripe auto-top-up (`/api/stripe/auto-top-up/trigger`) for users with auto-top-up enabled |

Implication: **local gen alone covers ~90% of model-management work** — including Tinybird billing verification. You only need to boot local Enter when your change touches an Enter-owned surface.

| Target | Run locally | Token to use | Tinybird writes to |
|---|---|---|---|
| `http://localhost:8788` model tests (config, handler, registry, modalities, billing) | gen only | `POLLINATIONS_TOKEN_LOCAL` | staging workspace |
| Same, but change touches Enter (see list below) | gen **and** enter | `POLLINATIONS_TOKEN_LOCAL` | staging workspace |
| `https://gen.pollinations.ai` | none | `POLLINATIONS_TOKEN_PROD` | prod workspace |
| Staging deploy | n/a (deployed) | `POLLINATIONS_TOKEN_STAGING` | staging workspace |

**Boot Enter locally only if the change touches any of:**
- Dashboard, auth routes, account APIs (Stripe portal, webhook handlers, login)
- Pollen pack / `packBalance` mutation logic, auto-top-up flow itself
- Tier configs (the source of truth in enter — `enter.pollinations.ai/src/tier-config.ts`)
- Tinybird event schema (the event SHAPE / new datasource column — not the data inside it; gen writes the data)
- DB seeding / migrations

Note: **`/v1/models` filtering (including `paidOnly`) lives in gen**, not enter (`gen.pollinations.ai/src/routes/proxy.ts:170` `filterModelsByPermissions`). Test this against local gen alone.

For pure model work (modelId, provider, registry modalities/aliases/description, handler code, cost block), local Enter is **not required** — generations and billing tracking both work without it. The only thing that won't fire is Stripe auto-top-up, which doesn't affect model-management testing.

## Booting

```bash
# (Optional) Terminal 1 — Enter on 3000 — ONLY when your change touches Enter surfaces
(cd enter.pollinations.ai && npm run dev)

# Terminal 2 — Gen on 8788 — required for all model tests.
# USE `npm run dev`, NOT bare `npx wrangler dev`. The dev script runs
# `vite build` first; bare wrangler serves a STALE bundle (your registry/config
# edits won't show — /v1/models returns old pricing) and skips
# `--persist-to .wrangler/state` (so the seeded D1 below isn't used).
(cd gen.pollinations.ai && npm run dev)

# Terminal 3 — seed a known API key into gen's local D1, then source tokens.
# Without this, e2e curls 401: gen validates Bearer tokens against its own local
# D1, and better-auth stores keys hashed (base64url(sha256(key))) — it never
# stores the plaintext of secret keys, so a token in _local/.env only works if
# its hash is in THIS D1. `seed:local` inserts a key whose plaintext = your
# _local/.env POLLINATIONS_TOKEN_LOCAL (idempotent; re-run after any D1 reset).
(cd gen.pollinations.ai && npm run seed:local)
source _local/.env
```

**End-to-end smoke test (must pass before any model PR):**
```bash
source _local/.env
curl -s "http://localhost:8788/v1/chat/completions" \
  -H "Authorization: Bearer $POLLINATIONS_TOKEN_LOCAL" -H "Content-Type: application/json" \
  -d '{"model":"<your-model>","max_tokens":200,"messages":[{"role":"user","content":"Reply: OK"}]}' \
  | jq '{finish:.choices[0].finish_reason, content:.choices[0].message.content}'
# 200 + content → wiring + auth + billing path all live. 401 → re-run seed:local.
```

---

# 4. `_local/.env` — secrets reference

Single source of truth for test tokens. Source it before any test command.

```bash
source _local/.env
```

| Var | Purpose |
|---|---|
| `POLLINATIONS_TOKEN_PROD` | Prod enter `sk_` — calls against `gen.pollinations.ai` |
| `POLLINATIONS_TOKEN_LOCAL` | `sk_` for `localhost:8788`. **NOT auto-seeded** — its hash must be inserted into gen's local D1 via `cd gen.pollinations.ai && npm run seed:local` (seeds this exact token). Re-run after any D1 reset. |
| `POLLINATIONS_TOKEN_STAGING` | Staging enter `sk_` — calls against staging deploys |
| `TINYBIRD_READ_PROD` | Read token, prod workspace |
| `TINYBIRD_READ_STAGING` | Read token, staging workspace — **also covers DEV** (local gen writes to the staging workspace via its `TINYBIRD_INGEST_URL` binding) |

> **There are no "free" vs "paid" keys.** A key is a key. The `paidOnly` gate checks the user's `packBalance` (purchased Pollen pack balance), not the key prefix. To exercise the gate, use a token whose **owning user has `packBalance == 0`** — typically a freshly minted key (signup grants free Pollen, no pack) or one whose pack has been depleted. Don't confuse "free Pollen remaining" (signup grant, doesn't unlock paidOnly) with "pack balance" (purchased, does unlock).

> **A 401 on `localhost:8788` almost always means the local D1 has no row for your token — run `cd gen.pollinations.ai && npm run seed:local`.** Root cause: gen validates `Bearer` tokens against its OWN local D1 `apikey` table (`shared/auth/api-key.ts` → better-auth `verifyApiKey`; enter's D1 is a separate sqlite, not shared). better-auth stores keys hashed as `base64url(sha256(key))` and never stores the plaintext of secret keys, so a dashboard-minted key is unrecoverable and a `_local/.env` token only validates if its hash is in THIS D1. The D1 gets recreated (or came from another clone), so the hash is usually absent → 401. `seed:local` inserts a key whose plaintext = your `_local/.env` `POLLINATIONS_TOKEN_LOCAL` with large test balances, so paid-only + spend both pass. It's idempotent — re-run any time. Inspect what's seeded (no secrets printed):
> ```bash
> GEN_DB=gen.pollinations.ai/.wrangler/state/v3/d1/miniflare-D1DatabaseObject/*.sqlite
> sqlite3 $GEN_DB "SELECT name, start, enabled FROM apikey WHERE id='local-e2e-key';"
> ```

Provider/runtime secrets (Azure, OpenAI, OpenRouter API keys, etc.) belong in `gen.pollinations.ai/secrets/{dev,staging,prod}.vars.json` via SOPS — never in `_local/.env`. See §11.

---

# 5. Files map — by modality

## Text

| File | Controls |
|---|---|
| `gen.pollinations.ai/src/text/configs/modelConfigs.ts` | Per-model provider routing config |
| `gen.pollinations.ai/src/text/configs/providerConfigs.ts` | Provider clients (Portkey, Bedrock, OpenAI-compat) |
| `gen.pollinations.ai/src/text/availableModels.ts` | Service-name → config mapping (the slug you call) |
| `shared/registry/text.ts` | `name`, `aliases`, `description`, `provider`, `inputModalities`, `outputModalities`, `tools`/`reasoning`/`search`, `cost` block, `priceMultiplier`, `paidOnly`, `addedDate`, `tier`, `alpha` |
| `gen.pollinations.ai/secrets/{dev,staging,prod}.vars.json` | Encrypted provider API keys (SOPS) |

## Image / Video

| File | Controls |
|---|---|
| `gen.pollinations.ai/src/image/createAndReturnImages.ts` | Image model dispatch |
| `gen.pollinations.ai/src/image/createAndReturnVideos.ts` | Video model dispatch |
| `gen.pollinations.ai/src/image/models.ts` | `IMAGE_CONFIG` (type, defaults, video flags) |
| `gen.pollinations.ai/src/image/models/*` | Per-model handlers (e.g. `seedreamModel.ts`, `novaCanvasModel.ts`, `replicateClient.ts`) |
| `gen.pollinations.ai/src/image/params.ts` | Param schema: `width`, `height`, `seed`, `aspectRatio`, `private`, `duration` |
| `shared/registry/image.ts` | Same shape as text registry; also includes video models |

## Audio

| File | Controls |
|---|---|
| `gen.pollinations.ai/src/routes/audio.ts` | TTS / music dispatch |
| `gen.pollinations.ai/src/routes/assemblyai-transcription.ts` | Whisper-class transcription |
| `shared/registry/audio.ts` | Pricing, voices, aliases, modalities |

## Embeddings

| File | Controls |
|---|---|
| `gen.pollinations.ai/src/embeddings/*` | Embedding model dispatch |
| `shared/registry/embeddings.ts` | Pricing, provider, aliases |

## Cross-cutting

| File | Controls |
|---|---|
| `shared/registry/registry.ts` | `convertUsage()` — where missing cost keys log `[registry] Missing conversion rate`. `completionReasoningTokens` is rewritten to `completionTextTokens` **before** the rate lookup (line 118), so it never produces this warning. If you see the warning for reasoning, it actually means `completionTextTokens` is missing. |
| `shared/registry/usage-headers.ts` | `x-usage-*` header builder/parser; defines every typed usage field (13 total) |
| `shared/registry/price-helpers.ts` | `perMillion()`, `priceMultiplier` math (`price = usage × cost × priceMultiplier`, rounded to 8 decimals) |
| `gen.pollinations.ai/src/middleware/track.ts` | Builds the `generation_event` row sent to Tinybird; cache HITs are flagged `isBilledUsage: false` (line 395) |

### `priceMultiplier`

Every cost block requires `priceMultiplier`. Current values in the registry: **`1` or `1.5`**, no others. `1.5` is our standard markup for retail; `1` is at-cost or strategically subsidized. Set it explicitly on every new model. Final billed price = `usage × cost × priceMultiplier`.

---

# 6. Change matrix — if you change X, verify Y

> Pricing depends on **both model AND provider.** Always verify pricing on the provider's own website before writing the cost block.
> `addedDate` is set **once** and **never updated.** Drives the 7-day NEW chip on the dashboard. Use `new Date("YYYY-MM-DD").getTime()` with today's date on first add; do not touch it for later pricing/endpoint/provider changes.

| If you change… | …in these files | …re-verify |
|---|---|---|
| **Pricing (`cost` block + `priceMultiplier`)** | `shared/registry/{text,image,audio,embeddings}.ts` | §7 one request per declared modality + §8 (usage JSON + `x-usage-*` headers + Tinybird row with correct cost + tail **completely clean** of `[registry] Missing conversion rate`) + §9 (field parity) |
| **Provider** | config/handler + registry `provider` + SOPS keys | §7 **full modality matrix** (providers silently drop modalities — empirical only), pricing (often differs by provider), prompt-cache behavior, §8, §9 (**mandatory** — field-parity audit catches new usage fields the old provider didn't return) |
| **modelId** (upstream identifier) | config only | One real call per modality returns 200; §8; §9 if the upstream version is new |
| **Slug / service name** | `availableModels.ts` + registry `name` + every alias entry referencing it | `aliases.test.ts`; `/v1/models` lists new slug; old slug returns 404 or alias-redirects; `rg <old-slug>` across `apps/`, `pollinations.ai/`, `packages/sdk` for hardcoded refs |
| **Aliases** | registry `aliases` array | `aliases.test.ts`; each alias resolves to canonical |
| **Description / brand** | registry only | `/v1/models` shows new copy; **don't touch `addedDate`** |
| **`inputModalities` added** | registry + possibly `gen.pollinations.ai/src/text/transforms/` | §7 row passes empirically (vendor docs are not evidence); error path for unsupported modality returns 4xx, not silent ignore |
| **`outputModalities` added** | registry + handler | Sample response carries the modality; §8 usage line for the matching cost type present. If declaring two output modalities (e.g. video+audio for `seedance-2.0`), confirm whether the upstream bills bundled into one usage field or returns separate fields — document the choice in the cost block comment. |
| **Image resolutions / aspect ratios** | handler + (registry comment) | One generation per supported ratio returns 200 with matching dims; unsupported ratios return 4xx; §7 cache row with byte-identical params shows MISS→HIT |
| **Video duration / fps** | handler | Each supported duration returns 200, mp4 of declared length; unsupported returns 4xx |
| **Cached-token behavior** | registry `promptCachedTokens` in cost block | §7 prompt-cache row passes (`cached_tokens > 0` on call 2); tail clean of `Missing conversion rate: usageType=promptCachedTokens` |
| **`paidOnly` flip** | registry `paidOnly: true/false` | Token whose user has `packBalance == 0` → 4xx; token with pack balance → 200; `/v1/models` filtering correct per pack balance |
| **Add model** | every file above | Full §7 + §8 + **§9 (mandatory)** + §10 |
| **Delete model** | remove from config + registry; keep SOPS provider keys (other models may share) | `/v1/models` no longer lists slug; request returns model-not-found 4xx; `aliases.test.ts` updated; `rg <slug>` across the repo for orphan hardcodes; PR description names any downstream apps removed from |

---

# 7. Test matrix — if model claims X, run Y

All commands assume:
```bash
source _local/.env
TOKEN="$POLLINATIONS_TOKEN_LOCAL"      # localhost:8788
# TOKEN="$POLLINATIONS_TOKEN_PROD"     # gen.pollinations.ai
GEN="http://localhost:8788"            # or https://gen.pollinations.ai
MODEL="<your-model>"
```

## 7.1 Text

| Capability | Trigger | Pass condition | Inspect |
|---|---|---|---|
| basic | plain prompt | finish=stop, content non-empty | `usage.completion_tokens > 0` |
| streaming | `stream:true` | last SSE chunk has `finish_reason`, `data: [DONE]` present | tokens accumulate |
| max_tokens edge | `max_tokens:1` | finish=length, NOT 4xx | `completion_tokens=1` |
| image input | `content:[{type:text},{type:image_url,…}]` | answer references image | `prompt_tokens_details.image_tokens` if reported |
| multi-image | 2+ `image_url` parts | reasons over both | `prompt_tokens` scales |
| tools | `tools:[…]` + triggering prompt | finish=tool_calls, valid JSON args | n/a |
| reasoning | thinking prompt | `completion_tokens_details.reasoning_tokens > 0` | reasoning tokens — billed at `completionTextTokens` rate by design (fallback in `registry.ts:118`); no separate cost entry required, but `completionTextTokens` itself must exist |
| **prompt cache** | **same ≥1024-token prefix** in 2 calls, ~2s apart | call 2: `prompt_tokens_details.cached_tokens > 0` | cached_tokens line |

**Image-input quick check** (1×1 transparent PNG, near-zero cost):
```bash
IMG="iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII="
curl -s "$GEN/v1/chat/completions" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d "{\"model\":\"$MODEL\",\"max_tokens\":20,\"messages\":[{\"role\":\"user\",\"content\":[{\"type\":\"text\",\"text\":\"What color is this pixel?\"},{\"type\":\"image_url\",\"image_url\":{\"url\":\"data:image/png;base64,$IMG\"}}]}]}"
```
- 200 + sensible answer → image input real, include in `inputModalities`
- 200 + "I cannot see images" → fake, **exclude**
- 4xx/5xx mentioning image/multimodal → fake, **exclude**

**Prompt cache check** (provider side):
```bash
SYS=$(python3 -c 'print("The quick brown fox jumps over the lazy dog.\n" * 200)')
for i in 1 2; do
  curl -s "$GEN/v1/chat/completions" \
    -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
    -d "$(jq -n --arg s "$SYS" --arg m "$MODEL" \
      '{model:$m,max_tokens:10,messages:[{role:"system",content:$s},{role:"user",content:"hi"}]}')" \
    | jq '.usage.prompt_tokens_details.cached_tokens'
  sleep 2
done
```
Call 2 > 0 → MUST add `promptCachedTokens` to cost block.

## 7.2 Image

| Capability | Trigger | Pass condition | Inspect |
|---|---|---|---|
| T2I basic | `GET /image/<prompt>?model=X&seed=42` | 200, file is JPEG/PNG | `x-usage-completion-image-tokens` header |
| supported aspect ratios | one call per ratio (square / wide / tall) | 200, dims match | response headers, `file` on saved bytes |
| unsupported ratio | a ratio outside support | 4xx (not silent fallback) | error body |
| seed determinism | same seed twice | identical bytes (or near, model-dep) | hash compare |
| I2I (image edit) | `&image=<url>` if model supports | 200, edited result | usage headers |
| **output cache** | **two byte-identical GETs** | call 1 `X-Cache: MISS`, call 2 `X-Cache: HIT` | response headers |

```bash
# T2I MISS — full usage check applies
curl -s -o /tmp/i1.jpg -D /tmp/i1.h -w "HTTP %{http_code} %{size_download}b\n" \
  "$GEN/image/a%20cute%20cat?model=$MODEL&seed=42&width=512&height=512" \
  -H "Authorization: Bearer $TOKEN"
file /tmp/i1.jpg
grep -iE "x-usage|x-cache" /tmp/i1.h

# Output cache — byte-identical request, billing should NOT fire
curl -s -o /tmp/i2.jpg -D /tmp/i2.h \
  "$GEN/image/a%20cute%20cat?model=$MODEL&seed=42&width=512&height=512" \
  -H "Authorization: Bearer $TOKEN"
grep -iE "x-cache" /tmp/i2.h   # expect: HIT
# NOTE: media cache HIT does NOT preserve x-usage-* headers (only safety metadata).
#       No Tinybird row is written for HITs. See §8 caveat.
```

## 7.3 Video

| Capability | Trigger | Pass condition | Inspect |
|---|---|---|---|
| basic | `/video/<prompt>?model=X&duration=3` | 200, mp4 of declared duration | usage headers, `ffprobe` duration |
| each supported duration | one call per supported value | 200, file length matches | ffprobe |
| each supported fps (if exposed) | one call per fps | 200 | ffprobe |
| **output cache** | **two byte-identical calls** | MISS→HIT | `X-Cache` header (HIT drops usage headers — see §8) |

## 7.4 Audio

| Capability | Trigger | Pass condition | Inspect |
|---|---|---|---|
| TTS | `/audio/<text>?voice=alloy&model=X` | 200, non-empty mp3 | `x-usage-completion-audio-tokens` (chars) or `-seconds` |
| voices | one call per declared voice | 200, audibly distinct (or document) | usage headers |
| OpenAI-compat TTS | `POST /v1/audio/speech` | 200, mp3 | usage headers |
| STT (Whisper/Scribe) | `POST /v1/audio/transcriptions` with mp3 | 200, text returned | `x-usage-prompt-audio-seconds` |
| Music gen (if claimed) | provider-specific | 200, audio | `x-usage-completion-audio-seconds` |
| **output cache** | **two byte-identical calls** | MISS→HIT | HIT drops usage headers — see §8 |

## 7.5 Embeddings

| Capability | Trigger | Pass condition | Inspect |
|---|---|---|---|
| basic | `POST /v1/embeddings` with `{model, input}` | 200, `data[0].embedding.length` matches declared dim | `usage.prompt_tokens` |
| batch | `input: [...]` array | 200, one vector per input | `usage.prompt_tokens` scales |
| oversized input | input beyond context | 4xx | error body |

## 7.6 Error paths — every malformed request MUST return 4xx, never opaque 5xx

| Path | Expected |
|---|---|
| unreachable image URL (404 source) | 400 with provider error message |
| malformed image URL ("not-a-url") | 400 |
| out-of-range temperature (99) | 400 "JSON body validation failed" |
| invalid tool schema (parameters not object) | 400 |
| empty `messages: []` | 400 "Messages must be a non-empty array" |
| oversized prompt (beyond contextLength) | 400 |
| `paidOnly` model + token with `packBalance == 0` | 4xx with clear billing message |

If any returns 5xx, model wiring is leaking an upstream error — fix the classification before merging.

## 7.7 Burst — confirm capacity at production peak

Sample peak from Tinybird first (`model_health` pipe). Default `n=5,15,30` for new models. Cache-bust each request (local TEXT-CACHE returns in <100ms otherwise).

```bash
for n in 5 15 30; do
  for i in $(seq 1 $n); do
    NONCE="$(uuidgen)-$i"
    (curl -s -o /tmp/burst-$i.body \
      -w "$i %{http_code} %{time_total}\n" \
      --max-time 90 "$GEN/v1/chat/completions" \
      -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
      -d "{\"model\":\"$MODEL\",\"max_tokens\":80,\"messages\":[{\"role\":\"user\",\"content\":\"echo: $NONCE\"}]}") &
  done
  wait
done
```

**Acceptance**: 0 5xx at chosen concurrency. Document any 429s in the PR. Timeouts at exactly 90s on novel prompts (thinking models) are usually genuine upstream slowness, not infra — note the rate.

---

# 8. Usage, billing, cache verification

After every **MISS** call (cache HITs are explicitly NOT billed — see caveat below), every new model or pricing change must pass all four checks:

### A. JSON `usage` (text / OpenAI-compatible responses)
- Dump the full `usage` block — including `prompt_tokens_details` and `completion_tokens_details`
- Every key with `> 0` must either:
  - Map to a registry cost entry, **or**
  - Be the documented fallback (`completion_tokens_details.reasoning_tokens` → billed at `completionTextTokens` rate)
- Any unmapped key = revenue leak. Tail will say `[registry] Missing conversion rate: model=X usageType=Y` and bill 0 for that line.

### B. `x-usage-*` response headers (image/video/audio/embeddings + text)
- Inspect with `curl -D -` or `-D /tmp/h`. The 13 typed headers are defined in `shared/registry/usage-headers.ts`.
- For MISS: every non-zero header should have a matching registry cost entry.
- For HIT: **text caches preserve `x-usage-*` headers** so the parsed usage matches the original MISS; **media (image/video/audio) caches drop `x-usage-*` headers** and only preserve selected safety metadata. Don't flag missing media usage headers on a HIT.

### C. Tinybird `generation_event` row
- Local gen / dev → staging workspace → `TINYBIRD_READ_STAGING`
- Prod gen → prod workspace → `TINYBIRD_READ_PROD`
- Confirm a row exists for your model with non-zero `token_count_*` and `token_price_*` columns matching the JSON/headers (column list: `enter.pollinations.ai/observability/datasources/generation_event.datasource`).
- **No row is written for cache HITs** (`isBilledUsage: false` at `gen.pollinations.ai/src/middleware/track.ts:395`). HIT-call verification stops at the `X-Cache: HIT` header.

`model_health` returns counts/errors/latency only, no usage. Query `generation_event` directly to see token + price columns:
```bash
TB="https://api.europe-west2.gcp.tinybird.co"
SQL="SELECT resolved_model_requested AS model, start_time,
  token_count_prompt_text, token_count_prompt_cached, token_count_prompt_image,
  token_count_completion_text, token_count_completion_reasoning,
  token_count_completion_image, token_count_completion_video_seconds,
  total_cost, total_price, dev_price, markup_rate
 FROM generation_event
 WHERE resolved_model_requested = '$MODEL'
   AND start_time >= now() - interval 10 minute
 ORDER BY start_time DESC
 LIMIT 5 FORMAT JSON"
curl -s -G "$TB/v0/sql" \
  --data-urlencode "q=$SQL" \
  --data-urlencode "token=$TINYBIRD_READ_STAGING" | jq '.data'
```

For health/latency monitoring (separate concern from billing verification), `model_health` is the right pipe — note its param is `minutes`, not `window_minutes`:
```bash
curl -s "$TB/v0/pipes/model_health.json?token=$TINYBIRD_READ_STAGING&minutes=10" \
  | jq ".data[] | select(.model==\"$MODEL\")"
```

### D. Worker tail — zero `Missing conversion rate` warnings
In a separate terminal during testing:
```bash
(cd gen.pollinations.ai && npx wrangler tail)
```
- Look for: `[registry] Missing conversion rate: model=… usageType=…`
- **No warning is acceptable.** Reasoning tokens fall back to `completionTextTokens` *before* the rate lookup (`shared/registry/registry.ts:118`) — they should never trigger the warning. If you see `Missing conversion rate: usageType=completionReasoningTokens`, it actually means `completionTextTokens` itself is missing from the cost block, and that line is billing 0. Any warning = cost block incomplete; fix before merging.

---

# 9. Field-parity audit — mandatory on new model & provider change

**Why.** Every time we add a model or swap a provider, the upstream may return usage fields we don't yet capture. If the field exists in the response but not in our registry, billing under-charges (or charges zero) for that resource — silently, with no test failure. We've already seen this with `promptCachedTokens` (caught only after deploy). The audit catches it before merge.

**The contract.** For a new model or provider swap, every numeric field present in the upstream response's usage/billing block must:
1. Map to one of the **13 typed usage fields** in `shared/registry/usage-headers.ts` (`promptTextTokens`, `promptCachedTokens`, `promptAudioTokens`, `promptAudioSeconds`, `promptImageTokens`, `promptVideoTokens`, `completionTextTokens`, `completionReasoningTokens`, `completionAudioTokens`, `completionAudioSeconds`, `completionImageTokens`, `completionVideoSeconds`, `completionVideoTokens`),
2. AND have a corresponding entry in the registry `cost` block (reasoning tokens are an exception — they're rewritten to `completionTextTokens` in `registry.ts:118` before rate lookup, so they don't need a separate cost line; but `completionTextTokens` itself must exist),
3. AND surface in the response headers as `x-usage-<kebab-case-name>`,
4. AND land in the Tinybird `generation_event` row via `track.ts`,
5. AND appear in the worker logs (`wrangler tail`) so we can audit historical drift.

If a field exists upstream that we don't map → either extend `usage-headers.ts` + the registry + the Tinybird schema, OR document explicitly in the PR why we're intentionally dropping it (rare; usually "provider bundles X into Y").

## Audit procedure (run once per new model / provider change)

```bash
source _local/.env
TOKEN="$POLLINATIONS_TOKEN_LOCAL"
MODEL="<your-model>"

# 1. Probe each modality the model declares — capture raw upstream response
curl -s "http://localhost:8788/v1/chat/completions" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -D /tmp/headers.txt \
  -d "{\"model\":\"$MODEL\",\"max_tokens\":50,\"messages\":[{\"role\":\"user\",\"content\":\"Count to ten.\"}]}" \
  | tee /tmp/response.json | jq '.usage'

# 2. List every numeric field upstream returned
jq -r '.usage | paths(numbers) | join(".")' /tmp/response.json | sort -u
# Cross-check against the 13 typed fields above.

# 3. Confirm each non-zero field appears as an x-usage-* header
grep -iE "^x-usage-" /tmp/headers.txt

# 4. Pull the actual billing row Tinybird wrote (wait ~5s for ingest)
sleep 5
TB="https://api.europe-west2.gcp.tinybird.co"
SQL="SELECT * FROM generation_event
 WHERE resolved_model_requested = '$MODEL'
   AND start_time >= now() - interval 2 minute
 ORDER BY start_time DESC LIMIT 1 FORMAT JSON"
curl -s -G "$TB/v0/sql" \
  --data-urlencode "q=$SQL" \
  --data-urlencode "token=$TINYBIRD_READ_STAGING" | jq '.data[0]'
# Confirm every non-zero usage field from step 2 has a non-zero token_count_* column,
# and every cost line has a non-zero token_price_* column.

# 5. Confirm wrangler tail shows the same usage fields logged
# (in the gen wrangler dev terminal — look for the usage payload in the track log)
```

## Audit acceptance gates

- Every numeric upstream usage field is in the 13-typed list **or** explicitly documented as dropped in the PR
- Every non-zero usage field has a matching `x-usage-*` header
- Every non-zero usage field has a matching column in the Tinybird row
- The cost block multiplies through correctly: `displayed price ≈ sum(usage_field × cost_rate × priceMultiplier)`
- Worker tail logs the full usage payload (we keep this for future audits)

If any of the five fails → fix the registry / `usage-headers.ts` / `track.ts` / cost block before merging. Do not ship a model whose upstream returns fields we can't account for.

## Bundled-modality exception

Some upstreams bill multiple modalities under a single usage field. Example: `seedance-2.0` declares `outputModalities: ["video","audio"]` but bills both under `completionVideoSeconds` (the audio is bundled into the video duration). When this is the case:
- Cost block carries only the bundling field (e.g., `completionVideoSeconds`)
- Add a comment to the cost block explaining the bundling
- Note in PR description: "audio is bundled into video billing per upstream invoice"

This is acceptable. What's NOT acceptable is silently dropping a separately-billed field because we forgot to map it.

---

# 10. PR checklist — before opening the PR

## Automated suite (must all pass)

```bash
# Snapshot / unit — fast, no network
(cd enter.pollinations.ai && npx vitest run test/aliases.test.ts \
                                            test/pricing-data.test.ts \
                                            test/effective-prices.snapshot.test.ts)

(cd gen.pollinations.ai && npx vitest run test/usage-headers.test.ts \
                                          test/model-permissions.test.ts \
                                          test/media-cache.test.ts \
                                          test/text-cache.test.ts \
                                          test/billing-deduction.test.ts \
                                          test/tracking-observability.test.ts \
                                          test/openai-schema.test.ts)

# Modality-specific (run the relevant subset)
(cd gen.pollinations.ai && npx vitest run test/image/)         # for image models
(cd gen.pollinations.ai && npx vitest run test/embeddings/)    # for embeddings
(cd gen.pollinations.ai && npx vitest run test/assemblyai-transcription.test.ts \
                                          test/scribe-transcription.test.ts \
                                          test/transcription-param-parsing.test.ts)  # for STT

# VCR / safety
(cd gen.pollinations.ai && npx vitest run test/generation-vcr.test.ts test/vcr.test.ts test/safety.test.ts)
```

## Empirical (must all pass against `localhost:8788`)

- [ ] All [Change matrix](#6-change-matrix--if-you-change-x-verify-y) rows for this change type re-verified
- [ ] All [Test matrix](#7-test-matrix--if-model-claims-x-run-y) rows for declared capabilities passed (not from docs)
- [ ] [Output cache](#72-image) tested with **byte-identical requests** if the modality caches
- [ ] [Prompt cache](#71-text) verified for text models (`cached_tokens > 0` on call 2)
- [ ] [Four-part usage check](#8-usage-billing-cache-verification) passed on MISS calls
- [ ] [Field-parity audit](#9-field-parity-audit--mandatory-on-new-model--provider-change) passed (new model or provider change)
- [ ] `/v1/models` returns the model with correct pricing + modalities
- [ ] `addedDate` set on first add, **untouched** on later edits
- [ ] `priceMultiplier` set (1 or 1.5)
- [ ] No 5xx in [error-path matrix](#76-error-paths--every-malformed-request-must-return-4xx-never-opaque-5xx)
- [ ] Burst test passed at expected production concurrency
- [ ] PR description notes any docs/upstream discrepancies found and any bundled-modality choices

---

# 11. Appendices

## 11.1 SOPS — provider secrets

```bash
# Inspect keys in a vars file
sops --decrypt gen.pollinations.ai/secrets/prod.vars.json \
  | python3 -c "import json,sys; [print(k) for k in json.load(sys.stdin)]"

# Add or update a key
sops set gen.pollinations.ai/secrets/prod.vars.json '["KEY_NAME"]' '"value"'

# Decrypt to .dev.vars for local dev
(cd gen.pollinations.ai && npm run decrypt-vars)
```

> Never put Pollinations test tokens (`POLLINATIONS_TOKEN_*`) or admin/operator tokens in SOPS — recipient list is too broad. SOPS is for provider/runtime keys only.

### When decrypt-vars fails with "no identity matched any of the recipients"

The convention on this team is to keep the Pollinations age private key in **macOS Keychain** under service name `sops-age-key` (account = your local `$USER`). If `~/.config/sops/age/keys.txt` exists but contains an unrelated key, decrypt fails with all `.sops.yaml` recipients listed as `FAILED`. Restore from keychain — don't ask the user to paste secrets:

```bash
SOPS_KEY=$(security find-generic-password -s "sops-age-key" -a "$USER" -w 2>/dev/null) \
  || { echo "Not in keychain — ask the user where their age key lives"; exit 1; }
for KF in ~/.config/sops/age/keys.txt ~/Library/Application\ Support/sops/age/keys.txt; do
  mkdir -p "$(dirname "$KF")"
  grep -qF "$SOPS_KEY" "$KF" 2>/dev/null || {
    printf '\n# pollinations (restored from keychain svce=sops-age-key)\n%s\n' "$SOPS_KEY" >> "$KF"
    chmod 600 "$KF"
  }
done
sops --decrypt gen.pollinations.ai/secrets/dev.vars.json >/dev/null && echo "decrypt OK"
```

If `-a "$USER"` doesn't match, try without `-a` (`security find-generic-password -s "sops-age-key" -w`) and let keychain pick the only one. Recipients can rotate — read the current expected public keys from `.sops.yaml` rather than hard-coding them here.

## 11.2 Description style

Format: `<Model Name> - <what it does or what makes it distinct>`. ≤ ~70 chars when possible.

- Say what the model **does** or what makes it **different** ("Fast & affordable image generation", "Long-context MoE for retrieval"). Capability over branding.
- **No provider/inference attribution** in the description — no "(OpenRouter)", "via DashScope", "OpenAI's", etc. `provider` and `brand` fields carry that.
- **No filler.** "X - Image Generation Model" tells the reader nothing. "FLUX.2 Klein 4B - Fast image generation and editing" > "FLUX.2 Klein 4B - Advanced Model".

## 11.3 Wrapper models (e.g. persona-prompted Claude)

For specialized wrappers, the underlying model's capabilities are NOT the same as the product's. Mark `inputModalities` to reflect the **product intent**, not what the underlying model technically supports. Add a one-line comment explaining the discrepancy.

