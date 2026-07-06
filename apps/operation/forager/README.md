# Forager

Forager writes the Operations Tinybird workspace used by the Treasury app.

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

Operator edits are append-only rows in `overrides`. Forager applies transaction
provider/category overrides when rebuilding `transactions`.

## Local Invoice Fetcher

GOG/Gmail invoice attachment fetching is intentionally not part of Forager.
Use the local helper instead:

```bash
python3 apps/operation/_local/invoice-fetcher/fetch_gog_invoices.py --month 2026-07
```

That helper only downloads invoice-like PDFs into the local invoice inbox. It
does not call AI and does not write Tinybird.

## Useful Commands

```bash
python3 -m ingest.doctor
python3 -m pytest tests/test_enty.py -q
```
