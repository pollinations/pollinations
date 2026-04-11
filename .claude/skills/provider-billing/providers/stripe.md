# Stripe (revenue + fees)

Validated: **2026-04-11** — all commands executed live against production account `acct_1SrY3q7rcjS3l7tr` (Myceli.AI OÜ). Real March 2026 numbers captured inline.

Pair with [polar.md](polar.md) for the subscription/MRR side, and with [aws.md](aws.md) / [azure.md](azure.md) / [gcp.md](gcp.md) on the cost side for runway math.

---

## Requirements

- `stripe` CLI installed (`brew install stripe/stripe-cli/stripe`). We're on `1.34.0` as of 2026-04-11.
- `sops` for decrypting the secrets vault.
- `python3` for pagination and response wrangling.
- `curl` — for automation prefer raw curl over the CLI. The CLI is useful for interactive exploration only and defaults to test mode.

## Secret handling — IMPORTANT

**Never paste live API keys into prompts, conversation, or skill files.** Load the live key from SOPS into an env var at runtime:

```bash
SECRETS_JSON=$(sops -d enter.pollinations.ai/secrets/prod.vars.json 2>/dev/null)
export STRIPE_API_KEY=$(echo "$SECRETS_JSON" | python3 -c "import sys, json; print(json.load(sys.stdin)['STRIPE_SECRET_KEY'])")
unset SECRETS_JSON
# ... use $STRIPE_API_KEY ...
# It vanishes when the shell session ends.
```

Never print the raw value. If you must sanity-check, only print the prefix: `echo "${STRIPE_API_KEY:0:10}"` → `sk_live_51`.

**`stripe config --list` dumps configured keys (including the test-mode secret key) in plaintext.** Do not paste its output publicly. If you accidentally surface a key, rotate it: https://dashboard.stripe.com/apikeys (live) or https://dashboard.stripe.com/test/apikeys (test).

---

## Known identifiers (Pollinations production)

```
Live account:       acct_1SrY3q7rcjS3l7tr
  display_name:     Myceli.AI OÜ
  email:            elliot@myceli.ai
  country:          EE
  default_currency: EUR
  business_type:    company
  charges_enabled:  true
  payouts_enabled:  true
Test account:       acct_1SrYSy6O03AauPe8   (separate, CLI default)
Secret in SOPS:     prod.vars.json → STRIPE_SECRET_KEY (sk_live_)
Webhook secret:     prod.vars.json → STRIPE_WEBHOOK_SECRET (whsec_)
Tinybird ingest:    prod.vars.json → TINYBIRD_STRIPE_INGEST_TOKEN
                    → suggests Tinybird already has Stripe pipes; check `enter.pollinations.ai/observability`
```

Live and test accounts are two completely separate Stripe accounts under the same business.

---

## Auth

Stripe uses HTTP basic auth with the secret key as username and empty password. **The trailing colon after the key is mandatory** — it tells curl "empty password":

```bash
curl -sS https://api.stripe.com/v1/<endpoint> -u "$STRIPE_API_KEY:"
```

Bearer-header auth (`-H "Authorization: Bearer $KEY"`) also works but the `-u "$KEY:"` form is the documented pattern.

---

## Endpoint: Account

```bash
curl -sS https://api.stripe.com/v1/account -u "$STRIPE_API_KEY:"
```

Returns `id`, `email`, `country`, `default_currency`, `business_type`, `charges_enabled`, `payouts_enabled`, and a nested `settings.dashboard.display_name`.

## Endpoint: Balance

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

Amounts are in **minor units** (cents). Divide by 100. Each currency is a separate array entry — an EU account commonly has both `eur` and `usd` rows after FX conversion.

**Validated 2026-04-11**: available €3,044.42 + pending €713.19 = **€3,757.61** total in Stripe balance (not yet paid out to bank).

## Endpoint: Balance transactions — the full ledger ⭐

This is the workhorse endpoint for "how much did Stripe handle this month, what were the fees, what was net."

```bash
START=$(python3 -c "import datetime; print(int(datetime.datetime(2026,3,1,tzinfo=datetime.timezone.utc).timestamp()))")
END=$(python3   -c "import datetime; print(int(datetime.datetime(2026,4,1,tzinfo=datetime.timezone.utc).timestamp()))")

curl -sS "https://api.stripe.com/v1/balance_transactions?created%5Bgte%5D=$START&created%5Blt%5D=$END&limit=100" \
  -u "$STRIPE_API_KEY:"
```

