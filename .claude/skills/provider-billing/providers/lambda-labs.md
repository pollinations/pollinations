# Lambda Labs (GPU shadow cost via instance × price)

Validated: **2026-04-11** — queries run live with a read-only API key against account `elliot@myceli.ai`. Account has **zero billing endpoints** — this file documents the "shadow cost via polling + price book" approach.

Pair with [runpod.md](runpod.md) — both providers are credit-funded GPU fleet, zero-invoice, shadow cost only.

---

## Why this exists

Lambda Labs runs three Pollinations workloads: `LTX-2.3` (LTX video on GH200) and two `Sana` instances (A10 + A100). Account is on a credit grant, so monthly invoices show $0. The Lambda API **does not expose any billing or usage data** — no balance, no charge history, no invoices, no credits endpoint. The only way to know real spend is to:

1. Periodically **poll** `GET /instances` to see what's running
2. Cross-reference against **`GET /instance-types`** (live published prices)
3. Compute shadow cost = `duration × price` per instance

Unlike [runpod.md](runpod.md) where we at least get a `clientBalance` + `currentSpendPerHr`, Lambda gives us nothing server-side. Full polling architecture required.

---

## Requirements

- `curl` + `python3`
- API key in `apps/operation/finance/secrets/.env` as `LAMBDA_LABS_API_KEY`
- Optional: a scheduled poller (cron / launchd / Cloudflare Worker cron) to record instance state over time

## Secret handling

Same pattern as [runpod.md](runpod.md) and [wise.md](wise.md) — local file, NOT SOPS:

```
apps/operation/finance/secrets/.env

LAMBDA_LABS_API_KEY=secret_<name>_<hex>.<hex>
```

Lambda Labs keys have a structured format: `secret_<key-name>_<uuid>.<secret>`. Generate at https://cloud.lambdalabs.com/api-keys.

**Blast radius if leaked**: attacker can list running instances, launch new instances (!!!), terminate instances, read SSH keys, see file system metadata. **⚠️ Lambda Labs API keys are full-access — there is no read-only scope**. Leaked key = attacker can spin up H100s on your credit pool. Rotate immediately if leaked.

---

## Known identifiers (Pollinations production)

```
Account email:        elliot@myceli.ai
Created by user ID:   e9947412dd7e422d8b5ba70f743fffce

File systems (NFS persistent storage):
  6661307b... polli3         us-east-1 (Virginia)    in_use=true
  0c14edce... polli2         us-east-1 (Virginia)    in_use=true
  7e445ff7... pollinations   us-east-3 (Washington)  in_use=true

SSH keys:
  bfe18c5a... thomashkey
```

### Active instances (2026-04-11 live capture)

| Name | Type | GPU | Region | $/hr | $/day | $/month |
|---|---|---|---|---|---|---|
| `LTX-2.3` | `gpu_1x_gh200` | 1× GH200 (96 GB) | us-east-3 | $2.29 | $54.96 | $1,648.80 |
| `Sana` | `gpu_1x_a10` | 1× A10 (24 GB PCIe) | us-east-1 | $1.29 | $30.96 | $928.80 |
| `Sana` | `gpu_1x_a100_sxm4` | 1× A100 (40 GB SXM4) | us-east-1 | $1.99 | $47.76 | $1,432.80 |
| **TOTAL** | | | | **$5.57** | **$133.68** | **$4,010.40** |

Two instances share the name "Sana" — that's allowed; they're disambiguated by `id`.

**Shadow cost projection**: at current instance mix, we're burning ~**$4,010/month** against Lambda credits.

---

## Auth

HTTP basic auth with the API key as username and empty password (same pattern as Stripe):

```bash
curl -sS "https://cloud.lambdalabs.com/api/v1/<endpoint>" -u "$LAMBDA_LABS_API_KEY:"
```

Note the trailing colon. Without it, curl prompts for a password.

Base URL: `https://cloud.lambdalabs.com/api/v1`

---

## Endpoint: Instance types (the price book) ⭐

```bash
curl -sS -u "$LAMBDA_LABS_API_KEY:" "https://cloud.lambdalabs.com/api/v1/instance-types"
```

Returns a dictionary keyed by instance type slug. Each entry has:

