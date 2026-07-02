# Treasury Implementation Plan — v2 (invoices-first, shared data platform)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `apps/operation/treasury/` in two independent parts: (1) an **ingest data platform** that daily gathers invoices (Gmail via `gog`), Wise payments, Stripe revenue, prod-Tinybird usage, provider meters and credit balances into **fact tables** in the `operations` Tinybird workspace — reconciling invoices ↔ payments into a single source of truth; (2) a **frontend** (worker + logic module) at `treasury.myceli.ai` that reads those tables and derives the P&L/margins view. The fact tables are UI-agnostic — they will feed all future business UIs (KPI, runway, economics).

**Architecture:**

```
PART 1 — ingest (Python stdlib, daily launchd cron, laptop)
  invoices/harvest  Gmail (gog) → PDF archive (outside git) → extract/label → invoices rows
  connectors        Wise per-transaction · Stripe monthly · prod-TB usage · meters (AWS CE,
                    Vast ledger, DeepInfra usage) · balance connectors (grants snapshot)
  reconcile         invoices ↔ payments ↔ expected-invoice matrix → reconciliation verdicts
      │  push (NDJSON, no intermediate files)
      ▼
STORE — Tinybird workspace `operations` (exists: cloud.tinybird.co/gcp/europe-west2/operations)
  9 fact tables + trivial SELECT* endpoint pipes = the platform contract for every business UI
      │  pipes (read token)
      ▼
PART 2 — web (frontend with the logic; NO data baked in)
  logic/build.js    the P&L join (invoices-first cost derivation), vitest-tested
  worker/index.ts   Basic auth → fetch pipes → build(flows) → inject into template.html
                    also exposes /flows.json + /data.json for future UIs
```

**Tech Stack:** Python 3.11+ stdlib only · `gog` CLI (Gmail, keychain OAuth — installed & authenticated) · `pdftotext` (poppler — installed) · Tinybird (`tb` CLI, Events/Data-Sources/SQL APIs) · CF Worker (Hono, TS, vitest) · SOPS + age · launchd.

## Global Constraints

- **Invoices-first:** provider cost truth order is **invoice → provider meter → pool delta → flagged estimate**. Wise payments NEVER enter cost — they are the verification layer (reconciliation).
- **Facts only in Tinybird:** ingest writes source facts; every derivation (cost accrual, margins, P&L, coverage) lives in `web/logic/`. No treasury-specific joins in the tables — other UIs must be able to reuse them as-is.
- **Independence (hard rule):** treasury reads NOTHING from other apps. Forbidden paths (all referenced by the `_local` prototype; none may survive the port): `apps/operation/kpi/secrets/env.json`, `apps/operation/finance/secrets/.env`, `apps/operation/finance/secrets/pool-history.json` (one-time seed in Task 9 only), `gen.pollinations.ai/secrets/prod.vars.json`, `enter.pollinations.ai/secrets/prod.vars.json`.
- **No data files:** transforms are in-memory; pushes are direct NDJSON (the "daily CSV" of the spec is satisfied without any file touching disk). The only files: PDF archive in `~/Documents/treasury-invoices/` (outside git) and the two SOPS files in `secrets/`.
- **Secrets:** ONE boundary, OPERATION-WIDE — the SHARED `apps/operation/secrets/{env,credits}.json` (sibling of the apps, like `tinybird/`), SOPS with the **operations age key** (Elliot-only recipient; keychain item `operations-age-key`). Every operation app reads from there; existing kpi/economics secrets stay on the old 3-dev key untouched (migrate opportunistically). Tinybird **admin** token never in SOPS (local `.tinyb` only). Worker holds two secrets: `DASHBOARD_PASSWORD`, `TINYBIRD_OPS_READ_TOKEN` (pipe-read only).
- **Tinybird:** workspace `operations` (already created), region `https://api.europe-west2.gcp.tinybird.co`. Always `tb --cloud`. Not an enter workspace — enter's staging-first flow doesn't apply; destructive ops still need explicit permission.
- **LAYOUT (updated 2026-07-02 — the forager split, supersedes older paths in task steps):** the dedicated data app **`apps/operation/forager/`** owns EVERYTHING Tinybird-facing: schemas + pipes (`forager/tinybird/`), all feeders (`forager/ingest/…`), `forager/config.json`, `forager/tests/`. Treasury is a pure frontend (`apps/operation/treasury/web/`) reading pipes with a scoped token — as is every future operation app. Wherever a task step says `ingest/…`, `tests/…`, `config.json`, or `tinybird/…`, read it as under `apps/operation/forager/`.
- **Cloudflare:** Myceli account `b6ec751c0862027ba269faf7029b2501`, worker `myceli-treasury`, custom domain `treasury.myceli.ai`.
- **Money semantics (settled, copy verbatim):** FX pinned EUR→USD 1.14 in `config.json`; months start `2026-01`; pollen paid = pack meter, quest = tier meter; `anthropic`/`openai` Wise bills = non-compute subscriptions; `cloudflare` = infra, excluded from compute; "Amazon" counterparty = office hardware, stays unmatched.
- **Home:** the pollinations monorepo (confirmed) — code public, data in Tinybird, secrets SOPS-scoped.
- **Git:** branch `feat/treasury-app`; commit per task; `npx biome check --write` on TS/JS before commits; **push/PR only on Elliot's explicit go**.
- **Port source:** `_local/2026-07-01-spend-audit/` (referred to as `$SA`). Untouched until Task 12 parity passes.

---

## The 9 fact tables (`operations` workspace)

| Table | Grain | Mode | Source |
|---|---|---|---|
| `invoices` | one row per invoice document | append (sha256-dedup) | catcher (gmail/dropfolder) |
| `payments` | one row per Wise outflow transaction (matched AND unmatched) | replace by month | Wise Activities |
| `usage_monthly` | month × provider × model | replace by month | prod TB `generation_event` |
| `revenue_monthly` | month | replace by month | Stripe balance_transactions |
| `provider_meter_monthly` | month × provider × mechanism (what the provider says we consumed) | replace by month | AWS CE, Vast ledger, DeepInfra usage, AIT-invoice credit lines |
| `grants_snapshot` | daily snapshot per credit/prepaid pool | append | balance connectors + credits.json + manual |
| `manual_readings` | one row per human console reading | append | `record` CLI |
| `reconciliation` | month × provider verdict | full replace | `reconcile.py` |
| `ingest_runs` | one row per cron run | append | orchestrator |

Future: D1 (enter) facts join as new tables under the same conventions — nothing here blocks it.

## File Structure (end state)

```
apps/operation/treasury/
  PLAN.md  README.md  .gitignore  config.json
  (secrets: SHARED ../secrets/ — apps/operation/secrets/{env,credits}.json, ops age key)
  ingest/
    __init__.py  creds.py  tb.py  doctor.py  run.py  record.py  reconcile.py
    connectors/
      __init__.py  common.py  wise.py  stripe.py  usage.py  meter.py
      openrouter.py deepinfra.py runpod.py vast.py digitalocean.py cloudflare.py fireworks.py
    invoices/
      __init__.py  harvest.py  extract.py  label.py
      parsers/__init__.py  parsers/automat_it.py  parsers/generic.py
    transform/__init__.py  transform/grants.py
  (Tinybird schemas/pipes: SHARED ../tinybird/ folder — apps/operation/tinybird/ — not in this app)
  web/
    template.html                                  ← copied UNCHANGED from $SA
    logic/build.js  logic/build.test.js            ← THE join (vitest)
    worker/index.ts  wrangler.toml  package.json  tsconfig.json
  cron/refresh.sh  cron/ai.myceli.treasury-refresh.plist
  tests/  (pytest: test_creds test_tb test_connectors test_extract test_reconcile test_no_leaks
           + fixtures/*_synthetic.json — invented numbers ONLY)
```

---

### Task 1: Scaffold + SOPS boundary (new age key, Elliot-only)

**Files:**
- Create: `.gitignore`, `config.json`, `ingest/__init__.py`, `ingest/creds.py`, `tests/test_creds.py`, `tests/test_no_leaks.py`
- Create (operator): `apps/operation/secrets/env.json`, `apps/operation/secrets/credits.json` (the SHARED operation-wide secrets folder)
- Modify: `/.sops.yaml` (repo root)

**Interfaces:**
- Produces: `creds.load_creds() -> dict` (SOPS + env overrides) · `creds.load_config() -> dict` · `creds.load_credits() -> dict`. Later tasks use ONLY these three for secrets/config.

- [ ] **Step 1: Generate the treasury age key (operator)**

```bash
age-keygen 2>/dev/null | tee /dev/tty | grep -v '^#' | tee -a ~/.config/sops/age/keys.txt \
  >> "$HOME/Library/Application Support/sops/age/keys.txt"
# ^ BOTH locations: with XDG_CONFIG_HOME unset, macOS sops reads ONLY the Application Support
#   file — a key appended only to ~/.config silently fails decrypt (hit 2026-07-02).
# note "public key: age1..." → OPERATIONS_RECIPIENT
security add-generic-password -s operations-age-key -a etfy -w 'AGE-SECRET-KEY-1...'  # keychain backup
```

- [ ] **Step 2: Add the treasury rule to `/.sops.yaml` — MUST be the FIRST rule** (sops takes the first matching creation_rule; the generic `env\.json$` rule would otherwise encrypt treasury secrets to the 3-dev shared keys):

```yaml
creation_rules:
    - path_regex: apps/operation/secrets/.*
      age: <OPERATIONS_RECIPIENT>
    - path_regex: (\.env$|\.encrypted\.env$|\.vars.json$|env\.json$)
      age: >-
        age1k85e3hjd2tv3wtjv7npjtmp9pwr5cfda22hyz9ajg06uqel3cc5s6c34rd,age1e8fctjh7tttmrkukrshp9dvl50lqhx22p9wt907avc96pj9pfdzs92shdc,age1ry4pg28f38yrnd5nhdl2zrkh8f7vgfu0p6hdu8lwpvpa7vz8ag6qqxy4d6
```

- [ ] **Step 3: `.gitignore` + `config.json`**

`.gitignore`:
```
.tinyb
node_modules/
dist/
*.log
.dev.vars
__pycache__/
```

