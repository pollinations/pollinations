# Forager — Agent Runbook

Forager is the ONLY writer to the Tinybird `operations` workspace. The treasury
web app is a read-only mirror. Every correction happens here, via these
workflows. Run everything from `apps/operation/forager/`.

The workspace holds six datasources: `transactions`, `provider_monthly`,
`pollen_monthly`, `revenue_monthly`, `grants`, `ingest_runs`. The first four
are rebuilt by `ingest.run` (replace); `grants` and `ingest_runs` are
append-only.

## Safety rules

- Every `ingest.run` snapshots ALL six datasources (append-only `grants` and
  `ingest_runs` included) to
  `~/Documents/treasury-backups/<UTC stamp>/<table>.ndjson` BEFORE writing, then
  prints a `+added/-removed` diff per replaced table.
- A write that would lose a manual `provider_monthly` row's data — no surviving
  manual-sourced row for that vendor/month/currency — aborts unless `--yes` is
  given (rows merged into a `manual,api` row are not lost).
- `--dry-run` = snapshot + diff, write nothing. Use it before any run you are
  unsure about; it does not append to `ingest_runs`.
- `replace` refuses to write 0 rows, so a failed pull never wipes a table.
- Restore = re-replace a table with its snapshot file (see Restore below).
- Hard scope rule: December 2025 (pre-window) costs and revenue are ignored —
  `months_start` is 2026-01. Cross-window artifacts (a December invoice charged
  in January, a December reload funding January usage) are accepted
  reconciliation wedges, never data to backfill.
- ONE carve-out (2026-07-07): `provider_monthly` also holds pre-window (2025)
  CREDIT rows recorded manually so grant burn accounts to zero — witnessed
  where an API reaches back (azure Cost Management, openai org costs), derived
  from dashboard used/left facts otherwise (aws, google, io.net — booked as a
  2025-12 bucket). They serve ONLY the treasury app's Credits runway lens; the
  web app clamps every other lens to `WINDOW_START = 2026-01`. Never record
  pre-window PAID rows except the invoice-witnessed azure Dec 2025.

## Workflows

### Full update

```bash
python3 -m ingest.run
```

Refreshes all four tables and appends an `ingest_runs` entry.

### One table

```bash
python3 -m ingest.run --dry-run --only provider   # inspect the diff first
python3 -m ingest.run --only provider             # then write
```

`--only` is one of `provider | pollen | revenue | transactions`.

### One month

```bash
python3 -m ingest.run --dry-run --month 2026-07
python3 -m ingest.run --month 2026-07
```

Splices the given `YYYY-MM` into the affected tables, including
`transactions` (re-pulled from Wise for that month only). A bare run without
`--month` rebuilds every table from `months_start`.

### One vendor (meter)

```bash
python3 -m ingest.run --dry-run --only provider --vendor fireworks
python3 -m ingest.run --only provider --vendor fireworks
```

`--vendor` requires `--only provider` and must be a meter-connector slug:
`alibaba | anthropic | aws | azure | cloudflare | community | deepinfra | elevenlabs | vast.ai | ovhcloud | fireworks | google | openai | openrouter | runpod | xai`.
`community` mirrors our own pollen ledger (user-deployed models earn pollen,
75/25 split, never cashed out) — all credit, no cash ever.
Manual-only vendors are updated with `ingest.record`, not here.
`aws` meters through Umbrella Cost, the Automat-it reseller's own dashboard
API (Cost Explorer cannot see reseller pricing/credits) — coverage starts
2026-04 (AIT onboarding); Jan–Mar 2026 and the 2025 pre-window rows stay
manual from `aws ce` credit records. The monthly AIT invoice remains the
reconciliation witness in `invoices_ep`, no longer the meter source.

### Add a manual meter row

```bash
python3 -m ingest.record provider io.net 2026-07 --currency USD --credit 123.45
```

Appends one `source="manual"` row to `provider_monthly`. Vendor must be in
`registry.CANONICAL`; at least one of `--credit`/`--paid` must be > 0. Manual
rows survive every subsequent `ingest.run` (they are re-merged, not dropped).

**Month contract: `provider_monthly.month` is the USAGE month (the service
period the charge covers), never the invoice or charge date.** An invoice
issued Feb 3 for January consumption is recorded as `2026-01`. When an invoice
spans months, split it into one row per month. The treasury app's calibration
math (provider actual ÷ our metering, per month) silently breaks when a row
lands in the billing month instead — the app flags the mismatch as swinging
`calib ×` values on the Vendors tab, but the fix is always here, at recording
time.

### Remove / correct a manual meter row

Manual rows persist across runs, so removing one is a surgical replace. Dry-run
`ingest.run` first if you want to see current state; then rebuild the table
without the offending row (the snapshot happens inside the script):