**CRITICAL URL-encoding gotcha**: the `created[gte]=...` filter uses square brackets. In a shell, `[` / `]` are glob metacharacters. You MUST URL-encode them (`%5B` / `%5D`) or shell-escape them (`created\[gte\]=...`) — otherwise zsh emits `no matches found` and curl never runs. Bites you every time.

Each `data[]` item:

```
id              txn_...
type            "charge" | "payment" | "refund" | "payout" | "stripe_fee" | "adjustment" | ...
amount          int (minor units, signed)
fee             int (minor units)
net             int (amount - fee, signed)
currency        "eur" | "usd" | ...
created         unix timestamp
exchange_rate   float or null
fee_details[]   [{ amount, currency, description: "Stripe processing fees" | "Stripe currency conversion fee" | "PayPal fees" | ... }]
source          ch_... / py_... / po_...
description     often null
```

### Aggregating balance transactions — validated script

Pagination: max 100/page, use `starting_after=<last-id>` for next page. For ~1000 tx/month the loop runs ~10 pages.

```python
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

### Real March 2026 result (11 pages, 1011 transactions)

| type | count | amount (€) | fee (€) | net (€) |
|---|---|---|---|---|
| charge | 599 | 4,309.85 | 367.22 | 3,942.63 |
| payment | 342 | 2,993.65 | 256.80 | 2,736.85 |
| stripe_fee | 67 | −43.13 | 0.00 | −43.13 |
| refund | 2 | −8.72 | 0.00 | −8.72 |
| payout | 1 | −4,227.21 | 0.00 | −4,227.21 |

**Interpretation**:
- **Revenue types** (what customers paid us): `charge` + `payment` = €7,303.50 gross, €6,679.48 after per-charge fees
- **Refunds**: €8.72
- **`stripe_fee` rows**: €43.13 in misc monthly account fees (invoice fees, CC account updater, etc.) — **NOT** the per-charge processing fee, those are in `fee_details[]` on `charge`/`payment` rows
- **`payout` row**: €4,227.21 — this is money MOVING from Stripe balance to our bank account. Not revenue. IGNORE when computing revenue.
- **March gross revenue**: **€7,303.50**
- **March net revenue** (after all per-charge fees, account fees, refunds): **€7,303.50 − 624.02 − 43.13 − 8.72 = €6,627.63**

### Fee breakdown (March 2026, from `fee_details[]`)

| Fee type | €/month |
|---|---|
| Stripe processing fees | 422.01 |
| Stripe currency conversion fee | 147.51 |
| PayPal fees | 54.50 |
| **Total** | **624.02** |

To discover fee types for a different month (Stripe adds new ones as features roll out), enumerate unique descriptions across `fee_details[]` before totalling:

```python
from collections import Counter
fee_types = Counter()
for t in txns:
    for f in t.get('fee_details', []) or []:
        fee_types[f['description']] += f['amount']
for desc, cents in fee_types.most_common():
    print(f"{desc:<40} €{cents/100:.2f}")
```

**Effective fee rate: 8.6% on €7,303 gross.** Much higher than Stripe's headline 2.9% + €0.30 because of:
- Currency conversion: account is EUR but many customers pay in USD/other → each charge eats a 2% FX fee
- PayPal flows through Stripe and adds PayPal's own fee on top
- Small ticket sizes amplify the fixed €0.30 component

For runway math, **always use net**, not gross. Gross overstates by ~9%.

## Endpoint: Payouts

```bash
curl -sS "https://api.stripe.com/v1/payouts?limit=10" -u "$STRIPE_API_KEY:"
```

Each payout has `arrival_date`, `amount`, `status`, `method` (standard/instant), `currency`, `automatic` (boolean).

## Endpoint: Charges / Customers / Disputes

```bash
# Recent charges
curl -sS "https://api.stripe.com/v1/charges?limit=10" -u "$STRIPE_API_KEY:"

# Customer list
curl -sS "https://api.stripe.com/v1/customers?limit=10" -u "$STRIPE_API_KEY:"

# Active disputes (important to watch)
curl -sS "https://api.stripe.com/v1/disputes?limit=10" -u "$STRIPE_API_KEY:"
```

## Stripe CLI vs raw curl

The `stripe` CLI wraps the REST API with nicer config (`~/.config/stripe/config.toml`) but **defaults to TEST mode**:

```bash
# Test mode (default)
stripe balance retrieve

