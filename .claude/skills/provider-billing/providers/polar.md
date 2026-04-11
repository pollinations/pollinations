# Polar.sh (subscriptions + MRR)

Validated: **2026-04-11** — all commands executed live against Polar organization `b3caa8b6-a64b-4c7c-94ad-03f70cc06841` (Myceli.AI OÜ). **Reconciliation gap**: Polar's `/metrics` reports $0 revenue since Feb 2026 while [Stripe](stripe.md) clearly processes €7k+/month. Documented in "Known unknowns" — do not trust a single-source number until resolved.

Pair with [stripe.md](stripe.md) for payment processor / fee detail, and with the cost-side playbooks ([aws.md](aws.md) / [azure.md](azure.md) / [gcp.md](gcp.md)) for runway math.

Related skill: [spending-analysis](../../spending-analysis/SKILL.md) already exists for deeper Polar analysis combined with Tinybird. Use that for ongoing revenue reporting; this file documents the bare-metal Polar API.

---

## Requirements

- **No Polar CLI exists.** Polar is REST-only via `api.polar.sh`. Use `curl` + `python3`.
- `sops` for decrypting the secrets vault.

## Secret handling — IMPORTANT

Load the Polar OAT (Organization Access Token) from SOPS into an env var at runtime:

```bash
SECRETS_JSON=$(sops -d enter.pollinations.ai/secrets/prod.vars.json 2>/dev/null)
export POLAR_TOKEN=$(echo "$SECRETS_JSON" | python3 -c "import sys, json; print(json.load(sys.stdin)['POLAR_ACCESS_TOKEN'])")
unset SECRETS_JSON
```

Never print the raw value. Sanity-check only the prefix: `echo "${POLAR_TOKEN:0:10}"` → `polar_oat_`.

If you accidentally surface the token, rotate it at: https://polar.sh/dashboard/myceli-ai/settings#organization-access-tokens. OATs don't expire by default but can be revoked and reissued.

---

## Known identifiers

```
Organization:         b3caa8b6-a64b-4c7c-94ad-03f70cc06841
  name:               Myceli.AI OÜ
  slug:               myceli-ai
  total_orders:       ~1.9 million (98% are $0 Spore subscription cycles)
  active_subscriptions: 20,117 (stable since 2026-01)
Secret in SOPS:       prod.vars.json → POLAR_ACCESS_TOKEN (polar_oat_)
Webhook secret:       prod.vars.json → POLAR_WEBHOOK_SECRET (polar_whs_)
Tinybird ingest:      prod.vars.json → TINYBIRD_POLAR_INGEST_TOKEN
                      → suggests Tinybird already has Polar pipes; check `enter.pollinations.ai/observability`
```

### Tier / product structure

Pollinations uses a **"pay-what-you-use" model**, not monthly subscriptions. As of 2026-04-11 the org has 19 products:

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

## Auth

Bearer token in Authorization header:

```bash
curl -sS "https://api.polar.sh/v1/<endpoint>" -H "Authorization: Bearer $POLAR_TOKEN"
```

---

## Endpoint: Organizations

```bash
curl -sS "https://api.polar.sh/v1/organizations/" -H "Authorization: Bearer $POLAR_TOKEN"
```

Returns `{items: [{id, name, slug, ...}]}`. Capture the org `id` — most other endpoints require it as `?organization_id=<uuid>`.

## Endpoint: Products / tiers

```bash
curl -sS "https://api.polar.sh/v1/products/?organization_id=$ORG_ID&limit=50" \
  -H "Authorization: Bearer $POLAR_TOKEN"
```

Each product has `id`, `name`, `is_recurring`, `prices: [{type, price_amount, price_currency}]`.

## Endpoint: Metrics — the aggregated revenue endpoint ⭐

**This is the endpoint you want for "what's our MRR / monthly revenue / subs".** It aggregates everything into periods so you don't have to paginate through millions of orders.

```bash
curl -sS "https://api.polar.sh/v1/metrics/?organization_id=$ORG_ID&start_date=2025-11-01&end_date=2026-04-30&interval=month" \
  -H "Authorization: Bearer $POLAR_TOKEN"
```

