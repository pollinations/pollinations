# Forager — invoice ingest runbook

Forager is the data app for the operations workspace. It harvests provider invoices, pulls Wise payments, and writes reconciliation verdicts to Tinybird. The treasury frontend reads those pipes; forager owns all writes.

Schema/token contract: [`tinybird/README.md`](tinybird/README.md)

---

## The flow

```
each run  (manual — cron deferred)
  1 GATHER   gmail sweep (gog, newer_than:3d)  ─┐
             inbox/ drop folder sweep           ├─► archive ~/Documents/treasury-invoices/YYYY-MM/…  (sha256-dedup vs TB)
  2 READ     pdftotext -layout → parser registry → {provider, period, amount, currency, number}
  3 PUSH     invoices rows (append) · payments rows (Wise, replace by month)
  4 FLAG     credits.json active windows × payments × invoices
             → reconciliation verdicts (full replace) → gaps_ep pipe
frontend     treasury.myceli.ai/missing — provider × month grid; red cell → portal URL
             (DEFERRED — query chase list via gaps_ep in the meantime)
```

---

## Manual refresh

Run from `apps/operation/forager/`:

```bash
python3 -m ingest.doctor && python3 -m ingest.run
```

- `doctor` exits 0 only when all hard checks pass (sops, tinybird-ops, wise, gog, pdftotext). Soft warnings (archive writable, freshness) print but don't block.
- `run` harvests Gmail (last 3 days), drains the inbox, pulls Wise payments for the last 2 months, updates reconciliation, logs the run, and prints the chase list.

Backfill (all months since `config.months_start`):

```bash
python3 -m ingest.run --backfill
```

---

## Inbox workflow

For providers that never email a PDF (see dashboard-only list below):

1. Download the PDF from the provider portal.
2. Drop it into `~/Documents/treasury-invoices/inbox/`.
3. Run `python3 -m ingest.run`.

The inbox is drained on every run: each PDF is sha256-deduped against Tinybird, classified from the filename prefix, extracted, moved to `YYYY-MM/<provider>_<date>_<sha8>_<origname>.pdf`, and pushed. An empty inbox after the run is the goal state.

---

## Label CLI

When a PDF can't be fully parsed, it lands in `invoices` with `status='needs_label'` and shows up amber in the chase list. Fix it with:

```bash
python3 -m ingest.invoices.label <sha256> \
    --provider <slug> \
    --month YYYY-MM \
    --amount <N> \
    --currency USD|EUR \
    --kind prepaid_topup|monthly_bill|reseller|subscription \
    [--number INV-123]
```

The command appends a corrected row with `status='parsed'`; downstream always takes the latest row per sha256. Provider slug must exist in `credits.json` pools — an unknown slug exits with the known-provider list. EUR amounts are converted to USD using `config.json` `fx_eur_usd`.

---

## Dashboard-only providers

These providers never send a PDF by email. Their invoices must be downloaded manually from the portal and dropped into the inbox. The reconciliation engine knows they are expected to show up red until the inbox is fed.

| Provider | Why email can't catch it |
|---|---|
| **aws (direct)** | Budget/alert emails only — actual AWS cost covered by Automat-IT reseller PDFs (captured under `aws`). |
| cloudflare | Startup-plan invoices are dashboard-only. |
| modal | Payment receipts are link-only. |
| openrouter | Billing-update emails only, no PDF attachment. |
| perplexity | Dashboard credits only. |
| alibaba | Console (BSS) only — free-quota notices in email, no invoice PDF. |
| openai | Dashboard billing only. |
| assemblyai | Startup program, dashboard. |
| vercel | Dashboard only. |
| runpod | Dashboard / GraphQL only. |
| inception | No billing email at all. |

Portal URLs for each provider live in `apps/operation/secrets/credits.json` under each pool's `portal` field and are rendered in the `/missing` frontend (once deployed).

---

## Chase list (current approach)

Until `treasury.myceli.ai/missing` is live, query the chase list directly:

```bash
# all open items
curl "https://api.europe-west2.gcp.tinybird.co/v0/pipes/gaps_ep.json" \
  -H "Authorization: Bearer $TINYBIRD_OPS_READ_TOKEN"
```

Or read it from the run output — every `python3 -m ingest.run` prints the CHASE LIST at the end.

---

## Definition of Done — invoice phase

- [x] `pytest tests/ -q` green including `test_no_leaks`
- [x] `python3 -m ingest.doctor` exits 0
- [ ] `invoices` ≥ 230 rows, `payments` ≥ 6 months, `reconciliation` verdicts for every pool-month since 2026-01
- [ ] Two consecutive green manual runs on different days
- [ ] Chase list either shrinking or entries consciously added to `config.json` `recon_accepted`
- [ ] **[blocked: frontend deferred]** `treasury.myceli.ai/missing` live behind password
- [ ] **[blocked: frontend deferred]** Red cells match known dashboard-only providers