# Live mode — requires `stripe login` with a live key OR pass it explicitly
stripe balance retrieve --api-key "$STRIPE_API_KEY"
```

For automation, **prefer raw curl** with the env-loaded secret. The CLI is useful for interactive exploration but adds a layer you have to reason about.

---

## Question → query cheat sheet

| Question | Endpoint |
|---|---|
| How much is in our Stripe balance right now? | `GET /v1/balance` |
| What's our net revenue for month X? | `/v1/balance_transactions` aggregated, exclude `payout`/`transfer`, sum `net` |
| What fees did Stripe charge us last month? | Same endpoint, sum `fee_details[].amount` grouped by `description` |
| When is the next payout? | `GET /v1/payouts?limit=1` → `arrival_date` |
| Any active disputes? | `GET /v1/disputes` |
| What's the effective fee rate? | Sum fees ÷ sum gross (charges+payments) |
| Account details | `GET /v1/account` |

---

## Gotchas

- **`[` and `]` in URLs must be percent-encoded** (`%5B` / `%5D`) or zsh will glob them. Bites you on Stripe's `created[gte]=...` filter every single time.
- **Basic auth needs a trailing colon**: `-u "$STRIPE_API_KEY:"`. Without the colon curl prompts for a password.
- **`balance_transactions` is signed** — payouts and refunds are negative `amount` AND negative `net`. Don't take `abs()` when aggregating or you'll double-count.
- **`stripe_fee` rows ≠ per-charge processing fees.** Those are in `fee_details[]` on `charge` / `payment` rows. `stripe_fee` rows are misc monthly account fees.
- **Stripe CLI defaults to test mode** unless you pass `--api-key $STRIPE_API_KEY` or have logged in with a live key via `stripe login`.
- **`stripe config --list` dumps API keys in plaintext.** Treat its output like a secret.
- **Test and live accounts have different `acct_*` IDs** for the same business. Don't confuse them.
- **Pagination**: 100/page max, use `starting_after=<last-id>` (NOT `offset`). `has_more: true` in the response means there's another page.

---

## Known unknowns

- **Stripe → Polar link**: does Stripe charge `metadata` include a `polar_order_id` or similar? Would prove that Stripe payments are actually flowing through Polar. Run:
  ```bash
  curl -sS "https://api.stripe.com/v1/charges?limit=5" -u "$STRIPE_API_KEY:" \
    | python3 -c "import sys, json; [print(c.get('id'), c.get('metadata')) for c in json.load(sys.stdin).get('data', [])]"
  ```
  If `metadata` is empty on most charges, Stripe is processing payments NOT coming from Polar.
- **PayPal integration**: PayPal fees appear in `fee_details[].description == "PayPal fees"` inside Stripe balance transactions. Does this mean we have PayPal payments flowing through Stripe Connect, or is there a separate PayPal integration worth documenting?
- **Test account `acct_1SrYSy6O03AauPe8`**: exists separately from live. Confirm whether it has any useful data or is just the CLI default.
- **Tinybird pipes**: `TINYBIRD_STRIPE_INGEST_TOKEN` in SOPS implies there's already a Tinybird Stripe ingest somewhere. Check `enter.pollinations.ai/observability` — if an aggregation pipe exists it's likely MUCH faster than paginating `balance_transactions`.
- **Reconciliation with Polar**: Stripe reports €7,303/mo in March. Polar `/metrics` reports $0 for the same period. See [polar.md](polar.md) for full context — do not trust either number in isolation.

---

## Session 1 validation log (2026-04-11)

| Command | Result |
|---|---|
| `stripe --version` | ✅ 1.34.0 installed |
| `stripe config --list` | ✅ test-mode configured; live requires env var |
| `sops -d enter.pollinations.ai/secrets/prod.vars.json` | ✅ decrypts, contains `STRIPE_SECRET_KEY` (sk_live_) |
| `GET /v1/account` | ✅ `acct_1SrY3q7rcjS3l7tr`, EUR, charges+payouts enabled |
| `GET /v1/balance` | ✅ €3,044.42 available + €713.19 pending |
| `GET /v1/balance_transactions` March 2026 | ✅ 1011 tx across 11 pages → €7,303.50 gross / €6,627.63 net |
