# BytePlus Model Ark (Seedance + Seedream)

Validated: **2026-04-12** — API key authenticates, `/api/v3/models` works, but **zero billing endpoints exist** on the key's surface. Shadow cost is the only path for runway tracking.

This is the same "credit pool + no billing API" pattern as Lambda Labs, with an added twist: BytePlus sells through the Model Ark Asia-Pacific (`ap-southeast`) endpoint only, and their public billing is console-only at https://console.byteplus.com.

Pair with [alibaba.md](alibaba.md) (sibling region-locked model provider) and the GPU shadow cost playbooks ([runpod.md](runpod.md), [lambda-labs.md](lambda-labs.md)) for the "shadow cost via usage × price book" pattern.

---

## Why this exists

Pollinations uses BytePlus Model Ark for two workloads:

- **Seedance Lite / Seedance Pro-Fast** — video generation (`provider: "bytedance"` in [shared/registry/image.ts](../../../shared/registry/image.ts))
- **Seedream 4.0 / 4.5 Pro / 5.0 Lite** — image generation (Seedream 5 is the current active model; 4.0 and 4.5 are hidden legacy)

Like Lambda Labs, we bill against a **prepaid credit pool** on BytePlus. Invoices at month-end show whatever cash was actually charged (if any). The credit pool balance lives in the Console → Cost Center and is **NOT** accessible via the API key in our vault. For runway math, we reconstruct spend via request counts × published model prices.

---

## Requirements

- `curl` + `python3`
- **No `byteplus` CLI, no `vectl` CLI.** Python SDK (`pip install volcengine`) exists but targets the mainland Volcengine (Chinese) endpoints — NOT the international `ap-southeast` surface we use. Useless for us.
- API key in `image.pollinations.ai/secrets/env.json` as `BYTEDANCE_API_KEY`

## Secret handling

**BytePlus `BYTEDANCE_API_KEY` already lives in SOPS** (not local `.env`), because the image.pollinations.ai Cloudflare Worker needs it to call Seedance/Seedream at request time. This is different from Wise/RunPod/Lambda/Alibaba where the keys are local-only finance tools.

```bash
SECRETS=$(sops -d image.pollinations.ai/secrets/env.json 2>/dev/null)
export BYTEDANCE_API_KEY=$(echo "$SECRETS" | python3 -c "import sys, json; print(json.load(sys.stdin)['BYTEDANCE_API_KEY'])")
unset SECRETS
```

Sanity check only the prefix: `echo "${BYTEDANCE_API_KEY:0:10}"` — format is a UUID-like string.

**Blast radius if leaked**: attacker can call Seedance/Seedream on our credit pool — burning credits that cost real money. There's no "read only" scope; the single key covers everything. Rotate immediately if leaked via https://console.byteplus.com → API keys.

---

## Known identifiers (Pollinations production)

```
Service:            BytePlus Model Ark (International)
Region:             ap-southeast (Singapore)
Base URL:           https://ark.ap-southeast.bytepluses.com/api/v3
Secret location:    image.pollinations.ai/secrets/env.json → BYTEDANCE_API_KEY
Console:            https://console.byteplus.com
Auth format:        Bearer UUID token (not sk_* or prefixed)
Models in use:
  Image:  seedream5 (Seedream 5.0 Lite — active)
          seedream (Seedream 4.0 — hidden legacy)
          seedream-pro (Seedream 4.5 Pro — hidden legacy)
  Video:  seedance (Seedance Lite)
          seedance-pro (Seedance Pro-Fast)
Known pricing (from shared/registry/image.ts):
  seedream5       $0.035 per completion image token
  seedream        $0.030 per completion image token (legacy)
  seedream-pro    $0.040 per completion image token (legacy)
  seedance        $1.80/M completion video tokens
  seedance-pro    $1.00/M completion video tokens
```

---

## Auth

Bearer token in Authorization header:

```bash
curl -sS "https://ark.ap-southeast.bytepluses.com/api/v3/<endpoint>" \
  -H "Authorization: Bearer $BYTEDANCE_API_KEY"
```

---

## Endpoint: Models catalog ⭐ — the ONLY read endpoint that works

```bash
curl -sS "https://ark.ap-southeast.bytepluses.com/api/v3/models" \
  -H "Authorization: Bearer $BYTEDANCE_API_KEY"
```

**Validated 2026-04-12**: returns ~18 KB of model metadata. Each entry includes `id`, `domain` (LLM / video / image), `modalities`, `features` (batch, cache, structured outputs), and `created` timestamp. Example models available on our key:

```
deepseek-r1-250120              LLM
seedream-5-lite                 image
seedance-1-0-lite               video
seedance-1-0-pro                video
... (18+ total including chat LLMs we don't use)
```

Use this to: (a) confirm auth works, (b) discover new models we could adopt, (c) check whether a specific model is still provisioned.

