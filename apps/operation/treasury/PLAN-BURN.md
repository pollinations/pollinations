# Burn Phase Implementation Plan (PLAN-BURN)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move every cost signal that today lives only in the spend-audit PoC into forager — live balance snapshots, provider meter reads, Tinybird usage cost, Stripe revenue — and join them with the existing invoices/payments tables into one `provider_month` table (per month × provider: $ spent, credit burn, grant left, each cell source-tagged, with a note telling Elliot what to do when a number is not programmatically findable).

**Architecture:** Same shape as the invoice phase. Connectors are thin fetchers in `ingest/connectors/providers/` (one file per provider, stdlib urllib/subprocess only, every HTTP call carries the User-Agent header — the RunPod Cloudflare-1010 lesson). Facts land in Tinybird `operations` datasources: `balances` and `meter_monthly` are append-only (history preserved, latest-wins on read); `usage_monthly`, `revenue_monthly`, `provider_month` are full-replace each run (pure recomputes). All derivation lives in a pure engine `ingest/burn.py` (like `gaps.py`): read facts back from TB, join, emit `provider_month` rows. Manual numbers enter through a tiny `ingest.record` CLI (append, `source="manual"`). Treasury/PoC read pipes with the `treasury_web` token — consumers only.

**End state (Elliot, 2026-07-03):** forager scripts → operations datasources (the source of truth) → the existing PoC frontend (still in its `_local` folder, still a basic static HTML, no visible UI change) and every future operation app. The PoC reads ONLY operations pipes — no provider keys, no local credits.json, no manual grid. Task B10 is the cutover and is IN SCOPE.

**Tech Stack:** Python 3 stdlib only (urllib, subprocess, json, hashlib). Tinybird Forward workspace `operations` (GCP europe-west2). pytest for hermetic tests. External CLIs shelled out to: `vastai`, `firectl`, `aws`, `gcloud`/`bq` (all confirmed installed 2026-07-03).

## Global Constraints

- **Invoices remain the ONLY cash-P&L cost.** Meter, balance-delta, and usage numbers are diagnostics + credit-burn quantification. They are never summed into cash P&L. `provider_month` carries them as separate, source-tagged columns.
- **Canonical provider slugs = `credits.json` pool slugs**: `vast.ai` (not vastai), `io.net`, `ovhcloud`, `google` (not gcp), `bytedance`, `scaleway`, etc. Connector registry slugs and the burn engine's CANON output must emit exactly these. Test-enforced (same pattern as `harvest.PROVIDERS` / `wise.ALIAS` tests).
- **Every HTTP request sends `User-Agent: Mozilla/5.0 (pollinations-finops-connector)`** (already in `ingest/connectors/common.py:UA`). No exceptions — RunPod's Cloudflare bans the urllib default UA (error 1010).
- **Token discipline:** `.append()` and `.sql()` on operations use `TINYBIRD_OPS_INGEST_TOKEN`; **every `.replace()` uses `TINYBIRD_OPS_REPLACE_TOKEN`**; the usage pull from `pollinations_enter` prod uses `TINYBIRD_PROD_READ_TOKEN` (READ-only, SQL API). Pipes declare `TOKEN "treasury_web" READ`. Admin token stays in local `.tinyb` only, never SOPS, never printed.
- **No secrets in output, ever.** Error strings from connectors are truncated to 200 chars before logging (keys can appear in URLs — RunPod puts `api_key` in the query string; strip it: log `type(e).__name__` + sanitized message). `tests/test_no_leaks.py` conventions extend to all new modules.
- **No new pip dependencies.** stdlib only, CLIs via `subprocess.run` with an injectable runner param for tests.
- **Hermetic tests only** — monkeypatch `common.http_json` / `tb._http`, inject `run_cmd` for CLI connectors. No network, no SOPS, no real CLIs in tests. Runner: `cd apps/operation/forager && python3 -m pytest tests/ -q`.
- **Connector failures never kill the run.** Each connector is wrapped in try/except in `run.py`; status per connector goes into the `ingest_runs` note JSON; the rest of the run proceeds.
- **Tinybird deploys go to the `operations` workspace only** (local `.tinyb` in `forager/tinybird/`), `tb --cloud deploy --check --wait` before `tb --cloud deploy --wait`. Verify workspace identity first (`tb --cloud workspace current`). Never `--allow-destructive-operations` without fresh explicit approval. This plan touches nothing in `pollinations_enter`.
- **Self-contained writes:** forager is the ONLY writer to the operations workspace. No other app ever receives an APPEND/CREATE-scoped token; consumers (PoC, treasury, future apps) get `treasury_web` (PIPES:READ) and nothing else.
- **Minimal & alive:** every datasource and pipe in operations must have an active consumer (PoC UI column, burn engine read-back, or the chase workflow). Adding a table without a consumer, or leaving one orphaned after a change, is a review defect.
- **YAGNI:** no connector for a provider that has no programmatic surface (io.net, Perplexity, Nebius, Lambda, BytePlus, Modal, ElevenLabs-grant) — those are `ingest.record` + note territory, documented in `CONNECTORS.md`. Cloudflare's PoC connector is verification-only (returns no balances) — intentionally NOT ported; Cloudflare cost arrives via invoices.

## Porting sources (read-only references)