```bash
python3 - <<'EOF'
from ingest import backup, creds, tb

secrets, config = creds.load_creds(), creds.load_config()
read = tb.TB(config["tb_ops_api"], secrets["TINYBIRD_OPS_INGEST_TOKEN"])
write = tb.TB(config["tb_ops_api"], secrets["TINYBIRD_OPS_REPLACE_TOKEN"])

rows = backup.snapshot_table(read, "provider_monthly", backup.run_directory(config))
keep = [
    r for r in rows
    if not (r["vendor"] == "io.net" and r["month"] == "2026-07"
            and "manual" in r["source"])
]
assert len(keep) == len(rows) - 1, "expected exactly one row to drop"
write.replace("provider_monthly", keep)
EOF
```

To correct a value, delete the row this way and re-add it with `ingest.record`.

### Add a vendor alias

Edit `config/vendor_aliases.json` — add the canonical slug mapped to an entry
`{"aliases": [...], "category": "...", "category_rules": [...]}`:

- `aliases`: identifying substrings (lowercased) that resolve rows to this slug.
- `category`: the vendor's default category (one of `compute | infra | saas |
  admin | office | payroll`).
- `category_rules` (optional): ordered `{"match": "...", "category": "..."}`
  keyword overrides, matched as lowercase substrings against the row's bank +
  invoice text. Use them when one vendor spans categories — e.g. an Anthropic
  Claude subscription is `saas` while API usage is `compute`.

Adding a vendor = aliases + category. A category fix = edit the entry and re-run
the affected table:

```bash
python3 -m ingest.run --dry-run --only transactions   # confirm the new mapping
python3 -m ingest.run --only transactions
```

If the alias affects a meter vendor, also re-run `--only provider` to remap its
`provider_monthly` rows.

Categories are fully deterministic (vendor keyword rules, then exact-amount
rules for fixed-price rows the text cannot split, then the vendor's default
category, then `admin` for unmatched rows that are also flagged) — there is no
AI verify pass.

The slug also becomes valid for `ingest.record` (it reads `registry.CANONICAL`,
which is the alias keys).

### Split a bundled bank transfer

`config/transaction_splits.json` replaces one Wise movement with its
invoice-line parts at ingest (a deliberate, per-row exception to the 1:1 Wise
mirror — e.g. a reimbursement transfer covering Cloudflare + Scaleway +
Workspace invoices). Each rule: `match` on `{date, amount, currency, text}`
(text = lowercase counterparty substring) + `parts` of
`{vendor, category, amount}`. Parts must sum to the matched amount to the
cent or the run fails. A part may add `"date"`: the invoice month it covered,
when the transfer reimburses older bills — the P&L groups by row date, so
this books each line to its consumption month (parts dated before 2026-01
stay in the table but out of the window's calculations; Elliot's ruling
2026-07-08). Splits survive every rebuild because they are applied
by `wise.apply_splits` during the pull — never edit the table directly (the
next run would wipe it). After editing, `--dry-run --only transactions`,
then write.

### Inspect current rows

```bash
python3 -m ingest.inspect provider_monthly --vendor replicate --month 2026-07
```

Read-only; prints matching rows as JSON lines plus a count. Tables:
`transactions | provider_monthly | pollen_monthly | revenue_monthly | ingest_runs`.
`--vendor` is invalid on `revenue_monthly`/`ingest_runs`; `--limit` defaults
to 200.

### Verify after any write

```bash
python3 -m ingest.inspect <table> --month <month>   # confirm rows landed
python3 -m ingest.doctor                             # preflight/health checks
```

Also read the `+added/-removed` diff line the run printed and the `*_diff`
fields in its `ingest_runs` status.

### Restore a table

Every run leaves a snapshot at
`~/Documents/treasury-backups/<UTC stamp>/<table>.ndjson`. To roll a table back,
re-replace it with the rows from that file:

```bash
python3 - <<'EOF'
import json
from ingest import backup, creds, tb

SNAPSHOT = "~/Documents/treasury-backups/20260706T101112Z/provider_monthly.ndjson"

secrets, config = creds.load_creds(), creds.load_config()
read = tb.TB(config["tb_ops_api"], secrets["TINYBIRD_OPS_INGEST_TOKEN"])
write = tb.TB(config["tb_ops_api"], secrets["TINYBIRD_OPS_REPLACE_TOKEN"])

import os
with open(os.path.expanduser(SNAPSHOT)) as fh:
    rows = [json.loads(line) for line in fh if line.strip()]
assert rows, "snapshot is empty — refusing to replace"
backup.snapshot_table(read, "provider_monthly", backup.run_directory(config))
write.replace("provider_monthly", rows)
EOF
```

## Secrets

sops-encrypted `secrets/env.json` (age key in the macOS keychain). Never print
values; `ingest.run` redacts them from error output.
