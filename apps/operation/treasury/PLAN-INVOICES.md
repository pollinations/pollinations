# Invoice Pipeline — Minimal Implementation Plan (Treasury Phase 1)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The invoice machine only: **gather** (Gmail via `gog` + a manual `inbox/` drop folder) → **read/extract** (pdftotext + parsers) → **Tinybird** (`invoices` + `payments` facts, gap verdicts) → **a missing-invoices frontend** where Elliot sees red cells live, clicks through to the provider portal, downloads, and drops the PDF into the inbox. Invoices become the source of truth; the compute P&L (later phase) will read cost from `invoices` ONLY.

**Relationship to `PLAN.md`:** this is Phase 1 of the umbrella plan, executable alone. Prerequisites are the umbrella's **Task 1** (scaffold + the operation-wide SOPS boundary at `apps/operation/secrets/` — for this phase `env.json` needs only `TINYBIRD_OPS_INGEST_TOKEN`, `TINYBIRD_OPS_READ_TOKEN`, `WISE_API_TOKEN`, `WISE_BUSINESS_PROFILE_ID`) and **Task 3** (`ingest/tb.py`). Everything else (usage, revenue, meter, grants, the P&L dashboard) stays in the umbrella and lands later on top of these tables. `ingest/run.py` is written here with only the invoice slice; the umbrella's Task 8 later extends it.

**Port sources (verified against the code):** `$SA = _local/2026-07-01-spend-audit`. `$SA/invoices/harvest_invoices.py` (the PROVIDERS classifier, DOMAINS/QUERIES sweeps, catalog/download flow, msgid8 idempotency), `$SA/invoices/check_billing_gaps.py` (dashboard-only provider knowledge → `billing_gaps.csv`), `$SA/build/connectors/wise.py` (Activities pull, ALIAS matching), `$SA/build/connectors/accrual.py:60-93` (Automat-IT PDF parser).

## Global Constraints

- Same as `PLAN.md` (independence, no data files in git, SOPS boundary, `operations` workspace, `tb --cloud`, Myceli CF account, branch `feat/treasury-app`, push only on explicit go), plus:
- **LAYOUT (updated 2026-07-02 — the forager split, supersedes older paths in task steps):** ALL Tinybird-facing code lives in the dedicated data app **`apps/operation/forager/`** — the schemas (`forager/tinybird/{datasources,pipes}`), the feeders (`forager/ingest/…`: connectors, invoices, gaps, run/doctor/record/label), `forager/config.json`, `forager/tests/`. **Treasury is a pure frontend** (`apps/operation/treasury/web/` + plan docs) that only reads pipes with a scoped token. Every future operation app is also a pure pipe consumer; anything that creates or feeds Tinybird goes in forager. Wherever a task step below says `ingest/…`, `tests/…`, `config.json`, or `tinybird/…`, read it as under `apps/operation/forager/`.
- **Archive layout is the existing one — do NOT reorganize.** `<archive_dir>/YYYY-MM/<provider>_<YYYY-MM-DD>_<msgid8>_<origname>.pdf`. New: `<archive_dir>/inbox/` (the manual drop folder; ingest empties it into the month layout).
- **One row per charge, not per PDF:** emails carrying an Invoice+Receipt PDF pair for the same charge (Anthropic, ElevenLabs, fal) produce ONE `invoices` row (the `Invoice-*.pdf` wins; the receipt twin is archived but gets no row).
- **Dashboard-only providers are first-class:** per `billing_gaps.csv` — openai, alibaba, perplexity, runpod, modal, openrouter, cloudflare, assemblyai, vercel, aws-direct (reseller PDFs cover it), inception. Email will never yield their PDFs; the gaps frontend + inbox is their ONLY path.
- **TOKENS (updated 2026-07-03 — Forward workspace reality, supersedes token steps below):** `operations` is a Tinybird **Forward** workspace: resource-scoped tokens can ONLY be declared in datafiles (deployed with the project), and datafile tokens cannot carry `DATASOURCES:CREATE`. Three tokens, all live and stored in SOPS `env.json`: `treasury_ingest` (datafile-managed: APPEND+READ on all 4 datasources → `TINYBIRD_OPS_INGEST_TOKEN`; use for `tb.append()` and `/v0/sql` reads), `treasury_web` (datafile-managed: PIPES:READ on the 3 endpoint pipes → `TINYBIRD_OPS_READ_TOKEN`), `treasury_replace` (API-managed static, `DATASOURCES:CREATE` only → `TINYBIRD_OPS_REPLACE_TOKEN`; **every `tb.replace()` call MUST use this token** — replace mode requires CREATE scope, verified empirically). Datasource schemas carry `json:$.field` JSONPaths (required by the Events API).