The PoC lives in the shared scratch store `/Users/comsom/Github/pollinations-local/2026-07-01-spend-audit/` (reachable from every clone as `_local/2026-07-01-spend-audit/` — all three clones' `_local` are symlinks to the same physical directory since 2026-07-03). Its `build/connectors/*.py` files are the porting source for balance connectors; `build/connectors/accrual.py` for meter mechanisms; `build/csv_build.py` for the TB-provider→canonical-slug CANON map; `build/refresh.sh` for the usage SQL. The Azure credits reader ports from this repo's `apps/operation/finance/lib/providers/` (azure `.mjs`). **Never modify anything under `_local/` or `finance/` — read-only.**

## Row shapes (single source of truth)

```python
# balances (append-only; None → JSON null → Nullable column)
{"run_at": "2026-07-03 14:05:00", "provider": "openrouter",
 "granted_usd": 3000.0, "spent_usd": 1372.48, "left_usd": 1627.52,
 "prepaid_left_usd": None, "currency": "USD", "source": "api", "note": ""}

# meter_monthly (append-only)
{"month": "2026-06", "provider": "deepinfra", "cost_usd": 8.77,
 "funding": "prepaid",              # cash | credit | prepaid
 "source": "api",                   # api | cli | bq | manual
 "method": "deepinfra /payment/usage", "retrieved_at": "2026-07-03"}

# grants (full replace) — pool-level merged view: credits.json base + latest live balance overlay
{"pool": "OpenRouter", "providers": "openrouter", "kind": "grant", "currency": "USD",
 "granted_usd": 3000.0, "granted_src": "api",     # api | manual | hc | ''
 "left_usd": 1627.52, "left_src": "api",
 "prepaid_left_usd": None, "prepaid_left_src": "",
 "expires": "", "note": "", "run_at": "2026-07-03"}

# usage_monthly (full replace)
{"month": "2026-06", "provider": "azure-openai", "model": "gpt-5.2", "event_type": "generate.text",
 "requests": 12345, "pollen_paid": 10.5, "pollen_quest": 3.2,
 "cost_paid": 8.1, "cost_quest": 2.4, "retrieved_at": "2026-07-03"}

# revenue_monthly (full replace)
{"month": "2026-06", "gross_eur": 1234.56, "fees_eur": 61.0,
 "refunds_eur": 12.0, "net_eur": 1161.56, "retrieved_at": "2026-07-03"}

# provider_month (full replace) — THE final table
{"month": "2026-06", "provider": "runpod", "billing": "prepaid",
 "invoice_usd": 0.0,        # parsed compute invoices (P&L cost)
 "cash_usd": 1368.0,        # Wise payments matched to provider
 "meter_cash_usd": 0.0,     # meter rows funding=cash
 "meter_prepaid_usd": 1214.0, "meter_src": "api",   # '' when absent; src covers the meter family
 "usage_cost_usd": 3700.0,                     # TB registry-imputed (diagnostic)
 "credit_burn_usd": 0.0, "credit_src": "",     # meter | delta | manual | ''
 "grant_left_usd": 255.66, "grant_src": "api", # api | manual | hc | ''
 "status": "ok",            # ok | grant_burn | usage_no_invoice | needs_data | quiet
 "note": "", "run_at": "2026-07-03"}
```

---

### Task B1: Tinybird schemas + pipes (operations workspace)

**Files:**
- Create: `apps/operation/forager/tinybird/balances.datasource`
- Create: `apps/operation/forager/tinybird/meter_monthly.datasource`
- Create: `apps/operation/forager/tinybird/usage_monthly.datasource`
- Create: `apps/operation/forager/tinybird/revenue_monthly.datasource`
- Create: `apps/operation/forager/tinybird/provider_month.datasource`
- Create: `apps/operation/forager/tinybird/grants.datasource`
- Create: `apps/operation/forager/tinybird/balances_ep.pipe`
- Create: `apps/operation/forager/tinybird/grants_ep.pipe`
- Create: `apps/operation/forager/tinybird/usage_ep.pipe`
- Create: `apps/operation/forager/tinybird/cash_monthly_ep.pipe`
- Create: `apps/operation/forager/tinybird/revenue_ep.pipe`
- Create: `apps/operation/forager/tinybird/provider_month_ep.pipe`
- Modify: `apps/operation/forager/tinybird/README.md` (add 5 datasources + 5 pipes to the tables)

**Interfaces:**
- Produces: datasource names `balances`, `meter_monthly`, `usage_monthly`, `revenue_monthly`, `provider_month`, `grants` (used by Tasks B2–B8 via `tb.append/replace/sql`); pipe URLs `/v0/pipes/{balances_ep,usage_ep,cash_monthly_ep,revenue_ep,provider_month_ep,grants_ep}.json` for consumers (each maps 1:1 to a PoC data file — see B10).

- [ ] **Step 1: Write the five datasources** (JSONPaths on every column — Events API requires them; Nullable is legal with JSONPaths):

`balances.datasource`:
```
TOKEN "treasury_ingest" APPEND
TOKEN "treasury_ingest" READ

SCHEMA >
    `run_at` DateTime `json:$.run_at`,
    `provider` String `json:$.provider`,
    `granted_usd` Nullable(Float64) `json:$.granted_usd`,
    `spent_usd` Nullable(Float64) `json:$.spent_usd`,
    `left_usd` Nullable(Float64) `json:$.left_usd`,
    `prepaid_left_usd` Nullable(Float64) `json:$.prepaid_left_usd`,
    `currency` String `json:$.currency`,
    `source` String `json:$.source`,
    `note` String `json:$.note`

ENGINE "MergeTree"
ENGINE_SORTING_KEY "provider, run_at"
```

`meter_monthly.datasource`:
```
TOKEN "treasury_ingest" APPEND
TOKEN "treasury_ingest" READ

SCHEMA >
    `month` String `json:$.month`,
    `provider` String `json:$.provider`,
    `cost_usd` Float64 `json:$.cost_usd`,
    `funding` String `json:$.funding`,
    `source` String `json:$.source`,
    `method` String `json:$.method`,
    `retrieved_at` Date `json:$.retrieved_at`

ENGINE "MergeTree"
ENGINE_SORTING_KEY "provider, month, retrieved_at"
```

`usage_monthly.datasource`:
```
TOKEN "treasury_ingest" APPEND
TOKEN "treasury_ingest" READ

SCHEMA >
    `month` String `json:$.month`,
    `provider` String `json:$.provider`,
    `model` String `json:$.model`,
    `event_type` String `json:$.event_type`,
    `requests` UInt64 `json:$.requests`,
    `pollen_paid` Float64 `json:$.pollen_paid`,
    `pollen_quest` Float64 `json:$.pollen_quest`,
    `cost_paid` Float64 `json:$.cost_paid`,
    `cost_quest` Float64 `json:$.cost_quest`,
    `retrieved_at` Date `json:$.retrieved_at`

ENGINE "MergeTree"
ENGINE_SORTING_KEY "month, provider, model"
```

`revenue_monthly.datasource`:
```
TOKEN "treasury_ingest" APPEND
TOKEN "treasury_ingest" READ

SCHEMA >
    `month` String `json:$.month`,
    `gross_eur` Float64 `json:$.gross_eur`,
    `fees_eur` Float64 `json:$.fees_eur`,
    `refunds_eur` Float64 `json:$.refunds_eur`,
    `net_eur` Float64 `json:$.net_eur`,
    `retrieved_at` Date `json:$.retrieved_at`

ENGINE "MergeTree"
ENGINE_SORTING_KEY "month"
```

`provider_month.datasource`:
```
TOKEN "treasury_ingest" APPEND
TOKEN "treasury_ingest" READ

SCHEMA >
    `month` String `json:$.month`,
    `provider` String `json:$.provider`,
    `billing` String `json:$.billing`,
    `invoice_usd` Float64 `json:$.invoice_usd`,
    `cash_usd` Float64 `json:$.cash_usd`,
    `meter_cash_usd` Float64 `json:$.meter_cash_usd`,
    `meter_prepaid_usd` Float64 `json:$.meter_prepaid_usd`,
    `meter_src` String `json:$.meter_src`,
    `usage_cost_usd` Float64 `json:$.usage_cost_usd`,
    `credit_burn_usd` Float64 `json:$.credit_burn_usd`,
    `credit_src` String `json:$.credit_src`,
    `grant_left_usd` Float64 `json:$.grant_left_usd`,
    `grant_src` String `json:$.grant_src`,
    `status` String `json:$.status`,
    `note` String `json:$.note`,
    `run_at` Date `json:$.run_at`

ENGINE "MergeTree"
ENGINE_SORTING_KEY "provider, month"
```

`grants.datasource`:
```
TOKEN "treasury_ingest" APPEND
TOKEN "treasury_ingest" READ

SCHEMA >
    `pool` String `json:$.pool`,
    `providers` String `json:$.providers`,
    `kind` String `json:$.kind`,
    `currency` String `json:$.currency`,
    `granted_usd` Nullable(Float64) `json:$.granted_usd`,
    `granted_src` String `json:$.granted_src`,
    `left_usd` Nullable(Float64) `json:$.left_usd`,
    `left_src` String `json:$.left_src`,
    `prepaid_left_usd` Nullable(Float64) `json:$.prepaid_left_usd`,
    `prepaid_left_src` String `json:$.prepaid_left_src`,
    `expires` String `json:$.expires`,
    `note` String `json:$.note`,
    `run_at` Date `json:$.run_at`

ENGINE "MergeTree"
ENGINE_SORTING_KEY "pool"
```

- [ ] **Step 2: Write the six pipes** (all `TOKEN "treasury_web" READ`, `TYPE endpoint`, one NODE each, following `coverage_ep.pipe` format):

```sql
-- balances_ep: latest snapshot per provider
SELECT provider,
       argMax(granted_usd, run_at)      AS granted_usd,
       argMax(spent_usd, run_at)        AS spent_usd,
       argMax(left_usd, run_at)         AS left_usd,
       argMax(prepaid_left_usd, run_at) AS prepaid_left_usd,
       argMax(source, run_at)           AS source,
       argMax(note, run_at)             AS note,
       max(run_at)                      AS run_at
FROM balances GROUP BY provider ORDER BY provider

-- usage_ep
SELECT * FROM usage_monthly ORDER BY month, provider, model

-- cash_monthly_ep: PoC provider_bills.csv equivalent, from the existing payments table
SELECT month, provider,
       round(sum(amount_usd), 2) AS paid_usd,
       round(sum(amount_eur), 2) AS paid_eur
FROM payments WHERE provider != ''
GROUP BY month, provider ORDER BY month, provider

-- revenue_ep
SELECT * FROM revenue_monthly ORDER BY month

-- provider_month_ep
SELECT * FROM provider_month ORDER BY month, provider

-- grants_ep: PoC grants.csv equivalent (Balances tab pools)
SELECT * FROM grants ORDER BY pool
```

- [ ] **Step 3: Validate** — from `apps/operation/forager/tinybird/`: `tb --cloud workspace current` (must show `operations`), then `tb --cloud deploy --check --wait`. Expected: check passes, diff lists exactly 6 new datasources + 6 new pipes, no destructive changes.
- [ ] **Step 4: Deploy** — `tb --cloud deploy --wait`. Then smoke: `curl -s "https://api.europe-west2.gcp.tinybird.co/v0/pipes/cash_monthly_ep.json" -H "Authorization: Bearer $TINYBIRD_OPS_READ_TOKEN"` returns rows (payments already has data). NOTE: datafile-declared tokens regenerate on deploy only if names change — names are unchanged here, so SOPS tokens stay valid; verify with the curl above.
- [ ] **Step 5: Update `tinybird/README.md`** tables (datasource/pipe inventory + which token reads what) and commit: `git add tinybird/ && git commit -m "feat(forager): burn-phase datasources + pipes (balances, meter, usage, revenue, provider_month, grants)"`

### Task B2: HTTP POST support, connector registry, `ingest.record` CLI

**Files:**
- Modify: `apps/operation/forager/ingest/connectors/common.py` (extend `http_json`)
- Create: `apps/operation/forager/ingest/connectors/providers/__init__.py`
- Create: `apps/operation/forager/ingest/connectors/registry.py`
- Create: `apps/operation/forager/ingest/record.py`
- Test: `apps/operation/forager/tests/test_record.py`, extend `tests/test_connectors.py`

**Interfaces:**
- Produces: `http_json(url, headers=None, timeout=30, data=None, method=None)` (data dict → JSON POST body, UA always set); `providers._brow(now, provider, **kw)` balances-row builder and `providers._mrow(month, provider, cost_usd, funding, source, method, today)` meter-row builder; `registry.BALANCE` / `registry.METER` lists of `(slug, fn)`; `registry.CANONICAL` = the FULL canonical slug vocabulary (all `credits.json` pool provider slugs, including manual-forever ones like `io.net`, `perplexity`, `lambda` — NOT just connector slugs, since `ingest.record` must accept them); CLI `python3 -m ingest.record balance|meter …`.

- [ ] **Step 1: Failing tests** — `http_json` POSTs JSON with UA when `data` given; `_brow`/`_mrow` emit exactly the row shapes above (None kept as None, rounding to 2dp); `record balance runpod --left 255.66` appends one `balances` row with `source="manual"` via an injected TB stub; `record meter io.net 2026-06 1234.5 --funding credit` appends one `meter_monthly` row; bad month string (`2026-13`, `26-06`) exits non-zero.
- [ ] **Step 2: Implement.** `common.http_json` gains optional `data`/`method` (bytes or dict; dict → `json.dumps().encode()` + `Content-Type: application/json`), fully backward-compatible. `providers/__init__.py`:

```python
def _brow(now, provider, granted=None, spent=None, left=None, prepaid=None,
          currency="USD", source="api", note=""):
    r2 = lambda v: None if v is None else round(float(v), 2)
    return {"run_at": now, "provider": provider,
            "granted_usd": r2(granted), "spent_usd": r2(spent), "left_usd": r2(left),
            "prepaid_left_usd": r2(prepaid), "currency": currency,
            "source": source, "note": note}

def _mrow(month, provider, cost_usd, funding, source, method, today):
    return {"month": month, "provider": provider, "cost_usd": round(float(cost_usd), 2),
            "funding": funding, "source": source, "method": method, "retrieved_at": today}
```

`registry.py` imports the provider modules (added in B3–B5; start with empty lists plus `CANONICAL`) — final state after B5:

```python
BALANCE = [("openrouter", openrouter.balance), ("deepinfra", deepinfra.balance),
           ("runpod", runpod.balance), ("vast.ai", vast.balance),
           ("digitalocean", digitalocean.balance), ("fireworks", fireworks.balance),
           ("openai", openai_.balance), ("scaleway", scaleway.balance),
           ("daytona", daytona.balance), ("ovhcloud", ovh.balance),
           ("azure", azure.balance)]
METER   = [("deepinfra", deepinfra.meter), ("vast.ai", vast.meter),
           ("ovhcloud", ovh.meter), ("fireworks", fireworks.meter),
           ("aws", aws.meter), ("google", gcp.meter), ("openai", openai_.meter)]
```

`record.py`: argparse two subcommands; builds row via `_brow`/`_mrow` with `source="manual"`; validates month `^\d{4}-(0[1-9]|1[0-2])$` and provider against `registry.CANONICAL`; TB client built from `creds["TINYBIRD_OPS_INGEST_TOKEN"]` but injectable (`main(argv, tb_factory=…)`) for tests; prints the appended row (no secrets involved).
- [ ] **Step 3: Run tests** (`python3 -m pytest tests/test_record.py tests/test_connectors.py -q`) → PASS. Commit: `feat(forager): connector registry, http POST, ingest.record manual-entry CLI`.

### Task B3: REST balance connectors (openrouter, deepinfra, runpod, scaleway, digitalocean, daytona)

**Files:**
- Create: `apps/operation/forager/ingest/connectors/providers/{openrouter,deepinfra,runpod,scaleway,digitalocean,daytona}.py`
- Test: `apps/operation/forager/tests/test_providers_rest.py`

**Interfaces:**
- Consumes: `common.http_json`, `providers._brow`.
- Produces: `balance(creds, now) -> dict` (ONE balances row) per module. Raise on any failure — run.py catches.

Port 1:1 from `/Users/comsom/Github/pollinations/_local/2026-07-01-spend-audit/build/connectors/<name>.py`, re-shaped to emit `_brow` rows. Exact per-connector spec (key names verified against ops SOPS):

| slug | endpoint | auth | creds keys | row mapping |
|---|---|---|---|---|
| `openrouter` | GET `https://openrouter.ai/api/v1/credits` | Bearer | `OPENROUTER_MANAGEMENT_API_KEY` | `data.total_credits`→granted, `data.total_usage`→spent, granted−spent→left |
| `deepinfra` | GET `https://api.deepinfra.com/v1/me?checklist=true` | Bearer | `DEEPINFRA_API_KEY` | `-stripe_balance`→prepaid (negative = credit we HOLD; settled question, don't re-litigate) |
| `runpod` | POST `https://api.runpod.io/graphql` body `{"query":"query { myself { clientBalance currentSpendPerHr } }"}` with `Authorization: Bearer` header (NOT api_key in URL — keeps the key out of error strings) | Bearer | `RUNPOD_API_KEY` | `clientBalance`→prepaid; `note=f"spend_per_hr={currentSpendPerHr}"` (run.py runway alarm reads this) |
| `scaleway` | GET `https://api.scaleway.com/billing/v2beta1/discounts?organization_id={org}` | header `X-Auth-Token` | `SCW_SECRET_KEY`, `SCW_ORGANIZATION_ID` | Σ`value`→granted, Σ`value_used`→spent, Σ`value_remaining`→left; money objects may be `{units,nanos}` — port the PoC's `_money()` helper |
| `digitalocean` | GET `https://api.digitalocean.com/v2/customers/my/balance` | Bearer | `DIGITALOCEAN_TOKEN` | `month_to_date_usage`→spent; if `account_balance`<0 → −balance→left; note: 403 expected until Elliot's team-role bump — connector ships anyway |
| `daytona` | GET `https://app.daytona.io/api/api-keys/current` (validity), then wallet probe `https://billing.app.daytona.io/v2/organization/{org}/wallet` | Bearer | `DAYTONA_API_KEY`, optional `DAYTONA_ORGANIZATION_ID` | wallet `balanceCents/100`→prepaid when probe succeeds; else raise `RuntimeError("wallet OIDC-gated — record manually")` |

- [ ] **Step 1: Failing tests** — one test per connector with a canned JSON fixture via `Capture`-style `http_json` monkeypatch, asserting the emitted row (values, slug, Nones) AND asserting `Authorization`/`X-Auth-Token` header presence and that the runpod URL contains no key. Plus registry test: every `BALANCE`/`METER` slug ∈ `CANONICAL`.
- [ ] **Step 2: Implement** (each module ≈ 15 lines; runpod exemplar):

```python
from ..common import http_json
from . import _brow

def balance(creds, now):
    d = http_json("https://api.runpod.io/graphql",
                  {"Authorization": f"Bearer {creds['RUNPOD_API_KEY']}"},
                  data={"query": "query { myself { clientBalance currentSpendPerHr } }"})
    m = d["data"]["myself"]
    return _brow(now, "runpod", prepaid=m["clientBalance"], source="api",
                 note=f"spend_per_hr={m.get('currentSpendPerHr', 0)}")
```

- [ ] **Step 3: Run tests → PASS. Commit:** `feat(forager): REST balance connectors (openrouter, deepinfra, runpod, scaleway, digitalocean, daytona)`

### Task B4: Signed/CLI/derived balance connectors (ovh, vast, fireworks, openai, azure)

**Files:**
- Create: `apps/operation/forager/ingest/connectors/providers/{ovh,vast,fireworks,openai_,azure}.py` (`openai_` avoids stdlib-ish name clash in imports)
- Test: `apps/operation/forager/tests/test_providers_cli.py`

**Interfaces:**
- Consumes: `common.http_json`, `_brow`; CLI connectors take `run_cmd=subprocess.run` kwarg (injectable).
- Produces: `balance(creds, now[, run_cmd])` per module; `ovh._signed(creds, method, path)` reused by B5's ovh meter.

Specs (port sources: PoC `build/connectors/{ovhcloud,fireworks,openai}.py`, `~/.config/vastai` CLI pattern from PoC `vast.py`; azure from `apps/operation/finance/lib/providers/` azure module):

- **ovh** — signed API: `GET /me/credit/balance/STARTUP_PROGRAM` on `https://eu.api.ovh.com/1.0`. Signature: `"$1$" + sha1(APP_SECRET + "+" + CONSUMER_KEY + "+" + METHOD + "+" + full_url + "+" + body + "+" + timestamp)`; timestamp from unauthenticated `GET /auth/time`. Headers `X-Ovh-Application`, `X-Ovh-Consumer`, `X-Ovh-Timestamp`, `X-Ovh-Signature`. Keys: `OVH_APPLICATION_KEY/SECRET`, `OVH_CONSUMER_KEY`. Row: balance amount EUR × `fx` → granted/left (use the PoC mapping: voucher sum → granted, balance → left), `currency="EUR"`, note carries expiry. `fx` comes in via `balance(creds, now, fx=1.14)` param wired from config by run.py.
- **vast** — `run_cmd(["vastai", "show", "user", "--raw"], …)`, parse stdout JSON `.credit` → prepaid, `source="cli"`.
- **fireworks** — `firectl account list --api-key … --output json` then per-account `firectl account get`; regex `Balance:\s*USD\s*([\d.]+)`; accounts in `FIREWORKS_PREPAID_ACCOUNT_IDS` (default `pollinations`) sum to prepaid, the rest to left (grant). Keys: `FIREWORKS_API_KEY`. `source="cli"`.
- **openai_** — `GET https://api.openai.com/v1/organization/costs?start_time={epoch}&bucket_width=1d&limit=180` paginated via `has_more`/`next_page` (max 20 pages), Bearer `OPENAI_ADMIN_KEY`. spent = Σ bucket amounts since `OPENAI_GRANT_START` (config default `2025-12-01`); granted = config `openai_grant_usd` default `1565.58`; left = granted − spent (`source="api"`, `grant_src` will read `hc` for granted — note it: `note="granted is HC"`).
- **azure** — AAD client-credentials: POST `https://login.microsoftonline.com/{AZURE_TENANT_ID}/oauth2/v2.0/token` (`grant_type=client_credentials`, `scope=https://management.azure.com/.default`, `AZURE_CLIENT_ID/SECRET`) → `GET https://management.azure.com/providers/Microsoft.Billing/billingAccounts/{AZURE_BILLING_ACCOUNT}/billingProfiles/{AZURE_BILLING_PROFILE}/providers/Microsoft.Consumption/credits/balanceSummary?api-version=2024-08-01` → `properties.balanceSummary.estimatedBalance.value`→left, `properties.balanceSummary.currentBalance.value` cross-check in note. Port exact URL/fields from the finance module — verify against it, don't trust this line blindly.

- [ ] **Step 1: Failing tests** — ovh signature test with fixed inputs asserts the exact sha1 hex; vast/fireworks with fake `run_cmd` returning canned stdout; openai pagination test (2 pages); azure two-hop test (token POST then GET). All assert emitted rows.
- [ ] **Step 2: Implement, port from sources above.**
- [ ] **Step 3: Run tests → PASS. Commit:** `feat(forager): signed/CLI balance connectors (ovh, vast, fireworks, openai, azure)`

### Task B5: Meter connectors (deepinfra, ovh, vast, fireworks, aws, gcp, openai)

**Files:**
- Create: `apps/operation/forager/ingest/connectors/providers/{aws,gcp}.py`; extend `deepinfra,ovh,vast,fireworks,openai_` with `meter()`
- Test: `apps/operation/forager/tests/test_providers_meter.py`

**Interfaces:**
- Consumes: `_mrow`, `http_json`, `run_cmd` injection, `ovh._signed`.
- Produces: `meter(creds, months, today[, run_cmd|fx]) -> list[dict]` per module. Registry `METER` finalized (B2 shape).

Specs (port from PoC `build/connectors/accrual.py` — every gotcha below is already encoded there):

- **deepinfra.meter** — `GET https://api.deepinfra.com/payment/usage?from={epoch}&to={epoch}` per month. **Epoch-seconds windows only** (`from=YYYY.MM` silently returns []); **`total_cost` is CENTS — divide by 100**. funding=`prepaid`.
- **ovh.meter** — movements ledger via `_signed`: `GET /me/credit/balance/STARTUP_PROGRAM/movement` (list of IDs) then each movement; sum negative `type=USE` amounts by creation month, EUR×fx. funding=`credit`.
- **vast.meter** — `vastai show invoices --raw`, rows `type=charge` grouped by month. funding=`prepaid`, source=`cli`.
- **fireworks.meter** — `firectl billing list-invoices --api-key …`; POSTPAID+PAID rows; **usage month = invoice month − 1** (cut on the 1st covers the previous month); ignore prepaid top-ups. funding=`cash`, source=`cli`.
- **aws.meter** — `aws ce get-cost-and-usage` subprocess, monthly granularity, two passes: net-of-credits cost → funding=`cash`; `RECORD_TYPE=Credit` amounts (absolute value) → funding=`credit` (this quantifies AWS grant burn). source=`cli`. Default profile = Myceli-direct root (matches PoC).
- **gcp.meter** — write `GCP_BILLING_SA_JSON` to a `tempfile.NamedTemporaryFile`, `gcloud auth activate-service-account --key-file=…`, then `bq query --use_legacy_sql=false --format=json` against the billing export table (copy table name + query verbatim from PoC `_gcp_monthly_export()`); cost EUR×fx → funding=`cash`, credits fields → funding=`credit`, source=`bq`. Expected to FAIL until Elliot re-enables the export + reauth — the try/except in run.py absorbs it; delete the temp key file in a `finally`.
- **openai_.meter** — reuse the B4 costs pull, bucket by month → funding=`credit` (rides the grant), source=`api`.

- [ ] **Step 1: Failing tests** — deepinfra cents+epoch (assert `from=`/`to=` are integers, 877 cents → 8.77); fireworks month−1 shift (invoice 2026-07 → row month 2026-06); aws two-funding split from canned CE JSON; ovh USE-only filter; vast charge grouping; gcp temp-keyfile cleanup (assert file deleted even on raise).
- [ ] **Step 2: Implement.**
- [ ] **Step 3: Run tests → PASS. Commit:** `feat(forager): meter connectors (deepinfra, ovh, vast, fireworks, aws-ce, gcp-bq, openai)`

### Task B6: Usage + revenue connectors

**Files:**
- Create: `apps/operation/forager/ingest/connectors/usage.py`
- Create: `apps/operation/forager/ingest/connectors/providers/stripe.py`
- Test: `apps/operation/forager/tests/test_usage_revenue.py`

**Interfaces:**
- Consumes: `tb.TB` (a TB instance pointed at `pollinations_enter` prod with `TINYBIRD_PROD_READ_TOKEN`); `http_json` for stripe.
- Produces: `usage.monthly_rows(tb_prod, months, today) -> list[dict]` (usage_monthly rows); `stripe.revenue_rows(creds, months, today) -> list[dict]` (revenue_monthly rows).

- [ ] **Step 1: Failing tests** — usage: TB stub returns canned SQL result; assert one query PER month (timeout safety — never one giant scan), window `start_time >= 'M-01 00:00:00' AND start_time < '(M+1)-01 00:00:00'`, `environment='production'` present, rows carry the month + retrieved_at. Stripe: canned 2-page `balance_transactions` fixture → assert pagination via `starting_after`, payouts excluded, cents→EUR /100, gross/refunds/net/fees math (fees = gross − refunds − net).
- [ ] **Step 2: Implement.** Usage SQL per month (ported from PoC `refresh.sh:31-35`, model grain kept for the PoC/treasury models view):

```sql
SELECT '{month}' AS month, model_provider_used AS provider, model_used AS model,
  any(event_type) AS event_type, count() AS requests,
  round(sumIf(total_price, selected_meter_slug LIKE '%pack%'), 4) AS pollen_paid,
  round(sumIf(total_price, selected_meter_slug LIKE '%tier%'), 4) AS pollen_quest,
  round(sumIf(total_cost,  selected_meter_slug LIKE '%pack%'), 4) AS cost_paid,
  round(sumIf(total_cost,  selected_meter_slug LIKE '%tier%'), 4) AS cost_quest
FROM generation_event
WHERE environment = 'production'
  AND start_time >= '{month}-01 00:00:00' AND start_time < '{next_month}-01 00:00:00'
GROUP BY provider, model
```

Stripe: `GET https://api.stripe.com/v1/balance_transactions?limit=100[&starting_after={id}]`, Bearer `STRIPE_API_KEY` (the restricted `rk_` — read-only), loop `has_more`, hard cap 100 pages; skip `type="payout"`; bucket by `created` epoch → month; gross=Σ(amount>0)/100, refunds=Σ|amount<0 of refund types|/100, net=Σnet/100, fees=gross−refunds−net.
- [ ] **Step 3: Run tests → PASS. Commit:** `feat(forager): usage (enter generation_event) + stripe revenue connectors`

### Task B7: Burn engine (`ingest/burn.py`) — the provider_month join

**Files:**
- Create: `apps/operation/forager/ingest/burn.py`
- Test: `apps/operation/forager/tests/test_burn.py`

**Interfaces:**
- Consumes: plain lists of dicts (invoices, payments, meter, usage, balances rows as read back from TB; pools from `load_credits()`), `months`, `config`, `today`. PURE — no I/O, like `gaps.py`.
- Produces: `run(invoices, payments, meter, usage, balances, pools, months, config, today) -> list[dict]` provider_month rows; `grants(pools, balances, today) -> list[dict]` grants rows (pool-level: credits.json base values with src `hc`, overlaid by the latest live balance of the pool's providers with src `api`/`manual` — the PoC grants.csv equivalent); `CANON` dict (TB `model_provider_used` → canonical slug — port the exact mapping from PoC `build/csv_build.py`; e.g. `azure-openai→azure`, `vertex-ai→google`, `bedrock→aws`, `vastai→vast.ai` — copy it verbatim, don't re-derive); `NOTES` dict (provider → what-Elliot-does string).

Engine rules (each is a test):
1. Universe = every (month, provider) where provider appears in any pool's `providers` list OR has usage/invoices/payments/meter that month. Provider slugs canonicalized via `CANON` for usage rows; other inputs already canonical.
2. `invoice_usd` = Σ `amount_usd` of invoices with `status='parsed'`, `period_month==month`, matching provider. `cash_usd` = Σ payments `amount_usd`.
3. `meter_cash_usd`/`meter_prepaid_usd`/`meter_src`: among meter rows for (month, provider), take latest `retrieved_at` per source; precedence `api` > `cli` > `bq` > `manual` (manual only fills holes). `funding=cash` rows sum into `meter_cash_usd`, `funding=prepaid` into `meter_prepaid_usd`; the `credit`-funded meter total feeds rule 4. `meter_src` = the winning source of the family (`''` when no meter rows).
4. `credit_burn_usd`/`credit_src` (pools with billing `sponsored` — and any provider whose pool kind is grant):
   - credit-funded meter total if present → src `meter`;
   - else balance delta: latest `left_usd` snapshot ≤ month start minus latest ≤ month end (both must exist, from `api|cli` sources) → src `delta`;
   - else manual meter row funding=credit → src `manual`;
   - else 0.0, src `''`, `status="needs_data"`, note = `NOTES[provider]`.
5. `usage_cost_usd` = Σ (cost_paid + cost_quest) of canonicalized usage rows. Diagnostic only.
6. `grant_left_usd`/`grant_src`: latest balances `left_usd` (api/cli → `api`, manual → `manual`); else pool's static `left` from credits.json → `hc`; else 0/`''`.
7. `status` (first match wins): `needs_data` (rule 4 fallthrough, or usage_cost > 1 with no invoice+no cash+no meter and no pool); `grant_burn` (sponsored/grant pool AND (usage_cost>1 OR credit_burn>0)); `usage_no_invoice` (usage_cost>1, invoice==0, cash==0, NOT covered by a grant pool); `quiet` (everything ~0); else `ok`.
8. `NOTES` map (manual-forever providers, exact strings): io.net → `"console cloud.io.net → Billing; then: python3 -m ingest.record meter io.net {month} <usd> --funding credit"`; same pattern for perplexity, nebius, lambda, bytedance, modal, elevenlabs, daytona (wallet). These surface in the note column so the dashboard tells Elliot what to run.

- [ ] **Step 1: Failing tests** — one per rule above, plus: CANON maps sample TB providers to canonical slugs; meter precedence api-over-manual; delta needs both snapshots (one snapshot → needs_data); grant_left falls back HC; `grants()` overlay (pool with live balance → api srcs + values from snapshot, pool without → hc srcs + credits.json values, Nones preserved); a full miniature scenario (2 months × 3 providers) asserting complete rows.
- [ ] **Step 2: Implement** (~150 lines, index inputs into dicts first, then one loop over universe).
- [ ] **Step 3: Run tests → PASS. Commit:** `feat(forager): burn engine — provider_month join with source tags + manual-action notes`

### Task B8: Wire into `run.py` + `doctor.py`

**Files:**
- Modify: `apps/operation/forager/ingest/run.py` (new burn stage after reconciliation, before run-log)
- Modify: `apps/operation/forager/ingest/doctor.py` (soft checks)
- Modify: `apps/operation/forager/config.json` (add `openai_grant_usd`, `openai_grant_start` if not present; reuse existing fx key)
- Test: `apps/operation/forager/tests/test_run_burn.py`

**Interfaces:**
- Consumes: everything above. Produces: the daily command stays exactly `python3 -m ingest.doctor && python3 -m ingest.run` — burn always runs; `--backfill` unchanged semantics (usage/meter always cover YTD anyway — they're cheap).

Run-stage order (append to existing flow):
1. `now = "%Y-%m-%d %H:%M:%S"` once. For each `(slug, fn)` in `registry.BALANCE`: try append row(s) to `balances` via `ops_ingest`; per-connector status `ok|err:<sanitized 200 chars>` into the statuses dict already written to `ingest_runs`.
2. Same loop for `registry.METER` with `months = months_ytd(cfg["months_start"])` → append to `meter_monthly`.
3. `usage.monthly_rows(tb_prod, months, today)` → `ops_replace.replace("usage_monthly", rows)` (skip replace when 0 rows — keep last good, note it, same pattern as the wise stage).
4. `stripe.revenue_rows(...)` → `ops_replace.replace("revenue_monthly", rows)` (same 0-row guard).
5. Read back invoices (reuse `dedupe_invoices`), payments, meter, usage, balances via `ops_ingest.sql(...)`; `burn.run(...)` → `ops_replace.replace("provider_month", rows)`; `burn.grants(pools, balances, today)` → `ops_replace.replace("grants", rows)`.
6. Print after the chase list: **runway alarms** — from latest runpod balance note parse `spend_per_hr`; if `prepaid/(spend*24) < 14` print `⚠ runpod ${left} ≈ {days}d at ${hr}/hr`; and every provider_month row with `status="needs_data"` for the current month prints its note (the “what Elliot does” line).

Doctor additions (ALL soft): `clis` (`shutil.which` each of vastai/firectl/aws/bq — report missing ones); `tb-prod` (`SELECT count() FROM generation_event WHERE start_time >= toStartOfDay(now())` with `TINYBIRD_PROD_READ_TOKEN`); `balances-fresh` (max run_at < 26h, only warns once balances has rows).

- [ ] **Step 1: Failing tests** — connector exception doesn't abort run (stub registry with one raiser + one ok, assert both statuses recorded + later stages ran); replace called with replace-token client, append with ingest-token client (two distinct stubs); 0-row usage skips replace; sanitized error contains no key material (feed a raiser whose message embeds `creds["X"]`).
- [ ] **Step 2: Implement. Step 3: full suite `python3 -m pytest tests/ -q` → all green (88 existing + new). Commit:** `feat(forager): burn stage in run.py — balances/meter/usage/revenue/provider_month + runway alarms`

### Task B9: Docs — `CONNECTORS.md`, README, secrets provenance

**Files:**
- Create: `apps/operation/forager/CONNECTORS.md`
- Modify: `apps/operation/forager/README.md` (runbook: record CLI, new outputs, monthly manual routine; extend the Secrets provenance table with any keys first used here)
- Modify: `apps/operation/treasury/PLAN.md` (mark burn phase as EXECUTING/DONE, pointer here)

`CONNECTORS.md` = forager's version of the PoC tracker, three sections: **Programmatic** (per provider: what, endpoint/CLI, keys, funding class, verified date), **Blocked** (digitalocean team-role; gcp export re-enable; AIT Umbrella tenant — each with the operator action), **Manual monthly** (the NOTES map rendered as a checklist: provider, where to read, the exact `ingest.record` command). Plus the settled-questions block copied forward (deepinfra sign, fireworks postpaid month−1, cloudflare not ported, openai granted=HC).

- [ ] **Step 1: Write docs. Step 2: Commit:** `docs(forager): CONNECTORS.md tracker + burn runbook`

### Task B10: PoC cutover — reads ONLY from the operations workspace

**GATE: coordinate before starting.** `_local` is ONE shared folder symlinked into every clone — a live session in any env could be editing this app (it was refreshed 2026-07-03 02:57). Check `ls -la` mtimes and get Elliot's explicit go immediately before this task; run it last, alone.

**Files (in the shared scratch store — `_local/2026-07-01-spend-audit/`, physical `/Users/comsom/Github/pollinations-local/2026-07-01-spend-audit/`):**
- Create: `build/pull_forager.py`
- Modify: `build/refresh.sh` (becomes: pull_forager → build_dashboard)
- Delete: `build/connectors/` (entire directory), `build/csv_build.py` (composition/overlay logic now lives in forager's burn engine), local `credits.json` reads, `data/manual_grid.csv` workflow (superseded by `python3 -m ingest.record` in forager)
- Keep: `build/template.html`, `build/build_dashboard.py`, `dashboard.html` — the UI layer is untouched (end state: `_local` folder stays, basic static HTML)

**Interfaces:**
- Consumes: the six web pipes with `TINYBIRD_OPS_READ_TOKEN` (from operations SOPS via `sops -d`, env-var fallback) — the PoC's ONLY secret.
- Produces: the exact current file contracts so `build_dashboard.py` runs unchanged:
  - `data/live.json` ← `balances_ep` (re-shape rows to the `{provider: {granted, spent, left, live:{…}, source, updated}}` record format)
  - `data/csv/usage.csv` ← `usage_ep`
  - `data/csv/provider_bills.csv` ← `cash_monthly_ep`
  - `data/csv/stripe.csv` ← `revenue_ep` (net_ratio derived = net/gross)
  - `data/csv/grants.csv` ← `grants_ep`
  - `data/csv/provider_costs.csv` ← `provider_month_ep`, exploded into funding-class rows: `invoice_usd`>0 → (cash, source=IV, status=actual); else `meter_cash_usd` → (cash, source per meter_src, actual); `meter_prepaid_usd` → (prepaid, actual); `credit_burn_usd` → (credit, source per credit_src, actual); if ALL are 0 and `usage_cost_usd`>0 → (usage_cost, funding per pool kind, source=TB, status=estimate)

- [ ] **Step 1:** Write `pull_forager.py` + trim `refresh.sh`; delete the retired files.
- [ ] **Step 2:** Run `bash build/refresh.sh`; diff `dashboard_data.json` against the pre-cutover copy — layout identical, numbers within the documented deltas (forager invoice-first numbers may differ from old accrual guesses; list every delta > $50/month for Elliot).
- [ ] **Step 3:** Acceptance greps: `grep -rE "api\.(openai|runpod|wise|deepinfra|scaleway|digitalocean)" build/` → nothing; `grep -r "secrets.local.json\|FIN_ENV\|prod.vars.json" build/` → nothing. The PoC now needs zero provider keys.
- [ ] **Step 4:** `_local` is gitignored in every clone — nothing to commit for this task; hand the change summary (files deleted, deltas > $50/month) to Elliot.

---

## Post-execution verification (controller, not a subagent task)

1. `python3 -m ingest.doctor` — hard checks pass; soft `clis` lists what's missing.
2. `python3 -m ingest.run --backfill` — statuses in output; expect `digitalocean err` (role), `gcp err` (export), everything else ok.
3. Cross-check `provider_month_ep` against known-good PoC numbers: deepinfra meter Apr $4.82 / May $36.26 / Jun $8.77; runpod balance ≈ live console; OVH left ≈ €3,517×fx; openrouter left ≈ $1,627; fireworks meter Jun ≈ $2,432.84. Tolerance: pennies for balances, <2% for meters.
4. Runway alarm prints for runpod (expected ~7d as of 2026-07-03).
5. `needs_data` notes list exactly the manual-forever providers — that's Elliot's monthly routine, matching `CONNECTORS.md`.
6. Rerun `python3 -m ingest.run` (non-backfill) — idempotent: appends new snapshots, replaces derived tables, no dupes in `provider_month`.
7. After B10: PoC refresh works with ONLY network access to Tinybird (no provider keys anywhere under `build/`); dashboard renders identically; every operations datasource and pipe has a named consumer (PoC file, burn engine read-back, or chase workflow) — anything orphaned gets deleted, per the minimal-&-alive constraint.