### Interval constraints

Verified via `/v1/metrics/limits`:

| Interval | min days | max days |
|---|---|---|
| hour | 0 | 7 |
| day | 0 | 366 |
| week | 14 | 371 |
| month | 60 | 1460 |
| year | 366 | 3650 |

Min date for any query: `2023-01-01`.

### Response fields per period

```
timestamp                               ISO 8601
active_subscriptions                    int
committed_subscriptions                 int
monthly_recurring_revenue               int (cents)    ← MRR
committed_monthly_recurring_revenue     int
average_revenue_per_user                int (cents)    ← ARPU
checkouts                               int
succeeded_checkouts                     int
churned_subscriptions                   int
churn_rate                              float
orders                                  int
revenue                                 int (cents)    ← period revenue
net_revenue                             int (cents)    ← after Polar platform fees
cumulative_revenue                      int (cents)    ← lifetime
net_cumulative_revenue                  int (cents)
costs / cumulative_costs                int (cents)
average_order_value                     int (cents)
one_time_products                       int
one_time_products_revenue               int
one_time_products_net_revenue           int
new_subscriptions                       int
new_subscriptions_revenue               int
renewed_subscriptions                   int
renewed_subscriptions_revenue           int
canceled_subscriptions_*                int   (by reason: customer_service, low_quality, missing_features, switched_service, too_complex, too_expensive, unused, other)
```

### Validated 2026-04-11 monthly trend (all values in cents USD)

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

**Cumulative gross lifetime: $5,065.00** (Nov 2025 → Apr 2026).

⚠️ **Revenue has been $0 since February 2026** per this endpoint, despite [Stripe](stripe.md) clearly processing ~€7k/month. See "Known unknowns" below.

## Endpoint: Orders — the raw ledger (pagination hell)

```bash
curl -sS "https://api.polar.sh/v1/orders/?organization_id=$ORG_ID&limit=100" \
  -H "Authorization: Bearer $POLAR_TOKEN"
```

**DO NOT rely on this for totals** — our org has **1.9 million orders** (98% are $0 Spore subscription cycles). Pagination through all of them is impractical. Use `/metrics/` for aggregates.

Each order has many fields:

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

### Filter params

**Filters that DID NOT appear to work** (Polar silently ignored them in 2026-04-11 testing — returned all 1.9M orders):

- `?billing_reason=purchase`
- `?product_price_type=one_time`
- `?created_at_gte=...&created_at_lt=...`

**Filters that likely work** (from Polar docs, untested):

- `?organization_id=<uuid>` — required, works
- `?product_id=<uuid>` — filter to one product (e.g. only pollen packs)
- `?customer_id=<uuid>` — single customer's orders
- `?subscription_id=<uuid>` — single subscription's orders
- `?status=paid|pending|canceled|refunded`
- `?sorting=-created_at` — sort by newest

### Recommended pattern for paid-only totals

Loop over pollen-pack product IDs server-side instead of paginating everything:

```bash
# Find all one-time (pollen-pack) product IDs with price > 0
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

## Endpoint: Subscriptions

```bash
curl -sS "https://api.polar.sh/v1/subscriptions/?organization_id=$ORG_ID&limit=100" \
  -H "Authorization: Bearer $POLAR_TOKEN"
```

Still ~20k active subs — smaller than the orders table but not trivial. For aggregates prefer `/metrics/`.

## Endpoint: Customers

```bash
curl -sS "https://api.polar.sh/v1/customers/?organization_id=$ORG_ID&limit=100" \
  -H "Authorization: Bearer $POLAR_TOKEN"
