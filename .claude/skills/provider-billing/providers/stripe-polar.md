# Stripe + Polar (revenue side)

Validated: **2026-04-11** — all commands executed live against production account `acct_1SrY3q7rcjS3l7tr` / Polar org `b3caa8b6-a64b-4c7c-94ad-03f70cc06841`. Live numbers captured inline. **Reconciliation gap**: Stripe reports €7k+/month gross revenue while Polar's `/metrics` endpoint reports $0 revenue since Feb 2026. Documented in "Known unknowns" — do not trust a single-source number until this is resolved.

This file covers the **revenue side** of the provider-billing skill — pair with [aws.md](aws.md) / [azure.md](azure.md) / [gcp.md](gcp.md) on the cost side for runway math.

---

## Requirements

- `stripe` CLI installed (`brew install stripe/stripe-cli/stripe`). We're on `1.34.0` as of 2026-04-11.
- **No Polar CLI exists** — Polar is REST-only via `api.polar.sh`. Use `curl` + python.
- `sops` for decrypting the secrets vault.
- `python3` for response wrangling and pagination.

## Secret handling — IMPORTANT

**Never paste live API keys into prompts, conversation, or skill files.** Live Stripe keys and Polar OATs should ONLY be loaded from the SOPS vault at runtime into environment variables:

```bash
SECRETS_JSON=$(sops -d enter.pollinations.ai/secrets/prod.vars.json 2>/dev/null)
export STRIPE_API_KEY=$(echo "$SECRETS_JSON" | python3 -c "import sys, json; print(json.load(sys.stdin)['STRIPE_SECRET_KEY'])")
export POLAR_TOKEN=$(echo "$SECRETS_JSON" | python3 -c "import sys, json; print(json.load(sys.stdin)['POLAR_ACCESS_TOKEN'])")
unset SECRETS_JSON
# ... use $STRIPE_API_KEY and $POLAR_TOKEN ...
# They vanish when the shell session ends.
```

**Never** print the raw values. **Never** write them to a file. If you must inspect a key, only print the first 10 chars for a sanity check:

```bash
echo "${STRIPE_API_KEY:0:10}"   # sk_live_51
echo "${POLAR_TOKEN:0:10}"      # polar_oat_
```

The `stripe` CLI has its own config at `~/.config/stripe/config.toml` which also stores keys. If you run `stripe config --list` and output the block, the keys are in plain text in the response. **Do not copy that output into a public channel.**

---

## Known identifiers (Pollinations production)

```
Stripe live account:  acct_1SrY3q7rcjS3l7tr
  display_name:       Myceli.AI OÜ
  email:              elliot@myceli.ai
  country:            EE
  default_currency:   EUR
  charges_enabled:    true
  payouts_enabled:    true
Stripe test account:  acct_1SrYSy6O03AauPe8  (separate from live)

Polar organization:   b3caa8b6-a64b-4c7c-94ad-03f70cc06841
  name:               Myceli.AI OÜ
  slug:               myceli-ai
  total_orders:       ~1.9 million (98% are $0 Spore subscription cycles)
  active_subscriptions: 20,117 (stable since 2026-01)
```

### Tier / product structure (Polar)

Pollinations uses a **"pay-what-you-use" model**, not monthly subscriptions:

| Product | Type | Price | Notes |
|---|---|---|---|
| 🦠 Spore | recurring | $0 | Free tier, auto-assigned |
| 🌱 Seed | recurring | $0 | Tier upgrade |
| 🌸 Flower | recurring | $0 | Tier upgrade |
| 🍯 Nectar | recurring | $0 | Tier upgrade |
| 🌏 Router | recurring | $0 | Router tier |
| ⚠️ Router Pack - 500 pollen | one-time | $0 | Free router pack |
| 🐝 5 pollen + 5 FREE | one-time | $5 | Entry pack |
| 🐝 10 pollen (pack) | one-time | $10 | |
| 🐝 10 pollen + 10 FREE | one-time | $10 | |
| 🐝 20 pollen (pack) | one-time | $20 | |
| 🐝 20 pollen + 20 FREE | one-time | $20 | |
| 🐝 50 pollen (pack) | one-time | $50 | |
| 🐝 50 pollen + 50 FREE | one-time | $50 | |
| (+ "Boost beta" pack variants) | one-time | $5/$10/$20 | |