## The flow

```
each run — manual `python3 -m ingest.run` for now (cron deferred to a later phase)
  1 GATHER   gmail sweep (gog, newer_than:3d)  ─┐
             inbox/ drop folder sweep           ├─► archive YYYY-MM/…  (sha256-dedup vs TB)
  2 READ     pdftotext -layout → parser registry → {provider, period, amount, currency, number}
  3 PUSH     invoices rows (append) · payments rows (Wise, replace by month)
  4 FLAG     expectations (credits.json billing/active window) × payments × invoices
             → reconciliation verdicts (full replace) → gaps pipe
frontend     treasury.myceli.ai/missing — provider × month grid; red cell → portal URL;
             "download → drop into inbox → next run ingests it"
```

---

### Task I1: Tinybird slice — 4 datasources + 3 pipes

**Files (all under the SHARED `apps/operation/tinybird/` — NOT inside treasury):**
- Create: `apps/operation/tinybird/.gitignore` (`.tinyb`), `apps/operation/tinybird/README.md` (the table contract: one line per datasource/pipe, "read pipes from your app, never re-pull sources; schemas change only via this folder")
- Create: `apps/operation/tinybird/datasources/invoices.datasource`, `payments.datasource`, `reconciliation.datasource`, `ingest_runs.datasource`; `apps/operation/tinybird/pipes/invoices_ep.pipe`, `gaps_ep.pipe`, `coverage_ep.pipe`

