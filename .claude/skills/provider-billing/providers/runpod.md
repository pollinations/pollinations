# RunPod (GPU shadow cost)

Validated: **2026-04-11** — queries run live against user `user_3BOlJSA6zZE5N6rOLI5maKMqFRU` / `elliot@myceli.ai`. Numbers captured inline. RunPod bills our account from a **pre-funded credit pool**, so traditional invoices show $0. The only way to know real spend is via the live GraphQL API.

Pair with [lambda-labs.md](lambda-labs.md) — these two providers are both "credit-funded GPU fleet, zero-invoice, shadow cost only."

---

## Why this exists

RunPod runs two Pollinations workloads: `gpu-worker` (Flux / Z-Image image generation, 4× RTX 4090) and `klein-worker` (Klein model, 1× RTX 3090). Both bill against a credit pool, so our Stripe history and bank statements will NEVER show RunPod charges — making all "how much do we spend on GPU" analysis blind without this skill.

The question this skill answers is: **"How fast are we burning the RunPod credit pool, what's left, and when does it run out?"**

---

## Requirements

- `curl` + `python3`
- **No `runpodctl` needed** — the CLI exists but only manages pods, not billing. Use the GraphQL API directly.
- API key in `apps/operation/finance/secrets/.env` as `RUNPOD_API_KEY`
- **Key must be READ scope** — RunPod's settings page offers read/write/"all" scopes

## Secret handling

RunPod tokens go in **local finance secrets**, NOT SOPS (same pattern as Wise — not a deploy secret, only used by the runway skill):

```
apps/operation/finance/secrets/.env      (gitignored via apps/operation/finance/.gitignore)

RUNPOD_API_KEY=rpa_...
```

Rotate via https://www.runpod.io/console/user/settings → **API Keys**. Keys start with `rpa_` and don't expire unless manually revoked.

**Blast radius if leaked** (read-only key): attacker can see running pods, balance, pod configs, image registry tokens, ssh keys. Cannot start/stop pods, cannot charge the account. Still rotate if leaked.

---

## Known identifiers (Pollinations production)

```
User ID:            user_3BOlJSA6zZE5N6rOLI5maKMqFRU
Email:              elliot@myceli.ai
Credit balance:     $2,071.80           (as of 2026-04-11, via clientBalance field)
Current burn rate:  $1.648/hr           (via currentSpendPerHr)
  = ~$39.55/day = ~$1,186/month shadow cost
Monthly spend cap:  $80                 (via spendLimit — appears to be a soft cap setting only)
Runway at this burn: $2,071.80 / $1.648 ≈ 1,257 hours ≈ 52 days
                     → credits exhaust around 2026-06-02 without top-up
```

### Active pods (2026-04-11)

| Pod name | GPU | Status | Role |
|---|---|---|---|
| `gpu-worker` | 4× RTX 4090 | RUNNING | Flux + Z-Image image generation |
| `klein-worker` | 1× RTX 3090 | RUNNING | Klein model |
| `plastic_peach_flyingfish` | 1× RTX 5090 | EXITED | legacy |
| `gpu_zimage` | 1× RTX 5090 | EXITED | legacy (pre-worker consolidation) |

Only the two RUNNING pods contribute to `currentSpendPerHr`.

---

## Auth

GraphQL over HTTPS. API key goes in the query string, NOT a header:

```bash
curl -sS -X POST "https://api.runpod.io/graphql?api_key=$RUNPOD_API_KEY" \
  -H "content-type: application/json" \
  -d '{"query":"..."}'
```

**Gotcha**: RunPod accepts the key in the URL, not `Authorization: Bearer`. Don't waste time trying header auth.

---

## The `myself` query — core billing fields

### What WORKS on our account (validated 2026-04-11)

| Field | Type | Example value | Notes |
|---|---|---|---|
| `id` | String | `user_3BOlJSA6zZE5N6rOLI5maKMqFRU` | |
| `email` | String | `elliot@myceli.ai` | |
| `currentSpendPerHr` | Float | `1.648` | Live burn rate across all running pods/serverless/disk |
| `spendLimit` | Int | `80` | Soft monthly cap; units appear to be USD |
| `clientBalance` | Float | `2071.8030568293` | **Remaining credit pool in USD** |
| `machineQuota` | Int | `0` | Machine creation limit (not used by us) |
| `pods` | [Pod] | see below | List of pods with costPerHr |

### What does NOT work on our account

These fields were probed and returned `Cannot query field ... on type "User"`:

- ❌ `billingHistory`
- ❌ `creditHistory`
- ❌ `transactionHistory`
- ❌ `clientCreditCharges` (documented publicly but not on our key)
- ❌ `credits`
- ❌ `balance` (use `clientBalance` instead)
- ❌ `spend`
- ❌ `usage`
- ❌ `invoices`
- ❌ `pastSpendAmt`