**All tier subscriptions are free.** Real money only flows through the **one-time pollen packs**.

---

## Stripe API

### Auth

Stripe uses HTTP basic auth with the secret key as username and empty password:

```bash
curl -sS https://api.stripe.com/v1/<endpoint> -u "$STRIPE_API_KEY:"
```

The trailing colon is mandatory — it tells curl "empty password."

### Account details

```bash
curl -sS https://api.stripe.com/v1/account -u "$STRIPE_API_KEY:"
```

Returns the account object: `id`, `email`, `country`, `default_currency`, `business_type`, `charges_enabled`, `payouts_enabled`, plus a `settings.dashboard.display_name` nested under `settings`.

### Current balance

```bash
curl -sS https://api.stripe.com/v1/balance -u "$STRIPE_API_KEY:"
```

Returns:
```json
{
  "object": "balance",
  "available": [{"amount": 304442, "currency": "eur"}],
  "pending":   [{"amount": 71319,  "currency": "eur"}],
  "connect_reserved": null,
  "livemode": true
}
```

Amounts are in **minor units** (cents), so divide by 100. Each currency is a separate array entry — an EU account commonly has `eur` + `usd` rows.

**Validated 2026-04-11**: available €3,044.42 + pending €713.19 = **€3,757.61** total in Stripe balance (not yet paid out to bank).

### Balance transactions — the full ledger

This is the workhorse endpoint for "how much did Stripe handle this month, what were the fees, what was net."

```bash
START=$(python3 -c "import datetime; print(int(datetime.datetime(2026,3,1,tzinfo=datetime.timezone.utc).timestamp()))")
END=$(python3   -c "import datetime; print(int(datetime.datetime(2026,4,1,tzinfo=datetime.timezone.utc).timestamp()))")

curl -sS "https://api.stripe.com/v1/balance_transactions?created%5Bgte%5D=$START&created%5Blt%5D=$END&limit=100" \
  -u "$STRIPE_API_KEY:"
```

**Critical URL-encoding gotcha**: the `created[gte]=...` filter uses square brackets. In a shell, `[` / `]` are glob metacharacters → you MUST URL-encode them (`%5B` / `%5D`) OR shell-quote the whole URL with `\[`. Otherwise zsh produces a cryptic "no matches found" error. Worked example (URL-encoded) above.

Each `data[]` item has:

```
id              txn_...
type            "charge" | "payment" | "refund" | "payout" | "stripe_fee" | "adjustment" | ...
amount          int (minor units, signed)
fee             int (minor units)
net             int (amount - fee, signed)
currency        "eur" | "usd" | ...
created         unix timestamp
exchange_rate   float (null if currency == account default)
fee_details[]   [{ amount, currency, description: "Stripe processing fees" | "Stripe currency conversion fee" | "PayPal fees" | ... }]
source          ch_... / py_... / po_... etc.
description     often null — see `source` for details
```

### Aggregating balance transactions (real March 2026 result)

Pagination: 100/page max, use `starting_after=<last-id>` for next page. For ~1000 tx/month the loop runs ~10 pages.

**Validated aggregation script** (captured output inline):

```python
# Load SECRETS_JSON → STRIPE_API_KEY first
import os, json, urllib.request, base64, datetime
from collections import defaultdict

key = os.environ['STRIPE_API_KEY']
auth = base64.b64encode(f"{key}:".encode()).decode()

start = int(datetime.datetime(2026, 3, 1, tzinfo=datetime.timezone.utc).timestamp())
end   = int(datetime.datetime(2026, 4, 1, tzinfo=datetime.timezone.utc).timestamp())

by_type = defaultdict(lambda: {'amount': 0, 'fee': 0, 'net': 0, 'n': 0})
by_fee_type = defaultdict(int)
starting_after = None
pages = 0

while True:
    params = f"created[gte]={start}&created[lt]={end}&limit=100"
    if starting_after:
        params += f"&starting_after={starting_after}"
    url = f"https://api.stripe.com/v1/balance_transactions?{params}"
    req = urllib.request.Request(url, headers={"Authorization": f"Basic {auth}"})
    with urllib.request.urlopen(req) as r:
        d = json.loads(r.read())
    for t in d.get('data', []):
        tp = t.get('type')
        by_type[tp]['amount'] += t.get('amount', 0)
        by_type[tp]['fee']    += t.get('fee', 0)
        by_type[tp]['net']    += t.get('net', 0)
        by_type[tp]['n']      += 1
        for fd in t.get('fee_details', []) or []:
            by_fee_type[fd.get('description', '?')] += fd.get('amount', 0)
    pages += 1
    if not d.get('has_more') or not d.get('data'):
        break
    starting_after = d['data'][-1]['id']
```

