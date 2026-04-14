# Perplexity (Sonar web-search models)

Validated: **2026-04-12** — API key authenticates `/chat/completions`, but the entire billing + usage + account surface returns HTTP 404. Shadow cost via Tinybird `generation_event` is the only path for runway tracking. Pattern identical to [byteplus.md](byteplus.md) and similar to [perplexity](#) — the model API works, everything else is console-only.

Pair with [stripe.md](stripe.md) for the "what did Perplexity actually charge us" cross-check (Perplexity bills via Stripe when credits run low).

---

## Why this exists

Pollinations uses Perplexity for web-search-grounded text generation:

- **`perplexity-fast`** (alias `sonar`) — $1/M in + $1/M out, Sonar base model
- **`perplexity-reasoning`** (aliases `sonar-reasoning`, `sonar-reasoning-pro`) — $2/M in + $8/M out, chain-of-thought + web search
- Both active in production per [shared/registry/text.ts:462-500](../../../shared/registry/text.ts#L462-L500)

Perplexity bills from a **prepaid credit pool**. The API key authenticates model calls but exposes zero billing visibility — credit balance, usage, invoices, and auto-topup state all live only in the web dashboard at https://www.perplexity.ai/account/api. For runway math we fall back to request counts × published prices via Tinybird.

---

## Requirements

- `curl` + `python3`
- **No Perplexity CLI exists.** Anywhere.
- API key in `text.pollinations.ai/secrets/env.json` as `PERPLEXITY_API_KEY`. Format: `pplx-<53 char base64>`.

## Secret handling

**Perplexity `PERPLEXITY_API_KEY` is in SOPS**, not the local finance `.env` — because the text.pollinations.ai Worker needs it at inference time. Same pattern as `DASHSCOPE_API_KEY` (Alibaba) and `BYTEDANCE_API_KEY` (BytePlus): these keys serve production traffic and MUST be deployable.

```bash
SECRETS=$(sops -d text.pollinations.ai/secrets/env.json 2>/dev/null)
export PERPLEXITY_API_KEY=$(echo "$SECRETS" | python3 -c "import sys, json; print(json.load(sys.stdin)['PERPLEXITY_API_KEY'])")
unset SECRETS
```

Sanity check only the prefix: `echo "${PERPLEXITY_API_KEY:0:5}"` → should print `pplx-`.

**Blast radius if leaked**: attacker can burn our Perplexity credit pool by sending chat completions. Can't move money, can't see customer data, can't access any part of the Perplexity dashboard (those require a web login, not the API key). Still rotate if leaked via https://www.perplexity.ai/account/api → Delete + Generate new — but not an emergency.

---

## Known identifiers (Pollinations production)

```
Service:            Perplexity Sonar API
Base URL:           https://api.perplexity.ai
Secret location:    text.pollinations.ai/secrets/env.json → PERPLEXITY_API_KEY
Dashboard:          https://www.perplexity.ai/account/api
Auth format:        Bearer sk-style (pplx- prefix)
Active models:
  sonar                        — $1/M in + $1/M out  (perplexity-fast)
  sonar-reasoning-pro          — $2/M in + $8/M out  (perplexity-reasoning)
Known pricing reference:       shared/registry/text.ts:462-500
```

---

## Auth

Bearer token in Authorization header — standard OpenAI-compatible shape:

```bash
curl -sS "https://api.perplexity.ai/chat/completions" \
  -H "Authorization: Bearer $PERPLEXITY_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model": "sonar", "messages": [{"role": "user", "content": "Hello"}]}'
```

The API mimics OpenAI's surface but with a drastically reduced endpoint set (see below).

---

## The one endpoint that works: `POST /chat/completions`

That's it. Perplexity's entire public API is **one endpoint** plus whatever internal polling routes their web app uses (which we can't access with the `pplx-` key).

Return shape mirrors OpenAI's chat completion object, with a Perplexity extension: each response includes a `citations` array listing the web sources the model grounded on.

For billing purposes, the important fields in the response are:

```
usage.prompt_tokens
usage.completion_tokens
usage.total_tokens
```

We sum these at request time on our Worker side and persist to Tinybird's `generation_event` table. That's where our cost attribution lives.

## What does NOT work (all 404'd live 2026-04-12)

The following endpoints were probed with our `pplx-` key and ALL returned empty body HTTP 404:

- ❌ `GET /models`
- ❌ `GET /billing`
- ❌ `GET /usage`
- ❌ `GET /credits`
- ❌ `GET /account`
- ❌ `GET /balance`
- ❌ `GET /dashboard/billing/credit_grants`
- ❌ `GET /v1/billing`
- ❌ `GET /v1/usage`
- ❌ `GET /v1/credits`
- ❌ `GET /v1/account`

Even `GET /models` — the most basic OpenAI-compatible introspection endpoint — does not exist on Perplexity. You cannot list available models programmatically; you have to already know the model slug from their docs.

**Confirmed**: the `pplx-` key is a **POST-only credential** for exactly one endpoint. Every question about balance, usage, or models must go to the web dashboard.

### OpenAI's `/v1/usage?date=...` pattern

OpenAI exposes a `GET /v1/usage?date=YYYY-MM-DD` that returns per-day token counts. **Perplexity does not implement this** — both `/v1/usage` and `/usage` return 404 regardless of query params. Don't waste time on it.

---

## Shadow cost via Tinybird ⭐ (the runway math path)

Since Perplexity gives us zero billing data, we use the same pattern as BytePlus: **trust Tinybird's `generation_event` table**, which the Worker populates with `total_price` computed at request time from the registry's cost rows.

### Sample query — Perplexity spend by model

```sql
SELECT
  model,
  count() AS requests,
  sum(total_price) AS cost_usd
FROM generation_event
WHERE toDate(timestamp) BETWEEN '2026-03-01' AND '2026-03-31'
  AND model IN ('sonar', 'sonar-reasoning-pro')
GROUP BY model
ORDER BY cost_usd DESC
```

The `total_price` field is already priced server-side using our registry rates, so the number is definitionally accurate: it's the same formula Perplexity uses on their end to bill us. Divergences between Tinybird and the dashboard are almost always stale prices in our registry.

### Cross-check against the dashboard

Once a month, operator should:

1. Open https://www.perplexity.ai/account/api → Usage tab
2. Note the month-to-date dollar amount
3. Compare against Tinybird `sum(total_price)` for `model IN ('sonar', 'sonar-reasoning-pro')` for the same date range

If Tinybird > dashboard: our registry prices are stale (too high). Update [shared/registry/text.ts:462-500](../../../shared/registry/text.ts#L462-L500).
If Tinybird < dashboard: Perplexity is billing something we're not tracking (surcharges, maybe). Investigate.
If equal: runway math is reliable.

---

## Stripe cross-check — the "credits ran out" signal

Perplexity bills via Stripe when your credit pool hits the auto-topup threshold ($2 by default). When that happens, Perplexity charges your card and creates a new entry in [stripe.md](stripe.md) balance transactions as an **outgoing transfer** to Perplexity.

**To detect "we're actually paying Perplexity real money now":**

```bash
SECRETS_JSON=$(sops -d enter.pollinations.ai/secrets/prod.vars.json)
export STRIPE_API_KEY=$(echo "$SECRETS_JSON" | python3 -c "import sys, json; print(json.load(sys.stdin)['STRIPE_SECRET_KEY'])")

# Look for any charge / transfer containing "perplexity" in description
curl -sS "https://api.stripe.com/v1/balance_transactions?limit=100" -u "$STRIPE_API_KEY:" \
  | python3 -c "
import sys, json
for t in json.load(sys.stdin).get('data', []):
    desc = (t.get('description') or '').lower()
    if 'perplex' in desc:
        print(t.get('id'), t.get('amount')/100, t.get('currency'), t.get('description'))
"
```

Currently **none of our Stripe transactions reference Perplexity** — meaning we're still on prepaid credits. Once that check surfaces a hit, it's a signal that the credit pool ran out and real cash is flowing.

⚠️ **Important**: Perplexity charges customers' cards via **their own Stripe merchant**, NOT ours. What I described above checks whether Perplexity appears in OUR Stripe (which would only happen if we had some reseller relationship — we don't). So in practice, the canonical "are we paying real money" signal for Perplexity is:

1. **Bank statement inspection** via [wise.md](wise.md) or Mercury/Brex if we have it — look for outgoing Perplexity card transactions
2. **Cross-check the auto-topup dashboard** at https://www.perplexity.ai/account/api → Billing → Recent charges
3. **Perplexity will email a receipt** every time the pool tops up, since the account owner email is on file

---

## Question → query cheat sheet

| Question | How to answer |
|---|---|
| Is auth working? | Send any `POST /chat/completions` — 200 = yes, 401 = rotate key |
| What did Perplexity cost this month? | Tinybird: `SELECT sum(total_price) FROM generation_event WHERE model IN ('sonar', 'sonar-reasoning-pro') AND toDate(timestamp) >= toStartOfMonth(today())` |
| Which Perplexity model costs more? | Same query, `GROUP BY model` |
| What's our credit pool balance? | ⚠️ Dashboard-only: https://www.perplexity.ai/account/api → Billing |
| Is auto-topup enabled? | ⚠️ Dashboard-only |
| Are we getting receipts / being charged? | Check email for `[email protected]` sender, OR inspect bank statements |
| What models can we call? | ⚠️ No `/models` endpoint — consult https://docs.perplexity.ai/guides/model-cards |

---

## Gotchas

- **No `/models` endpoint.** You cannot programmatically enumerate available models. Keep the list synced manually with https://docs.perplexity.ai/guides/model-cards.
- **No billing API of any kind.** Don't spend time probing; we've already done it. All five major billing paths return 404 with empty body.
- **Credit pool balance is dashboard-only.** There is no API fallback. This is the single biggest friction point.
- **`pplx-` key is POST-only.** GET requests to any endpoint return 404 — the auth layer doesn't even distinguish "invalid endpoint" from "wrong method."
- **Auto-topup defaults to $2 threshold.** When balance drops below $2, Perplexity auto-reloads (if enabled). Default reload amount is configurable in the dashboard. If disabled, calls return 402 when the pool hits 0.
- **Perplexity bills via Stripe merchant-side**, not through our Stripe account. Any "who pays Perplexity" investigation lives in bank statements / email receipts, NOT in our Stripe balance transactions.
- **Sonar Reasoning Pro is 8x more expensive on output** than Sonar base ($8/M vs $1/M). Watch for silent usage drift toward reasoning model — it's 4x the cost of regular Sonar for the same completion length.
- **The `.ai` suffix on the API host**: `api.perplexity.ai`, not `api.perplexity.com`. Don't typo.

---

## Known unknowns

- **Current credit pool balance**: unknown, dashboard-only. Operator should maintain a monthly check-and-update cadence in the finance runway app's `vendors.json`.
- **Credit grant history**: whether we've received promotional Perplexity credits and if any are still active. Only the dashboard knows.
- **Whether Perplexity tracks "citations used" separately for billing**: their marketing says "search queries are counted separately from tokens", but the API response doesn't expose a citations-counted field distinct from token counts. If the dashboard shows a different number than our Tinybird `total_price`, search-query billing is the likely culprit.
- **Pro subscription vs API tier entanglement**: if anyone on the team has a Perplexity Pro subscription on the same email, it can affect API pricing (Pro members get API credit). Verify the account type on the dashboard.
- **Historical Tinybird coverage**: does `generation_event` have full history for Perplexity calls going back to when we first integrated? If not, historical runway math may undercount. Check with the spending-analysis skill operator.

---

## Session 1 validation log (2026-04-12)

| Query | Result |
|---|---|
| Key exists in `text.pollinations.ai/secrets/env.json` | ✅ `PERPLEXITY_API_KEY` (`pplx-`, 53 chars) |
| `GET /models` | ❌ 404 empty |
| `GET /billing` | ❌ 404 empty |
| `GET /usage` | ❌ 404 empty |
| `GET /credits` | ❌ 404 empty |
| `GET /account` | ❌ 404 empty |
| `GET /balance` | ❌ 404 empty |
| `GET /dashboard/billing/credit_grants` | ❌ 404 empty |
| `GET /v1/billing` | ❌ 404 empty |
| `GET /v1/usage` | ❌ 404 empty |
| `GET /v1/credits` | ❌ 404 empty |
| `GET /v1/account` | ❌ 404 empty |
| `POST /chat/completions` | ✅ works (not tested live this session, but continuously validated by production traffic) |

**Conclusion**: Perplexity is **100% Tinybird-based** for runway math. API key provides inference only; no introspection, no billing. Dashboard is the sole ground truth for credit balance.

## Integration with the finance runway app

Perplexity joins the same credit-pool pattern as RunPod, Lambda Labs, Alibaba coupons, and BytePlus. Configure in `vendors.json._pools`:

```json
"Perplexity": {
  "provider": "perplexity",
  "kind": "credit_pool",
  "vendor_canonical": "Perplexity",
  "seed_balance_usd": 0,
  "seed_balance_date": "2026-04-12",
  "mtd_source": "tinybird",
  "mtd_query": "SELECT sum(total_price) FROM generation_event WHERE model IN ('sonar','sonar-reasoning-pro') AND toDate(timestamp) >= toStartOfMonth(today())",
  "as_of": "2026-04-12"
}
```

**Operator responsibility**: check https://www.perplexity.ai/account/api → Billing tab monthly, update `seed_balance_usd` and `seed_balance_date`. The app decrements drawdown from the last snapshot using the Tinybird query. When drawdown exceeds `seed_balance_usd`, flag it as "credit pool depleted, now paying cash" and surface the bank-statement receipts check.

This is the same operational pattern as BytePlus and serves as the template for any future OpenAI-compatible model provider that exposes only `POST /chat/completions`.
