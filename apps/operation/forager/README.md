# Forager

Forager is the ONLY writer to the Operations Tinybird workspace read by the
Treasury app (which is a read-only mirror). For the full correction playbook
— scoped runs, manual rows, aliases, backups, restore — see
[`AGENTS.md`](./AGENTS.md).

## Main Flow

Run from this directory:

```bash
python3 -m ingest.run
```

The daily run refreshes:

| Table | Source |
|---|---|
| `transactions` | Enty monthly export folders in `~/Documents/treasury-invoices/enty-ledger` |
| `meter_monthly` | Provider APIs/CLIs plus manual rows |
| `usage_monthly` | Production `generation_event` usage |
| `revenue_monthly` | Stripe balance transactions |
| `ingest_runs` | Forager run log |

Manual corrections are entered here, not in the app: append a `meter_monthly`
row with `ingest.record`, or run a scoped `ingest.run`. See
[`AGENTS.md`](./AGENTS.md).

## Local Invoice Fetcher

GOG/Gmail invoice attachment fetching is intentionally not part of Forager.
Use the local helper instead:

```bash
python3 _local/invoice_fetcher/fetch_gog_invoices.py --month 2026-07
```

That helper only downloads invoice-like PDFs into the local invoice inbox. It
does not call AI and does not write Tinybird.

## Useful Commands

```bash
python3 -m ingest.run --dry-run                      # snapshot + diff, no writes
python3 -m ingest.run --only meter                   # one table: meter|usage|revenue|transactions
python3 -m ingest.run --only meter --provider aws    # one meter connector
python3 -m ingest.run --month 2026-07                # one month; bare still rebuilds transactions
python3 -m ingest.run --month 2026-07 --only meter   # one month, skip the transactions rebuild
python3 -m ingest.run --yes                          # allow writes that lose a manual meter row's data
python3 -m ingest.inspect meter_monthly --month 2026-07   # read-only row dump
python3 -m ingest.doctor                             # preflight/health checks
python3 -m pytest tests/test_enty.py -q
```

See [`AGENTS.md`](./AGENTS.md) for the full correction workflows (manual rows,
aliases, backups, restore).