`config.json` (non-secret, committed):
```json
{
    "tb_ops_api": "https://api.europe-west2.gcp.tinybird.co",
    "tb_prod_api": "https://api.europe-west2.gcp.tinybird.co",
    "fx_eur_usd": 1.14,
    "months_start": "2026-01",
    "archive_dir": "~/Documents/treasury-invoices",
    "gog_account": "elliot@myceli.ai",
    "aws_profile": "myceli-management",
    "repull_months": 2,
    "recon_tolerance_pct": 0.02,
    "recon_tolerance_usd": 2.0,
    "recon_accepted": []
}
```
(`gog_account`: set to whichever account `gog` is authenticated with for the invoice mailbox — verify with `gog gmail -a <acct> search 'newer_than:1d'`. `recon_accepted`: `"YYYY-MM:provider"` entries silence known-and-accepted gaps.)

- [ ] **Step 4: Write the failing tests**

`tests/test_creds.py`:
```python
"""creds is the ONLY env boundary. Run: cd apps/operation/treasury && python3 -m pytest tests/ -q"""
import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from ingest import creds

def test_config_loads():
    c = creds.load_config()
    assert c["fx_eur_usd"] == 1.14
    assert c["months_start"] == "2026-01"
    assert c["archive_dir"].startswith("/")   # ~ expanded

def test_env_overrides(monkeypatch):
    monkeypatch.setenv("WISE_API_TOKEN", "from-env")
    monkeypatch.setattr(creds, "_sops_decrypt", lambda p: {"WISE_API_TOKEN": "from-sops", "X": "y"})
    c = creds.load_creds()
    assert c["WISE_API_TOKEN"] == "from-env"
    assert c["X"] == "y"
```

`tests/test_no_leaks.py`:
```python
"""No plaintext data/secrets tracked; no cross-app references in code. Guards every later task."""
import json, os, subprocess

APP = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))   # .../treasury
OPS = os.path.dirname(APP)                                              # .../operation
SCOPES = ["apps/operation/treasury", "apps/operation/secrets", "apps/operation/tinybird"]

def _tracked():
    out = subprocess.run(["git", "ls-files", *SCOPES], capture_output=True, text=True,
                         cwd=os.path.join(APP, "..", "..", ".."))
    return [p for p in out.stdout.splitlines() if p.strip()]

def test_no_data_files_tracked():
    allowed_json = {"apps/operation/secrets/env.json", "apps/operation/secrets/credits.json",
                    "apps/operation/treasury/config.json",
                    "apps/operation/treasury/web/package.json",
                    "apps/operation/treasury/web/package-lock.json",
                    "apps/operation/treasury/web/tsconfig.json"}
    for p in _tracked():
        assert not p.endswith(".csv"), f"CSV tracked: {p}"
        assert not p.endswith(".pdf"), f"PDF tracked: {p}"
        if p.endswith(".json") and "/fixtures/" not in p:
            assert p in allowed_json, f"unexpected JSON tracked: {p}"
        if "/fixtures/" in p:
            assert p.endswith("_synthetic.json"), f"fixture not marked synthetic: {p}"

def test_secrets_are_encrypted():
    for name in ("env.json", "credits.json"):
        p = os.path.join(OPS, "secrets", name)
        if os.path.exists(p):
            assert "sops" in json.load(open(p)), f"{name} is NOT sops-encrypted"

def test_no_cross_app_paths_in_code():
    banned = ["operation/kpi", "operation/finance", "gen.pollinations.ai/secrets",
              "enter.pollinations.ai/secrets"]
    for root, _, files in os.walk(APP):
        if any(s in root for s in ("node_modules", "__pycache__", ".git")):
            continue
        for f in files:
            if f.endswith((".py", ".sh", ".ts", ".js")) and f != "PLAN.md":
                src = open(os.path.join(root, f), errors="ignore").read()
                for b in banned:
                    assert b not in src, f"{f} references {b}"
```

- [ ] **Step 5: Run to verify fail** — `python3 -m pytest tests/ -q` → `ModuleNotFoundError: ingest.creds`.

- [ ] **Step 6: Write `ingest/creds.py`**

```python
"""The ONLY env boundary. Secrets live in the SHARED apps/operation/secrets/ (ops age key);
treasury reads no other app's secrets — by design."""
import json, os, subprocess

APP = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))      # .../apps/operation/treasury
OPS_SECRETS = os.path.join(os.path.dirname(APP), "secrets")            # .../apps/operation/secrets

def _sops_decrypt(path):
    out = subprocess.run(["sops", "-d", path], capture_output=True, text=True, timeout=30)
    if out.returncode != 0:
        raise RuntimeError(f"sops decrypt failed for {os.path.basename(path)}: {out.stderr.strip()[:200]}")
    return json.loads(out.stdout)

def load_creds():
    c = _sops_decrypt(os.path.join(OPS_SECRETS, "env.json"))
    c.update({k: os.environ[k] for k in c if k in os.environ})
    return c

def load_config():
    c = json.load(open(os.path.join(APP, "config.json")))
    c["archive_dir"] = os.path.expanduser(c["archive_dir"])
    return c

def load_credits():
    return _sops_decrypt(os.path.join(OPS_SECRETS, "credits.json"))
```

- [ ] **Step 7: Create the SOPS files (operator).** `secrets/credits.json` = `$SA/data/credits.json` **plus a new required field per pool**: `"billing": "monthly" | "prepaid" | "reseller" | "subscription" | "sponsored"` (drives the expected-invoice matrix in Task 7 — set it per pool while copying: reseller=AWS·Automat-IT, sponsored=Azure sponsorship, prepaid=RunPod/Vast/DeepInfra/Fireworks/Lambda/io.net/Daytona/Modal/OpenRouter, subscription=Anthropic/OpenAI-ChatGPT, monthly=the rest). Then:

```bash
mkdir -p apps/operation/secrets
cp $SA/data/credits.json apps/operation/secrets/credits.json  # add "billing" per pool, then:
sops -e -i apps/operation/secrets/credits.json
cat > /tmp/tenv.json <<'EOF'
{
  "TINYBIRD_OPS_INGEST_TOKEN": "",
  "TINYBIRD_OPS_READ_TOKEN": "",
  "TINYBIRD_PROD_READ_TOKEN": "",
  "WISE_API_TOKEN": "",
  "WISE_BUSINESS_PROFILE_ID": "",
  "STRIPE_API_KEY": "",
  "OPENROUTER_API_KEY": "",
  "DEEPINFRA_API_KEY": "",
  "RUNPOD_API_KEY": "",
  "DIGITALOCEAN_TOKEN": "",
  "CLOUDFLARE_API_TOKEN": "",
  "CLOUDFLARE_ACCOUNT_ID": "",
  "FIREWORKS_API_KEY": "",
  "FIREWORKS_API_KEY_NEW": ""
}
EOF
cp /tmp/tenv.json apps/operation/secrets/env.json && sops -e -i apps/operation/secrets/env.json && rm /tmp/tenv.json
```
`STRIPE_API_KEY` = new **restricted read-only** key (Balance transactions: Read). Wise/provider values copied once from where the prototype found them; never referenced again. AWS/Azure/vastai/gog auth via local CLIs, not SOPS. Tinybird tokens land in Task 2.

- [ ] **Step 8: Run to verify pass** — `python3 -m pytest tests/ -q` → PASS.

- [ ] **Step 9: Commit**

```bash
git checkout -b feat/treasury-app
git add .sops.yaml apps/operation/treasury apps/operation/secrets
git commit -m "feat(treasury): scaffold + operation-wide sops boundary"
```

---

### Task 2: Tinybird `operations` — datasources, pipes, tokens

