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
npm run rebuild              # full rebuild from all CSVs (idempotent)
npm run add-month -- FILE    # import a new month, then rebuild (note the -- to forward the arg)
npm run forecast             # re-compute forecast columns without re-reading CSVs
node bin/update-live.mjs     # pull live MTD from provider APIs then rebuild
node bin/update-live.mjs --dry-run       # preview without writing
node bin/update-live.mjs --no-rebuild    # fetch + save, skip sheet push
npm test                     # unit tests
```

## Credit pools (live MTD via provider CLIs)

The sheet has a `CREDIT POOLS (USD)` section that tracks the remaining balance of each cloud credit grant. Pool balances are stored in `secrets/vendors.json` under `_pools` and updated by `bin/update-live.mjs`, which queries the provider CLIs for current-month consumption.

Supported providers:

- **Azure** — `az rest` against `Microsoft.Consumption/usageDetails`. Requires `az login`. The remaining balance is manually seeded (Azure does not expose it via CLI without the `Billing Reader` role); MTD consumption is pulled live and subtracted from the seed.
- **AWS** — `aws ce get-cost-and-usage`. Requires local `aws` credentials with Cost Explorer permission. Finance intentionally ignores gen worker `AWS_*` secrets because those are Bedrock runtime keys, not billing keys. Credit application is detected via `UnblendedCost − NetUnblendedCost`.
- **Deep Infra** — `GET /v1/me?checklist=true` for remaining prepaid balance plus `GET /payment/usage` for current-month credit burn. Cash top-ups come from Wise card transactions only.
- **OpenRouter** — `GET /api/v1/credits` with a management API key. Remaining balance is live; MTD consumption is derived from the account usage counter at month open.
- **Runpod, Lambda Labs** — currently static seeds only (no CLI integration yet).

Manual seed values live under `_pools.<pool>.seed_balance_usd` and should be updated from the provider's dashboard whenever a new grant is applied.

## Daily cron (macOS launchd)

To run `update-live.mjs` daily on macOS, install a LaunchAgent plist at `~/Library/LaunchAgents/ai.pollinations.finance-update.plist`. This file is NOT checked into the repo because it contains hard-coded paths to your home directory. Template:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>ai.pollinations.finance-update</string>
    <key>ProgramArguments</key>
    <array>
        <string>/ABSOLUTE/PATH/TO/pollinations/apps/operation/finance/bin/update-live.sh</string>
    </array>
    <key>StartCalendarInterval</key>
    <dict>
        <key>Hour</key><integer>8</integer>
        <key>Minute</key><integer>15</integer>
    </dict>
    <key>StandardOutPath</key>
    <string>/ABSOLUTE/PATH/TO/pollinations/apps/operation/finance/secrets/update-live.log</string>
    <key>StandardErrorPath</key>
    <string>/ABSOLUTE/PATH/TO/pollinations/apps/operation/finance/secrets/update-live.err</string>
    <key>WorkingDirectory</key>
    <string>/ABSOLUTE/PATH/TO/pollinations/apps/operation/finance</string>
</dict>
</plist>
```

After editing paths:

```bash
launchctl load ~/Library/LaunchAgents/ai.pollinations.finance-update.plist
launchctl start ai.pollinations.finance-update  # run immediately to verify
tail -f apps/operation/finance/secrets/update-live.log
```

`bin/update-live.sh` sets `SOPS_AGE_KEY_FILE` from the local age key file when launchd does not inherit `SOPS_AGE_KEY`, so shared provider secrets can decrypt in non-interactive daily runs.

To disable: `launchctl unload ~/Library/LaunchAgents/ai.pollinations.finance-update.plist`.

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
