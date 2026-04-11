# Finance Runway Tracker — Design

**Location:** `apps/operation/finance/`
**Date:** 2026-04-11
**Status:** Approved, ready for implementation planning

## Purpose

A runway tracker for Pollinations. Import past transaction CSVs, surface burn rate and runway, forecast future months from known recurring costs. Replaces the ad-hoc Google Sheet built on 2026-04-11 with a better, wider layout. Built to be extended with live cloud-provider ingestion later (v2).

Primary user: Elliot, running the script locally from his laptop. Not a multi-user system.

## Non-goals (v1)

- No provider APIs, no cron, no live data fetching. That is v2 — separate script, separate ticket, reuses the existing `provider-billing` skill.
- No multi-currency. Everything is EUR (source is Wise EUR e-wallet).
- No historical cash balance per month — current balance lives in config, running cash walks forward/backward from there.
- No web UI. That comes later next to `apps/operation/kpi/` if needed.
- No automated tests. Script is small, failures are obvious, re-running is cheap. Add tests when v2 introduces the cron.
- No category renaming UI. Categories come from `secrets/vendors.json`; canonical order lives in `lib/categories.mjs`.

## Stack

- Node ESM, zero runtime dependencies
- Shells out to the `gog` CLI for Google Sheets writes
- Lives at `apps/operation/finance/` alongside `economics/` and `kpi/`

Reason for Node: matches the pollinations monorepo convention. Reason for zero deps: keeps the app trivially readable and avoids a `node_modules/` in an operations folder.

## Folder structure

```
apps/operation/finance/
├── README.md
├── package.json            # type: "module", bin scripts, no deps
├── bin/
│   ├── rebuild-sheet.mjs   # full rebuild from all CSVs + vendors.json
│   ├── add-month.mjs       # import a new month CSV, prompt for new vendors
│   └── forecast.mjs        # re-compute forecast columns only
├── lib/
│   ├── parse-csv.mjs       # CSV → raw rows
│   ├── normalize.mjs       # raw rows → canonical rows via vendors.json
│   ├── aggregate.mjs       # canonical rows → matrix
│   ├── forecast.mjs        # extend matrix with forecast columns
│   ├── layout.mjs          # pure: matrix → 2D cell grid + format map
│   ├── categories.mjs      # canonical category order
│   ├── gog.mjs             # thin wrapper around gog CLI
│   └── prompt.mjs          # readline wrapper for new-vendor prompts
├── config.example.json     # committed template, placeholder values
├── config.local.json       # gitignored
├── secrets/                # gitignored
│   ├── input/              # transaction CSVs, one per month
│   │   └── YYYY-MM.csv
│   └── vendors.json        # vendor identity + forecast rules
└── .gitignore
```

### What is in the public repo

- All code under `bin/` and `lib/`
- `README.md` with setup instructions using placeholders only
- `config.example.json` with placeholder values
- `package.json` (no dependencies)
- `.gitignore`

Zero numbers. Zero vendor names. Zero account IDs.

### What stays out of the repo

- `config.local.json` — contains `spreadsheetId` and `gogAccount`
- `secrets/input/*.csv` — raw transaction data
- `secrets/vendors.json` — reveals counterparties
- The Google Sheet itself lives in Elliot's Drive, access-controlled by him

## Data model

### Canonical row (internal representation)

```js
{
  date: "2025-03-15",
  month: "2025-03",
  vendor: "Vast.ai",       // canonical, not raw
  category: "Compute",     // canonical, not raw CSV category
  amount: -437.96          // negative = expense, positive = revenue
}
```

### `secrets/vendors.json`

Single source of truth for vendor identity. Keys are raw names as they appear in source CSVs. Values are canonical mapping + forecast rule.

```json
{
  "Vast.ai Inc.": {
    "canonical": "Vast.ai",
    "category": "Compute",
    "forecast": "avg3"
  },
  "Anthropic": {
    "canonical": "Anthropic",
    "category": "Compute",
    "forecast": 180
  },
  "Anthropic, PBC": {
    "canonical": "Anthropic",
    "category": "Compute",
    "forecast": 180
  },
  "Gaswerkssiedlung Berlin GmbH": {
    "canonical": "Gaswerkssiedlung",
    "category": "Office",
    "forecast": 1166.83
  },
  "Deel Inc.": {
    "canonical": "Deel",
    "category": "Employee Salaries",
    "forecast": 14000
  },
  "Google Cloud EMEA Limited": {
    "canonical": "Google Cloud",
    "category": "Compute",
    "forecast": "live",
    "provider": "gcp"
  }
}
```

**`forecast` field rules:**