**Schema introspection is disabled** on our API key — `__type(name: "User")` returns empty fields array. So we cannot discover new billing fields by asking RunPod; we only have what we've empirically probed.

**Implication**: there is NO historical spend ledger available to us from the RunPod API. We can only see (a) live burn rate, (b) remaining balance, (c) currently-running pods and their cost. For historical spend we have to either (1) poll these values over time and store snapshots, or (2) derive it by diffing `clientBalance` across two time points.

---

## Endpoint: Live balance + burn rate ⭐

The most important query — answers "how's the credit pool doing" in one call:

```bash
source apps/operation/finance/secrets/.env

curl -sS -X POST "https://api.runpod.io/graphql?api_key=$RUNPOD_API_KEY" \
  -H "content-type: application/json" \
  -d '{"query":"query { myself { clientBalance currentSpendPerHr spendLimit } }"}' \
  | python3 -c "
import sys, json
d = json.load(sys.stdin)['data']['myself']
bal = d['clientBalance']
burn = d['currentSpendPerHr']
limit = d['spendLimit']
hours = bal / burn if burn > 0 else float('inf')
days = hours / 24
print(f'balance:        \${bal:>9.2f}')
print(f'burn rate:      \${burn:>6.3f}/hr  (\${burn*24:.2f}/day, \${burn*24*30:.2f}/month)')
print(f'spend limit:    \${limit}')
print(f'runway:         {hours:.0f} hrs = {days:.1f} days at current burn')
"
```

**Validated output 2026-04-11:**
```
balance:        $  2071.80
burn rate:      $ 1.648/hr  ($39.55/day, $1186.56/month)
spend limit:    $80
runway:         1257 hrs = 52.4 days at current burn
```

## Endpoint: Pod inventory with per-pod cost

```bash
curl -sS -X POST "https://api.runpod.io/graphql?api_key=$RUNPOD_API_KEY" \
  -H "content-type: application/json" \
  -d '{"query":"query { myself { pods { id name desiredStatus costPerHr gpuCount machine { gpuDisplayName gpuTypeId podHostId } } } }"}'
```

Each pod object has:

```
id                 String   pod_xyz
name               String   "gpu-worker", "klein-worker", ...
desiredStatus      Enum     "RUNNING" | "EXITED" | "TERMINATED" | ...
costPerHr          Float    per-pod live rate (may be 0 for exited pods)
gpuCount           Int      # of GPUs in the pod
machine.gpuDisplayName  String  "RTX 4090", "RTX 3090", "RTX 5090", ...
machine.gpuTypeId  String   SKU identifier
machine.podHostId  String   host machine ID
```

Use this to attribute cost by workload (gpu-worker vs klein-worker vs any future additions). Sum `costPerHr` across `desiredStatus == "RUNNING"` to reconcile with the account-wide `currentSpendPerHr` from the `myself` query.

**Reconciliation gotcha**: in our validation, the sum of pod `costPerHr` ($1.580) was slightly less than `currentSpendPerHr` ($1.648). The ~$0.068/hr delta is probably disk or network charges not attributed to individual pods. Over a month, $0.068/hr × 720 hr = ~$49, which is meaningful. Track both and don't assume the pod sum tells the full story.

## Other useful queries (if you need to drill further)

```bash
# All pods including terminated (for historical analysis)
'{"query":"query { myself { pods { id name desiredStatus costPerHr machine { gpuDisplayName } } } }"}'

# Serverless endpoints (we don't currently use these but may in future)
'{"query":"query { myself { serverlessEndpoints { id name workersRunning gpuIds } } }"}'

# GPU types available (price reference)
'{"query":"query { gpuTypes { id displayName communityCloud securePrice communityPrice } }"}'
```

---

## Computing historical spend (the "shadow cost" trick)

Since we have no historical endpoint, the only way to get "how much did we spend in March 2026" is to **derive it from successive `clientBalance` snapshots**:

```
spend_between_t1_and_t2 = clientBalance(t1) - clientBalance(t2) + any_topups_between
```

If no credit top-ups happened, the balance delta IS the spend. If top-ups happened, you need to subtract them.

### Polling setup (manual for now, automate later)

Save this as a cron job or launchd timer. It writes one JSONL line per run to a local file:

```bash
#!/bin/bash
# apps/operation/finance/bin/runpod-snapshot.sh
source /Users/comsom/Github/pollinations/apps/operation/finance/secrets/.env
OUT=/Users/comsom/Github/pollinations/apps/operation/finance/secrets/runpod-snapshots.jsonl
TS=$(date -u +%Y-%m-%dT%H:%M:%SZ)
DATA=$(curl -sS -X POST "https://api.runpod.io/graphql?api_key=$RUNPOD_API_KEY" \
  -H "content-type: application/json" \
  -d '{"query":"query { myself { clientBalance currentSpendPerHr pods { id name desiredStatus costPerHr } } }"}')
echo "{\"t\":\"$TS\",\"data\":$DATA}" >> "$OUT"
```