## Endpoint: Chat / image / video generation (the only writes that matter)

```
POST /api/v3/chat/completions         # LLM calls (OpenAI-compat)
POST /api/v3/images/generations       # Seedream image (used by seedreamModel.ts)
POST /api/v3/contents/generations/tasks  # Seedance video — async task, poll for result
GET  /api/v3/contents/generations/tasks/{taskId}  # Seedance video polling
```

These are documented in detail inside `image.pollinations.ai/src/models/seedreamModel.ts` and `seedanceVideoModel.ts`. We don't re-document them here — this file is about **billing**, not model calling.

## What does NOT work

All of these returned **HTTP 404** or `Could not resolve host` on 2026-04-12:

### On `ark.ap-southeast.bytepluses.com` (the model endpoint)

- ❌ `/api/v3/usage`
- ❌ `/api/v3/billing`
- ❌ `/api/v3/account`
- ❌ `/api/v3/credits`
- ❌ `/api/v3/balance`
- ❌ `/api/v1/account`
- ❌ `/api/v3/bot/list`

### Host-level (DNS doesn't resolve)

- ❌ `open.ap-southeast.bytepluses.com` — doesn't exist
- ❌ `billing.ap-southeast.bytepluses.com` — doesn't exist

**Confirmed**: BytePlus Model Ark's international endpoint exposes ONLY the generation surface on this key. Any billing/account/usage data is console-only at https://console.byteplus.com → Cost Center.

### The `volcengine` Python SDK / mainland endpoint

A Python SDK exists (`pip install volcengine`) that targets the mainland Chinese Volcengine API and has a signed AK/SK auth mechanism similar to Alibaba's RAM. **It is NOT compatible with our international `ap-southeast` tenant** — different host, different auth, different account system entirely. Don't try to use it.

---

## Shadow-cost strategy (the only path to a real runway number)

Same pattern as [alibaba.md](alibaba.md) and [perplexity.md](perplexity.md): **compute cost from usage records stored in Tinybird × the price book**.

Every BytePlus generation call flows through `image.pollinations.ai` and emits a usage event to Tinybird's `generation_event` table with:
- `model` (e.g., `seedream5`, `seedance`, `seedance-pro`)
- `total_price` (pre-computed by the worker at request time)
- `user_id`, `timestamp`
- Cost breakdown (`promptTextTokens`, `completionImageTokens`, `completionVideoTokens`, etc.)

**This means the authoritative cost data for BytePlus is already in Tinybird — we don't need to query BytePlus at all.** See [spending-analysis](../../spending-analysis/SKILL.md) skill for how to query `generation_event`.

### Sample Tinybird query (BytePlus shadow cost for March 2026)

```sql
-- Via Tinybird pipe or direct SQL
SELECT
  model,
  count() AS requests,
  sum(total_price) AS cost_usd
FROM generation_event
WHERE toDate(timestamp) BETWEEN '2026-03-01' AND '2026-03-31'
  AND model IN ('seedream5', 'seedream', 'seedream-pro', 'seedance', 'seedance-pro')
GROUP BY model
ORDER BY cost_usd DESC
```

The `total_price` field is already computed server-side using the registry's cost rows, so this number is authoritative (same rates BytePlus charges us).

### Cross-check against the Console

Once a month, operator should open https://console.byteplus.com → Cost Center and compare the month-to-date spend figure there against what Tinybird says. If they diverge significantly:

1. **Tinybird higher than Console**: some of our pricing registry may be stale (we're modeling more cost than BytePlus is actually charging). Update `shared/registry/image.ts`.
2. **Console higher than Tinybird**: BytePlus is charging for something we're not tracking (maybe disk / storage / an API surcharge we don't know about). Investigate.
3. **Both match**: runway math is reliable.

### Stripe cross-check

BytePlus bills via wire or credit card through the Console's billing integration. If we ever pay real money (rather than burning credits), those charges appear as outgoing transfers on Stripe or wire on Wise. Filter [stripe.md](stripe.md) balance_transactions for merchant name `BytePlus` / `ByteDance` / `Volcengine` once we're off credits — right now it's all credit-funded so nothing shows up.

---

## Question → query cheat sheet

| Question | Query |
|---|---|
| What models are available on the key? | `GET /api/v3/models` |
| Is auth still working? | Same query — 200 means yes, 401 means rotate the key |
| What did BytePlus cost this month? | Tinybird `generation_event` filtered to `seedance*` / `seedream*` models, sum `total_price` |
| Which BytePlus model cost the most? | Same query, `GROUP BY model` |
| What's our credit pool balance? | ⚠️ Console-only at https://console.byteplus.com → Cost Center. No API. |
| Any unpaid invoices? | ⚠️ Console-only. |
| What's the historical request count? | Tinybird — `count()` on the same filter |

---

## Gotchas