**Files (all under the SHARED `apps/operation/tinybird/` — NOT inside treasury):**
- Create: `apps/operation/tinybird/datasources/` — 9 `.datasource` files; `apps/operation/tinybird/pipes/` — endpoint pipes (Phase 1's four datasources + three pipes are owned by `PLAN-INVOICES.md` Task I1 and may already exist — this task adds the remaining five tables + their pipes)

**Interfaces:**
- Produces: the schemas below (every later push/query names these columns exactly) + tokens `treasury_ingest` (DATASOURCES:CREATE — needed by `mode=replace` — plus APPEND+READ on all 9) and `treasury_web` (PIPES:READ on the endpoint pipes only) → into `secrets/env.json`; plus static token `treasury_generation_event_read` in the `pollinations_enter` workspace (DATASOURCES:READ:generation_event) → `TINYBIRD_PROD_READ_TOKEN`.

- [ ] **Step 1: Auth the CLI against the existing workspace (operator)** — `cd apps/operation/tinybird && tb auth` with an admin token from https://cloud.tinybird.co/gcp/europe-west2/operations/tokens (`.tinyb` is gitignored; admin token NEVER in SOPS). Verify: `tb --cloud workspace current` → `operations`.

- [ ] **Step 2: Write the 9 datasource files**

`invoices.datasource` (schema owned by `PLAN-INVOICES.md` Task I1 — kept identical here):
```
SCHEMA >
    `sha256` String,
    `msgid` String,
    `provider` String,
    `category` String,
    `kind` String,
    `period_month` String,
    `amount` Float64,
    `currency` String,
    `amount_usd` Float64,
    `invoice_number` String,
    `issued_at` Date,
    `source` String,
    `file_ref` String,
    `status` String,
    `ingested_at` Date

ENGINE "MergeTree"
ENGINE_SORTING_KEY "provider, period_month, issued_at"
```
(`category`: compute|infra|saas|payroll|self|other — compute P&L filters `category='compute'` · `kind`: monthly_bill|prepaid_topup|reseller|subscription|unknown · `source`: email|inbox · `status`: parsed|needs_label · `msgid` for Invoice/Receipt pair dedupe · `file_ref`: path under archive_dir.)

`payments.datasource` (per-transaction — matching needs it; unmatched outflows keep `provider` empty so runway/infra UIs see everything):
```
SCHEMA >
    `paid_at` Date,
    `month` String,
    `provider` String,
    `counterparty` String,
    `amount_eur` Float64,
    `amount_usd` Float64,
    `wise_ref` String,
    `pulled_at` Date

ENGINE "MergeTree"
ENGINE_SORTING_KEY "month, provider, paid_at"
```

`usage_monthly.datasource`:
```
SCHEMA >
    `month` String,
    `provider` String,
    `model` String,
    `event_type` String,
    `requests` UInt64,
    `pollen_paid` Float64,
    `pollen_quest` Float64,
    `cost_paid` Float64,
    `cost_quest` Float64,
    `pulled_at` Date

ENGINE "MergeTree"
ENGINE_SORTING_KEY "month, provider, model"
```

`revenue_monthly.datasource`:
```
SCHEMA >
    `month` String,
    `gross_eur` Float64,
    `fees_eur` Float64,
    `refunds_eur` Float64,
    `net_eur` Float64,
    `net_ratio` Float64,
    `pulled_at` Date

ENGINE "MergeTree"
ENGINE_SORTING_KEY "month"
```

`provider_meter_monthly.datasource`:
```
SCHEMA >
    `month` String,
    `provider` String,
    `reported_usd` Float64,
    `mechanism` String,
    `pulled_at` Date

ENGINE "MergeTree"
ENGINE_SORTING_KEY "month, provider, mechanism"
```
(`mechanism`: aws_ce|vast_ledger|deepinfra_usage|ait_invoice_credit.)

`grants_snapshot.datasource`:
```
SCHEMA >
    `as_of` Date,
    `pool` String,
    `providers` String,
    `kind` String,
    `billing` String,
    `currency` String,
    `granted` Nullable(Float64),
    `granted_src` String,
    `left` Nullable(Float64),
    `left_src` String,
    `prepaid_left` Nullable(Float64),
    `prepaid_left_src` String,
    `note` String,
    `connection` String,
    `expires` String,
    `verify` String,
    `source` String

ENGINE "MergeTree"
ENGINE_SORTING_KEY "pool, as_of"
```

`manual_readings.datasource`:
```
SCHEMA >
    `recorded_at` Date,
    `pool` String,
    `field` String,
    `value` Float64,
    `note` String

ENGINE "MergeTree"
ENGINE_SORTING_KEY "pool, field, recorded_at"
```

`reconciliation.datasource`:
```
SCHEMA >
    `month` String,
    `provider` String,
    `billing` String,
    `status` String,
    `invoice_usd` Float64,
    `payment_usd` Float64,
    `delta_usd` Float64,
    `invoice_refs` String,
    `payment_refs` String,
    `note` String,
    `run_at` Date

ENGINE "MergeTree"
ENGINE_SORTING_KEY "month, provider"
```
(`status`: ok|ok_credit|missing_invoice|missing_payment|amount_mismatch|accepted.)

`ingest_runs.datasource`:
```
SCHEMA >
    `run_at` DateTime,
    `ok` UInt8,
    `statuses` String,
    `notes` String

ENGINE "MergeTree"
ENGINE_SORTING_KEY "run_at"
```

- [ ] **Step 3: Write the endpoint pipes — the platform contract.** Ten trivial pipes; each is `TYPE endpoint`. Nine are `SELECT * FROM <table>` named `<table>_ep` (for `grants_snapshot`, only the latest snapshot: `SELECT * FROM grants_snapshot WHERE as_of = (SELECT max(as_of) FROM grants_snapshot)` as `grants_current_ep`). The tenth pre-shapes balance history for pool-delta derivation:

`grants_monthly_end_ep.pipe`:
```
NODE monthly_end
SQL >
    SELECT pool, formatDateTime(toStartOfMonth(as_of), '%Y-%m') AS month,
           argMax(left, as_of) AS month_end_left
    FROM grants_snapshot
    WHERE left IS NOT NULL
    GROUP BY pool, month
    ORDER BY pool, month

TYPE endpoint
```

- [ ] **Step 4: Validate, deploy, create tokens**

```bash
tb --cloud deploy --check --wait   # expect: OK
tb --cloud deploy --wait           # 9 datasources + 10 pipes
```
Then in the UI (tokens page): create `treasury_ingest` and `treasury_web` per Interfaces; create `treasury_generation_event_read` in `pollinations_enter`; `sops secrets/env.json` to store all three. Smoke: `curl -s .../v0/pipes/reconciliation_ep.json -H "Authorization: Bearer $WEB"` → `{"data":[]}` not 403.

- [ ] **Step 5: Commit** — `git add apps/operation/tinybird && git commit -m "feat(operations): shared tinybird platform — full schema set"`

---

### Task 3: `ingest/tb.py` — the Tinybird client

**Files:**
- Create: `ingest/tb.py`, `tests/test_tb.py`

**Interfaces:**
- Produces: `class TB(api, token)` — `sql(query) -> list[dict]` · `append(datasource, rows: list[dict])` (Events NDJSON) · `replace(datasource, rows, condition=None)` (Data Sources multipart NDJSON; refuses 0 rows). All Tinybird I/O goes through this class.

- [ ] **Step 1: Failing tests** (`tests/test_tb.py`) — patch `ingest.tb._http`, assert construction:

```python
import json, os, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from ingest import tb

class Capture:
    def __init__(self): self.calls = []
    def __call__(self, url, data=None, headers=None, method=None, timeout=120):
        self.calls.append({"url": url, "data": data, "headers": headers, "method": method})
        return {"data": [{"x": 1}], "successful_rows": 2}

def _client(cap):
    tb._http = cap
    return tb.TB("https://api.example.tinybird.co", "tok123")

def test_sql_posts_query():
    cap = Capture(); t = _client(cap)
    assert t.sql("SELECT 1") == [{"x": 1}]
    c = cap.calls[0]
    assert c["url"].endswith("/v0/sql")
    assert c["headers"]["Authorization"] == "Bearer tok123"

def test_append_uses_events_ndjson():
    cap = Capture(); t = _client(cap)
    t.append("ingest_runs", [{"run_at": "2026-07-02 08:30:00", "ok": 1}])
    c = cap.calls[0]
    assert "/v0/events?name=ingest_runs" in c["url"]
    assert json.loads(c["data"].decode().splitlines()[0])["ok"] == 1

def test_replace_uses_datasources_multipart():
    cap = Capture(); t = _client(cap)
    t.replace("usage_monthly", [{"month": "2026-07"}], condition="month='2026-07'")
    c = cap.calls[0]
    assert "/v0/datasources?" in c["url"] and "mode=replace" in c["url"]
    assert "replace_condition=" in c["url"]
    assert b'{"month": "2026-07"}' in c["data"]

def test_replace_empty_rows_is_refused():
    cap = Capture(); t = _client(cap)
    try:
        t.replace("usage_monthly", [], condition=None)
        assert False, "must refuse full replace with 0 rows"
    except ValueError:
        pass
```

- [ ] **Step 2: Run → FAIL. Step 3: Implement:**

```python
"""Tinybird I/O. Safety: replace with zero rows is refused — a failed pull never wipes a table."""
import json, urllib.parse, urllib.request

def _http(url, data=None, headers=None, method=None, timeout=120):
    req = urllib.request.Request(url, data=data, headers=headers or {}, method=method)
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.load(r)

_BOUNDARY = "TbTreasuryBoundary7f3a9c"

class TB:
    def __init__(self, api, token):
        self.api, self.token = api.rstrip("/"), token

    def _auth(self):
        return {"Authorization": f"Bearer {self.token}"}

    def sql(self, query):
        body = urllib.parse.urlencode({"q": query + " FORMAT JSON"}).encode()
        return _http(f"{self.api}/v0/sql", data=body, headers=self._auth()).get("data", [])

    def append(self, datasource, rows):
        if not rows:
            return {"successful_rows": 0}
        nd = "\n".join(json.dumps(r) for r in rows).encode()
        url = f"{self.api}/v0/events?name={urllib.parse.quote(datasource)}"
        return _http(url, data=nd, headers=self._auth(), method="POST")

    def replace(self, datasource, rows, condition=None):
        if not rows:
            raise ValueError(f"refusing to replace {datasource} with 0 rows")
        nd = "\n".join(json.dumps(r) for r in rows).encode()
        q = {"name": datasource, "mode": "replace", "format": "ndjson"}
        if condition:
            q["replace_condition"] = condition
        url = f"{self.api}/v0/datasources?" + urllib.parse.urlencode(q)
        body = (f"--{_BOUNDARY}\r\nContent-Disposition: form-data; name=\"ndjson\"; "
                f"filename=\"rows.ndjson\"\r\nContent-Type: application/octet-stream\r\n\r\n"
                ).encode() + nd + f"\r\n--{_BOUNDARY}--\r\n".encode()
        headers = {**self._auth(), "Content-Type": f"multipart/form-data; boundary={_BOUNDARY}"}
        d = _http(url, data=body, headers=headers, method="POST", timeout=300)
        if d.get("error"):
            raise RuntimeError(f"tb replace {datasource}: {d['error']}")
        return d
```

- [ ] **Step 4: Run → PASS. Step 5: Live smoke** (append+read one `ingest_runs` row against `operations`, as in the Task 8 verify snippet). **Commit:** `git add ingest/tb.py tests/test_tb.py && git commit -m "feat(treasury): tinybird client"`

---

### Task 4: Fact connectors — ported, severed, reshaped

**Files:**
- Create: `ingest/connectors/` — port from `$SA/build/connectors/`, plus new `usage.py`, `meter.py` (from `accrual.py`)
- Test: `tests/test_connectors.py`

**Interfaces:**
- Consumes: `creds.*`, `tb.TB`
- Produces: `wise.outflow_rows(creds, months, fx, today) -> list[dict]` (payments-shaped, per transaction, unmatched included) · `stripe.monthly_revenue(months, creds)` (signature unchanged) · `usage.pull_month(tb_prod, ym, today) -> list[dict]` (usage_monthly-shaped) · `meter.rows(creds, config, months, today) -> list[dict]` (provider_meter_monthly-shaped) · balance connectors keep `NAME` + `fetch(creds)`.

- [ ] **Step 1: Copy + sever** — `cp -r $SA/build/connectors ingest/connectors && rm -rf ingest/connectors/__pycache__`, then:
  - `common.py`: DELETE `FIN_ENV`, `_sops_gen`, `load_creds`, `LOCAL_SECRETS`. Keep `http_json`, `months_ytd`, `strip_html`, `UA`, `TODAY`. `FX_EUR_USD` now read from `config.json` (same one-liner loader as the prototype used for nothing — new code):
    ```python
    import json as _json, os as _os
    FX_EUR_USD = _json.load(open(_os.path.join(_os.path.dirname(_os.path.dirname(_os.path.dirname(_os.path.abspath(__file__)))), "config.json")))["fx_eur_usd"]
    ```
  - `stripe.py`: DELETE `_repo_root` + the sops fallback in `_get_key` (creds/env only).
  - `wise.py`: keep `ALIAS`, `_match`, `_fetch_month`, `_amount`; REPLACE the two aggregators with one per-transaction emitter (this powers reconciliation AND the monthly view):
    ```python
    def outflow_rows(creds, months, fx, today):
        """One payments row per outgoing Wise transaction. Unmatched counterparties keep
        provider='' — payroll/office stay visible for future runway/infra UIs."""
        rows = []
        for month in months:
            for a in _fetch_month(creds, month):
                if a.get("status") not in ("COMPLETED", "IN_PROGRESS") or a.get("type") == "CARD_CHECK":
                    continue
                cp = strip_html(a.get("title", ""))
                pv, pc = _amount(a.get("primaryAmount", ""))
                sv, _ = _amount(a.get("secondaryAmount", ""))
                eur = pv if pc == "EUR" else (sv if sv else pv)
                if "positive" not in (a.get("primaryAmount") or "") and eur > 0:
                    eur = -eur
                if eur >= 0:
                    continue
                rows.append({"paid_at": (a.get("createdOn") or f"{month}-15")[:10], "month": month,
                             "provider": _match(cp) or "", "counterparty": cp,
                             "amount_eur": round(-eur, 2), "amount_usd": round(-eur * fx, 2),
                             "wise_ref": str(a.get("id") or ""), "pulled_at": today})
        return rows
    ```
  - `accrual.py` → RENAME `meter.py`: DELETE `POOL_HISTORY`/`pool_history` (pool deltas are now derived by the frontend from `grants_monthly_end_ep`) and DELETE `automat_invoices` (the AIT parser moves into the invoice catcher, Task 5). Keep `aws_ce_monthly` (add `profile` param → `aws --profile`), `vast_monthly`, `deepinfra_monthly`. Add the assembler:
    ```python
    def rows(creds, config, months, today):
        out = []
        for prov, mech, data in (("aws", "aws_ce", aws_ce_monthly(profile=config["aws_profile"])),
                                 ("vast.ai", "vast_ledger", vast_monthly()),
                                 ("deepinfra", "deepinfra_usage", deepinfra_monthly(creds))):
            for m, usd in data.items():
                if m in months and usd > 0.5:
                    out.append({"month": m, "provider": prov, "reported_usd": round(usd, 2),
                                "mechanism": mech, "pulled_at": today})
        return out
    ```
  - `run.py` (old live.json writer): DELETE.
  - Write `usage.py` — the prod pull (SQL verbatim from `$SA/build/refresh.sh:31-35`, own read token):
    ```python
    _COLS = ("model_provider_used AS provider, model_used AS model, any(event_type) AS event_type, "
             "count() AS requests, "
             "round(sumIf(total_price, selected_meter_slug LIKE '%pack%'),4) AS pollen_paid, "
             "round(sumIf(total_price, selected_meter_slug LIKE '%tier%'),4) AS pollen_quest, "
             "round(sumIf(total_cost, selected_meter_slug LIKE '%pack%'),4) AS cost_paid, "
             "round(sumIf(total_cost, selected_meter_slug LIKE '%tier%'),4) AS cost_quest")

    def _bounds(ym):
        y, m = int(ym[:4]), int(ym[5:7])
        return f"{ym}-01", (f"{y+1:04d}-01-01" if m == 12 else f"{y:04d}-{m+1:02d}-01")

    def pull_month(tb_prod, ym, today):
        lo, hi = _bounds(ym)
        rows = tb_prod.sql(f"SELECT {_COLS} FROM generation_event "
                           f"WHERE start_time >= '{lo}' AND start_time < '{hi}' "
                           f"AND environment='production' GROUP BY provider, model")
        return [{"month": ym, "provider": r["provider"] or "(none)", "model": r["model"] or "(none)",
                 "event_type": r["event_type"] or "", "requests": int(r["requests"] or 0),
                 "pollen_paid": float(r["pollen_paid"] or 0), "pollen_quest": float(r["pollen_quest"] or 0),
                 "cost_paid": float(r["cost_paid"] or 0), "cost_quest": float(r["cost_quest"] or 0),
                 "pulled_at": today} for r in rows]
    ```

- [ ] **Step 2: Tests** (`tests/test_connectors.py`) — synthetic only:

```python
from ingest.connectors import wise

def test_wise_counterparty_matching():
    assert wise._match("Google Cloud EMEA Ltd") == "google"
    assert wise._match("AUTOMAT-IT OU") == "aws"
    assert wise._match("Amazon retail") is None      # office hardware stays unmatched
    assert wise._match("LETS DEEL LTD") is None      # payroll is ops, not compute

def test_outflow_rows_keeps_unmatched(monkeypatch):
    monkeypatch.setattr(wise, "_fetch_month", lambda c, m: [
        {"status": "COMPLETED", "type": "TRANSFER", "title": "RunPod",
         "primaryAmount": "100 EUR", "secondaryAmount": "", "createdOn": "2026-07-01", "id": 11},
        {"status": "COMPLETED", "type": "TRANSFER", "title": "SO LAB X",
         "primaryAmount": "50 EUR", "secondaryAmount": "", "createdOn": "2026-07-02", "id": 12}])
    rows = wise.outflow_rows({}, ["2026-07"], fx=1.14, today="2026-07-02")
    assert {r["provider"] for r in rows} == {"runpod", ""}
    assert all(r["wise_ref"] for r in rows)
```

- [ ] **Step 3: Run all tests — the leak guard proves the severing.** `python3 -m pytest tests/ -q` → PASS.
- [ ] **Step 4: Commit** — `git add ingest/connectors tests/test_connectors.py && git commit -m "feat(treasury): fact connectors ported and severed"`

---

### Task 5: The invoice catcher — harvest, extract, label

**Files:**
- Create: `ingest/invoices/harvest.py` (port of `$SA/invoices/harvest_invoices.py`), `ingest/invoices/extract.py`, `ingest/invoices/parsers/__init__.py`, `ingest/invoices/parsers/automat_it.py`, `ingest/invoices/parsers/generic.py`, `ingest/invoices/label.py`
- Test: `tests/test_extract.py`

**Interfaces:**
- Consumes: `gog` CLI (`config["gog_account"]`), `pdftotext`, `tb.TB`, `creds.load_credits()`
- Produces: `harvest.run(config, tb_ops, today, since=None) -> dict` (downloads new PDFs to archive, extracts, appends `invoices` rows + extras, returns counts) · `extract.parse(pdf_path, sender_hint, fx, today) -> dict` (`{invoice: {...} | None, meter: [...], readings: [...], status}`) · `python3 -m ingest.invoices.label` CLI for `needs_label` rows.

- [ ] **Step 1: Port `harvest.py`** from `$SA/invoices/harvest_invoices.py` — the `PROVIDERS` classifier, `DOMAINS` sweep and `QUERIES` carry over verbatim; changes:
  - Output dir = `config["archive_dir"]/<provider>/` (files named `<YYYY-MM>_<msgid8>_<origname>.pdf`); still idempotent by msgid8, **plus** sha256 dedupe against Tinybird: skip any file whose hash is already in `SELECT sha256 FROM invoices`.
  - `gog` calls go through one helper: `_gog(config, *args)` → `subprocess.run(["gog", "-a", config["gog_account"], "--json", ...])`. Search: `gog gmail search '<query>'`; fetch message + attachment ids: `gog gmail get <messageId>`; download: `gog gmail attachment <messageId> <attachmentId> --out <path>` (verify exact download flag with `gog gmail attachment --help` during implementation; adjust the helper only).
  - Daily mode: queries get `newer_than:3d` appended (overlap absorbs slow email); backfill mode passes `since="2026/01/01"` (the prototype's `after:` window).
  - After download, each new PDF goes through `extract.parse(path, sender_hint=provider_slug)`; the returned `invoice` row is appended to `invoices` (status `parsed` or `needs_label`), `meter` extras to `provider_meter_monthly` (append), `readings` extras to `manual_readings` (append, note=`"auto: invoice footer"`).
  - Non-cost slugs from the classifier (`self-issued`, payroll/SaaS like `deel`, `slack`…) are still archived but appended with `kind="unknown", status="needs_label"` — nothing is silently dropped; labeling decides.

- [ ] **Step 2: Write `extract.py` + parsers**

`extract.py`:
```python
"""PDF → text → parser registry. First parser that recognises the text wins.
Returns {"invoice": row|None, "meter": [rows], "readings": [rows], "status": "parsed"|"needs_label"}."""
import hashlib, subprocess
from .parsers import automat_it, generic

PARSERS = [automat_it, generic]   # specific first; generic ALWAYS matches last

def pdf_text(path):
    return subprocess.run(["pdftotext", "-layout", path, "-"],
                          capture_output=True, text=True, timeout=30).stdout

def sha256(path):
    return hashlib.sha256(open(path, "rb").read()).hexdigest()

def parse(path, sender_hint, fx, today):
    txt = pdf_text(path)
    for p in PARSERS:
        if p.matches(txt, sender_hint):
            out = p.parse(txt, sender_hint, fx, today)
            if out.get("invoice"):
                out["invoice"].update({"sha256": sha256(path), "file_ref": path,
                                       "ingested_at": today})
            return out
    return {"invoice": None, "meter": [], "readings": [], "status": "needs_label"}
```

`parsers/automat_it.py` — the existing parser (`$SA/build/connectors/accrual.py:60-93`) reshaped to the registry contract: `matches(txt, hint)` = `"Automat-IT" in txt or "BILLING PERIOD" in txt`; `parse(...)` returns the cash total as the `invoice` row (`kind="reseller"`, `currency="EUR"`, `amount_usd = amount*fx`, `period_month` from BILLING PERIOD, `invoice_number` from the Tax Invoice ref), the credits-used line as one `meter` row (`mechanism="ait_invoice_credit"`, `reported_usd = credit_eur*fx`), and the "remaining credits are X EUR" footer as one `readings` row (`pool="AWS · Automat-IT"`, `field="left"`, `value = rem_eur*fx`). The regexes carry over character-for-character.

`parsers/generic.py` — best-effort for standard invoices; `matches` always True; extracts: total via `(?:total|amount due|grand total)\D{0,20}([\d,]+\.\d{2})`, currency via `(USD|EUR|\$|€)` near the total, invoice number via `(?:invoice|receipt)\s*(?:no\.?|number|#)\s*:?\s*(\S+)`, period = the month of the latest date found (`\d{4}-\d{2}-\d{2}` or `[A-Z][a-z]{2,8} \d{1,2}, \d{4}`); `kind` from the provider's `billing` field in credits.json (passed via hint lookup — prepaid pools → `prepaid_topup`, else `monthly_bill`). Any missing field → `status="needs_label"` with whatever was found.

`label.py` — fix-up CLI:
```python
"""Relabel a needs_label invoice row (rows are append-only: emits a corrected duplicate
with status='parsed'; the frontend/dedup always takes the latest row per sha256).
    python3 -m ingest.invoices.label <sha256> --provider vast.ai --month 2026-06 \
        --amount 500 --currency USD --kind prepaid_topup [--number INV-123]"""
```
(argparse mirroring `record.py`; validates provider against credits.json pools' provider lists; recomputes `amount_usd` via config fx when currency is EUR.)

- [ ] **Step 3: Tests** (`tests/test_extract.py`) — synthetic invoice TEXT fixtures (no real PDFs in git; test the parsers on strings by monkeypatching `extract.pdf_text`):

```python
from ingest.invoices import extract

AIT = """AUTOMAT-IT ...  BILLING PERIOD: 01/05/2026
Tax Invoice- AIT-777   INVOICE TOTAL  EUR 1,234.56
Credits Used  EUR 0.87  -1,000.00 ea  -2,000.00
Your remaining credits are 9,999 EUR"""

def test_automat_it(monkeypatch, tmp_path):
    p = tmp_path / "x.pdf"; p.write_bytes(b"%PDF")
    monkeypatch.setattr(extract, "pdf_text", lambda _: AIT)
    out = extract.parse(str(p), "aws", fx=1.14, today="2026-07-02")
    inv = out["invoice"]
    assert inv["kind"] == "reseller" and inv["period_month"] == "2026-05"
    assert inv["amount"] == 1234.56 and inv["currency"] == "EUR"
    assert out["meter"][0]["mechanism"] == "ait_invoice_credit"
    assert out["readings"][0]["field"] == "left"

def test_generic_needs_label_when_no_total(monkeypatch, tmp_path):
    p = tmp_path / "y.pdf"; p.write_bytes(b"%PDF")
    monkeypatch.setattr(extract, "pdf_text", lambda _: "Thanks for your purchase!")
    out = extract.parse(str(p), "runpod", fx=1.14, today="2026-07-02")
    assert out["status"] == "needs_label"
```

- [ ] **Step 4: Run → FAIL → implement → PASS. Commit** — `git add ingest/invoices tests/test_extract.py && git commit -m "feat(treasury): invoice catcher (gmail harvest, extract, label)"`

---

### Task 6: Grants transform

**Files:**
- Create: `ingest/transform/grants.py`
- Test: `tests/test_reconcile.py` (grants part)

**Interfaces:**
- Consumes: `creds.load_credits()`, manual-latest dict, balance-connector records
- Produces: `grants.build(credits, manual_latest, live_records, today) -> list[dict]` (grants_snapshot-shaped, incl. the new `billing` column).

- [ ] **Step 1: Port** `_overlay_manual` / `_overlay_live` / `build_grants` from `$SA/build/csv_build.py:43-154` — logic and precedence IDENTICAL (manual < live; a fresh read clears `verify`), with substitutions: manual comes from `manual_latest: {(pool, field): (value, recorded_at)}` (SQL over `manual_readings` in the orchestrator) instead of the grid CSV; live records passed directly (no live.json); `_overlay_aws_invoice` is GONE (the AIT footer now arrives as an auto `manual_readings` row via the catcher — same precedence slot as manual). Rows carry `as_of=today` and `billing` from each pool.

- [ ] **Step 2: Test** (in `tests/test_reconcile.py`):

```python
from ingest.transform import grants

def test_manual_beats_base_but_live_beats_manual():
    credits = {"pools": [{"pool": "TestPool", "providers": ["testprov"], "kind": "grant",
                          "billing": "monthly", "granted": 1000, "left": 900}]}
    manual = {("TestPool", "left"): (700.0, "2026-07-01")}
    live = {"testprov": {"ok": True, "granted": 1000.0, "left": 500.0,
                         "live": {"left": True}, "source": "api", "updated": "2026-07-02"}}
    rows = grants.build(credits, manual, live, today="2026-07-02")
    row = next(r for r in rows if r["pool"] == "TestPool")
    assert row["left"] == 500.0 and row["left_src"] == "API" and row["billing"] == "monthly"
```

- [ ] **Step 3: Fail → implement → pass → commit** `feat(treasury): grants snapshot transform`.

---

### Task 7: Reconciliation — the single-source-of-truth engine

**Files:**
- Create: `ingest/reconcile.py`
- Test: `tests/test_reconcile.py` (extend)

**Interfaces:**
- Consumes: invoices rows, payments rows, usage rows, meter rows, billing map (`{provider: billing}` derived from credits.json pools' `providers`+`billing`), config tolerances + `recon_accepted`
- Produces: `reconcile.run(invoices, payments, usage, meter, billing_map, months, config, today) -> list[dict]` (reconciliation-shaped rows).

- [ ] **Step 1: Write the failing tests** — they define the semantics:

```python
from ingest import reconcile

CFG = {"recon_tolerance_pct": 0.02, "recon_tolerance_usd": 2.0, "recon_accepted": []}

def _run(inv=[], pay=[], usage=[], meter=[], bmap={}, months=["2026-06"]):
    return reconcile.run(inv, pay, usage, meter, bmap, months, CFG, today="2026-07-02")

def test_monthly_missing_invoice():
    # provider active (has usage), billed monthly, no invoice → missing_invoice
    rows = _run(usage=[{"month": "2026-06", "provider": "google", "cost_paid": 10, "cost_quest": 0}],
                bmap={"google": "monthly"})
    r = next(x for x in rows if x["provider"] == "google")
    assert r["status"] == "missing_invoice"

def test_monthly_ok_when_invoice_and_payment_match():
    rows = _run(inv=[{"provider": "google", "kind": "monthly_bill", "period_month": "2026-06",
                      "amount_usd": 1000.0, "sha256": "a1", "status": "parsed"}],
                pay=[{"month": "2026-07", "provider": "google", "amount_usd": 1001.0, "wise_ref": "w1"}],
                bmap={"google": "monthly"}, months=["2026-06", "2026-07"])
    r = next(x for x in rows if x["provider"] == "google" and x["month"] == "2026-06")
    assert r["status"] == "ok"          # arrears: payment lands in M or M+1

def test_prepaid_every_topup_needs_an_invoice():
    rows = _run(pay=[{"month": "2026-06", "provider": "runpod", "amount_usd": 500.0,
                      "wise_ref": "w2", "paid_at": "2026-06-10"}],
                bmap={"runpod": "prepaid"})
    r = next(x for x in rows if x["provider"] == "runpod")
    assert r["status"] == "missing_invoice" and r["payment_refs"] == "w2"

def test_prepaid_matches_within_tolerance():
    # tolerance = max(2% * 495, $2) = $9.90; delta = $5 → the pair matches → ok
    rows = _run(inv=[{"provider": "runpod", "kind": "prepaid_topup", "period_month": "2026-06",
                      "amount_usd": 500.0, "sha256": "b2", "status": "parsed", "issued_at": "2026-06-11"}],
                pay=[{"month": "2026-06", "provider": "runpod", "amount_usd": 495.0,
                      "wise_ref": "w2", "paid_at": "2026-06-10"}],
                bmap={"runpod": "prepaid"})
    r = next(x for x in rows if x["provider"] == "runpod")
    assert r["status"] == "ok"
def test_sponsored_expects_nothing():
    rows = _run(usage=[{"month": "2026-06", "provider": "azure", "cost_paid": 5, "cost_quest": 5}],
                bmap={"azure": "sponsored"})
    r = next(x for x in rows if x["provider"] == "azure")
    assert r["status"] == "ok_credit"

def test_accepted_gap_is_silenced():
    cfg = dict(CFG, recon_accepted=["2026-06:google"])
    rows = reconcile.run([], [], [{"month": "2026-06", "provider": "google",
                                   "cost_paid": 10, "cost_quest": 0}], [],
                         {"google": "monthly"}, ["2026-06"], cfg, today="2026-07-02")
    assert next(x for x in rows if x["provider"] == "google")["status"] == "accepted"
```

- [ ] **Step 2: Implement `reconcile.py`**

```python
"""Invoices ↔ payments ↔ activity, per (month, provider). Invoices are truth; Wise verifies.

Verdicts:
  ok               expectation met (invoice present; money trail consistent)
  ok_credit        sponsored/credit pool — no invoice or payment expected
  missing_invoice  activity or payment exists but no invoice covers it   ← the chase list
  missing_payment  invoice exists but no money trail (fine for credit-funded; flagged to eyeball)
  amount_mismatch  invoice and payment disagree beyond tolerance
  accepted         gap listed in config recon_accepted
"""

def _tol(cfg, amount):
    return max(cfg["recon_tolerance_pct"] * abs(amount), cfg["recon_tolerance_usd"])

def _ym_next(ym):
    y, m = int(ym[:4]), int(ym[5:7])
    return f"{y+1:04d}-01" if m == 12 else f"{y:04d}-{m+1:02d}"

def run(invoices, payments, usage, meter, billing_map, months, cfg, today):
    inv_ok = [i for i in invoices if i.get("status") != "needs_label" and i.get("kind") != "unknown"]
    out = []
    providers = sorted(set(billing_map)
                       | {u["provider"] for u in usage} | {m["provider"] for m in meter}
                       | {p["provider"] for p in payments if p["provider"]}
                       | {i["provider"] for i in inv_ok})
    for prov in providers:
        billing = billing_map.get(prov, "monthly")
        p_inv = [i for i in inv_ok if i["provider"] == prov]
        p_pay = [p for p in payments if p["provider"] == prov]
        for ym in months:
            active = (any(u["month"] == ym and (u["cost_paid"] + u["cost_quest"]) > 0.5 for u in usage
                          if u["provider"] == prov)
                      or any(m["month"] == ym and m["reported_usd"] > 0.5 for m in meter
                             if m["provider"] == prov)
                      or any(p["month"] == ym for p in p_pay)
                      or any(i["period_month"] == ym for i in p_inv))
            if not active:
                continue
            if f"{ym}:{prov}" in cfg["recon_accepted"]:
                out.append(_row(ym, prov, billing, "accepted", 0, 0, "", "", "config", today)); continue
            if billing == "sponsored":
                out.append(_row(ym, prov, billing, "ok_credit", 0, 0, "", "", "", today)); continue
            if billing == "prepaid":
                # every top-up payment must pair with an invoice (±10d, tolerance)
                unmatched_pay, used = [], set()
                for p in [p for p in p_pay if p["month"] == ym]:
                    hit = next((i for i in p_inv if i["sha256"] not in used
                                and abs(i["amount_usd"] - p["amount_usd"]) <= _tol(cfg, p["amount_usd"])
                                and abs(_days(i.get("issued_at", f"{ym}-15"), p["paid_at"])) <= 10), None)
                    if hit: used.add(hit["sha256"])
                    else: unmatched_pay.append(p)
                orphans = [i for i in p_inv if i["period_month"] == ym and i["sha256"] not in used]
                if unmatched_pay:
                    out.append(_row(ym, prov, billing, "missing_invoice",
                                    0, sum(p["amount_usd"] for p in unmatched_pay),
                                    "", ",".join(p["wise_ref"] for p in unmatched_pay), "", today))
                elif orphans:
                    out.append(_row(ym, prov, billing, "missing_payment",
                                    sum(i["amount_usd"] for i in orphans), 0,
                                    ",".join(i["sha256"] for i in orphans), "",
                                    "prepaid invoice without money trail", today))
                else:
                    out.append(_row(ym, prov, billing, "ok", 0, 0, "", "", "", today))
                continue
            # monthly / reseller / subscription: expect invoice(s) covering ym;
            # matching payment may land in ym or ym+1 (arrears)
            m_inv = [i for i in p_inv if i["period_month"] == ym]
            m_pay = [p for p in p_pay if p["month"] in (ym, _ym_next(ym))]
            iv = sum(i["amount_usd"] for i in m_inv)
            pv = sum(p["amount_usd"] for p in m_pay)
            refs = (",".join(i["sha256"] for i in m_inv), ",".join(p["wise_ref"] for p in m_pay))
            if not m_inv:
                out.append(_row(ym, prov, billing, "missing_invoice", 0, pv, "", refs[1], "", today))
            elif not m_pay:
                out.append(_row(ym, prov, billing, "missing_payment", iv, 0, refs[0], "",
                                "credit-funded or unpaid — eyeball", today))
            elif abs(iv - pv) > _tol(cfg, iv):
                out.append(_row(ym, prov, billing, "amount_mismatch", iv, pv, *refs, "", today))
            else:
                out.append(_row(ym, prov, billing, "ok", iv, pv, *refs, "", today))
    return out

def _days(a, b):
    import datetime
    return (datetime.date.fromisoformat(a[:10]) - datetime.date.fromisoformat(b[:10])).days

def _row(month, provider, billing, status, iv, pv, iref, pref, note, today):
    return {"month": month, "provider": provider, "billing": billing, "status": status,
            "invoice_usd": round(iv, 2), "payment_usd": round(pv, 2),
            "delta_usd": round(iv - pv, 2), "invoice_refs": iref, "payment_refs": pref,
            "note": note, "run_at": today}
```

- [ ] **Step 3: Run → PASS. Commit** — `feat(treasury): invoice/payment reconciliation engine`

---

### Task 8: Orchestrator, doctor, record CLI

**Files:**
- Create: `ingest/run.py`, `ingest/doctor.py`, `ingest/record.py`

**Interfaces:**
- Produces: `python3 -m ingest.run` (daily) · `--backfill` (all months + full harvest sweep) · `python3 -m ingest.doctor` (exit 0/1) · `python3 -m ingest.record <pool> <field> <value> [--note]`.

- [ ] **Step 1: `doctor.py`**

```python
"""Preflight. HARD checks (any failure blocks the run): sops, tinybird ops (write token
read+write), tinybird prod, wise, stripe, gog (gmail reachable), pdftotext on PATH.
SOFT checks (warn only): each balance connector, archive_dir writable, last run < 26h.
Exit 0 = all hard checks green."""
import datetime, os, shutil, subprocess, sys
from . import creds, tb
from .connectors import wise, stripe

def checks():
    out = []   # (name, hard, ok, detail)
    try:
        c, cfg = creds.load_creds(), creds.load_config()
        out.append(("sops", True, True, "decrypted"))
    except Exception as e:
        return [("sops", True, False, str(e)[:120])]
    ops = tb.TB(cfg["tb_ops_api"], c["TINYBIRD_OPS_INGEST_TOKEN"])
    prod = tb.TB(cfg["tb_prod_api"], c["TINYBIRD_PROD_READ_TOKEN"])
    ym = datetime.date.today().strftime("%Y-%m")
    for name, fn in [
        ("tinybird-ops", lambda: ops.sql("SELECT count() AS n FROM ingest_runs")),
        ("tinybird-prod", lambda: prod.sql("SELECT 1 AS ok")),
        ("wise", lambda: wise._fetch_month(c, ym)),
        ("stripe", lambda: stripe.monthly_revenue([ym], c)),
        ("gog", lambda: subprocess.run(["gog", "-a", cfg["gog_account"], "--json",
                                        "gmail", "search", "newer_than:1d"],
                                       capture_output=True, timeout=60, check=True)),
        ("pdftotext", lambda: shutil.which("pdftotext") or (_ for _ in ()).throw(RuntimeError("not on PATH"))),
    ]:
        try:
            fn(); out.append((name, True, True, "ok"))
        except Exception as e:
            out.append((name, True, False, str(e)[:120]))
    from .connectors import openrouter, deepinfra, runpod, vast, digitalocean, cloudflare, fireworks
    for mod in (openrouter, deepinfra, runpod, vast, digitalocean, cloudflare, fireworks):
        try:
            mod.fetch(c); out.append((mod.NAME, False, True, "ok"))
        except Exception as e:
            out.append((mod.NAME, False, False, str(e)[:120]))
    out.append(("archive", False, os.access(cfg["archive_dir"], os.W_OK), cfg["archive_dir"]))
    try:
        last = ops.sql("SELECT max(run_at) AS t FROM ingest_runs")[0]["t"]
        age_h = (datetime.datetime.utcnow() - datetime.datetime.fromisoformat(last)).total_seconds() / 3600
        out.append(("freshness", False, age_h < 26, f"last run {age_h:.1f}h ago"))
    except Exception as e:
        out.append(("freshness", False, False, str(e)[:120]))
    return out

def main():
    res = checks()
    for name, hard, ok, detail in res:
        print(f"  {'✓' if ok else ('✗' if hard else '·')} {name:14} {detail}")
    sys.exit(1 if [r for r in res if r[1] and not r[2]] else 0)

if __name__ == "__main__":
    main()
```

- [ ] **Step 2: `run.py`**

```python
"""Daily ingest → operations workspace. No files written except the PDF archive.
    python3 -m ingest.run              # daily: harvest new invoices + repull last 2 months
    python3 -m ingest.run --backfill   # everything since config.months_start"""
import datetime, json, sys
from . import creds, tb, reconcile
from .connectors import wise, stripe, usage, meter, common
from .connectors import openrouter, deepinfra, runpod, vast, digitalocean, cloudflare, fireworks
from .invoices import harvest
from .transform import grants

BALANCE = [openrouter, deepinfra, runpod, digitalocean, fireworks, cloudflare, vast]

def main():
    backfill = "--backfill" in sys.argv
    today = datetime.date.today().isoformat()
    c, cfg = creds.load_creds(), creds.load_config()
    ops = tb.TB(cfg["tb_ops_api"], c["TINYBIRD_OPS_INGEST_TOKEN"])
    prod = tb.TB(cfg["tb_prod_api"], c["TINYBIRD_PROD_READ_TOKEN"])
    st, notes = {}, []
    all_months = common.months_ytd(cfg["months_start"], today)
    win = all_months if backfill else all_months[-cfg["repull_months"]:]

    st["harvest"] = harvest.run(cfg, ops, today,               # 1. invoices (append, deduped)
                                since=cfg["months_start"].replace("-", "/") + "/01" if backfill else None)

    for ym in win:                                             # 2. usage
        rows = usage.pull_month(prod, ym, today)
        if rows: ops.replace("usage_monthly", rows, condition=f"month='{ym}'")
        st[f"usage:{ym}"] = len(rows)

    try:                                                       # 3. payments (per transaction)
        for ym in win:
            rows = wise.outflow_rows(c, [ym], cfg["fx_eur_usd"], today)
            if rows: ops.replace("payments", rows, condition=f"month='{ym}'")
            st[f"wise:{ym}"] = len(rows)
    except Exception as e:
        notes.append(f"wise FAILED, months kept: {e}")

    try:                                                       # 4. revenue
        for ym, m in stripe.monthly_revenue(win, c).items():
            if m["txns"] == 0: continue
            ops.replace("revenue_monthly", [{"month": ym, "gross_eur": m["bruto_eur"],
                "fees_eur": m["stripe_fees_eur"], "refunds_eur": m["refunds_eur"],
                "net_eur": m["netto_eur"], "net_ratio": m["net_ratio"], "pulled_at": today}],
                condition=f"month='{ym}'")
            st[f"stripe:{ym}"] = m["txns"]
    except Exception as e:
        notes.append(f"stripe FAILED, months kept: {e}")

    mrows = meter.rows(c, cfg, all_months, today)              # 5. provider meters
    for ym in {r["month"] for r in mrows} & set(win if not backfill else all_months):
        ops.replace("provider_meter_monthly", [r for r in mrows if r["month"] == ym],
                    condition=f"month='{ym}'")
    st["meter"] = len(mrows)

    live = {}                                                  # 6. balances → grants snapshot
    for mod in BALANCE:
        try: live[mod.NAME] = {"ok": True, **mod.fetch(c)}
        except Exception as e: live[mod.NAME] = {"ok": False, "error": str(e)}
    manual = {(r["pool"], r["field"]): (r["value"], r["recorded_at"]) for r in ops.sql(
        "SELECT pool, field, argMax(value, recorded_at) AS value, max(recorded_at) AS recorded_at "
        "FROM manual_readings GROUP BY pool, field")}
    grows = grants.build(creds.load_credits(), manual, live, today)
    ops.append("grants_snapshot", grows)
    st["grants"] = len(grows)

    facts = {n: ops.sql(f"SELECT * FROM {n}") for n in       # 7. reconcile (reads facts back)
             ("invoices", "payments", "usage_monthly", "provider_meter_monthly")}
    bmap = {}
    for p in creds.load_credits().get("pools", []):
        for prov in p.get("providers", []):
            bmap[prov.strip().lower()] = p.get("billing", "monthly")
    rrows = reconcile.run(facts["invoices"], facts["payments"], facts["usage_monthly"],
                          facts["provider_meter_monthly"], bmap, all_months, cfg, today)
    ops.replace("reconciliation", rrows)
    bad = [r for r in rrows if r["status"] in ("missing_invoice", "amount_mismatch")]
    st["recon"] = f"{len(rrows)} rows, {len(bad)} to chase"

    now = datetime.datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")   # 8. run log
    ops.append("ingest_runs", [{"run_at": now, "ok": 0 if notes else 1,
                                "statuses": json.dumps(st), "notes": "; ".join(notes)}])
    print(f"ingested: {st}" + (f" NOTES: {notes}" if notes else ""))
    if bad:
        print("CHASE LIST:")
        for r in bad:
            print(f"  {r['month']} {r['provider']:14} {r['status']:16} "
                  f"inv=${r['invoice_usd']:.0f} pay=${r['payment_usd']:.0f}")

if __name__ == "__main__":
    main()
```

- [ ] **Step 3: `record.py`** — unchanged from plan v1: validates pool against credits.json, appends one `manual_readings` row, prints confirmation.

- [ ] **Step 4: Run `python3 -m ingest.doctor` → all hard checks green (fix creds until they are). Commit** — `feat(treasury): orchestrator + doctor + record CLI`

---

### Task 9: Backfill + the chase loop (operator-heavy)

- [ ] **Step 1: Move the archive out of the repo tree** — `mkdir -p ~/Documents/treasury-invoices && cp -r $SA/invoices/2026-* $SA/invoices/_manual-preexisting ~/Documents/treasury-invoices/_import/` then run a one-off import: walk `_import/`, `extract.parse` each PDF, append `invoices` (+extras) rows — reuse `harvest`'s ingest path via a `--from-dir` flag on `harvest.py` (10 lines: same dedupe + extract + append, skipping Gmail).

- [ ] **Step 2: Seed history (one-time; the ONLY sanctioned finance read, via stdin so no committed file ever references the path)** — finance `pool-history.json` monthly balances → `grants_snapshot` rows; then replay `$SA/data/manual_grid.csv` filled cells (~8) through `python3 -m ingest.record`:

```bash
python3 - <<'EOF'
import json, sys; sys.path.insert(0, ".")
from ingest import creds, tb
hist = json.load(open("/Users/comsom/Github/pollinations/apps/operation/finance/secrets/pool-history.json"))
pools = {p["pool"]: p for p in creds.load_credits()["pools"]}
def match(fin_name):   # finance pool name -> treasury pool (name or providers overlap)
    low = fin_name.lower()
    for name, p in pools.items():
        if low in name.lower() or any(low.startswith(pr[:6]) for pr in p.get("providers", [])):
            return name
    return None
c, cfg = creds.load_creds(), creds.load_config()
ops = tb.TB(cfg["tb_ops_api"], c["TINYBIRD_OPS_INGEST_TOKEN"])
rows = []
for fin_name, months in hist.items():
    pool = match(fin_name)
    if not pool: print("UNMAPPED (resolve by hand):", fin_name); continue
    for ym, bal in months.items():
        if isinstance(bal, (int, float)):
            rows.append({"as_of": f"{ym}-28", "pool": pool, "providers": "", "kind": "seed",
                         "billing": pools[pool].get("billing", "monthly"), "currency": "USD",
                         "granted": None, "granted_src": "", "left": abs(bal), "left_src": "SEED",
                         "prepaid_left": None, "prepaid_left_src": "",
                         "note": f"seeded from finance pool-history ({fin_name})",
                         "connection": "", "expires": "", "verify": "", "source": "pool-history seed"})
ops.append("grants_snapshot", rows); print(f"seeded {len(rows)} rows")
EOF
python3 -m ingest.record "Perplexity" left 1848.75 --note "seed from manual_grid 2026-07"
# ... one ingest.record call per remaining filled cell in $SA/data/manual_grid.csv
```

- [ ] **Step 3: Full backfill** — `python3 -m ingest.doctor && python3 -m ingest.run --backfill`. The Gmail sweep re-downloads anything the `$SA` import missed (sha256 dedupe makes this safe).

- [ ] **Step 4: THE CHASE LOOP — this answers "how widespread is the invoice problem":** run.py printed the chase list (every `missing_invoice`/`amount_mismatch` per month × provider, Jan→now). For each: download from the provider portal into `~/Documents/treasury-invoices/_import/`, re-run `harvest --from-dir`, label `needs_label` rows via `python3 -m ingest.invoices.label`, re-run `python3 -m ingest.run`, repeat until the list is empty or every remaining gap is consciously added to `config.recon_accepted` with a reason in the commit message. (`$SA/invoices/billing_gaps.csv` + `no_pdf_found.json` are the head start — the prototype already found the first gaps.)

- [ ] **Step 5: Verify counts + commit** — every table non-empty; `SELECT status, count() FROM reconciliation GROUP BY status` shows the end state; commit `feat(treasury): backfill complete, reconciliation baseline`.

---

### Task 10: `web/logic/build.js` — the P&L join (invoices-first)

**Files:**
- Create: `web/logic/build.js`, `web/logic/build.test.js`, `web/logic/fixtures/flows_synthetic.json`, `web/package.json`, `web/tsconfig.json`
- Create: `web/template.html` — `cp $SA/build/template.html web/template.html` **UNCHANGED**

**Interfaces:**
- Consumes: `flows = {usage, payments, revenue, meter, grants, grants_history, invoices, reconciliation, meta}` (the pipe outputs)
- Produces: `build(flows, config) -> doc` — the EXACT shape `template.html:176` (`const DATA = /*DATA*/;`) consumes: `{generated, fx_eur_usd, months, current_month, net_ratio, break_even_mult, periods, models, grants, bills, costs, stripe}` (see `$SA/build/build_dashboard.py` return). Exported both as ESM (worker) and `globalThis.TreasuryBuild` (future client use).

- [ ] **Step 1: Port `$SA/build/build_dashboard.py` to JS** — the join, period folding, model-split-by-imputed-weight, and template-facing shape carry over 1:1 (`bills` now sourced from `payments` aggregated month×provider; `stripe` from `revenue`). **The compute P&L cost is INVOICES ONLY** (tightened per Elliot, 2026-07-02 — supersedes the earlier mechanism-priority design):

```
P&L cost (month, provider) = Σ parsed invoices with category='compute', period_month=M
                             (kind reseller: amount=cash; its credit line arrives via the
                             meter mechanism ait_invoice_credit and is shown as credit burn)
                             → status "actual", source "IV"

Diagnostics (displayed alongside, NEVER summed into cash P&L):
  meter        provider_meter_monthly for M (aws_ce, vast_ledger, deepinfra_usage)  → "what
               the provider reports" column; drift vs invoice > tolerance ⇒ warning badge
  pool delta   grants_history month-end deltas → credit-burn column for sponsored pools
               (Azure/AWS credits have no cash invoice by design)
  estimate     usage imputed cost → registry-sanity column only
  coverage     any compute provider-month with usage but NO parsed invoice renders the cell
               as MISSING (from reconciliation) instead of silently showing $0 cost
```
Funding class per provider from `grants` (`kind`: grant/voucher→credit, prepaid→prepaid, else cash). The settled exclusions port verbatim: `PROVIDER_ALIAS`, `INFRA_PROVIDERS={cloudflare}`, `NONCOMPUTE_BILL_PROVIDERS={anthropic, openai}`, `anthropic: []` (no cost rows). Wise/payments NEVER enter cost — they feed `bills` (the verification column) and the recon badges only.

- [ ] **Step 2: `web/logic/fixtures/flows_synthetic.json`** — invented mini-world: 2 months, 3 providers (`credprov` grant pool, `cashprov` monthly invoices, `prepaidprov` prepaid), matching invoices/payments/meter/grants/usage/revenue rows. Committed (lives under a `fixtures/` dir and ends `_synthetic.json`, per the leak guard).

- [ ] **Step 3: Vitest invariants** (`web/logic/build.test.js`):

```javascript
import { describe, expect, it } from "vitest";
import { build } from "./build.js";
import flows from "./fixtures/flows_synthetic.json";

const CFG = { fx_eur_usd: 1.14 };
const doc = build(flows, CFG);

describe("build", () => {
    it("has the template contract shape", () => {
        for (const k of ["generated", "months", "current_month", "net_ratio", "break_even_mult",
                         "periods", "models", "grants", "bills", "costs", "stripe"])
            expect(doc).toHaveProperty(k);
    });
    it("break-even is inverse net ratio", () => {
        expect(doc.break_even_mult).toBeCloseTo(1 / doc.net_ratio, 4);
    });
    it("invoice beats meter beats estimate", () => {
        // cashprov has both an invoice and a meter row for 2026-01 → invoice wins
        const c = doc.costs.filter(x => x.provider === "cashprov" && x.month === "2026-01");
        expect(c).toHaveLength(1);
        expect(c[0].source).toBe("IV");
    });
    it("estimates only where nothing real exists", () => {
        for (const c of doc.costs)
            expect(c.status === "estimate").toBe(c.source === "TB");
    });
    it("payments never enter cost", () => {
        expect(doc.costs.every(c => c.source !== "WS")).toBe(true);
    });
    it("is deterministic", () => {
        expect(build(flows, CFG)).toEqual(doc);
    });
});
```

- [ ] **Step 4:** `cd web && npm install && npx vitest run` → FAIL → implement `build.js` → PASS. `npx biome check --write logic/`. **Commit** — `feat(treasury): invoices-first P&L join with vitest invariants`

`web/package.json`:
```json
{
    "name": "myceli-treasury",
    "private": true,
    "type": "module",
    "scripts": {
        "dev": "wrangler dev",
        "test": "vitest run",
        "deploy": "CLOUDFLARE_ACCOUNT_ID=b6ec751c0862027ba269faf7029b2501 wrangler deploy"
    },
    "dependencies": { "hono": "^4" },
    "devDependencies": { "wrangler": "^4", "typescript": "^5", "vitest": "^3" }
}
```

---

### Task 11: Worker — `treasury.myceli.ai`

**Files:**
- Create: `web/worker/index.ts`, `web/wrangler.toml`, `web/worker/html.d.ts`

**Interfaces:**
- Consumes: the endpoint pipes (via `TINYBIRD_OPS_READ_TOKEN`), `logic/build.js`, `template.html`
- Produces: `GET /` (injected dashboard) · `GET /flows.json` (raw facts, for future UIs) · `GET /data.json` (built doc) — all behind Basic auth.

- [ ] **Step 1: `wrangler.toml`**

```toml
name = "myceli-treasury"
main = "worker/index.ts"
compatibility_date = "2026-01-01"

routes = [
    { pattern = "treasury.myceli.ai", custom_domain = true }
]

[vars]
TINYBIRD_API = "https://api.europe-west2.gcp.tinybird.co"

[[rules]]
type = "Text"
globs = ["**/*.html"]
fallthrough = true

# Secrets: DASHBOARD_PASSWORD, TINYBIRD_OPS_READ_TOKEN (pipe-read only)
```

- [ ] **Step 2: `worker/index.ts`** (Basic-auth middleware mirrors `kpi/src/worker/index.ts:162-184`):

```typescript
import { Hono } from "hono";
import { build } from "../logic/build.js";
import template from "../template.html";

type Env = { DASHBOARD_PASSWORD?: string; TINYBIRD_OPS_READ_TOKEN: string; TINYBIRD_API: string };

const PIPES: Record<string, string> = {
    usage: "usage_monthly_ep", payments: "payments_ep", revenue: "revenue_monthly_ep",
    meter: "provider_meter_monthly_ep", grants: "grants_current_ep",
    grants_history: "grants_monthly_end_ep", invoices: "invoices_ep",
    reconciliation: "reconciliation_ep", meta: "ingest_runs_ep",
};
const CACHE_TTL = 3600;

const app = new Hono<{ Bindings: Env }>();

app.use("*", async (c, next) => {
    const password = c.env.DASHBOARD_PASSWORD;
    if (!password) return new Response("Dashboard password not configured", { status: 500 });
    const auth = c.req.header("Authorization");
    if (auth) {
        const [scheme, encoded] = auth.split(" ");
        if (scheme === "Basic" && encoded && atob(encoded).split(":")[1] === password) return next();
    }
    return new Response("Unauthorized", {
        status: 401,
        headers: { "WWW-Authenticate": 'Basic realm="Treasury"' },
    });
});

async function pipe(env: Env, name: string): Promise<unknown[]> {
    const url = `${env.TINYBIRD_API}/v0/pipes/${name}.json`;
    const cache = caches.default;
    const key = new Request(url);
    const hit = await cache.match(key);
    if (hit) return ((await hit.json()) as { data: unknown[] }).data;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${env.TINYBIRD_OPS_READ_TOKEN}` } });
    if (!res.ok) throw new Error(`tinybird ${name} ${res.status}`);
    const json = (await res.json()) as { data: unknown[] };
    await cache.put(key, new Response(JSON.stringify(json), {
        headers: { "Cache-Control": `public, max-age=${CACHE_TTL}` },
    }));
    return json.data;
}