| Value | Meaning |
|---|---|
| *number* | Fixed monthly amount, copied forward to every future column |
| `"avg3"` | Average of last three actual months |
| `"last"` | Last actual month's value |
| `"none"` | Do not forecast; one-off spend |
| `"live"` | v2 placeholder — cron will fill from provider API. v1 falls back to `avg3` and renders in a distinct style so it is visually clear the cell is a fallback |

**`provider` field** is a v2 hint (which provider API to call). Ignored in v1.

**Unknown vendors:** when a CSV row has a vendor key missing from `vendors.json`, the script prompts interactively for canonical name, category, and forecast rule, then writes the answer back to `vendors.json` and continues.

### `config.local.json`

```json
{
  "spreadsheetId": "1spPgtYPa05YtK8jjw0g4hpfYXqE10043oP7A1dQe5Mk",
  "gogAccount": "elliot@myceli.ai",
  "forecastMonths": 6,
  "cashBalance": 120000,
  "cashBalanceAsOf": "2026-04-01"
}
```

`cashBalanceAsOf` is the month from which the running-cash row is seeded. Running cash walks forward from there using net-per-month.

## Sheet layout (one tab)

One tab. Past, current, and future months all in one grid, left to right.

```
Row 1:  POLLINATIONS FINANCE — RUNWAY TRACKER
Row 2:  (blank)
Row 3:  Cash: €120,000 | Burn (avg3): -€37,555 | Runway: 3.2 months | Cash out: Jul 2025
Row 4:  (blank)
Row 5:  Category | Vendor        | Jan 2025 | Feb 2025 | Mar 2025 | Apr 2025 (MTD) | May 2025 (fcst) | ... | Avg 3mo
Row 6:  REVENUE  |               |          |          |          |                |                 |
Row 7:           | Stripe        |   4.30   |  245.48  |  4231.51 |  —             |  1493.76        |
Row 8:           | Polar.sh      | 3765.67  |    —     |    —     |  —             |  1255.22        |
Row 9:  Revenue subtotal         | 3770.67  |  245.48  |  4231.51 |  —             |  2748.99        |
Row 10: (blank)
Row 11: EXPENSES |               |          |          |          |                |                 |
Row 12: Compute  |               |          |          |          |                |                 |
Row 13:          | Vast.ai       |    —     |-1774.55  |-3029.01  |  —             | -1601.19        |
Row 14:          | Anthropic     |    —     | -549.65  | -630.00  |  —             |  -393.22        |
...
Row N:  Compute subtotal         | ...
Row M:  Salaries subtotal        | ...
Row P:  Office subtotal          | ...
Row Y:  TOTAL EXPENSES           | ...
Row Z:  NET (Revenue − Expenses) | ...
Row Z+2:Running cash             | 120000   |  82445   |  41289   | ...            | ...             |
```

### Visual rules

- **Past months:** white background, black text
- **Current month:** light yellow background; header reads `Month Year (MTD)`; a thick vertical border sits between the last past month and the current month
- **Future months:** light gray background; gray italic text; header reads `Month Year (fcst)`
- **Category header rows:** bold, light blue background
- **Subtotal rows:** bold, top border
- **TOTAL EXPENSES and NET rows:** bold, thick borders, tinted background
- **Running cash row:** bold, formula-free (values computed in JS and written)
- **Live-fallback cells** (vendor flagged `"live"`, current month): lightly italicized so the user knows the number is a placeholder until v2 fills it

### KPI summary row (row 3)

Computed in JS at rebuild time and written as plain values:

- **Cash** = `config.cashBalance`
- **Burn (avg3)** = average NET of the last three past months
- **Runway** = `cashBalance / abs(burn)` months
- **Cash out** = month label where running cash first goes negative; `"> horizon"` if it stays positive through the forecast window

Values not formulas. Avoids cell-reference fragility during rebuilds.

## Scripts

### `bin/rebuild-sheet.mjs` (primary)

Idempotent. Full rebuild. Output depends only on inputs.

Sequence:

1. Load `config.local.json` and `secrets/vendors.json`
2. Read every file under `secrets/input/*.csv`, parse with `lib/parse-csv.mjs`
3. For each raw row, look up vendor in `vendors.json`
   - If unknown: prompt interactively (new vendor name, category, forecast rule), write answers back to `vendors.json`, continue
4. Produce canonical rows, aggregate into matrix via `lib/aggregate.mjs`:
   ```js
   {
     months: ["2025-01", "2025-02", "2025-03"],
     categories: ["Revenue", "Compute", ...],
     vendors: { "Vast.ai": "Compute", ... },
     data: { "2025-03": { "Vast.ai": -3029.01, ... } }
   }
   ```