```json
{
  "gpu_1x_gh200": {
    "instance_type": {
      "name": "gpu_1x_gh200",
      "description": "1x GH200 (96 GB)",
      "price_cents_per_hour": 229,
      "specs": {
        "vcpus": 64,
        "memory_gib": 432,
        "storage_gib": 4096,
        "gpus": 1
      }
    },
    "regions_with_capacity_available": [
      {"name": "us-east-3", "description": "Washington DC, USA"}
    ]
  }
}
```

### Full price book (validated 2026-04-11)

| Instance type | $/hr | Description | Regions available |
|---|---|---|---|
| `gpu_1x_gh200` | 2.29 | 1x GH200 (96 GB) | 1 |
| `gpu_1x_b200_sxm6` | 6.99 | 1x B200 (180 GB SXM6) | 0 |
| `gpu_2x_b200_sxm6` | 13.78 | 2x B200 (180 GB SXM6) | 0 |
| `gpu_4x_b200_sxm6` | 27.16 | 4x B200 (180 GB SXM6) | 0 |
| `gpu_8x_b200_sxm6` | 53.52 | 8x B200 (180 GB SXM6) | 0 |
| `gpu_2x_h100_sxm5` | 8.38 | 2x H100 (80 GB SXM5) | 0 |
| `gpu_4x_h100_sxm5` | 16.36 | 4x H100 (80 GB SXM5) | 0 |
| `gpu_8x_h100_sxm5` | 31.92 | 8x H100 (80 GB SXM5) | 0 |
| (+ 8 more — hit the endpoint for full list) | | | |

The API has 16 total types. `regions_with_capacity_available: []` means "sold out right now" — instances we already have keep running fine, but we can't launch new ones of that type until capacity frees up.

**Cache this response** — prices change rarely. Poll hourly or daily, write to a file at `apps/operation/finance/secrets/lambda-prices.json`. That file can even be committed to the repo (prices are public), but `.env` is fine for now.

## Endpoint: Running instances ⭐

```bash
curl -sS -u "$LAMBDA_LABS_API_KEY:" "https://cloud.lambdalabs.com/api/v1/instances"
```

Returns:

```json
{
  "data": [
    {
      "id": "...",
      "name": "Sana",
      "hostname": "104.171.203.123",
      "ip": "104.171.203.123",
      "status": "active",
      "region": {"name": "us-east-1", "description": "Virginia, USA"},
      "instance_type": {
        "name": "gpu_1x_a100_sxm4",
        "description": "1x A100 (40 GB SXM4)",
        "price_cents_per_hour": 199,
        "specs": {...}
      },
      "jupyter_token": "...",
      "jupyter_url": "...",
      "ssh_key_names": ["thomashkey"],
      "file_system_names": ["polli2"]
    }
  ]
}
```

Status values: `active`, `booting`, `terminated`, `unhealthy`. Only `active` counts toward shadow cost.

**Important**: instance objects do NOT include a `started_at` timestamp in our API response. Without it, you cannot compute "how long has this instance been running" from a single query. You MUST poll over time and track first-seen / last-seen yourself.

## Endpoint: File systems (persistent storage)

```bash
curl -sS -u "$LAMBDA_LABS_API_KEY:" "https://cloud.lambdalabs.com/api/v1/file-systems"
```

Response includes `id`, `name`, `mount_point`, `created`, `is_in_use`, `region`, and `bytes_used`. **⚠️ `bytes_used` is unreliable** — we observed `bytes_used: 7` on filesystems that clearly contain real data. Don't use this for capacity cost computation.

**Pricing**: Lambda charges ~$0.20/GB/month for persistent storage when a filesystem is "in use" (attached to at least one running instance). With 3 filesystems of unknown size, we cannot compute storage cost programmatically. Check the Console UI or grant agreement for actual filesystem capacities.

## Endpoint: SSH keys

```bash
curl -sS -u "$LAMBDA_LABS_API_KEY:" "https://cloud.lambdalabs.com/api/v1/ssh-keys"
```

Not billing-relevant but useful to audit who has access to our instances.

## What does NOT exist

All of these were probed and returned **HTTP 404** on 2026-04-11:

- ❌ `/api/v1/user`
- ❌ `/api/v1/account`
- ❌ `/api/v1/billing`
- ❌ `/api/v1/invoices`
- ❌ `/api/v1/credits`
- ❌ `/api/v1/usage`

Confirming: **Lambda Labs provides zero programmatic access to billing.** This is a public API limitation, not an account permissions issue.

---

## The shadow-cost polling pattern

Since Lambda gives us no server-side history, we compute spend by polling `/instances` periodically and tallying each instance's runtime × price.

### Minimal polling script

Save as `apps/operation/finance/bin/lambda-snapshot.sh`:

```bash
#!/bin/bash
set -e
source /Users/comsom/Github/pollinations/apps/operation/finance/secrets/.env
OUT=/Users/comsom/Github/pollinations/apps/operation/finance/secrets/lambda-snapshots.jsonl
TS=$(date -u +%Y-%m-%dT%H:%M:%SZ)
INSTANCES=$(curl -sS -u "$LAMBDA_LABS_API_KEY:" https://cloud.lambdalabs.com/api/v1/instances)
echo "{\"t\":\"$TS\",\"data\":$INSTANCES}" >> "$OUT"
```

Make executable and wire up cron / launchd:

```bash
chmod +x apps/operation/finance/bin/lambda-snapshot.sh

# Every 10 minutes via cron
echo '*/10 * * * * /Users/comsom/Github/pollinations/apps/operation/finance/bin/lambda-snapshot.sh' | crontab -
```

Polling interval tradeoff:
- **10 min**: ~4,320 samples/month, ~8 MB/year. Good enough for workloads that run for hours/days.
- **1 hour**: ~720 samples/month, might miss short-lived instances.
- **1 min**: unnecessary precision unless you're running ephemeral inference pods.

### Replay / aggregation script (sketch)

```python
#!/usr/bin/env python3
# apps/operation/finance/bin/lambda-shadow-cost.py
import json, sys
from datetime import datetime, timezone
from collections import defaultdict

snapshots_path = 'apps/operation/finance/secrets/lambda-snapshots.jsonl'

# Accumulate runtime per (instance_id, instance_type) pair
runtime_hours = defaultdict(float)
instance_type = {}
prev_ts = None

with open(snapshots_path) as f:
    for line in f:
        if not line.strip(): continue
        rec = json.loads(line)
        ts = datetime.fromisoformat(rec['t'].replace('Z', '+00:00'))
        delta_h = 0
        if prev_ts:
            delta_h = (ts - prev_ts).total_seconds() / 3600
        active = [i for i in rec.get('data', {}).get('data', []) if i.get('status') == 'active']
        for i in active:
            iid = i.get('id')
            itype = i.get('instance_type', {}).get('name')
            runtime_hours[iid] += delta_h
            instance_type[iid] = itype
        prev_ts = ts

# Load current price book
# (refresh via: curl .../instance-types > price_book.json)
price_book = {
    'gpu_1x_gh200': 2.29,
    'gpu_1x_a10':   1.29,
    'gpu_1x_a100_sxm4': 1.99,
    # ... keep in sync with /instance-types
}

total = 0
for iid, hours in runtime_hours.items():
    itype = instance_type[iid]
    rate = price_book.get(itype, 0)
    cost = hours * rate
    total += cost
    print(f"  {iid[:8]}  {itype:<22} {hours:>7.1f}h  \${rate:>5.2f}/hr  \${cost:>8.2f}")
print(f"\nTotal shadow cost over snapshot window: \${total:.2f}")
```

Not yet built — this is a sketch. When needed, flesh out with proper date-range filters, price-book loading, and per-day aggregation.

### Better option: poll in the cloud, not locally

Polling from a Mac means gaps when the laptop is closed. Options to fix:

1. **Cron on an always-on machine** (our EC2 or RunPod host) — minimal effort, ~2 lines of crontab.
2. **Cloudflare Worker cron trigger** — deploy the snapshot script as a Worker with a `triggers.crons` config, write to D1 or R2. Clean but requires Worker setup.
3. **GitHub Actions scheduled workflow** — a workflow with `on: schedule: - cron: '*/10 * * * *'` that runs the curl + appends to a gist or a repo file. Free, no infra, but exposes the API key to GitHub secrets (low risk given leak radius above).