async function flows(env: Env) {
    const entries = await Promise.all(
        Object.entries(PIPES).map(async ([k, p]) => [k, await pipe(env, p)] as const),
    );
    return Object.fromEntries(entries);
}

app.get("/flows.json", async (c) => c.json(await flows(c.env)));
app.get("/data.json", async (c) => c.json(build(await flows(c.env), { fx_eur_usd: 1.14 })));
app.get("/", async (c) => {
    const doc = build(await flows(c.env), { fx_eur_usd: 1.14 });
    return c.html(template.replace("/*DATA*/", JSON.stringify(doc)));
});

export default app;
```
(`html.d.ts`: `declare module "*.html" { const s: string; export default s; }`.)

- [ ] **Step 3: Local verify**

```bash
cd web && echo 'DASHBOARD_PASSWORD=test' > .dev.vars && echo 'TINYBIRD_OPS_READ_TOKEN=<paste>' >> .dev.vars
npx wrangler dev &
curl -s -o /dev/null -w '%{http_code}' http://localhost:8787/            # 401
curl -s -u admin:test http://localhost:8787/ | grep -c 'const DATA = {'  # 1
```

- [ ] **Step 4: Deploy (operator; needs myceli wrangler login + Elliot's go)** — `npx wrangler whoami` must show Elliot@myceli.ai; `wrangler secret put` both secrets; `npm run deploy`; `curl https://treasury.myceli.ai/` → 401.