**Real March 2026 result** (11 pages, 1011 transactions):

| type | count | amount (€) | fee (€) | net (€) |
|---|---|---|---|---|
| charge | 599 | 4,309.85 | 367.22 | 3,942.63 |
| payment | 342 | 2,993.65 | 256.80 | 2,736.85 |
| stripe_fee | 67 | −43.13 | 0.00 | −43.13 |
| refund | 2 | −8.72 | 0.00 | −8.72 |
| payout | 1 | −4,227.21 | 0.00 | −4,227.21 |

**Interpretation**:
- **Revenue types** (what customers paid us): `charge` + `payment` = €7,303.50 gross, €6,679.48 net after €624 in fees
- **Refunds**: €8.72 (tiny)
- **`stripe_fee`**: €43.13 in additional misc fees (invoice fees, CC updater, etc.)
- **`payout`**: €4,227.21 moved from Stripe balance to our bank account — this is NOT revenue, it's our own money transferred. IGNORE when computing revenue.
- **March gross revenue**: **€7,303.50**
- **March net revenue** (after all fees/refunds/stripe_fee): **€7,303.50 − 624.02 − 43.13 − 8.72 = €6,627.63**

### Fee breakdown (March 2026, from `fee_details[]`)

| Fee type | €/month |
|---|---|
| Stripe processing fees | 422.01 |
| Stripe currency conversion fee | 147.51 |
| PayPal fees | 54.50 |
| **Total** | **624.02** |

**That's an 8.6% effective fee rate** on €7,303 gross. Much higher than Stripe's headline 2.9% + €0.30 because of:
- Currency conversion (account is EUR but many customers pay in USD/other → each charge eats a 2% FX fee)
- PayPal flows through Stripe and adds PayPal's own fee on top
- Small ticket sizes amplify the fixed €0.30 component

For runway math, use **net revenue**, not gross. Gross overstates by ~9%.

### Payouts — when does money hit the bank

```bash
curl -sS "https://api.stripe.com/v1/payouts?limit=10" -u "$STRIPE_API_KEY:"
```

Each payout has `arrival_date`, `amount`, `status`, `method` (standard/instant), `currency`, `automatic` (boolean).

### Charges / customers / disputes

```bash
# Recent charges
curl -sS "https://api.stripe.com/v1/charges?limit=10" -u "$STRIPE_API_KEY:"

# Customer list
curl -sS "https://api.stripe.com/v1/customers?limit=10" -u "$STRIPE_API_KEY:"

# Active disputes (important to watch)
curl -sS "https://api.stripe.com/v1/disputes?limit=10" -u "$STRIPE_API_KEY:"
```

### Using the Stripe CLI vs raw curl

The `stripe` CLI wraps the REST API with nicer auth (uses `~/.config/stripe/config.toml`) but defaults to TEST mode:

```bash
# Test mode (default) — uses sk_test_ from config
stripe balance retrieve

# Live mode — requires `stripe login` with a live key OR passing it explicitly
stripe balance retrieve --api-key "$STRIPE_API_KEY"
```

For automation, **prefer raw curl** with the env-loaded secret. The CLI is useful for interactive exploration but adds a layer you have to reason about.

---

## Polar API

### Auth

Bearer token (Polar Organization Access Token, starts with `polar_oat_`):

```bash
curl -sS "https://api.polar.sh/v1/<endpoint>" -H "Authorization: Bearer $POLAR_TOKEN"
```

### Organizations

```bash
curl -sS "https://api.polar.sh/v1/organizations/" -H "Authorization: Bearer $POLAR_TOKEN"
```

Returns `{items: [{id, name, slug, ...}]}`. Capture the org `id` — most other endpoints require it as `?organization_id=<uuid>`.

### Products / tiers

```bash
curl -sS "https://api.polar.sh/v1/products/?organization_id=$ORG_ID&limit=50" \
  -H "Authorization: Bearer $POLAR_TOKEN"
```

Each product has `id`, `name`, `is_recurring`, `prices: [{type, price_amount, price_currency}]`. As of 2026-04-11 Pollinations has 19 products — see the tier table earlier in this file.

