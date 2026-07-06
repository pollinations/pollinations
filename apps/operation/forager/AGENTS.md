# Forager — Agent Runbook

Forager is the ONLY writer to the Tinybird `operations` workspace. The treasury
web app is a read-only mirror. Every correction happens here, via these
workflows. Run everything from `apps/operation/forager/`.

The workspace holds five datasources: `transactions`, `meter_monthly`,
`usage_monthly`, `revenue_monthly`, `ingest_runs`.

## Safety rules

- Every `ingest.run` snapshots the four replaced tables (`meter_monthly`,
  `usage_monthly`, `revenue_monthly`, `transactions`) to
  `~/Documents/treasury-backups/<UTC stamp>/<table>.ndjson` BEFORE writing, then
  prints a `+added/-removed` diff per table.
- A write that would lose a manual `meter_monthly` row's data — no surviving
  manual-sourced row for that provider/month/currency — aborts unless `--yes` is
  given (rows merged into a `manual,api` row are not lost).
- `--dry-run` = snapshot + diff, write nothing. Use it before any run you are
  unsure about; it does not append to `ingest_runs`.
- `replace` refuses to write 0 rows, so a failed pull never wipes a table.
- Restore = re-replace a table with its snapshot file (see Restore below).

## Workflows

### Full update

```bash
python3 -m ingest.run
```

Refreshes all four tables and appends an `ingest_runs` entry.

### One table

```bash
python3 -m ingest.run --dry-run --only meter   # inspect the diff first
python3 -m ingest.run --only meter             # then write
```

`--only` is one of `meter | usage | revenue | transactions`.

### One month

```bash
python3 -m ingest.run --dry-run --month 2026-07
python3 -m ingest.run --month 2026-07
```

Splices the given `YYYY-MM` into the affected tables. `--month` is invalid with
`--only transactions` (transactions have no month scope).

### One provider (meter)

```bash
python3 -m ingest.run --dry-run --only meter --provider aws
python3 -m ingest.run --only meter --provider aws
```

`--provider` requires `--only meter` and must be a meter-connector slug:
`deepinfra | vast.ai | ovhcloud | fireworks | aws | google | openai`.
Manual-only providers are updated with `ingest.record`, not here.

### Add a manual meter row

```bash
python3 -m ingest.record meter io.net 2026-07 --currency USD --credit 123.45
```

Appends one `source="manual"` row to `meter_monthly`. Provider must be in
`registry.CANONICAL`; at least one of `--credit`/`--paid` must be > 0. Manual
rows survive every subsequent `ingest.run` (they are re-merged, not dropped).

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

rows = backup.snapshot_table(read, "meter_monthly", backup.run_directory(config))
keep = [
    r for r in rows
    if not (r["provider"] == "io.net" and r["month"] == "2026-07"
            and "manual" in r["source"])
]
assert len(keep) == len(rows) - 1, "expected exactly one row to drop"
write.replace("meter_monthly", keep)
EOF
```

To correct a value, delete the row this way and re-add it with `ingest.record`.

### Add a provider alias

Edit `config/provider_aliases.json` — add the canonical slug mapped to a list of
identifying substrings (lowercased), then re-run the affected table:

```bash
python3 -m ingest.run --dry-run --only transactions   # confirm the new mapping
python3 -m ingest.run --only transactions
```

The slug also becomes valid for `ingest.record` (it reads `registry.CANONICAL`,
which is the alias keys).

### Inspect current rows

```bash
python3 -m ingest.inspect meter_monthly --provider replicate --month 2026-07
```

Read-only; prints matching rows as JSON lines plus a count. Tables:
`transactions | meter_monthly | usage_monthly | revenue_monthly | ingest_runs`.
`--provider` is invalid on `revenue_monthly`/`ingest_runs`; `--limit` defaults
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
from ingest import creds, tb

SNAPSHOT = "~/Documents/treasury-backups/20260706T101112Z/meter_monthly.ndjson"

secrets, config = creds.load_creds(), creds.load_config()
write = tb.TB(config["tb_ops_api"], secrets["TINYBIRD_OPS_REPLACE_TOKEN"])

import os
with open(os.path.expanduser(SNAPSHOT)) as fh:
    rows = [json.loads(line) for line in fh if line.strip()]
assert rows, "snapshot is empty — refusing to replace"
write.replace("meter_monthly", rows)
EOF
```

## Secrets

sops-encrypted `secrets/env.json` (age key in the macOS keychain). Never print
values; `ingest.run` redacts them from error output.