- [ ] **Step 5: Commit** — `feat(treasury): worker at treasury.myceli.ai`

---

### Task 12: Cron, runbook, parity, retire the prototype

- [ ] **Step 1: `cron/refresh.sh`**

```bash
#!/usr/bin/env bash
# Daily treasury ingest: doctor gate, then run. Called by launchd; logs to ~/Library/Logs.
set -euo pipefail
cd "$(dirname "$0")/.."
# launchd doesn't inherit the shell env; sops needs the age key, subprocesses need brew PATH
export SOPS_AGE_KEY_FILE="${SOPS_AGE_KEY_FILE:-$HOME/.config/sops/age/keys.txt}"
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
echo "=== treasury refresh $(date -u +%FT%TZ) ==="
python3 -m ingest.doctor || { echo "DOCTOR RED — ingest blocked"; exit 1; }
python3 -m ingest.run
```

- [ ] **Step 2: `cron/ai.myceli.treasury-refresh.plist`** (template; operator installs)

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key><string>ai.myceli.treasury-refresh</string>
    <key>ProgramArguments</key>
    <array><string>/Users/comsom/Github/pollinations/apps/operation/treasury/cron/refresh.sh</string></array>
    <key>StartCalendarInterval</key>
    <dict><key>Hour</key><integer>8</integer><key>Minute</key><integer>45</integer></dict>
    <key>StandardOutPath</key><string>/Users/comsom/Library/Logs/treasury-refresh.log</string>
    <key>StandardErrorPath</key><string>/Users/comsom/Library/Logs/treasury-refresh.err</string>
    <key>WorkingDirectory</key><string>/Users/comsom/Github/pollinations/apps/operation/treasury</string>