5. Extend matrix with `config.forecastMonths` future columns via `lib/forecast.mjs`, one rule at a time per vendor
6. Pass matrix to `lib/layout.mjs`, receive `{ cells: 2D, formats: Map<range, CellFormat> }`
7. `lib/gog.mjs` clears the sheet, writes values (single `gog sheets update --values-json`), applies formats in batches, resizes columns, freezes header rows
8. Print summary: rows written, vendors total, months actual + forecast, runway estimate

### `bin/add-month.mjs <csv-path>`

Convenience wrapper. Copies the given CSV into `secrets/input/YYYY-MM.csv` (where `YYYY-MM` is derived from the first row's date), then calls `rebuild-sheet.mjs`. No partial updates — always full rebuild, no drift.

### `bin/forecast.mjs`

Runs steps 4–7 of `rebuild-sheet.mjs`. For use when `vendors.json` forecast rules change but no new CSV has landed. Optional — `rebuild-sheet.mjs` always works.

## Separation of concerns

The seams below are the v1/v2 contract. v2 (live provider ingestion) must not require changes in layers above it.

- **`lib/parse-csv.mjs`** — pure. String in, array of raw rows out
- **`lib/normalize.mjs`** — pure. Raw rows + `vendors.json` in, canonical rows out. Only file that knows about alias lookup
- **`lib/aggregate.mjs`** — pure. Canonical rows in, matrix out
- **`lib/forecast.mjs`** — pure. Matrix + vendors.json forecast rules in, extended matrix out
- **`lib/layout.mjs`** — pure. Matrix + config in, `{ cells, formats }` out. Knows nothing about Google Sheets, gog, or the filesystem. This is the seam for a future HTML/Notion renderer
- **`lib/gog.mjs`** — the ONLY module that shells out to `gog`. Swap for `googleapis` later and no other file changes
- **`lib/prompt.mjs`** — the ONLY module that touches stdin
- **`bin/*.mjs`** — orchestration only, no logic. Each script is a short linear pipeline

## Error handling

| Scenario | Behavior |
|---|---|
| CSV with malformed row | Fail loudly with filename and line number |
| Unknown vendor | Prompt for canonical name, category, forecast rule; write back |
| `gog` command fails | Fail loudly, print the exact command that failed |
| Missing `config.local.json` | Print: "copy `config.example.json` to `config.local.json` and edit" |
| Missing `secrets/` | Print setup instructions |
| `vendors.json` has a category not in `lib/categories.mjs` | Warn, fall back to "Other", do not fail |

No swallowed errors. No silent fallbacks other than the explicit "Other" category bucket.

## Privacy review

- `config.local.json` — gitignored
- `secrets/` — entire folder gitignored (input CSVs + `vendors.json`)
- `vendors.json` reveals counterparties → lives in `secrets/`
- `config.example.json` committed with placeholder values only
- `README.md` uses placeholder data in all examples
- Root `.gitignore` for the app folder explicitly lists `config.local.json`, `secrets/`, `*.csv`
- Nothing in the repo allows a reader to reconstruct the spreadsheet ID, account, vendor list, or amounts

## v1 → v2 bridge

v2 adds a separate `bin/update-live-forecast.mjs` script that:

1. Reads `config.local.json` and `secrets/vendors.json`
2. Filters vendors with `forecast === "live"`
3. For each, uses the existing `.claude/skills/provider-billing/` skill to fetch month-to-date spend from that vendor's provider API
4. Writes those values into specific cells in the current-month column of the sheet via `lib/gog.mjs`
5. Can be invoked manually or from a cron (`schedule` skill, or GitHub Action)

v2 touches zero v1 files. It only reads `vendors.json` and writes specific cells. The `provider` field in `vendors.json` is the routing table.

## Confirmed decisions (locked during brainstorming)

1. **Stack:** Node ESM, zero runtime deps
2. **Folder:** `apps/operation/finance/`
3. **Layout:** one tab, vendor rows grouped under category headers, months as columns left→right, past/current/future in one grid
4. **Config & secrets:** `config.local.json` gitignored + `secrets/` folder gitignored for CSVs and `vendors.json`
5. **Vendor identity:** explicit `vendors.json` alias file with interactive prompt for new vendors
6. **Scope:** historical + current (MTD) + forecast, all static in v1. Cron/live ingestion is v2
7. **Forecast rule syntax:** number | `"avg3"` | `"last"` | `"none"` | `"live"`
8. **Current-month live cells in v1:** fall back to `avg3`, rendered italicized so it's visibly a placeholder
9. **Cash balance:** single number in `config.local.json`, manually updated
