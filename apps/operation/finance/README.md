# Finance Runway Tracker

Node CLI that ingests transaction CSVs, resolves vendor identity via an alias file, and writes a Google Sheet (vendors × months grid, with forecast columns and runway KPIs) using the `gog` CLI.

## Prerequisites

- Node 20+
- `gog` CLI (a local Google Workspace CLI tool) authenticated to the Google account that owns the target spreadsheet:
  ```
  gog login you@example.com
  ```

## Setup

1. Copy the example config:
   ```
   cp config.example.json config.local.json
   ```
2. Edit `config.local.json`:
   - `spreadsheetId`: the Google Sheet ID (the long string in the URL)
   - `gogAccount`: the email `gog` is authenticated with
   - `forecastMonths`: how many future months to project (default 6)
   - `cashBalance`: current cash on hand in EUR
   - `cashBalanceAsOf`: ISO date; running cash walks forward from the first full month on or after this date
3. Create the spreadsheet if you don't have one yet:
   ```
   gog -a you@example.com sheets create "Finance Tracker"
   ```
   Paste the returned `spreadsheetId` into `config.local.json`.
4. Drop transaction CSVs into `secrets/input/` named `YYYY-MM.csv`. Required columns: `counterparty,date,bank_account,category,amount_eur,status`.

## Commands

```
npm run rebuild          # full rebuild from all CSVs (idempotent)
npm run add-month -- FILE   # import a new month, then rebuild (note the -- to forward the arg)
npm run forecast         # re-compute forecast columns without re-reading CSVs
npm test                 # unit tests
```

## How vendor identity works

The first time the rebuild script sees a vendor not in `secrets/vendors.json`, it will prompt:

```
New vendor: "Acme Cloud Inc."
  Canonical name [Acme Cloud Inc.]: Acme Cloud
  Category [Other]: Compute
  Forecast rule (number | avg3 | last | none | live) [avg3]: avg3
```

Answers are written back to `secrets/vendors.json` and the rebuild continues.

## Privacy

`config.local.json`, `secrets/`, and any `*.csv` outside `test/fixtures/` are gitignored. The public repo contains zero numbers, vendor names, or account IDs.

## Architecture

Linear pipeline of pure functions + one side-effect layer:

```
CSVs → parse-csv → normalize (vendors.json) → aggregate → forecast → layout → gog
```

Each `lib/` module has one responsibility. `lib/gog.mjs` is the only file that shells out. `lib/layout.mjs` is pure — a future HTML renderer can consume it unchanged.