</dict>
</plist>
```

Install (operator): `chmod +x cron/refresh.sh && cp cron/ai.myceli.treasury-refresh.plist ~/Library/LaunchAgents/ && launchctl load ~/Library/LaunchAgents/ai.myceli.treasury-refresh.plist && launchctl start ai.myceli.treasury-refresh && tail -f ~/Library/Logs/treasury-refresh.log`

- [ ] **Step 3: `README.md`** — the platform runbook, in this order: (a) **the table contract** — the 9 tables + pipes with one line each, explicitly marked "read these from your UI, don't re-pull sources" (this is what other business UIs consume); (b) setup (age key, sops, tokens, gog account); (c) daily ops (doctor / run / record / label / the chase loop); (d) connector status table ported from `$SA/CONNECTORS.md` **with all dollar amounts stripped**; (e) settled questions verbatim minus amounts.

- [ ] **Step 4: PARITY CHECK (gate)** — `curl -s -u admin:$PW https://treasury.myceli.ai/data.json` vs `$SA/dashboard_data.json`: for Apr/May, `periods[m].{net_revenue, quest_burn}` within 2 % (revenue/usage paths unchanged). `paid_margin`/`cash_pnl` may shift more — the cost basis moved from Wise-shifted to invoices-first; for each provider-month where cost drift > 10 %, eyeball that the new number traces to an invoice/meter row (that drift is the CORRECTION, not a bug — log the top 5 in the commit message).