```

---

## Question → query cheat sheet

| Question | Endpoint |
|---|---|
| How much MRR? | `GET /v1/metrics/` → `monthly_recurring_revenue` |
| How many active subscribers? | `GET /v1/metrics/` → `active_subscriptions` |
| What's the churn rate? | `GET /v1/metrics/` → `churn_rate` |
| One-time pack sales by month | `GET /v1/metrics/` → `one_time_products_revenue` (⚠️ 0 for us — see reconciliation gap) |
| Sales by specific product | Loop `GET /v1/orders/?product_id=<uuid>` over pollen-pack product IDs |
| What products / tiers exist? | `GET /v1/products/?organization_id=<uuid>` |
| Customer list | `GET /v1/customers/?organization_id=<uuid>` |
| Subscription list | `GET /v1/subscriptions/?organization_id=<uuid>` |

---

## Gotchas

- **`organization_id` is required on almost every query.** Without it you get zero results (or sometimes all-orgs, depending on endpoint).
- **`/v1/orders/` paginates ALL orders**, including $0 subscription cycles. For us that's 1.9 M rows. Never paginate the full list; use `/v1/metrics/` for aggregates.
- **Values are in USD cents**, not EUR. [Stripe](stripe.md) account default is EUR. Convert when comparing.
- **Most `/orders/` filter params silently ignore unsupported values** — you'll get a 200 with the full unfiltered list. Always verify `total_count` in the pagination block didn't stay the same as an unfiltered query.
- **Tier products (Spore/Seed/Flower/Nectar/Router) are all $0/month.** All real revenue is one-time pollen packs.
- **Metric discrepancy**: `/metrics.revenue` reports $0 since Feb 2026 while Stripe processes ~€7k/month. Do not trust Polar as the sole revenue source until this is explained.
- **OATs don't expire by default** but can be revoked. If requests start 401ing, rotate via https://polar.sh/dashboard/myceli-ai/settings#organization-access-tokens.
- **`interval=month` requires ≥60 days** in the date window (`/metrics/limits`). Shorter spans need `interval=day` or `week`.

---

## Known unknowns

- **`/metrics.revenue = 0` since February 2026** while Stripe is clearly collecting ~€7k/month. THIS IS THE BIG ONE. Possible causes:
  - Polar's metrics aggregation is stale/broken on our tenant
  - Pollen packs are billed through a different Polar endpoint (`/checkouts/` vs `/orders/`)
  - Stripe is processing payments bypassing Polar entirely (direct Stripe Checkout flow)
  - Amount field naming changed — maybe we should sum `total_amount` or `subtotal_amount` instead of the `revenue` aggregate
- **Filter support**: `billing_reason`, `product_price_type`, `status`, `created_at_gte/lt` — which of these actually work on our Polar tenant version? Need to test each with a known good filter (e.g. a specific product_id that definitely has paid orders).
- **`/checkouts/` endpoint**: Polar also has a checkouts endpoint separate from orders. Worth exploring if the paid pollen packs are flowing through there rather than `/orders/`.
- **Stripe → Polar link**: see [stripe.md § Known unknowns](stripe.md#known-unknowns) — verifying `metadata.polar_order_id` on Stripe charges would confirm whether the two systems are actually connected.
- **Tinybird pipes**: `TINYBIRD_POLAR_INGEST_TOKEN` in SOPS implies there's already a Polar→Tinybird ingest pipeline. Check `enter.pollinations.ai/observability`; if an aggregation pipe exists it's likely the canonical revenue source and should be preferred over hitting `/metrics/` directly. The [spending-analysis](../../spending-analysis/SKILL.md) skill likely already uses this path.

---

## Session 1 validation log (2026-04-11)

| Command | Result |
|---|---|
| `GET /v1/organizations/` | ✅ 1 org `b3caa8b6-...` (Myceli.AI OÜ) |
| `GET /v1/products/?organization_id=...` | ✅ 19 products, only pollen packs have nonzero prices |
| `GET /v1/metrics/?interval=month` (12 months) | ✅ 12-month trend; revenue=0 since Feb 2026 (MYSTERY) |
| `GET /v1/orders/?limit=100` | ⚠️ 1.9M total orders, all sampled rows have `amount=0` — pagination not useful for paid revenue |
| `GET /v1/orders/?billing_reason=purchase` | ⚠️ filter silently ignored, returned 1.9M |
| `GET /v1/orders/?product_price_type=one_time` | ⚠️ filter silently ignored, returned 1.9M |
| `GET /v1/metrics/limits` | ✅ interval constraints table above |