### Metrics — the aggregated revenue endpoint ⭐

**This is the endpoint you want for "what's our MRR / monthly revenue / subs".** It aggregates everything into periods so you don't have to paginate through millions of orders.

```bash
curl -sS "https://api.polar.sh/v1/metrics/?organization_id=$ORG_ID&start_date=2025-11-01&end_date=2026-04-30&interval=month" \
  -H "Authorization: Bearer $POLAR_TOKEN"
```

**Interval constraints** (verified via `/v1/metrics/limits`):

| Interval | min days | max days |
|---|---|---|
| hour | 0 | 7 |
| day | 0 | 366 |
| week | 14 | 371 |
| month | 60 | 1460 |
| year | 366 | 3650 |

Min date for any query: `2023-01-01`.

**Response fields per period** (lots):

```
timestamp                       ISO 8601
active_subscriptions            int
committed_subscriptions         int
monthly_recurring_revenue       int (cents)    ← MRR
committed_monthly_recurring_revenue int
average_revenue_per_user        int (cents)    ← ARPU
checkouts                       int
succeeded_checkouts             int
churned_subscriptions           int
churn_rate                      float
orders                          int
revenue                         int (cents)    ← period revenue
net_revenue                     int (cents)    ← after Polar platform fees
cumulative_revenue              int (cents)    ← lifetime
net_cumulative_revenue          int (cents)
costs / cumulative_costs        int (cents)
average_order_value             int (cents)
one_time_products               int
one_time_products_revenue       int
one_time_products_net_revenue   int
new_subscriptions               int
new_subscriptions_revenue       int
renewed_subscriptions           int
renewed_subscriptions_revenue   int
canceled_subscriptions_*        int   (by reason: customer_service, low_quality, missing_features, switched_service, too_complex, too_expensive, unused, other)
```

### Validated 2026-04-11 monthly trend

```
month     orders    revenue_c  net_rev_c  cum_rev_c  active_subs
--------------------------------------------------------------
2025-11    8,213       46,000    39,956      46,000         646
2025-12   74,510      188,000   169,657     234,000       7,130
2026-01  438,218      272,500   249,414     506,500      20,117
2026-02  563,277            0         0     506,500      20,117
2026-03  623,630            0         0     506,500      20,117
2026-04  218,689            0         0     506,500      20,116
```

All values in cents USD. **Cumulative gross lifetime: $5,065.00** (Nov 2025 → Apr 2026).

### Orders — the raw ledger (pagination hell)

```bash
curl -sS "https://api.polar.sh/v1/orders/?organization_id=$ORG_ID&limit=100" \
  -H "Authorization: Bearer $POLAR_TOKEN"
```

**DO NOT rely on this for totals** — our org has **1.9 million orders** (98% are $0 Spore subscription cycles). Pagination through all of them is impractical. Use `/metrics/` for aggregates.

Each order has a LOT of fields:

```
id, created_at, modified_at, paid, status
amount, subtotal_amount, tax_amount, discount_amount, total_amount, net_amount, platform_fee_amount, refunded_amount
currency  (usually USD)
customer / customer_id / billing_name / billing_address
product / product_id / product_price / product_price_id
subscription / subscription_id
items[]
billing_reason           "subscription_create" | "subscription_cycle" | "purchase"
invoice_number / is_invoice_generated
metadata, custom_field_data
```

**Filter params I tried that DID NOT work** (Polar silently ignores unsupported params):

- `?billing_reason=purchase`  — doesn't filter
- `?product_price_type=one_time` — doesn't filter
- `?created_at_gte=...&created_at_lt=...` — **unclear if this actually works**; returned same total count on my validation

**Filter params that likely work** (from Polar docs, untested in our tenant):

- `?organization_id=<uuid>` — required, works
- `?product_id=<uuid>` — filter to one product (e.g. only pollen packs)
- `?customer_id=<uuid>` — single customer's orders
- `?subscription_id=<uuid>` — single subscription's orders
- `?status=paid|pending|canceled|refunded`
- `?sorting=-created_at` — sort by newest

To get paid pollen-pack orders specifically, loop over product IDs and filter server-side:

```bash
# Find all one-time (pollen-pack) product IDs
POLLEN_IDS=$(curl -sS "https://api.polar.sh/v1/products/?organization_id=$ORG_ID&limit=50" \
  -H "Authorization: Bearer $POLAR_TOKEN" \
  | python3 -c "
import sys, json
d = json.load(sys.stdin)
for p in d.get('items', []):
    if not p.get('is_recurring'):
        for pr in p.get('prices', []):
            if (pr.get('price_amount') or 0) > 0:
                print(p['id'])
                break
")
for pid in $POLLEN_IDS; do
  curl -sS "https://api.polar.sh/v1/orders/?organization_id=$ORG_ID&product_id=$pid&limit=100" \
    -H "Authorization: Bearer $POLAR_TOKEN"
done
```

### Subscriptions

```bash
curl -sS "https://api.polar.sh/v1/subscriptions/?organization_id=$ORG_ID&limit=100" \
  -H "Authorization: Bearer $POLAR_TOKEN"
```

Similar volume problem as orders (20k active) but at least it's 100x smaller than the orders table.

---

## Reconciliation: Stripe vs Polar

This is the big picture question for runway math. Current state:

| Source | March 2026 revenue |
|---|---|
| **Stripe** (gross charges + payments) | **€7,303.50** |
| **Stripe** (net after fees) | **€6,627.63** |
| **Polar** `/metrics.revenue` | **$0.00** (flat since February) |

**The numbers don't match.** Either:
1. Polar `metrics` is broken/stale on our tenant
2. Pollen-pack purchases in 2026 are going through Stripe directly and NOT being recorded as Polar orders
3. Polar is filtering out something in `/metrics` that's active in Stripe

This is the single most important open question for runway tracking. Do NOT trust either number in isolation — cross-check always.

**Attempt to reconcile**: check whether Stripe charges have a `metadata.polar_order_id` field (would prove the link):

```bash
curl -sS "https://api.stripe.com/v1/charges?limit=5" -u "$STRIPE_API_KEY:" \
  | python3 -c "
import sys, json
d = json.load(sys.stdin)
for c in d.get('data', []):
    print(c.get('id'), c.get('amount'), c.get('currency'), 'metadata:', c.get('metadata'))
"
```

If `metadata` is populated with Polar identifiers on every charge, the two systems ARE linked — and the Polar `metrics` discrepancy is a Polar-side bug. If metadata is empty, Stripe is processing payments that never touched Polar.

---

## Question → query cheat sheet

| Question | Endpoint |
|---|---|
| How much is in our Stripe balance right now? | `GET https://api.stripe.com/v1/balance` |
| What's our net Stripe revenue for a given month? | `balance_transactions` aggregated by type, exclude `payout` / `transfer`, sum `net` |
| What did Stripe charge us in fees last month? | same endpoint, sum `fee_details[].amount` grouped by `description` |
| When is the next Stripe payout? | `GET /v1/payouts?limit=1` → `arrival_date` |
| Any active disputes? | `GET /v1/disputes` |
| How much MRR on Polar? | `GET /v1/metrics/?...` → `monthly_recurring_revenue` |
| How many active subscribers? | `GET /v1/metrics/` → `active_subscriptions` |
| What's the churn rate? | `GET /v1/metrics/` → `churn_rate` |
| What are our one-time pack sales for March? | `GET /v1/metrics/` → `one_time_products_revenue` (NOT currently populating — see reconciliation gap) |
| Sales by product | Loop `/v1/orders/?product_id=<uuid>` over all one-time product IDs |
| Customer list | `GET /v1/customers/?organization_id=<uuid>` |

---

## Gotchas