- [ ] **Step 5: Full green + commit** — `python3 -m pytest tests/ -q` && `cd web && npx vitest run && npx biome check .` → commit `feat(treasury): daily cron + runbook, parity checked`.

- [ ] **Step 6: Retire (ONLY after Elliot confirms parity + a week of green cron)** — delete `$SA` (`_local/2026-07-01-spend-audit/`). `apps/operation/finance/` is NOT touched — Google Sheet + runway stay there until a later phase reads them from these same tables.

---

## Out of scope (explicitly deferred)

- Runway/forecast + infra tab (then delete `finance/`) — next phase; the `payments` table (unmatched outflows included) is already designed to feed it.
- D1/enter facts table — future source; same conventions.
- Migrating KPI/economics/quest-dashboard onto the `operations` tables — opportunistic, after treasury proves the contract.
- Live FX — stays pinned in `config.json`.
- Blocked balance connectors (DO/CF/Fireworks-new/OpenAI-admin/Scaleway/OVH keys) — doctor shows them soft-red until keys land.

## Verification checklist (Definition of Done)

1. `python3 -m pytest tests/ -q` and `cd web && npx vitest run` green — incl. `test_no_leaks` (no CSV/PDF/plaintext-JSON tracked; secrets encrypted; zero cross-app references).
2. `python3 -m ingest.doctor` exit 0 (sops, tb×2, wise, stripe, gog, pdftotext all green).
3. All 9 tables populated in `operations`; `reconciliation` has a verdict for every active provider-month since 2026-01; chase list empty or consciously `recon_accepted`.
4. `treasury.myceli.ai` → 401 bare; dashboard with password; `/flows.json` serves the platform facts.
5. launchd loaded; two consecutive green daily runs in `~/Library/Logs/treasury-refresh.log`.
6. Prototype `$SA` deleted; finance app untouched.