Run hourly:
```bash
echo '0 * * * * /Users/comsom/Github/pollinations/apps/operation/finance/bin/runpod-snapshot.sh' | crontab -
```

After a few days of snapshots, you can replay to compute per-day spend from the balance delta.

**Not yet automated** as of 2026-04-11. See Level 2 in the umbrella [SKILL.md](../SKILL.md) conversation if we decide to build this out.

### Alternative: `costPerHr` × runtime duration

If you instead track pod start/stop events (via the `pods` query over time), you can multiply `costPerHr × duration` per pod and sum. This gives per-pod attribution but requires more frequent polling (misses pods that start and stop between snapshots).

---

## Question → query cheat sheet

| Question | Query |
|---|---|
| How much credit do I have left? | `myself { clientBalance }` |
| How fast am I burning credit right now? | `myself { currentSpendPerHr }` |
| When do credits run out? | `clientBalance / currentSpendPerHr` (hours) |
| What pods are running and costing what? | `myself { pods { name desiredStatus costPerHr gpuCount machine { gpuDisplayName } } }` |
| What's the cost by workload? | Same as above, sum by pod name |
| How much did I spend yesterday? | ⚠️ Not directly queryable. Need two `clientBalance` snapshots separated by 24h. |
| What GPU types are available and at what price? | `gpuTypes { displayName communityPrice securePrice }` |
| Monthly shadow spend projection | `currentSpendPerHr * 24 * 30` |

---

## Gotchas

- **API key goes in the URL query string**, not an `Authorization` header. `api.runpod.io/graphql?api_key=...`
- **Schema introspection is disabled** for our key. You can't discover fields — probe empirically.
- **Many documented billing fields don't exist** on the actual schema we have access to. `clientCreditCharges`, `billingHistory`, etc. all return "Cannot query field". Only use fields we've validated.
- **Pod `costPerHr` sum ≠ account `currentSpendPerHr`** — there's a ~$0.07/hr unattributed delta (likely disk/network). Always report both.
- **`spendLimit: 80` is a soft setting, not a hard cap.** Balance can go way above/below this; don't use it for runway math.
- **Exited pods still appear in the `pods` query** with `desiredStatus: EXITED`. Filter by `desiredStatus == "RUNNING"` when computing live cost.
- **No historical ledger API.** You MUST poll `clientBalance` over time to reconstruct spend history.
- **GPU display names are human-readable** (`RTX 4090`) not SKUs. For programmatic matching use `gpuTypeId`.
- **Pods launched from the UI vs API appear identically**. The API key doesn't gatekeep by creation source.

---

## Known unknowns

- **Historical spend ledger** — no way to fetch a list of charges. Our only option is snapshot polling (documented above but not yet running).
- **Credit top-up events** — we don't know how to detect when a top-up lands. If someone adds credits, `clientBalance` jumps and our balance-delta method miscounts spend for that window. Workaround: maintain a manual log of top-up dates/amounts, subtract them when computing deltas.
- **Disk storage cost** — part of the ~$0.07/hr unattributed delta is probably persistent volume storage. The `pods` query doesn't expose volume size, so we can't separate it programmatically. Ignore or model as "other 5%" of the burn rate.
- **Serverless endpoint costs** — not currently used by us, but if we ever enable serverless, the `serverlessCharges` attribution path is undocumented to us. Explore when it matters.
- **Network egress** — RunPod claims "no data transfer fees" but the docs are inconsistent. If/when we see egress charges, they'd probably show up in the same unattributed delta.
- **Credit expiration policy** — we don't know if the $2,071.80 is time-limited (e.g. "expires 12 months from grant date"). Check the RunPod grant agreement; if credits expire, runway math needs to use `min(runway_from_burn, time_until_expiry)`.

---

## Session 1 validation log (2026-04-11)

| Query | Result |
|---|---|
| `myself { id email currentSpendPerHr machineQuota }` | ✅ user + $1.648/hr |
| `myself { clientBalance }` | ✅ $2,071.80 credit remaining |
| `myself { spendLimit }` | ✅ 80 (soft cap) |
| `myself { pods { id name desiredStatus costPerHr gpuCount machine { gpuDisplayName } } }` | ✅ 4 pods (2 running, 2 exited) |
| `myself { clientCreditCharges(...) }` | ❌ field does not exist |
| `myself { billingHistory }` | ❌ field does not exist |
| `myself { creditHistory }` | ❌ field does not exist |
| `__type(name: "User") { fields { name } }` | ❌ introspection disabled (0 fields returned) |

**Shadow cost captured**: **$1,137/month** based on currently-running pods. Will hit $0 balance (credit exhaustion) around 2026-06-02 at current burn.