**Recommendation**: Option 2 (Cloudflare Worker cron) once we're serious about runway dashboards. It colocates with the rest of our enter.pollinations.ai worker infra.

---

## Question → query cheat sheet

| Question | Query |
|---|---|
| What's running right now? | `GET /instances` filter `status == "active"` |
| How much am I burning per hour right now? | `sum(price_cents_per_hour / 100)` across active instances |
| What's my projected monthly shadow cost? | `burn_per_hour × 24 × 30` |
| Have any new instances launched today? | Diff latest snapshot vs one from 24h ago |
| How much did March cost? | Replay snapshots.jsonl over March's date range with shadow-cost.py |
| What types can I launch right now? | `GET /instance-types` filter `regions_with_capacity_available` non-empty |
| What's the cheapest H100 available? | `GET /instance-types` filter H100, sort by price |

---

## Gotchas

- **No read-only scope.** Lambda Labs API keys are full-access. Leaking one = someone can launch $50/hr B200 instances on your credit pool. Treat like a live Stripe key.
- **No billing endpoints of any kind.** This is a hard architectural limit, not a permissions problem.
- **No `started_at` on instance objects** in our response. You can't compute runtime from a single query — must poll over time.
- **`bytes_used` on file systems is unreliable** (always shows `7` in our tests). Ignore.
- **`regions_with_capacity_available: []` means sold out** for that type. Existing instances keep running; you can't launch new ones until capacity frees up.
- **Monthly invoice always shows $0** while on credits. The Console UI (Settings → Billing) is the ONLY source of "official" spend, and it shows the shadow cost deducted from the credit pool — but that UI number isn't exposed via API either.
- **Filesystem costs are invisible** — we know they bill ~$0.20/GB/month but `bytes_used` is wrong and there's no `capacity` field. Don't try to programmatic-ize storage cost; model it as "~5% overhead on instance spend" or confirm capacity via the Console UI.
- **Two instances named "Sana"** is valid. Always use `id` to disambiguate, not `name`.
- **Stripe charges (if any)**: Lambda Labs bills via Stripe when credits run out. Those charges would appear in our [stripe.md](stripe.md) data as incoming card charges to Lambda — watch for merchant name `LAMBDA LABS` or similar once we're off credits.

---

## Known unknowns

- **File system capacity (GB)** on polli2, polli3, pollinations — not in API. Check Console UI. Storage cost at $0.20/GB/mo could be significant if these are hundreds of GB each.
- **Credit pool remaining balance** — no API endpoint. Only way to know: check the Console UI (Settings → Billing → Credits) periodically or ask Lambda support.
- **Credit expiration** — same as RunPod, unknown whether the grant has a time limit. Check the grant agreement.
- **Invoice history** — past $0 invoices exist and can be viewed in the Console UI as PDFs. Could be scraped via browser automation if we ever need them, but the invoice API doesn't exist.
- **Actual instance start times** — without a `started_at` field we can't bootstrap historical cost for the pre-polling era. First snapshot = earliest data point we have.
- **Network egress / bandwidth charges** — Lambda claims "free" but verify with a test case. Probably negligible for our workload which is mostly inbound API calls.

---

## Session 1 validation log (2026-04-11)

| Endpoint | Result |
|---|---|
| `GET /instance-types` | ✅ 16 types, prices captured |
| `GET /instances` | ✅ 3 active: LTX-2.3 (GH200), 2× Sana (A10 + A100) |
| `GET /ssh-keys` | ✅ 1 key (thomashkey) |
| `GET /file-systems` | ✅ 3 filesystems (polli2, polli3, pollinations), bytes_used unreliable |
| `GET /user` | ❌ 404 |
| `GET /account` | ❌ 404 |
| `GET /billing` | ❌ 404 |
| `GET /invoices` | ❌ 404 |
| `GET /credits` | ❌ 404 |
| `GET /usage` | ❌ 404 |

**Shadow cost captured**: **$5.57/hr → $4,010/month** across 3 active instances, derived from live instance list × price book. No historical data; polling not yet automated.