- **`[` and `]` in URLs must be percent-encoded** (`%5B` / `%5D`) or zsh will glob them into `no matches found`. Bites you on Stripe's `created[gte]=...` filter every single time.
- **Stripe basic auth needs a trailing colon**: `-u "$STRIPE_API_KEY:"` (with the colon and NO password after).
- **Stripe `balance_transactions` is signed** — payouts and refunds show as negative `amount` AND negative `net`. Don't take `abs()` when aggregating or you'll double-count.
- **`stripe_fee` in Stripe balance transactions is NOT the processing fee per charge** — those are in `fee_details[]` on `charge` / `payment` rows. `stripe_fee` rows are misc monthly account fees (invoice fees, CC account updater charges, etc.).
- **Stripe CLI defaults to test mode** unless you pass `--api-key $STRIPE_API_KEY` explicitly or have logged in with a live key.
- **`stripe config --list` dumps the API keys in plaintext**. Don't paste its output publicly.
- **Polar `/v1/orders/` paginates through ALL orders including $0 subscription cycles** — for us that's 1.9 M rows. Never paginate the full list; use `/v1/metrics/` for aggregates.
- **Polar's `/v1/metrics/` has `revenue: 0` for Feb–Apr 2026** while Stripe is clearly collecting payments. Known discrepancy — see Reconciliation section.
- **Polar values are in USD cents**, not EUR cents. Stripe account default is EUR. Convert when comparing.
- **Polar tier products (Spore/Seed/Flower/Nectar/Router) are all $0/month.** All real revenue is one-time pollen packs.
- **`organization_id` is required on almost every Polar query.** Without it you get zero results (or sometimes all-orgs, depending on endpoint).
- **Polar OATs don't expire by default** but can be revoked. If requests start 401ing, rotate via https://polar.sh/dashboard/myceli-ai/settings#organization-access-tokens.

---

## Known unknowns

- **Polar `/metrics.revenue = 0` since February 2026** while Stripe is clearly collecting €7k+/month. THIS IS THE BIG ONE. Possible causes:
  - Polar's metrics aggregation is stale/broken on our tenant
  - Pollen packs are billed through a different Polar endpoint (checkouts vs orders)
  - Stripe is processing payments bypassing Polar entirely (direct checkout flow)
  - `amount` field naming changed — maybe we should sum `total_amount` or `subtotal_amount` instead
- **Polar test filters**: I couldn't get `billing_reason`, `product_price_type`, or `status` to actually filter results. Confirm which query params are supported by our Polar tenant version.
- **Stripe → Polar link**: unverified whether Stripe charges have `metadata.polar_order_id` populated. Run the reconciliation curl in the section above next session to confirm.
- **PayPal fee source**: PayPal fees appear in `fee_details[].description == "PayPal fees"` inside Stripe balance transactions. Does this mean we have PayPal payments flowing through Stripe Connect? Or is there a separate PayPal integration to verify?
- **Stripe test account**: `acct_1SrYSy6O03AauPe8` exists separately from the live account `acct_1SrY3q7rcjS3l7tr`. Confirm whether this is just the CLI's default test-mode account and whether it has any real data attached.
- **Tinybird Stripe/Polar ingest tokens** (`TINYBIRD_STRIPE_INGEST_TOKEN`, `TINYBIRD_POLAR_INGEST_TOKEN`) exist in SOPS — suggests someone already built Tinybird ingestion for these. Check `enter.pollinations.ai/observability` for existing pipes that already aggregate this. If present, USE THOSE instead of re-querying the APIs.

---

## Session 1 validation log (2026-04-11)

Commands run live, real responses captured above. Summary:

| Command | Result |
|---|---|
| `stripe --version` | ✅ 1.34.0 installed |
| `stripe config --list` | ✅ test-mode configured; live mode requires `stripe login` or env var |
| `sops -d enter.pollinations.ai/secrets/prod.vars.json` | ✅ decrypts, contains `STRIPE_SECRET_KEY` (sk_live_) and `POLAR_ACCESS_TOKEN` (polar_oat_) |
| `GET /v1/account` (Stripe) | ✅ `acct_1SrY3q7rcjS3l7tr`, EUR, charges+payouts enabled |
| `GET /v1/balance` (Stripe) | ✅ €3,044.42 available + €713.19 pending |
| `GET /v1/balance_transactions` March 2026 (Stripe) | ✅ 1011 tx across 11 pages → €7,303.50 gross / €6,627.63 net |
| `GET /v1/organizations` (Polar) | ✅ 1 org `b3caa8b6-...` (Myceli.AI OÜ) |
| `GET /v1/products?organization_id=...` (Polar) | ✅ 19 products, only pollen packs have nonzero prices |
| `GET /v1/metrics?interval=month` (Polar) | ✅ 12-month trend; revenue=0 since Feb 2026 (MYSTERY) |
| `GET /v1/orders?limit=100` (Polar) | ⚠️ 1.9M total orders, all with `amount=0` in sample — not useful for paid revenue |

Related skill: [spending-analysis](../../spending-analysis/SKILL.md) already exists for deeper Polar analysis. That skill uses Polar + Tinybird together and should be the go-to for deep revenue queries. This file documents the bare-metal API access patterns.