**Interfaces:**
- Produces: the four schemas below (identical to the umbrella's where they overlap — the other 5 tables arrive with later phases) + pipes for the frontend.

- [ ] **Step 1: Write the datasource files**

`invoices.datasource`:
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
(`category`: compute|infra|saas|payroll|self|other — from the harvest classifier groups; compute P&L filters `category='compute'`. `kind`: monthly_bill|prepaid_topup|reseller|subscription|unknown. `source`: email|inbox. `status`: parsed|needs_label. `msgid`: Gmail message id, empty for inbox drops — pairs dedupe on it.)

`payments.datasource` (Wise outflows per transaction; unmatched counterparties keep `provider=''`):
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
(`status` here: ok|ok_credit|missing_invoice|missing_payment|amount_mismatch|needs_label|accepted.)

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

- [ ] **Step 2: Write the pipes**

`invoices_ep.pipe`: `SELECT * FROM invoices ORDER BY provider, period_month` · `TYPE endpoint`

`gaps_ep.pipe` (the chase list):
```
NODE gaps
SQL >
    SELECT month, provider, billing, status, invoice_usd, payment_usd, delta_usd,
           invoice_refs, payment_refs, note
    FROM reconciliation
    WHERE status IN ('missing_invoice', 'amount_mismatch', 'needs_label')
    ORDER BY month DESC, provider

TYPE endpoint
```

`coverage_ep.pipe` (the grid — one row per provider × month with its verdict):
```
NODE coverage
SQL >
    SELECT month, provider, billing, status, invoice_usd, payment_usd
    FROM reconciliation
    ORDER BY provider, month

TYPE endpoint
```

- [ ] **Step 3: Deploy + token scopes** — from `apps/operation/tinybird/`: `tb --cloud deploy --check --wait` then `tb --cloud deploy --wait`; grant `treasury_web` PIPES:READ on the three pipes (UI). Smoke: `curl .../v0/pipes/gaps_ep.json -H "Authorization: Bearer $WEB"` → `{"data":[]}`.

- [ ] **Step 4: Commit** — `git add apps/operation/tinybird && git commit -m "feat(operations): shared tinybird platform — invoice-phase slice"`

---

### Task I2: Gather — harvest port + inbox drop folder

**Files:**
- Create: `ingest/invoices/__init__.py`, `ingest/invoices/harvest.py`
- Test: `tests/test_harvest.py`

**Interfaces:**
- Consumes: `gog` CLI (`config["gog_account"]`), `tb.TB`, `creds.load_config()`
- Produces: `harvest.gmail_sweep(config, tb_ops, today, since=None) -> dict` (counts) · `harvest.inbox_sweep(config, tb_ops, today) -> dict` · both end with new PDFs archived under `YYYY-MM/` and handed to `extract_and_push` (Task I3). `harvest.classify(frm, subject) -> (slug, category)`.

- [ ] **Step 1: Port `$SA/invoices/harvest_invoices.py` → `harvest.py`.** Carry over verbatim: `PROVIDERS` (all 44 entries, order matters — specifics first), `DOMAINS`, `QUERIES`, `classify`, `safe`, the `search_all` merge-by-msgid, the `gmail get` attachment normalization (list/dict/message quirk — keep the exact code), and the download call shape `gog("gmail", "attachment", msgid, attachmentId, "--out", mdir, "--name", name)`. Changes:
  - `gog()` helper gains the account: `["gog", "-a", config["gog_account"], *args]`.
  - `OUT` → `config["archive_dir"]`; same `YYYY-MM/` month dirs, same filename scheme.
  - Extend `PROVIDERS` entries with a category: turn the list into `(slug, category, keys)` — compute (the provider list through `openrouter`/`inception`), infra (`tinybird`→`digitalocean`), saas/office (`exafunction`→`enty`, `slack`, `tele2`, `naturenergie`, `wise`, `github`), payroll (`deel`), self (`self-issued`); `classify` returns `(slug, category)`, default `("other", "other")`.
  - Daily mode appends `newer_than:3d` to every query; backfill passes `since` → `after:` (existing behavior).
  - Idempotency: keep msgid8-in-month-dir check AND add sha256-vs-Tinybird (`SELECT sha256 FROM invoices`) after download — a re-downloaded duplicate is deleted, not re-pushed.
  - Every archived PDF is immediately passed to `extract.extract_and_push` (Task I3) — one flow, no separate "read" pass. Where the email had an Invoice+Receipt PDF pair (same msgid, one filename starting `Invoice`, another `Receipt`), only the `Invoice-*.pdf` is passed on; the receipt is archived with no row.
  - `catalog.json` / `manifest.csv` / `no_pdf_found.json` side-files are DROPPED — Tinybird is the manifest now. The catalog-mode summary grid print stays (it's useful operator feedback).

- [ ] **Step 2: Write `inbox_sweep`** — for each PDF in `<archive_dir>/inbox/`: sha256-dedup vs TB; classify by filename prefix if it matches `<provider>_...`, else run `extract` first and use its parser hint, else `("other","other")` + `needs_label`; move to `<archive_dir>/<YYYY-MM>/<provider>_<date>_<sha8>_<origname>.pdf` (month = extracted period, fallback today's month); push its row. Empty inbox = the goal state.

- [ ] **Step 3: Tests** (`tests/test_harvest.py`):

```python
from ingest.invoices import harvest

def test_classify_specifics_beat_generics():
    assert harvest.classify("billing@automat-it.com", "Tax Invoice")[0] == "aws"
    assert harvest.classify("Google Workspace <noreply@google.com>", "Invoice")[0] == "google-workspace"
    assert harvest.classify("x@lambdal.com", "receipt")[0] == "lambda"

def test_classify_categories():
    assert harvest.classify("invoice+statements@mail.anthropic.com", "receipt")[1] == "compute"
    assert harvest.classify("billing@tinybird.co", "invoice")[1] == "infra"
    assert harvest.classify("no-reply@deel.com", "payment summary")[1] == "payroll"

def test_invoice_receipt_pair_prefers_invoice():
    pdfs = [{"filename": "Receipt-2876.pdf"}, {"filename": "Invoice-PYGJ-0024.pdf"}]
    assert harvest.pick_primary(pdfs)["filename"].startswith("Invoice")
```

- [ ] **Step 4: Run → FAIL → implement → PASS. Commit** — `feat(treasury): invoice harvest (gmail + inbox)`

---

### Task I3: Read/extract — pdftotext + parser registry + label CLI

**Files:**
- Create: `ingest/invoices/extract.py`, `ingest/invoices/parsers/__init__.py`, `parsers/automat_it.py`, `parsers/stripe_receipt.py`, `parsers/generic.py`, `ingest/invoices/label.py`
- Test: `tests/test_extract.py`

**Interfaces:**
- Consumes: `pdftotext`, harvest hints `(slug, category)`
- Produces: `extract.extract_and_push(tb_ops, path, slug, category, msgid, source, config, today)` — parses, builds the row, appends to `invoices` (plus parser extras: Automat-IT's credit line + credits-left footer go to a note for now — meter/grants tables are later phases) · `extract.parse(txt, slug, config, today) -> dict|None` (pure, testable) · `python3 -m ingest.invoices.label <sha256> --provider X --month YYYY-MM --amount N --currency USD|EUR --kind K` (emits a corrected duplicate row with `status='parsed'`; consumers take the latest row per sha256).

- [ ] **Step 1: `extract.py`** — `pdf_text(path)` = `pdftotext -layout <path> -` (subprocess, 30s timeout); `sha256(path)`; parser registry `[automat_it, stripe_receipt, generic]` — first whose `matches(txt, slug)` is True wins; any missing required field (amount, period) → `status="needs_label"` with whatever was found; a row is ALWAYS pushed (nothing silently dropped). `kind` from the pool's `billing` in credits.json (provider→pool lookup via each pool's `providers` list; unknown provider → `kind="unknown"`). `amount_usd = amount * config["fx_eur_usd"]` when currency EUR, else `amount`.

- [ ] **Step 2: Parsers**
  - `automat_it.py` — the verified parser from `$SA/build/connectors/accrual.py:68-88`, regexes character-for-character (`BILLING PERIOD: \d{2}/(\d{2})/(\d{4})`, `Tax Invoice-\s*(\S+)`, `INVOICE TOTAL\s+EUR\s*([\d,]+\.?\d*)`, the Credits-Used layout regex, `remaining credits are\s*([\d,]+)\s*EUR`). Emits the cash total as the invoice row (`kind="reseller"`, currency EUR); credit-used + credits-left are returned in a separate `extras` dict (`{"ait_credit_eur": …, "ait_credits_left_eur": …}`) — ignored by `extract_and_push` for now, consumed by the meter/grants phases later (the `invoices` schema deliberately has no note column).
  - `stripe_receipt.py` — Anthropic/ElevenLabs/fal/xai-style Stripe-generated PDFs: `matches` on `"Receipt number"` or `"Invoice number"` + `"$"`; extracts `(?:Amount paid|Total)\s+\$?([\d,]+\.\d{2})`, `(?:Invoice|Receipt) number:?\s*(\S+)`, `Date (?:paid|due):?\s*([A-Z][a-z]+ \d{1,2}, \d{4})` → period = that date's month.
  - `generic.py` — always matches last: total via `(?:total|amount due|amount paid|grand total)\D{0,20}([\d,]+\.\d{2})` (case-insensitive), currency from `(USD|EUR|\$|€)` near the total, number via `(?:invoice|receipt)\s*(?:no\.?|number|#)\s*:?\s*(\S+)`, period = month of the latest parseable date in the text.

- [ ] **Step 3: Tests** (`tests/test_extract.py`) — synthetic invoice TEXTS (monkeypatch `pdf_text`; no real PDFs in git): the Automat-IT fixture asserts amount/period/number/note extraction; a Stripe-receipt fixture asserts `$` amount + period; an unparseable text asserts `needs_label` row still produced. (Fixture strings modeled on the plan-v2 Task 5 tests — reuse them.)

- [ ] **Step 4: `label.py`** — argparse CLI per the interface; validates provider against credits.json; recomputes `amount_usd`; prints the corrected row. Test: labeling an unknown provider exits with the known-pool list.

- [ ] **Step 5: FAIL → implement → PASS. Commit** — `feat(treasury): invoice extraction + parsers + label CLI`

---

### Task I4: Payments — the inverse signal (Wise per transaction)

**Files:**
- Create: `ingest/connectors/__init__.py`, `ingest/connectors/common.py` (http_json/months_ytd/strip_html only, severed as in umbrella Task 4), `ingest/connectors/wise.py`
- Test: `tests/test_connectors.py`

**Interfaces:**
- Produces: `wise.outflow_rows(creds, months, fx, today) -> list[dict]` (payments-shaped, unmatched included) — exactly the umbrella Task 4 port (ALIAS/`_match`/`_fetch_month` verbatim from `$SA`, per-transaction emitter with `wise_ref`, `paid_at`). Copy that task's code and tests 1:1; they are already written against the verified `$SA/build/connectors/wise.py`.

- [ ] Steps: copy umbrella **Task 4 Step 1 (wise/common parts only) + Step 2 tests** → run → PASS → commit `feat(treasury): wise payments connector`.

---

### Task I5: Gaps engine — who's missing

**Files:**
- Create: `ingest/gaps.py`, `ingest/run.py`, `ingest/doctor.py`
- Modify: `secrets/credits.json` (operator — see Step 1)
- Test: `tests/test_gaps.py`

**Interfaces:**
- Consumes: invoices rows, payments rows, per-pool metadata
- Produces: `gaps.run(invoices, payments, pools, months, config, today) -> list[dict]` (reconciliation-shaped) · `python3 -m ingest.run` (daily: gather → extract → payments → gaps → log) · `python3 -m ingest.doctor` (hard: sops, tb-ops, wise, gog, pdftotext; soft: archive writable, freshness < 26h — the umbrella Task 8 doctor minus stripe/tb-prod/balance checks).

- [ ] **Step 1 (operator): enrich `apps/operation/secrets/credits.json` pools** with the fields the engine and frontend need — per pool: `billing` (monthly|prepaid|reseller|subscription|sponsored), `active_from` ("YYYY-MM"; when we started using it — read off the harvest summary grid), optional `active_until`, `portal` (billing-console URL, e.g. `https://platform.openai.com/settings/organization/billing` — source them from the manual_grid `where_to_read` column and `billing_gaps.csv` knowledge), `invoice_channel` (email|portal).

- [ ] **Step 2: Failing tests** (`tests/test_gaps.py`) — they define the semantics:

```python
from ingest import gaps

CFG = {"recon_tolerance_pct": 0.02, "recon_tolerance_usd": 2.0, "recon_accepted": []}
POOLS = [
    {"pool": "Google", "providers": ["google"], "billing": "monthly", "active_from": "2026-01"},
    {"pool": "RunPod", "providers": ["runpod"], "billing": "prepaid", "active_from": "2026-01"},
    {"pool": "Azure spons", "providers": ["azure"], "billing": "sponsored", "active_from": "2026-01"},
]

def _run(inv=[], pay=[], months=["2026-06"]):
    return gaps.run(inv, pay, POOLS, months, CFG, today="2026-07-02")

def test_monthly_active_window_expects_invoice():
    r = next(x for x in _run() if x["provider"] == "google")     # active, no invoice, no payment
    assert r["status"] == "missing_invoice"

def test_before_active_from_expects_nothing():
    rows = gaps.run([], [], [{"pool": "Late", "providers": ["late"], "billing": "monthly",
                              "active_from": "2026-06"}], ["2026-05"], CFG, today="2026-07-02")
    assert not [x for x in rows if x["provider"] == "late" and x["status"] != "ok"]

def test_prepaid_payment_without_invoice():
    r = next(x for x in _run(pay=[{"month": "2026-06", "provider": "runpod", "amount_usd": 500.0,
                                   "wise_ref": "w2", "paid_at": "2026-06-10"}])
             if x["provider"] == "runpod")
    assert r["status"] == "missing_invoice" and r["payment_refs"] == "w2"

def test_prepaid_matched_within_tolerance_is_ok():
    r = next(x for x in _run(
        inv=[{"provider": "runpod", "kind": "prepaid_topup", "period_month": "2026-06",
              "amount_usd": 495.0, "sha256": "b2", "status": "parsed", "issued_at": "2026-06-11"}],
        pay=[{"month": "2026-06", "provider": "runpod", "amount_usd": 500.0,
              "wise_ref": "w2", "paid_at": "2026-06-10"}]) if x["provider"] == "runpod")
    assert r["status"] == "ok"                # delta 5 ≤ max(2%·500, $2) = 10

def test_needs_label_is_amber_not_ok():
    r = next(x for x in _run(inv=[{"provider": "google", "kind": "monthly_bill",
                                   "period_month": "2026-06", "amount_usd": 0.0,
                                   "sha256": "c3", "status": "needs_label"}])
             if x["provider"] == "google")
    assert r["status"] == "needs_label"

def test_sponsored_is_ok_credit():
    assert next(x for x in _run() if x["provider"] == "azure")["status"] == "ok_credit"
```

- [ ] **Step 3: Implement `gaps.py`** — per (provider, month) within `[active_from, active_until or now]`:
  - `sponsored` → `ok_credit`.
  - `monthly`/`reseller`/`subscription` (AMENDED 2026-07-03 — was "compare Σinvoice vs Σpayments in M..M+1", which double-counted steady monthly payers; the invoice's own `period_month` governs, and every payment pays exactly ONE invoice): invoices with `period_month == M`; parsed → greedy-match each invoice to the nearest-dated UNUSED payment in the M..M+1 window (nearest by |`paid_at` − `issued_at`|; each payment consumed at most once across the whole run, so July's transfer claimed by June's invoice is gone when July reconciles) — match within tolerance `max(pct·inv, usd)` → `ok`; nearest available payment outside tolerance → `amount_mismatch`; no unused payment in window → `missing_payment`; only `needs_label` rows → `needs_label`; none → `missing_invoice`.
  - `prepaid`: greedy-match each payment to an unused parsed invoice (±tolerance, ±10 days on `issued_at` vs `paid_at`); unmatched payment → `missing_invoice` (refs = wise_refs); unmatched invoice → `missing_payment`; needs_label invoices present → `needs_label`; no activity → `ok`.
  - `config["recon_accepted"]` (`"YYYY-MM:provider"`) → `accepted`.
  - Providers seen in invoices/payments but in NO pool (saas/payroll/other) get NO verdict rows — compute/infra scope comes from the pools list.
- [ ] **Step 4: `run.py`** — thin orchestrator: `doctor`-style creds load; `harvest.gmail_sweep` (+`--backfill` → `since=config months_start`); `harvest.inbox_sweep`; `wise.outflow_rows` per window (`repull_months`, or all on backfill) → `ops.replace("payments", …, condition=month)`; read `invoices`+`payments` back; `gaps.run(...)` → `ops.replace("reconciliation", rows)`; append `ingest_runs`; print the chase list (every missing_invoice/amount_mismatch/needs_label).
- [ ] **Step 5: PASS → commit** — `feat(treasury): invoice gap engine + orchestrator`

---

### Task I6: Backfill — import the 233 PDFs, first real gap report

- [ ] **Step 1:** `mkdir -p ~/Documents/treasury-invoices && cp -r $SA/invoices/2026-* ~/Documents/treasury-invoices/ && cp $SA/invoices/_manual-preexisting/* ~/Documents/treasury-invoices/inbox/` (month dirs keep their layout; the 5 hand-saved ones go through the inbox path to get named + classified).
- [ ] **Step 2:** one-off import of the pre-organized month dirs: `python3 -m ingest.run --import-archive` (a flag on run.py: walk `YYYY-MM/` dirs, sha-dedup, re-derive `(slug, category)` from the filename prefix via the classifier table, extract, push — ~15 lines).
- [ ] **Step 3:** `python3 -m ingest.doctor && python3 -m ingest.run --backfill` — full Gmail sweep since 2026-01 (catches anything the old harvest missed), Wise Jan→now, first gap report.
- [ ] **Step 4:** eyeball the chase list against known truths: aws-direct months should be covered by reseller invoices; openai/alibaba/perplexity/runpod/modal/openrouter/cloudflare months should light up red (dashboard-only — expected!); `needs_label` count should be small. Fix classifier/parser surprises now, label the rest.
- [ ] **Step 5:** commit `feat(treasury): invoice backfill + first gap baseline` (code/config changes only — PDFs and data stay out of git; the leak-guard test enforces it).

---

### Task I7: The missing-invoices frontend

**Files:**
- Create: `web/worker/index.ts`, `web/worker/html.d.ts`, `web/missing.html`, `web/wrangler.toml`, `web/package.json`, `web/tsconfig.json`

**Interfaces:**
- Consumes: pipes `coverage_ep`, `gaps_ep`, `invoices_ep` via `TINYBIRD_OPS_READ_TOKEN`
- Produces: `https://treasury.myceli.ai/missing` (Basic auth) — the chase UI; `/gaps.json` raw. The umbrella later adds `/` (the P&L dashboard) to this same worker.

- [ ] **Step 1: `wrangler.toml` / `package.json` / `tsconfig.json`** — exactly the umbrella Task 11 Step 1 + Task 10 package.json (same worker name `myceli-treasury`, same route, same Text rule, same secrets comment).

- [ ] **Step 2: `worker/index.ts`** — the umbrella Task 11 worker with the Basic-auth middleware and cached `pipe()` helper verbatim (KPI pattern), but Phase-1 routes only — cache TTL 900 (15 min — you want to see a dropped invoice turn green quickly after a run):

```typescript
app.get("/gaps.json", async (c) => c.json(await pipe(c.env, "gaps_ep")));
app.get("/missing", async (c) => {
    const [coverage, gaps] = await Promise.all([pipe(c.env, "coverage_ep"), pipe(c.env, "gaps_ep")]);
    return c.html(missingHtml
        .replace("/*COVERAGE*/", JSON.stringify(coverage))
        .replace("/*GAPS*/", JSON.stringify(gaps)));
});
app.get("/", (c) => c.redirect("/missing"));   // until the P&L dashboard lands here
```

- [ ] **Step 3: `web/missing.html`** — one self-contained page (vanilla JS + inline CSS, same style family as `template.html`):
  - `const COVERAGE = /*COVERAGE*/; const GAPS = /*GAPS*/;` injected server-side like the dashboard.
  - **Grid**: rows = providers (from COVERAGE), columns = months; cell classes: `ok`/`ok_credit` green (shows `$inv`), `missing_invoice` red, `needs_label`/`amount_mismatch` amber, `accepted` grey, no row = blank. Header shows totals: `N missing · M amber`.
  - **PORTALS map**: `const PORTALS = { openai: "https://platform.openai.com/settings/organization/billing", runpod: "https://console.runpod.io/user/billing", ... }` — one entry per pool, copied from the `portal` fields set in Task I5 Step 1 (URLs are not secrets; fine in the public repo).
  - **Click a red/amber cell** → detail panel: why it's expected (billing type, payment refs + amounts if payment-driven), the portal link (`target=_blank`), and the standing instruction: *"Download the PDF → drop it into `~/Documents/treasury-invoices/inbox/` → it turns green on the next run (`python3 -m ingest.run`)."* `needs_label` cells show the label command with the sha256 pre-filled.

- [ ] **Step 4: Verify locally** (`wrangler dev` + `.dev.vars`, curl 401 bare / 200 with password, grid renders backfill data), **deploy** (operator: myceli account, both secrets, `npm run deploy`), check `https://treasury.myceli.ai/missing` live.

- [ ] **Step 5: `npx biome check --write web/` → commit** — `feat(treasury): missing-invoices frontend`

---

### Task I8: Runbook + Definition of Done

**Cron is DEFERRED** (per Elliot, 2026-07-02) — refresh stays manual (`python3 -m ingest.doctor && python3 -m ingest.run`) until the umbrella's cron task lands. Nothing in this phase may assume a scheduler exists.

- [ ] **Step 1:** `README.md` — invoice-phase runbook: the flow diagram, the manual refresh command, inbox workflow, label CLI, the dashboard-only provider list (ported from `$SA/invoices/README.md` — statuses only, amounts stripped), `/missing` URL.
- [ ] **Step 2 (Definition of Done):** pytest green incl. leak-guard · doctor exit 0 · `invoices` ≥ 230 rows, `payments` ≥ 6 months, `reconciliation` verdicts for every pool-month since 2026-01 · `/missing` live behind password, red cells match known dashboard-only providers · two consecutive green manual runs on different days · chase list either shrinking or consciously `recon_accepted`.

---

## Out of scope (this phase)

Usage/revenue/meter/grants tables, the P&L dashboard (`/`), `logic/build.js`, seeds from finance pool-history, Stripe — all umbrella `PLAN.md`, which now consumes `invoices` as the ONLY compute-P&L cost source when it lands. The old finance app and `$SA` stay untouched.