- **No billing API exists at all**. Don't waste time probing endpoints — we already did, and the only thing `ark.ap-southeast.bytepluses.com` serves is `/api/v3/models` and the generation routes.
- **Region is locked to `ap-southeast`**. There's no `us-east`, `eu-west`, or anywhere else. If you see references to `ark.cn-beijing.volces.com` in any docs, that's the mainland Chinese tenant — different account, different billing, doesn't apply to us.
- **`open.ap-southeast.bytepluses.com` and `billing.ap-southeast.bytepluses.com` do not exist.** The `open-api`/`openapi` / `billing` subdomain conventions used by Alibaba and AWS don't apply here.
- **`volcengine` Python SDK is NOT for our account.** It targets the mainland Chinese tenant with a different AK/SK auth flow. Pip-installing it won't give you access to our international credits.
- **API key is a UUID**, not a prefixed string. Harder to secret-scan for; always store in named secrets files with clear labels.
- **Seedance is async**: video generation submits a task, polls for result. If you're measuring "cost", don't double-count the poll calls — only the task-completion event consumes credits.
- **Legacy Seedream variants (4.0, 4.5 Pro) are hidden** in the registry but still callable. Check both the active `seedream5` model and legacy aliases when querying historical data.
- **The key is live-mode only.** No sandbox / test mode exists. Every call consumes real credits. Don't test against production credit pool without intent.
- **The `BYTEDANCE_API_KEY` name is legacy** — the service is now called BytePlus Model Ark, but we named the env var before the rebrand. Don't rename it or the Worker breaks.

---

## Known unknowns

- **Credit pool balance**: unknown, console-only. Operator should eyeball https://console.byteplus.com → Cost Center once a month and maintain a note in runway tracking. No API path.
- **Credit expiration dates**: same — check the Console or the original grant agreement.
- **Per-model minimum cost / surcharges**: our registry pricing may omit fixed fees (e.g., per-task overhead on Seedance async jobs). If Tinybird numbers consistently undercount vs Console, investigate this first.
- **Multi-account structure**: we assume one BytePlus account. Unverified whether Pollinations has additional sub-accounts or sibling accounts on BytePlus. Check Console → Account settings if suspicious charges appear.
- **Volcengine signed AK/SK access**: if BytePlus ever exposes their mainland Volcengine-style billing API to international tenants (unlikely but possible), we'd need a separate RAM-user-style AccessKey pair. Watch https://docs.byteplus.com/ for updates. Until then, console-only.
- **Whether our credit pool has ever run out**: unknown. If it has, Stripe would show BytePlus charges. Cross-check [stripe.md](stripe.md) once with a search for merchant names containing `Byte` / `Volc`.

---

## Session 1 validation log (2026-04-12)

| Query | Result |
|---|---|
| Key exists in `image.pollinations.ai/secrets/env.json` | ✅ `BYTEDANCE_API_KEY` (UUID, 36 chars) |
| `GET /api/v3/models` | ✅ 200, ~18 KB catalog |
| `GET /api/v3/usage` | ❌ 404 |
| `GET /api/v3/billing` | ❌ 404 |
| `GET /api/v3/account` | ❌ 404 |
| `GET /api/v3/credits` | ❌ 404 |
| `GET /api/v3/balance` | ❌ 404 |
| `open.ap-southeast.bytepluses.com` | ❌ DNS not resolved |
| `billing.ap-southeast.bytepluses.com` | ❌ DNS not resolved |
| `volcengine` Python SDK for `ap-southeast` | ❌ SDK targets mainland only |
| Tinybird `generation_event` with `seedance*/seedream*` filter | ✅ (untested this session; confirmed available per spending-analysis skill) |

**Conclusion**: BytePlus is **100% Tinybird-based** for runway math. The API key only enables model calls. All cost attribution happens via the request ledger we already maintain. Console is the only ground truth for credit balance — no automation possible.

## Integration with the finance runway app

Similar to RunPod/Lambda, BytePlus should be configured in `vendors.json._pools` as a credit pool with a manually-entered `seed_balance_usd` that the operator updates whenever they check the Console. The wrapper in `apps/operation/finance/lib/providers/` should compute MTD via Tinybird (not the BytePlus API) and decrement the pool.

```json
"BytePlus": {
  "provider": "byteplus",
  "kind": "credit_pool",
  "vendor_canonical": "BytePlus",
  "seed_balance_usd": 0,
  "seed_balance_date": "2026-04-12",
  "mtd_source": "tinybird",
  "mtd_query": "SELECT sum(total_price) FROM generation_event WHERE model IN ('seedance','seedance-pro','seedream','seedream-pro','seedream5') AND toDate(timestamp) >= toStartOfMonth(today())",
  "as_of": "2026-04-12"
}
```

**Operator responsibility**: check https://console.byteplus.com → Cost Center once a month and update `seed_balance_usd` + `seed_balance_date`. The app tracks drawdown from that manual snapshot.
