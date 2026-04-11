# Finance Runway Tracker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `apps/operation/finance/`: a Node CLI that ingests transaction CSVs, resolves vendor identity through an alias file, and writes a one-tab Google Sheet (vendors × months, left→right, with forecast columns and runway KPIs) via the `gog` CLI.

**Architecture:** Linear pipeline of pure functions — `parse-csv → normalize → aggregate → forecast → layout` — with a single side-effect layer (`lib/gog.mjs`) that shells out to `gog`. Three thin orchestration scripts in `bin/`. Config and all sensitive data (CSVs, `vendors.json`, sheet ID, account email) are gitignored. `vendors.json` is the single source of truth for vendor identity and forecast rules.

**Tech Stack:** Node 20+ ESM, zero runtime dependencies, `node:test` for tests, `gog` CLI (v0.12.0) for Google Sheets I/O.

**Spec:** [`docs/superpowers/specs/2026-04-11-finance-runway-tracker-design.md`](../specs/2026-04-11-finance-runway-tracker-design.md)

---

## Notes for the implementer

- **Branch:** `feat/finance-runway-tracker-spec` (already exists, contains the spec commit). Continue work here.
- **Reference implementation:** the ad-hoc Python scripts at `/tmp/opex/build.py` and the 3 CSVs at `/tmp/opex/*.csv` from today's session contain real data you can use for local smoke tests. Do NOT commit them. The final app reads from `apps/operation/finance/secrets/input/` which is gitignored.
- **`gog` CLI basics:** `gog -a elliot@myceli.ai sheets create <title>`, `gog sheets update <id> <range> --values-json '...'`, `gog sheets format <id> <range> --format-fields '...' --format-json '...'`, `gog sheets number-format <id> <range> --pattern '...' --type NUMBER`, `gog sheets resize-columns <id> <range> --width <px>`, `gog sheets freeze <id> --rows N`, `gog sheets clear <id> <range>`. Run any subcommand with `--help` to see flags.
- **Node ESM gotcha:** with `"type": "module"` in `package.json`, always import with explicit `.mjs` extensions and use `import.meta.url` / `new URL(..., import.meta.url)` for file paths relative to modules. Never use `__dirname`.
- **Test runner:** Node's built-in `node --test` runs any `*.test.mjs` file under `test/`. No Jest, no Vitest, no config. `node --test` returns non-zero on failure.
- **Formatting:** run `npx biome check --write apps/operation/finance` before committing any task. The root `biome.json` covers this folder.
- **Commit style:** short, lowercase, no fluff, no Claude mention (team standard). Example: `feat(finance): add csv parser`.

---

## File Structure

### Created files

| Path | Responsibility |
|---|---|
| `apps/operation/finance/package.json` | Package manifest; `type: "module"`, no deps, bin entries |
| `apps/operation/finance/README.md` | Setup + usage instructions, placeholder data only |
| `apps/operation/finance/.gitignore` | Ignores `config.local.json`, `secrets/`, `*.csv`, `node_modules/` |
| `apps/operation/finance/config.example.json` | Committed template, placeholder values |
| `apps/operation/finance/lib/parse-csv.mjs` | Pure: CSV string → array of raw row objects |
| `apps/operation/finance/lib/categories.mjs` | Canonical category order, exported as const array |
| `apps/operation/finance/lib/normalize.mjs` | Pure: raw rows + vendors.json → canonical rows; reports unknown vendors |
| `apps/operation/finance/lib/aggregate.mjs` | Pure: canonical rows → `{months, vendors, data}` matrix |
| `apps/operation/finance/lib/forecast.mjs` | Pure: matrix + vendors.json forecast rules + forecastMonths → extended matrix |
| `apps/operation/finance/lib/layout.mjs` | Pure: matrix + config → `{cells: 2D, formats: [{range, format}], columnWidths, freezeRows}` |
| `apps/operation/finance/lib/gog.mjs` | Side-effect layer: thin async wrappers around `gog` CLI (`createSheet`, `clearSheet`, `updateValues`, `applyFormat`, `applyNumberFormat`, `resizeColumn`, `freeze`) |
| `apps/operation/finance/lib/prompt.mjs` | Side-effect layer: readline-based interactive prompt for new vendors |
| `apps/operation/finance/lib/io.mjs` | Side-effect layer: filesystem (load config/vendors, list CSVs, save vendors.json) |
| `apps/operation/finance/bin/rebuild-sheet.mjs` | Orchestration: full rebuild pipeline |
| `apps/operation/finance/bin/add-month.mjs` | Orchestration: copies one CSV into `secrets/input/YYYY-MM.csv`, calls rebuild |
| `apps/operation/finance/bin/forecast.mjs` | Orchestration: re-runs aggregate → forecast → layout → write (skips CSV parsing) |
| `apps/operation/finance/test/parse-csv.test.mjs` | Unit tests for CSV parser |
| `apps/operation/finance/test/normalize.test.mjs` | Unit tests for vendor normalization |
| `apps/operation/finance/test/aggregate.test.mjs` | Unit tests for matrix aggregation |
| `apps/operation/finance/test/forecast.test.mjs` | Unit tests for forecast extension |
| `apps/operation/finance/test/layout.test.mjs` | Unit tests for cell grid generation |
| `apps/operation/finance/test/fixtures/mini.csv` | Tiny synthetic CSV (committed, placeholder vendor names) for tests |
| `apps/operation/finance/test/fixtures/vendors.json` | Tiny synthetic vendor alias file for tests |

### Not created

No files outside `apps/operation/finance/` are created or modified.

---

## Task 0: Scaffold the app folder

**Files:**
- Create: `apps/operation/finance/package.json`
- Create: `apps/operation/finance/.gitignore`
- Create: `apps/operation/finance/README.md`
- Create: `apps/operation/finance/config.example.json`

- [ ] **Step 1: Create the folder and empty subfolders**

```bash
mkdir -p apps/operation/finance/{bin,lib,test/fixtures,secrets/input}
```

- [ ] **Step 2: Write `package.json`**

Create `apps/operation/finance/package.json`:

```json
{
  "name": "@pollinations/finance",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "description": "Runway tracker for Pollinations. Ingests transaction CSVs, writes a Google Sheet via gog CLI.",
  "bin": {
    "finance-rebuild": "./bin/rebuild-sheet.mjs",
    "finance-add-month": "./bin/add-month.mjs",
    "finance-forecast": "./bin/forecast.mjs"
  },
  "scripts": {
    "test": "node --test test/",
    "rebuild": "node bin/rebuild-sheet.mjs",
    "add-month": "node bin/add-month.mjs",
    "forecast": "node bin/forecast.mjs"
  },
  "engines": {
    "node": ">=20"
  }
}
```

- [ ] **Step 3: Write `.gitignore`**

Create `apps/operation/finance/.gitignore`:

```
config.local.json
secrets/
node_modules/
*.csv
!test/fixtures/*.csv
```

The `!test/fixtures/*.csv` negation allows committing synthetic fixture CSVs (they contain only placeholder data).

- [ ] **Step 4: Write `config.example.json`**

Create `apps/operation/finance/config.example.json`:

```json
{
  "spreadsheetId": "YOUR_SPREADSHEET_ID_HERE",
  "gogAccount": "you@example.com",
  "forecastMonths": 6,
  "cashBalance": 0,
  "cashBalanceAsOf": "2026-01-01"
}
```

- [ ] **Step 5: Write `README.md`**

Create `apps/operation/finance/README.md`:

````markdown
# Finance Runway Tracker

Node CLI that ingests transaction CSVs, resolves vendor identity via an alias file, and writes a Google Sheet (vendors × months grid, with forecast columns and runway KPIs) using the `gog` CLI.

## Prerequisites

- Node 20+
- [`gog`](https://github.com/anthropics/gog) CLI authenticated to the Google account that owns the target spreadsheet:
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
npm run add-month FILE   # import a new month, then rebuild
npm run forecast         # re-compute forecast columns without re-reading CSVs
npm test                 # unit tests
```

## How vendor identity works

The first time the rebuild script sees a vendor not in `secrets/vendors.json`, it will prompt:

```
New vendor: "Vast.ai Inc."
  Canonical name [Vast.ai Inc.]: Vast.ai
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
````

- [ ] **Step 6: Format and commit**

Run:
```bash
npx biome check --write apps/operation/finance
git add apps/operation/finance/{package.json,.gitignore,README.md,config.example.json}
git commit -m "feat(finance): scaffold package and config template"
```
Expected: commit created, working tree clean for these files.

---

## Task 1: Canonical category list

**Files:**
- Create: `apps/operation/finance/lib/categories.mjs`
- Test: `apps/operation/finance/test/categories.test.mjs`

- [ ] **Step 1: Write the failing test**

Create `apps/operation/finance/test/categories.test.mjs`:

```js
import test from "node:test";
import assert from "node:assert/strict";
import { CATEGORIES, REVENUE_CATEGORIES, isRevenue, categoryIndex } from "../lib/categories.mjs";

test("CATEGORIES is a non-empty array of strings", () => {
  assert.ok(Array.isArray(CATEGORIES));
  assert.ok(CATEGORIES.length > 0);
  for (const c of CATEGORIES) assert.equal(typeof c, "string");
});

test("CATEGORIES contains expected operational categories", () => {
  const required = ["Revenue", "Compute", "Employee Salaries", "Office", "Other"];
  for (const r of required) assert.ok(CATEGORIES.includes(r), `missing ${r}`);
});

test("isRevenue detects revenue categories", () => {
  assert.equal(isRevenue("Revenue"), true);
  assert.equal(isRevenue("Compute"), false);
});

test("categoryIndex returns stable sort keys", () => {
  assert.equal(categoryIndex("Revenue"), 0);
  assert.ok(categoryIndex("Compute") < categoryIndex("Other"));
  assert.equal(categoryIndex("NonexistentCat"), CATEGORIES.length); // unknowns sort last
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/operation/finance && node --test test/categories.test.mjs`
Expected: FAIL with "Cannot find module '../lib/categories.mjs'".

- [ ] **Step 3: Write `lib/categories.mjs`**

Create `apps/operation/finance/lib/categories.mjs`:

```js
export const CATEGORIES = [
  "Revenue",
  "Compute",
  "Employee Salaries",
  "Freelancer",
  "Office",
  "Productivity",
  "Coding",
  "Infra",
  "Accounting",
  "Community",
  "Food / Drink",
  "Banking",
  "Other",
];

export const REVENUE_CATEGORIES = new Set(["Revenue", "API Sell"]);

export function isRevenue(category) {
  return REVENUE_CATEGORIES.has(category);
}

const INDEX = new Map(CATEGORIES.map((c, i) => [c, i]));

export function categoryIndex(category) {
  const i = INDEX.get(category);
  return i === undefined ? CATEGORIES.length : i;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/operation/finance && node --test test/categories.test.mjs`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
npx biome check --write apps/operation/finance/lib/categories.mjs apps/operation/finance/test/categories.test.mjs
git add apps/operation/finance/lib/categories.mjs apps/operation/finance/test/categories.test.mjs
git commit -m "feat(finance): add canonical category list"
```

---

## Task 2: CSV parser

**Files:**
- Create: `apps/operation/finance/lib/parse-csv.mjs`
- Create: `apps/operation/finance/test/fixtures/mini.csv`
- Test: `apps/operation/finance/test/parse-csv.test.mjs`

- [ ] **Step 1: Create the test fixture CSV**

Create `apps/operation/finance/test/fixtures/mini.csv` (synthetic data, committable):

```csv
counterparty,date,bank_account,category,amount_eur,status
Acme Cloud Inc.,2025-01-15,Test Wallet,Compute,-100.50,confirmed
"Beta, LLC",2025-01-20,Test Wallet,Office,-42.00,
Gamma Revenue,2025-01-28,Test Wallet,API Sell,500.00,confirmed
```

- [ ] **Step 2: Write the failing test**

Create `apps/operation/finance/test/parse-csv.test.mjs`:

```js
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { parseCsv } from "../lib/parse-csv.mjs";

const fixturePath = new URL("./fixtures/mini.csv", import.meta.url);

test("parseCsv returns array of row objects with expected keys", async () => {
  const text = await readFile(fixturePath, "utf8");
  const rows = parseCsv(text);
  assert.equal(rows.length, 3);
  assert.deepEqual(Object.keys(rows[0]).sort(), [
    "amount_eur", "bank_account", "category", "counterparty", "date", "status",
  ]);
});

test("parseCsv converts amount_eur to number", async () => {
  const text = await readFile(fixturePath, "utf8");
  const rows = parseCsv(text);
  assert.equal(rows[0].amount_eur, -100.5);
  assert.equal(rows[2].amount_eur, 500);
});

test("parseCsv handles quoted fields with commas", async () => {
  const text = await readFile(fixturePath, "utf8");
  const rows = parseCsv(text);
  assert.equal(rows[1].counterparty, "Beta, LLC");
});

test("parseCsv handles empty status field", async () => {
  const text = await readFile(fixturePath, "utf8");
  const rows = parseCsv(text);
  assert.equal(rows[1].status, "");
});

test("parseCsv throws with filename and line number on malformed row", () => {
  const bad = "counterparty,date,amount_eur\nAcme,2025-01-15\n"; // only 2 columns
  assert.throws(() => parseCsv(bad, { filename: "bad.csv" }), /bad\.csv.*line 2/);
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd apps/operation/finance && node --test test/parse-csv.test.mjs`
Expected: FAIL, "Cannot find module '../lib/parse-csv.mjs'".

- [ ] **Step 4: Write `lib/parse-csv.mjs`**

Create `apps/operation/finance/lib/parse-csv.mjs`:

```js
// Minimal RFC 4180 CSV parser: supports quoted fields, embedded commas, escaped quotes.
// Does NOT support embedded newlines inside quoted fields (our source never has them).

function parseLine(line) {
  const out = [];
  let i = 0;
  while (i < line.length) {
    if (line[i] === '"') {
      // quoted field
      let v = "";
      i++;
      while (i < line.length) {
        if (line[i] === '"' && line[i + 1] === '"') { v += '"'; i += 2; }
        else if (line[i] === '"') { i++; break; }
        else { v += line[i]; i++; }
      }
      out.push(v);
      if (line[i] === ",") i++;
    } else {
      // unquoted field
      let v = "";
      while (i < line.length && line[i] !== ",") { v += line[i]; i++; }
      out.push(v);
      if (line[i] === ",") i++;
    }
  }
  return out;
}

export function parseCsv(text, { filename = "<input>" } = {}) {
  const lines = text.split(/\r?\n/).filter((l) => l.length > 0);
  if (lines.length === 0) return [];
  const headers = parseLine(lines[0]).map((h) => h.trim());
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const fields = parseLine(lines[i]);
    if (fields.length !== headers.length) {
      throw new Error(
        `${filename}: line ${i + 1}: expected ${headers.length} fields, got ${fields.length}`,
      );
    }
    const row = {};
    for (let j = 0; j < headers.length; j++) {
      const key = headers[j];
      const val = fields[j];
      row[key] = key === "amount_eur" ? Number(val) : val;
    }
    rows.push(row);
  }
  return rows;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd apps/operation/finance && node --test test/parse-csv.test.mjs`
Expected: PASS, 5 tests.

- [ ] **Step 6: Commit**

```bash
npx biome check --write apps/operation/finance/lib/parse-csv.mjs apps/operation/finance/test/parse-csv.test.mjs apps/operation/finance/test/fixtures/mini.csv
git add apps/operation/finance/lib/parse-csv.mjs apps/operation/finance/test/parse-csv.test.mjs apps/operation/finance/test/fixtures/mini.csv
git commit -m "feat(finance): add csv parser"
```

---

## Task 3: Vendor normalization

**Files:**
- Create: `apps/operation/finance/lib/normalize.mjs`
- Create: `apps/operation/finance/test/fixtures/vendors.json`
- Test: `apps/operation/finance/test/normalize.test.mjs`

- [ ] **Step 1: Create the test vendors fixture**

Create `apps/operation/finance/test/fixtures/vendors.json`:

```json
{
  "Acme Cloud Inc.": { "canonical": "Acme", "category": "Compute", "forecast": "avg3" },
  "Beta, LLC":       { "canonical": "Beta", "category": "Office",  "forecast": 42 },
  "Gamma Revenue":   { "canonical": "Gamma","category": "Revenue", "forecast": "none" }
}
```

- [ ] **Step 2: Write the failing test**

Create `apps/operation/finance/test/normalize.test.mjs`:

```js
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { parseCsv } from "../lib/parse-csv.mjs";
import { normalize } from "../lib/normalize.mjs";

const csvPath = new URL("./fixtures/mini.csv", import.meta.url);
const vendorsPath = new URL("./fixtures/vendors.json", import.meta.url);

async function loadFixtures() {
  const text = await readFile(csvPath, "utf8");
  const vendors = JSON.parse(await readFile(vendorsPath, "utf8"));
  return { rows: parseCsv(text), vendors };
}

test("normalize maps raw vendor names to canonical", async () => {
  const { rows, vendors } = await loadFixtures();
  const { canonical, unknown } = normalize(rows, vendors);
  assert.equal(unknown.length, 0);
  assert.equal(canonical[0].vendor, "Acme");
  assert.equal(canonical[1].vendor, "Beta");
});

test("normalize overrides category from vendors.json", async () => {
  const { rows, vendors } = await loadFixtures();
  // Even though the CSV labels Acme "Compute", the vendors.json category wins
  const { canonical } = normalize(rows, vendors);
  assert.equal(canonical[0].category, "Compute");
});

test("normalize extracts month from date", async () => {
  const { rows, vendors } = await loadFixtures();
  const { canonical } = normalize(rows, vendors);
  assert.equal(canonical[0].month, "2025-01");
});

test("normalize returns unknown vendors untouched and reports them", async () => {
  const rows = [
    { counterparty: "Zeta GmbH", date: "2025-02-01", bank_account: "x", category: "Other", amount_eur: -10, status: "" },
  ];
  const { canonical, unknown } = normalize(rows, {});
  assert.equal(canonical.length, 0);
  assert.equal(unknown.length, 1);
  assert.equal(unknown[0], "Zeta GmbH");
});

test("normalize preserves negative/positive amounts as-is", async () => {
  const { rows, vendors } = await loadFixtures();
  const { canonical } = normalize(rows, vendors);
  assert.equal(canonical[0].amount, -100.5);
  assert.equal(canonical[2].amount, 500);
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd apps/operation/finance && node --test test/normalize.test.mjs`
Expected: FAIL, "Cannot find module '../lib/normalize.mjs'".

- [ ] **Step 4: Write `lib/normalize.mjs`**

Create `apps/operation/finance/lib/normalize.mjs`:

```js
/**
 * Convert raw CSV rows into canonical rows using a vendors.json alias map.
 *
 * Canonical row shape:
 *   { date: "YYYY-MM-DD", month: "YYYY-MM", vendor, category, amount }
 *
 * Returns { canonical, unknown }:
 *   - canonical: array of rows whose raw counterparty was found in the alias map
 *   - unknown: deduped array of raw counterparties NOT found in the alias map
 *
 * This function is pure: it does not prompt, read files, or mutate inputs.
 * The caller is responsible for handling unknowns (typically by prompting the
 * user and re-running normalize with an updated map).
 */
export function normalize(rawRows, vendorsMap) {
  const canonical = [];
  const unknownSet = new Set();
  for (const r of rawRows) {
    const key = r.counterparty;
    const entry = vendorsMap[key];
    if (!entry) {
      unknownSet.add(key);
      continue;
    }
    canonical.push({
      date: r.date,
      month: r.date.slice(0, 7),
      vendor: entry.canonical,
      category: entry.category,
      amount: r.amount_eur,
    });
  }
  return { canonical, unknown: [...unknownSet] };
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd apps/operation/finance && node --test test/normalize.test.mjs`
Expected: PASS, 5 tests.

- [ ] **Step 6: Commit**

```bash
npx biome check --write apps/operation/finance/lib/normalize.mjs apps/operation/finance/test/normalize.test.mjs apps/operation/finance/test/fixtures/vendors.json
git add apps/operation/finance/lib/normalize.mjs apps/operation/finance/test/normalize.test.mjs apps/operation/finance/test/fixtures/vendors.json
git commit -m "feat(finance): add vendor normalization"
```

---

## Task 4: Matrix aggregation

**Files:**
- Create: `apps/operation/finance/lib/aggregate.mjs`
- Test: `apps/operation/finance/test/aggregate.test.mjs`

- [ ] **Step 1: Write the failing test**

Create `apps/operation/finance/test/aggregate.test.mjs`:

```js
import test from "node:test";
import assert from "node:assert/strict";
import { aggregate } from "../lib/aggregate.mjs";

const rows = [
  { date: "2025-01-15", month: "2025-01", vendor: "Acme",  category: "Compute", amount: -100 },
  { date: "2025-01-28", month: "2025-01", vendor: "Acme",  category: "Compute", amount: -50  },
  { date: "2025-02-01", month: "2025-02", vendor: "Acme",  category: "Compute", amount: -200 },
  { date: "2025-01-20", month: "2025-01", vendor: "Beta",  category: "Office",  amount: -42  },
  { date: "2025-02-05", month: "2025-02", vendor: "Gamma", category: "Revenue", amount: 500  },
];

test("aggregate returns sorted month list", () => {
  const m = aggregate(rows);
  assert.deepEqual(m.months, ["2025-01", "2025-02"]);
});

test("aggregate collects unique vendors with their categories", () => {
  const m = aggregate(rows);
  assert.deepEqual(m.vendors, {
    Acme: "Compute",
    Beta: "Office",
    Gamma: "Revenue",
  });
});

test("aggregate sums amounts per vendor per month", () => {
  const m = aggregate(rows);
  assert.equal(m.data["2025-01"].Acme, -150);
  assert.equal(m.data["2025-02"].Acme, -200);
  assert.equal(m.data["2025-01"].Beta, -42);
  assert.equal(m.data["2025-02"].Gamma, 500);
});

test("aggregate returns zero for vendor/month combos with no transactions", () => {
  const m = aggregate(rows);
  assert.equal(m.data["2025-02"].Beta, 0);
  assert.equal(m.data["2025-01"].Gamma, 0);
});

test("aggregate handles empty input", () => {
  const m = aggregate([]);
  assert.deepEqual(m.months, []);
  assert.deepEqual(m.vendors, {});
  assert.deepEqual(m.data, {});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/operation/finance && node --test test/aggregate.test.mjs`
Expected: FAIL, "Cannot find module '../lib/aggregate.mjs'".

- [ ] **Step 3: Write `lib/aggregate.mjs`**

Create `apps/operation/finance/lib/aggregate.mjs`:

```js
/**
 * Aggregate canonical rows into a matrix.
 *
 * Input: array of { date, month, vendor, category, amount }
 * Output: {
 *   months: string[] (sorted ascending, e.g. ["2025-01", "2025-02"]),
 *   vendors: { [vendorName]: categoryName } (unique vendor → category),
 *   data: { [month]: { [vendor]: number } } (summed amounts, 0 for missing combos)
 * }
 *
 * Pure. Does not mutate input.
 */
export function aggregate(rows) {
  const monthsSet = new Set();
  const vendors = {};
  const data = {};

  for (const r of rows) {
    monthsSet.add(r.month);
    vendors[r.vendor] = r.category;
    if (!data[r.month]) data[r.month] = {};
    data[r.month][r.vendor] = (data[r.month][r.vendor] ?? 0) + r.amount;
  }

  const months = [...monthsSet].sort();

  // Fill zero cells for every (month, vendor) combo that has no transaction
  for (const month of months) {
    for (const vendor of Object.keys(vendors)) {
      if (data[month][vendor] === undefined) data[month][vendor] = 0;
    }
  }

  return { months, vendors, data };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/operation/finance && node --test test/aggregate.test.mjs`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
npx biome check --write apps/operation/finance/lib/aggregate.mjs apps/operation/finance/test/aggregate.test.mjs
git add apps/operation/finance/lib/aggregate.mjs apps/operation/finance/test/aggregate.test.mjs
git commit -m "feat(finance): add matrix aggregation"
```

---

## Task 5: Forecast extension

**Files:**
- Create: `apps/operation/finance/lib/forecast.mjs`
- Test: `apps/operation/finance/test/forecast.test.mjs`

- [ ] **Step 1: Write the failing test**

Create `apps/operation/finance/test/forecast.test.mjs`:

```js
import test from "node:test";
import assert from "node:assert/strict";
import { forecast, nextMonth } from "../lib/forecast.mjs";

const base = {
  months: ["2025-01", "2025-02", "2025-03"],
  vendors: { Acme: "Compute", Beta: "Office", Gamma: "Revenue", Delta: "Compute" },
  data: {
    "2025-01": { Acme: -100, Beta: -42, Gamma: 500, Delta: 0 },
    "2025-02": { Acme: -200, Beta: -42, Gamma: 0,   Delta: -50 },
    "2025-03": { Acme: -300, Beta: -42, Gamma: 700, Delta: -50 },
  },
};

const vendorRules = {
  "Acme Cloud Inc.": { canonical: "Acme",  category: "Compute", forecast: "avg3" },
  "Beta, LLC":       { canonical: "Beta",  category: "Office",  forecast: 42 },
  "Gamma Revenue":   { canonical: "Gamma", category: "Revenue", forecast: "none" },
  "Delta Vendor":    { canonical: "Delta", category: "Compute", forecast: "last" },
};

test("nextMonth increments correctly across year boundary", () => {
  assert.equal(nextMonth("2025-01"), "2025-02");
  assert.equal(nextMonth("2025-12"), "2026-01");
});

test("forecast adds N future months to the matrix", () => {
  const extended = forecast(base, vendorRules, 2);
  assert.deepEqual(extended.months, ["2025-01", "2025-02", "2025-03", "2025-04", "2025-05"]);
});

test("forecast with fixed number copies that number forward", () => {
  const extended = forecast(base, vendorRules, 2);
  assert.equal(extended.data["2025-04"].Beta, -42);
  assert.equal(extended.data["2025-05"].Beta, -42);
});

test("forecast avg3 averages last three months", () => {
  const extended = forecast(base, vendorRules, 2);
  // Acme: (-100 + -200 + -300) / 3 = -200
  assert.equal(extended.data["2025-04"].Acme, -200);
  assert.equal(extended.data["2025-05"].Acme, -200);
});

test("forecast last uses last month's value", () => {
  const extended = forecast(base, vendorRules, 2);
  assert.equal(extended.data["2025-04"].Delta, -50);
});

test("forecast none leaves cell as zero", () => {
  const extended = forecast(base, vendorRules, 2);
  assert.equal(extended.data["2025-04"].Gamma, 0);
});

test("forecast live falls back to avg3 in v1", () => {
  const liveRules = {
    ...vendorRules,
    "Acme Cloud Inc.": { canonical: "Acme", category: "Compute", forecast: "live" },
  };
  const extended = forecast(base, liveRules, 1);
  assert.equal(extended.data["2025-04"].Acme, -200); // same as avg3
});

test("forecast marks future cells via a Set returned on the matrix", () => {
  const extended = forecast(base, vendorRules, 2);
  assert.ok(extended.forecastMonths instanceof Set);
  assert.ok(extended.forecastMonths.has("2025-04"));
  assert.ok(extended.forecastMonths.has("2025-05"));
  assert.ok(!extended.forecastMonths.has("2025-03"));
});

test("forecast marks live cells on the matrix for layout styling", () => {
  const liveRules = {
    ...vendorRules,
    "Acme Cloud Inc.": { canonical: "Acme", category: "Compute", forecast: "live" },
  };
  const extended = forecast(base, liveRules, 1);
  assert.ok(extended.liveCells instanceof Set);
  assert.ok(extended.liveCells.has("2025-04|Acme"));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/operation/finance && node --test test/forecast.test.mjs`
Expected: FAIL, "Cannot find module '../lib/forecast.mjs'".

- [ ] **Step 3: Write `lib/forecast.mjs`**

Create `apps/operation/finance/lib/forecast.mjs`:

```js
/**
 * Extend an aggregate matrix with N future months based on per-vendor forecast rules.
 *
 * Input:
 *   matrix        — { months, vendors, data } from aggregate()
 *   vendorRules   — raw vendors.json map (keys are raw counterparty names, values have `canonical` and `forecast`)
 *   forecastCount — number of future months to add
 *
 * Output (extended matrix):
 *   months          — original months + N future months
 *   vendors         — unchanged
 *   data            — extended with forecast values for the new months
 *   forecastMonths  — Set of month strings that are forecast (not actual)
 *   liveCells       — Set of "month|vendor" keys that were flagged `"live"` (v2 will fill these)
 *
 * Rules:
 *   number       → copy that number to every future month
 *   "avg3"       → average of last 3 actual months for that vendor
 *   "last"       → last actual month's value for that vendor
 *   "none"       → 0 in every future month
 *   "live"       → v1 fallback: same as avg3, but the cell is marked in liveCells
 *
 * Pure. Does not mutate input. Does not mutate vendorRules.
 */

export function nextMonth(ym) {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1, 1));
  d.setUTCMonth(d.getUTCMonth() + 1);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function buildRuleIndexByCanonical(vendorRules) {
  // Map canonical vendor name → forecast rule. If two raw entries map to the same
  // canonical, last one wins (they should agree; this is documented behavior).
  const out = {};
  for (const entry of Object.values(vendorRules)) {
    out[entry.canonical] = entry.forecast;
  }
  return out;
}

function avg3(matrix, vendor) {
  const lastThree = matrix.months.slice(-3);
  if (lastThree.length === 0) return 0;
  const sum = lastThree.reduce((s, m) => s + (matrix.data[m][vendor] ?? 0), 0);
  return sum / lastThree.length;
}

function lastMonthValue(matrix, vendor) {
  const last = matrix.months.at(-1);
  if (!last) return 0;
  return matrix.data[last][vendor] ?? 0;
}

function forecastValue(rule, matrix, vendor) {
  if (typeof rule === "number") return rule;
  if (rule === "avg3") return avg3(matrix, vendor);
  if (rule === "last") return lastMonthValue(matrix, vendor);
  if (rule === "none") return 0;
  if (rule === "live") return avg3(matrix, vendor); // v1 fallback
  return 0; // unknown rule → zero
}

export function forecast(matrix, vendorRules, forecastCount) {
  const ruleByCanonical = buildRuleIndexByCanonical(vendorRules);
  const months = [...matrix.months];
  const data = {};
  for (const m of months) data[m] = { ...matrix.data[m] };

  const forecastMonths = new Set();
  const liveCells = new Set();

  let cursor = months.at(-1);
  for (let i = 0; i < forecastCount; i++) {
    cursor = nextMonth(cursor);
    months.push(cursor);
    forecastMonths.add(cursor);
    data[cursor] = {};
    for (const vendor of Object.keys(matrix.vendors)) {
      const rule = ruleByCanonical[vendor];
      data[cursor][vendor] = rule === undefined ? 0 : forecastValue(rule, matrix, vendor);
      if (rule === "live") liveCells.add(`${cursor}|${vendor}`);
    }
  }

  return { months, vendors: matrix.vendors, data, forecastMonths, liveCells };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/operation/finance && node --test test/forecast.test.mjs`
Expected: PASS, 9 tests.

- [ ] **Step 5: Commit**

```bash
npx biome check --write apps/operation/finance/lib/forecast.mjs apps/operation/finance/test/forecast.test.mjs
git add apps/operation/finance/lib/forecast.mjs apps/operation/finance/test/forecast.test.mjs
git commit -m "feat(finance): add forecast extension"
```

---

## Task 6: Layout generator

**Files:**
- Create: `apps/operation/finance/lib/layout.mjs`
- Test: `apps/operation/finance/test/layout.test.mjs`

This is the widest task. The output of `layout.mjs` is `{ cells, formats, columnWidths, freezeRows }`. `cells` is a 2D array written once to the sheet. `formats` is an array of `{ range, format, fields }` objects consumed by `lib/gog.mjs`. The function is pure — no I/O.

- [ ] **Step 1: Write the failing test**

Create `apps/operation/finance/test/layout.test.mjs`:

```js
import test from "node:test";
import assert from "node:assert/strict";
import { buildLayout } from "../lib/layout.mjs";

const matrix = {
  months: ["2025-01", "2025-02", "2025-03", "2025-04", "2025-05"],
  vendors: { Acme: "Compute", Beta: "Office", Gamma: "Revenue" },
  data: {
    "2025-01": { Acme: -100, Beta: -42, Gamma: 500 },
    "2025-02": { Acme: -200, Beta: -42, Gamma: 0 },
    "2025-03": { Acme: -300, Beta: -42, Gamma: 700 },
    "2025-04": { Acme: -200, Beta: -42, Gamma: 400 },
    "2025-05": { Acme: -200, Beta: -42, Gamma: 400 },
  },
  forecastMonths: new Set(["2025-04", "2025-05"]),
  liveCells: new Set(),
};

const config = {
  cashBalance: 10000,
  cashBalanceAsOf: "2025-04-01",
};

// currentMonth is passed explicitly so tests aren't date-dependent
const options = { currentMonth: "2025-04" };

test("buildLayout returns cells, formats, columnWidths, freezeRows", () => {
  const out = buildLayout(matrix, config, options);
  assert.ok(Array.isArray(out.cells));
  assert.ok(Array.isArray(out.formats));
  assert.ok(Array.isArray(out.columnWidths));
  assert.equal(typeof out.freezeRows, "number");
});

test("buildLayout first row is the title", () => {
  const { cells } = buildLayout(matrix, config, options);
  assert.equal(cells[0][0], "POLLINATIONS FINANCE — RUNWAY TRACKER");
});

test("buildLayout includes a KPI summary row with cash, burn, runway", () => {
  const { cells } = buildLayout(matrix, config, options);
  const kpiRow = cells.find((r) => typeof r[0] === "string" && r[0].startsWith("Cash:"));
  assert.ok(kpiRow, "KPI row missing");
  assert.ok(kpiRow[0].includes("Cash: €10,000"));
  assert.ok(kpiRow[0].includes("Burn"));
  assert.ok(kpiRow[0].includes("Runway"));
});

test("buildLayout header row contains Category, Vendor, then each month", () => {
  const { cells } = buildLayout(matrix, config, options);
  const headerRow = cells.find((r) => r[0] === "Category" && r[1] === "Vendor");
  assert.ok(headerRow);
  assert.equal(headerRow[2], "Jan 2025");
  assert.equal(headerRow[3], "Feb 2025");
  assert.equal(headerRow[4], "Mar 2025");
  assert.equal(headerRow[5], "Apr 2025 (MTD)");
  assert.equal(headerRow[6], "May 2025 (fcst)");
});

test("buildLayout groups vendors under category headers with subtotals", () => {
  const { cells } = buildLayout(matrix, config, options);
  const categoryHeaders = cells.filter((r) => r[0] === "Compute" && r[1] === "");
  assert.ok(categoryHeaders.length >= 1);
  const subtotalRow = cells.find((r) => r[1] === "Compute subtotal");
  assert.ok(subtotalRow);
});

test("buildLayout computes monthly totals row", () => {
  const { cells } = buildLayout(matrix, config, options);
  const totalRow = cells.find((r) => r[1] === "TOTAL EXPENSES");
  assert.ok(totalRow);
  // Jan: Acme (-100) + Beta (-42) = -142
  assert.equal(totalRow[2], -142);
});

test("buildLayout computes net row (revenue + expenses)", () => {
  const { cells } = buildLayout(matrix, config, options);
  const netRow = cells.find((r) => typeof r[1] === "string" && r[1].startsWith("NET"));
  assert.ok(netRow);
  // Jan: 500 + (-142) = 358
  assert.equal(netRow[2], 358);
});

test("buildLayout computes running cash walking forward from cashBalanceAsOf", () => {
  const { cells } = buildLayout(matrix, config, options);
  const cashRow = cells.find((r) => r[1] === "Running cash");
  assert.ok(cashRow);
  // Starts at 10000 at April (cashBalanceAsOf = 2025-04-01)
  // April net: 400 + (-242) = 158 → 10158
  // May net: 400 + (-242) = 158 → 10316
  assert.equal(cashRow[5], 10000 + 158);
  assert.equal(cashRow[6], 10000 + 158 + 158);
});

test("buildLayout emits a format entry for the current month column", () => {
  const { formats } = buildLayout(matrix, config, options);
  const currentMonthFormat = formats.find((f) => f.label === "currentMonthColumn");
  assert.ok(currentMonthFormat, "missing currentMonthColumn format");
  assert.ok(currentMonthFormat.range.includes("F")); // Apr is column F (A=Category, B=Vendor, C=Jan, D=Feb, E=Mar, F=Apr)
});

test("buildLayout emits format entries for forecast columns", () => {
  const { formats } = buildLayout(matrix, config, options);
  const forecastFormat = formats.find((f) => f.label === "forecastColumns");
  assert.ok(forecastFormat, "missing forecastColumns format");
});

test("buildLayout freezes the header row", () => {
  const { freezeRows } = buildLayout(matrix, config, options);
  assert.ok(freezeRows >= 1);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/operation/finance && node --test test/layout.test.mjs`
Expected: FAIL, "Cannot find module '../lib/layout.mjs'".

- [ ] **Step 3: Write `lib/layout.mjs`**

Create `apps/operation/finance/lib/layout.mjs`:

```js
import { CATEGORIES, categoryIndex, isRevenue } from "./categories.mjs";

// ---------- helpers ----------

const MONTH_ABBR = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function monthLabel(ym, { isCurrent, isForecast }) {
  const [y, m] = ym.split("-").map(Number);
  const base = `${MONTH_ABBR[m - 1]} ${y}`;
  if (isCurrent) return `${base} (MTD)`;
  if (isForecast) return `${base} (fcst)`;
  return base;
}

function colLetter(zeroIdx) {
  // Column index to A1 letter. Good up to ZZ.
  let n = zeroIdx;
  let s = "";
  while (n >= 0) {
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26) - 1;
  }
  return s;
}

function a1(row, col) {
  return `${colLetter(col)}${row + 1}`;
}

function range(r1, c1, r2, c2) {
  return `Sheet1!${a1(r1, c1)}:${a1(r2, c2)}`;
}

function formatEuro(n) {
  // Not used for numeric cells — those get Sheet number formatting.
  // Used only for text strings in KPI summary.
  const abs = Math.abs(n);
  const s = abs.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  return `${n < 0 ? "-" : ""}€${s}`;
}

function groupVendorsByCategory(vendors) {
  const byCat = new Map();
  for (const [vendor, category] of Object.entries(vendors)) {
    if (!byCat.has(category)) byCat.set(category, []);
    byCat.get(category).push(vendor);
  }
  // Sort categories by canonical order, vendors alphabetically
  const ordered = [...byCat.entries()].sort((a, b) => categoryIndex(a[0]) - categoryIndex(b[0]));
  for (const [, list] of ordered) list.sort();
  return ordered;
}

function sumRowForVendors(matrix, month, vendors) {
  return vendors.reduce((s, v) => s + (matrix.data[month][v] ?? 0), 0);
}

// ---------- runway KPIs ----------

function computeKpis(matrix, config, { currentMonth }) {
  const actualMonths = matrix.months.filter((m) => !matrix.forecastMonths.has(m) && m !== currentMonth);
  const lastThree = actualMonths.slice(-3);
  let burn = 0;
  if (lastThree.length > 0) {
    const nets = lastThree.map((m) => {
      let total = 0;
      for (const v of Object.keys(matrix.vendors)) total += matrix.data[m][v] ?? 0;
      return total;
    });
    burn = nets.reduce((a, b) => a + b, 0) / nets.length;
  }
  const burnAbs = Math.abs(burn);
  const runwayMonths = burnAbs > 0 ? config.cashBalance / burnAbs : Infinity;
  const runwayText = runwayMonths === Infinity ? "∞" : runwayMonths.toFixed(1);
  return {
    burn,
    runwayMonths,
    text: `Cash: ${formatEuro(config.cashBalance)} | Burn (avg3): ${formatEuro(Math.round(burn))} | Runway: ${runwayText} months`,
  };
}

// ---------- main ----------

/**
 * Pure layout builder. Returns everything needed to render a sheet but knows
 * nothing about gog, Google Sheets, or I/O. A future HTML/Notion renderer
 * can consume the same output.
 *
 * @param {object} matrix  - from forecast(aggregate(...))
 * @param {object} config  - { cashBalance, cashBalanceAsOf, ... }
 * @param {object} options - { currentMonth: "YYYY-MM" } (passed explicitly for testability)
 * @returns { cells: any[][], formats: Array<{range, format, fields, label}>, columnWidths: Array<{col, width}>, freezeRows: number }
 */
export function buildLayout(matrix, config, { currentMonth }) {
  const cells = [];
  const formats = [];

  const { months } = matrix;

  // Column index of each month (after Category, Vendor = 2 static columns)
  const monthCol = (monthIdx) => 2 + monthIdx;
  const totalCol = 2 + months.length; // "Total actual" column

  // --- row 0: title ---
  const titleRow = ["POLLINATIONS FINANCE — RUNWAY TRACKER", ...Array(totalCol).fill("")];
  cells.push(titleRow);
  formats.push({
    label: "title",
    range: range(0, 0, 0, totalCol),
    fields: "userEnteredFormat.textFormat.bold,userEnteredFormat.textFormat.fontSize,userEnteredFormat.backgroundColor,userEnteredFormat.textFormat.foregroundColor",
    format: {
      textFormat: { bold: true, fontSize: 16, foregroundColor: { red: 1, green: 1, blue: 1 } },
      backgroundColor: { red: 0.15, green: 0.15, blue: 0.2 },
    },
  });

  // --- row 1: blank ---
  cells.push(Array(totalCol + 1).fill(""));

  // --- row 2: KPIs ---
  const kpi = computeKpis(matrix, config, { currentMonth });
  const kpiRow = [kpi.text, ...Array(totalCol).fill("")];
  cells.push(kpiRow);
  formats.push({
    label: "kpi",
    range: range(2, 0, 2, totalCol),
    fields: "userEnteredFormat.textFormat.bold,userEnteredFormat.backgroundColor",
    format: {
      textFormat: { bold: true },
      backgroundColor: { red: 0.95, green: 0.97, blue: 1 },
    },
  });

  // --- row 3: blank ---
  cells.push(Array(totalCol + 1).fill(""));

  // --- row 4: header ---
  const currentMonthIdx = months.indexOf(currentMonth); // may be -1
  const headerRow = ["Category", "Vendor"];
  for (const m of months) {
    headerRow.push(
      monthLabel(m, {
        isCurrent: m === currentMonth,
        isForecast: matrix.forecastMonths.has(m) && m !== currentMonth,
      }),
    );
  }
  headerRow.push("Total actual");
  cells.push(headerRow);
  const headerRowIdx = cells.length - 1;
  formats.push({
    label: "header",
    range: range(headerRowIdx, 0, headerRowIdx, totalCol),
    fields: "userEnteredFormat.textFormat.bold,userEnteredFormat.backgroundColor,userEnteredFormat.borders",
    format: {
      textFormat: { bold: true },
      backgroundColor: { red: 0.93, green: 0.93, blue: 0.93 },
      borders: { bottom: { style: "SOLID" } },
    },
  });

  // --- vendor rows grouped by category ---
  const grouped = groupVendorsByCategory(matrix.vendors);

  // Track which rows are vendor rows for totals later
  const expenseSubtotalRows = [];
  const revenueSubtotalRows = [];

  for (const [category, vendors] of grouped) {
    // Category header row
    const catHeader = [category, "", ...Array(months.length + 1).fill("")];
    cells.push(catHeader);
    const catRowIdx = cells.length - 1;
    formats.push({
      label: `category-${category}`,
      range: range(catRowIdx, 0, catRowIdx, totalCol),
      fields: "userEnteredFormat.textFormat.bold,userEnteredFormat.backgroundColor",
      format: {
        textFormat: { bold: true },
        backgroundColor: { red: 0.85, green: 0.9, blue: 1 },
      },
    });

    // Vendor rows
    for (const vendor of vendors) {
      const row = ["", vendor];
      let totalActual = 0;
      for (let i = 0; i < months.length; i++) {
        const m = months[i];
        const v = matrix.data[m][vendor] ?? 0;
        row.push(Number(v.toFixed(2)));
        if (!matrix.forecastMonths.has(m) && m !== currentMonth) totalActual += v;
      }
      row.push(Number(totalActual.toFixed(2)));
      cells.push(row);
    }

    // Subtotal row
    const subtotal = ["", `${category} subtotal`];
    for (const m of months) {
      subtotal.push(Number(sumRowForVendors(matrix, m, vendors).toFixed(2)));
    }
    // Total actual for subtotal = sum of actual months only
    let subtotalActual = 0;
    for (const m of months) {
      if (!matrix.forecastMonths.has(m) && m !== currentMonth) {
        subtotalActual += sumRowForVendors(matrix, m, vendors);
      }
    }
    subtotal.push(Number(subtotalActual.toFixed(2)));
    cells.push(subtotal);
    const subRowIdx = cells.length - 1;
    formats.push({
      label: `subtotal-${category}`,
      range: range(subRowIdx, 1, subRowIdx, totalCol),
      fields: "userEnteredFormat.textFormat.bold,userEnteredFormat.textFormat.italic,userEnteredFormat.borders",
      format: {
        textFormat: { bold: true, italic: true },
        borders: { top: { style: "SOLID" } },
      },
    });

    if (isRevenue(category)) revenueSubtotalRows.push(subRowIdx);
    else expenseSubtotalRows.push(subRowIdx);

    // Blank spacer
    cells.push(Array(totalCol + 1).fill(""));
  }

  // --- TOTAL EXPENSES row (sum of all expense vendors) ---
  const expenseVendors = Object.entries(matrix.vendors)
    .filter(([, cat]) => !isRevenue(cat))
    .map(([v]) => v);
  const revenueVendors = Object.entries(matrix.vendors)
    .filter(([, cat]) => isRevenue(cat))
    .map(([v]) => v);

  const totalExpRow = ["", "TOTAL EXPENSES"];
  for (const m of months) totalExpRow.push(Number(sumRowForVendors(matrix, m, expenseVendors).toFixed(2)));
  totalExpRow.push("");
  cells.push(totalExpRow);
  const totalExpRowIdx = cells.length - 1;
  formats.push({
    label: "totalExpenses",
    range: range(totalExpRowIdx, 0, totalExpRowIdx, totalCol),
    fields: "userEnteredFormat.textFormat.bold,userEnteredFormat.backgroundColor,userEnteredFormat.borders",
    format: {
      textFormat: { bold: true },
      backgroundColor: { red: 0.95, green: 0.85, blue: 0.85 },
      borders: {
        top: { style: "SOLID_THICK" },
        bottom: { style: "SOLID" },
      },
    },
  });

  // --- NET row ---
  const netRow = ["", "NET (Revenue − Expenses)"];
  for (const m of months) {
    const net = sumRowForVendors(matrix, m, revenueVendors) + sumRowForVendors(matrix, m, expenseVendors);
    netRow.push(Number(net.toFixed(2)));
  }
  netRow.push("");
  cells.push(netRow);
  const netRowIdx = cells.length - 1;
  formats.push({
    label: "net",
    range: range(netRowIdx, 0, netRowIdx, totalCol),
    fields: "userEnteredFormat.textFormat.bold,userEnteredFormat.backgroundColor,userEnteredFormat.borders",
    format: {
      textFormat: { bold: true },
      backgroundColor: { red: 0.85, green: 0.95, blue: 0.85 },
      borders: { bottom: { style: "SOLID_THICK" } },
    },
  });

  // --- Running cash row ---
  cells.push(Array(totalCol + 1).fill(""));
  const cashRow = ["", "Running cash"];
  const asOfMonth = config.cashBalanceAsOf ? config.cashBalanceAsOf.slice(0, 7) : months[0];
  let running = config.cashBalance;
  let started = false;
  for (const m of months) {
    if (m === asOfMonth) started = true;
    if (!started) {
      cashRow.push("");
      continue;
    }
    const net = sumRowForVendors(matrix, m, revenueVendors) + sumRowForVendors(matrix, m, expenseVendors);
    running += net;
    cashRow.push(Number(running.toFixed(2)));
  }
  cashRow.push("");
  cells.push(cashRow);
  const cashRowIdx = cells.length - 1;
  formats.push({
    label: "runningCash",
    range: range(cashRowIdx, 0, cashRowIdx, totalCol),
    fields: "userEnteredFormat.textFormat.bold,userEnteredFormat.backgroundColor",
    format: {
      textFormat: { bold: true },
      backgroundColor: { red: 0.9, green: 0.9, blue: 1 },
    },
  });

  // --- Column-level formats for current + forecast ---
  const lastRow = cells.length - 1;
  if (currentMonthIdx >= 0) {
    const c = monthCol(currentMonthIdx);
    formats.push({
      label: "currentMonthColumn",
      range: `Sheet1!${colLetter(c)}${headerRowIdx + 1}:${colLetter(c)}${lastRow + 1}`,
      fields: "userEnteredFormat.backgroundColor",
      format: { backgroundColor: { red: 1, green: 1, blue: 0.85 } },
    });
  }
  const forecastIdxs = months
    .map((m, i) => (matrix.forecastMonths.has(m) && m !== currentMonth ? i : -1))
    .filter((i) => i >= 0);
  if (forecastIdxs.length > 0) {
    const first = monthCol(forecastIdxs[0]);
    const last = monthCol(forecastIdxs.at(-1));
    formats.push({
      label: "forecastColumns",
      range: `Sheet1!${colLetter(first)}${headerRowIdx + 1}:${colLetter(last)}${lastRow + 1}`,
      fields: "userEnteredFormat.backgroundColor,userEnteredFormat.textFormat.italic,userEnteredFormat.textFormat.foregroundColor",
      format: {
        backgroundColor: { red: 0.94, green: 0.94, blue: 0.94 },
        textFormat: { italic: true, foregroundColor: { red: 0.4, green: 0.4, blue: 0.4 } },
      },
    });
  }

  // --- Column widths ---
  const columnWidths = [
    { col: 0, width: 150 }, // Category
    { col: 1, width: 220 }, // Vendor
  ];
  for (let i = 0; i < months.length; i++) columnWidths.push({ col: 2 + i, width: 110 });
  columnWidths.push({ col: totalCol, width: 120 });

  return {
    cells,
    formats,
    columnWidths,
    freezeRows: headerRowIdx + 1,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/operation/finance && node --test test/layout.test.mjs`
Expected: PASS, 11 tests.

- [ ] **Step 5: Commit**

```bash
npx biome check --write apps/operation/finance/lib/layout.mjs apps/operation/finance/test/layout.test.mjs
git add apps/operation/finance/lib/layout.mjs apps/operation/finance/test/layout.test.mjs
git commit -m "feat(finance): add layout generator"
```

---

## Task 7: gog CLI wrapper

**Files:**
- Create: `apps/operation/finance/lib/gog.mjs`

No tests for this module. It is a thin shell-out wrapper; testing it would mean mocking `child_process` which just tests the mock. We verify it end-to-end in Task 10 (integration check).

- [ ] **Step 1: Write `lib/gog.mjs`**

Create `apps/operation/finance/lib/gog.mjs`:

```js
import { spawn } from "node:child_process";

/**
 * Thin async wrappers around the `gog` CLI. This is the ONLY module in the app
 * that shells out. Every other module is pure. Swapping this for the Google
 * Sheets googleapis client later would touch no other file.
 */

function run(args, { account, json = false } = {}) {
  return new Promise((resolve, reject) => {
    const finalArgs = ["-a", account, ...args];
    if (json) finalArgs.push("-j");
    const child = spawn("gog", finalArgs, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`gog ${finalArgs.join(" ")} exited ${code}\nstderr: ${stderr}`));
        return;
      }
      resolve(json ? JSON.parse(stdout) : stdout.trim());
    });
  });
}

export async function createSheet(title, { account }) {
  const r = await run(["sheets", "create", title], { account, json: true });
  return r.spreadsheetId;
}

export async function clearSheet(spreadsheetId, range, { account }) {
  await run(["sheets", "clear", spreadsheetId, range], { account });
}

export async function updateValues(spreadsheetId, range, cells, { account }) {
  await run(
    ["sheets", "update", spreadsheetId, range, "--values-json", JSON.stringify(cells)],
    { account },
  );
}

export async function applyFormat(spreadsheetId, { range, format, fields }, { account }) {
  await run(
    ["sheets", "format", spreadsheetId, range, "--format-fields", fields, "--format-json", JSON.stringify(format)],
    { account },
  );
}

export async function applyNumberFormat(spreadsheetId, range, pattern, { account }) {
  await run(
    ["sheets", "number-format", spreadsheetId, range, "--pattern", pattern, "--type", "NUMBER"],
    { account },
  );
}

export async function resizeColumn(spreadsheetId, colA1Range, pixels, { account }) {
  await run(["sheets", "resize-columns", spreadsheetId, colA1Range, "--width", String(pixels)], {
    account,
  });
}

export async function freeze(spreadsheetId, rows, { account }) {
  await run(["sheets", "freeze", spreadsheetId, "--rows", String(rows)], { account });
}
```

- [ ] **Step 2: Commit**

```bash
npx biome check --write apps/operation/finance/lib/gog.mjs
git add apps/operation/finance/lib/gog.mjs
git commit -m "feat(finance): add gog cli wrapper"
```

---

## Task 8: IO + prompt helpers

**Files:**
- Create: `apps/operation/finance/lib/io.mjs`
- Create: `apps/operation/finance/lib/prompt.mjs`

No unit tests: these are thin wrappers around `fs` and `readline`. Verified end-to-end in Task 10.

- [ ] **Step 1: Write `lib/io.mjs`**

Create `apps/operation/finance/lib/io.mjs`:

```js
import { readFile, writeFile, readdir, copyFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const APP_DIR = dirname(dirname(fileURLToPath(import.meta.url)));
const CONFIG_PATH = join(APP_DIR, "config.local.json");
const VENDORS_PATH = join(APP_DIR, "secrets", "vendors.json");
const INPUT_DIR = join(APP_DIR, "secrets", "input");

export function appDir() {
  return APP_DIR;
}

export async function loadConfig() {
  if (!existsSync(CONFIG_PATH)) {
    throw new Error(
      `Missing ${CONFIG_PATH}. Copy config.example.json to config.local.json and edit it.`,
    );
  }
  return JSON.parse(await readFile(CONFIG_PATH, "utf8"));
}

export async function loadVendors() {
  if (!existsSync(VENDORS_PATH)) {
    await mkdir(dirname(VENDORS_PATH), { recursive: true });
    await writeFile(VENDORS_PATH, "{}\n");
    return {};
  }
  return JSON.parse(await readFile(VENDORS_PATH, "utf8"));
}

export async function saveVendors(vendors) {
  await mkdir(dirname(VENDORS_PATH), { recursive: true });
  await writeFile(VENDORS_PATH, `${JSON.stringify(vendors, null, 2)}\n`);
}

export async function listInputCsvs() {
  if (!existsSync(INPUT_DIR)) {
    await mkdir(INPUT_DIR, { recursive: true });
    return [];
  }
  const files = await readdir(INPUT_DIR);
  return files
    .filter((f) => f.endsWith(".csv"))
    .sort()
    .map((f) => join(INPUT_DIR, f));
}

export async function readText(path) {
  return readFile(path, "utf8");
}

export async function copyIntoInput(sourcePath, destName) {
  await mkdir(INPUT_DIR, { recursive: true });
  const dest = join(INPUT_DIR, destName);
  await copyFile(sourcePath, dest);
  return dest;
}
```

- [ ] **Step 2: Write `lib/prompt.mjs`**

Create `apps/operation/finance/lib/prompt.mjs`:

```js
import readline from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { CATEGORIES } from "./categories.mjs";

/**
 * Interactively resolve an unknown vendor.
 * Returns { canonical, category, forecast } suitable for writing into vendors.json.
 */
export async function promptNewVendor(rawName) {
  const rl = readline.createInterface({ input: stdin, output: stdout });
  try {
    console.log(`\nNew vendor: "${rawName}"`);
    const canonical = (await rl.question(`  Canonical name [${rawName}]: `)) || rawName;
    let category = await rl.question(`  Category (${CATEGORIES.join(", ")}) [Other]: `);
    category = category || "Other";
    if (!CATEGORIES.includes(category)) {
      console.log(`  ⚠ unknown category "${category}" — will fall back to Other`);
      category = "Other";
    }
    let forecast = await rl.question("  Forecast rule (number | avg3 | last | none | live) [avg3]: ");
    forecast = forecast || "avg3";
    if (forecast !== "avg3" && forecast !== "last" && forecast !== "none" && forecast !== "live") {
      const n = Number(forecast);
      if (!Number.isFinite(n)) {
        console.log(`  ⚠ invalid forecast "${forecast}" — falling back to avg3`);
        forecast = "avg3";
      } else {
        forecast = n;
      }
    }
    return { canonical, category, forecast };
  } finally {
    rl.close();
  }
}
```

- [ ] **Step 3: Commit**

```bash
npx biome check --write apps/operation/finance/lib/io.mjs apps/operation/finance/lib/prompt.mjs
git add apps/operation/finance/lib/io.mjs apps/operation/finance/lib/prompt.mjs
git commit -m "feat(finance): add io and prompt helpers"
```

---

## Task 9: `rebuild-sheet.mjs` orchestration

**Files:**
- Create: `apps/operation/finance/bin/rebuild-sheet.mjs`

- [ ] **Step 1: Write `bin/rebuild-sheet.mjs`**

Create `apps/operation/finance/bin/rebuild-sheet.mjs`:

```js
#!/usr/bin/env node
import { basename } from "node:path";
import { parseCsv } from "../lib/parse-csv.mjs";
import { normalize } from "../lib/normalize.mjs";
import { aggregate } from "../lib/aggregate.mjs";
import { forecast } from "../lib/forecast.mjs";
import { buildLayout } from "../lib/layout.mjs";
import { loadConfig, loadVendors, saveVendors, listInputCsvs, readText } from "../lib/io.mjs";
import { promptNewVendor } from "../lib/prompt.mjs";
import {
  clearSheet,
  updateValues,
  applyFormat,
  applyNumberFormat,
  resizeColumn,
  freeze,
} from "../lib/gog.mjs";

function colLetter(zeroIdx) {
  let n = zeroIdx;
  let s = "";
  while (n >= 0) {
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26) - 1;
  }
  return s;
}

function currentMonthFromClock() {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

async function main() {
  const config = await loadConfig();
  const account = config.gogAccount;
  const spreadsheetId = config.spreadsheetId;
  if (!spreadsheetId || !account) {
    throw new Error("config.local.json must set spreadsheetId and gogAccount");
  }

  const csvPaths = await listInputCsvs();
  if (csvPaths.length === 0) {
    console.error("No CSVs in secrets/input/. Drop a YYYY-MM.csv file there and re-run.");
    process.exit(1);
  }

  // Load all CSVs
  const rawRows = [];
  for (const path of csvPaths) {
    const text = await readText(path);
    const rows = parseCsv(text, { filename: basename(path) });
    rawRows.push(...rows);
  }
  console.log(`Loaded ${rawRows.length} rows from ${csvPaths.length} CSV file(s).`);

  // Resolve unknown vendors interactively
  let vendors = await loadVendors();
  for (;;) {
    const { canonical, unknown } = normalize(rawRows, vendors);
    if (unknown.length === 0) {
      var canonicalRows = canonical;
      break;
    }
    console.log(`\n${unknown.length} unknown vendor(s) — resolving interactively.`);
    for (const u of unknown) {
      const entry = await promptNewVendor(u);
      vendors[u] = entry;
    }
    await saveVendors(vendors);
  }

  // Aggregate → forecast → layout
  const matrix = aggregate(canonicalRows);
  const extended = forecast(matrix, vendors, config.forecastMonths ?? 6);
  const layout = buildLayout(extended, config, { currentMonth: currentMonthFromClock() });

  // Write to sheet
  console.log(`Writing ${layout.cells.length} rows × ${layout.cells[0].length} cols to sheet...`);
  const lastCol = colLetter(layout.cells[0].length - 1);
  await clearSheet(spreadsheetId, `Sheet1!A1:${lastCol}1000`, { account });
  await updateValues(spreadsheetId, "Sheet1!A1", layout.cells, { account });

  for (const fmt of layout.formats) {
    await applyFormat(spreadsheetId, fmt, { account });
  }

  // Number format for all numeric cells in month columns + total
  // Month columns start at C (col 2) and go through the total column
  const firstMonthCol = colLetter(2);
  const totalCol = colLetter(2 + extended.months.length);
  const numericRange = `Sheet1!${firstMonthCol}5:${totalCol}${layout.cells.length}`;
  await applyNumberFormat(
    spreadsheetId,
    numericRange,
    '#,##0 "€";[RED]-#,##0 "€"',
    { account },
  );

  for (const { col, width } of layout.columnWidths) {
    const letter = colLetter(col);
    await resizeColumn(spreadsheetId, `${letter}:${letter}`, width, { account });
  }

  await freeze(spreadsheetId, layout.freezeRows, { account });

  console.log("\nDone.");
  console.log(`Vendors: ${Object.keys(extended.vendors).length}`);
  console.log(
    `Months: ${extended.months.length} (${extended.months.filter((m) => !extended.forecastMonths.has(m)).length} actual + ${extended.forecastMonths.size} forecast)`,
  );
  const kpiRow = layout.cells.find((r) => typeof r[0] === "string" && r[0].startsWith("Cash:"));
  if (kpiRow) console.log(kpiRow[0]);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
```

- [ ] **Step 2: Make executable**

```bash
chmod +x apps/operation/finance/bin/rebuild-sheet.mjs
```

- [ ] **Step 3: Run existing tests to confirm nothing broke**

Run: `cd apps/operation/finance && npm test`
Expected: PASS, all tests from tasks 1–6.

- [ ] **Step 4: Commit**

```bash
npx biome check --write apps/operation/finance/bin/rebuild-sheet.mjs
git add apps/operation/finance/bin/rebuild-sheet.mjs
git commit -m "feat(finance): add rebuild-sheet orchestration"
```

---

## Task 10: End-to-end smoke test

Manual verification with real data. Not committed. Uses the existing spreadsheet from this morning.

- [ ] **Step 1: Set up local config and secrets**

The spec session already created the target spreadsheet (`1spPgtYPa05YtK8jjw0g4hpfYXqE10043oP7A1dQe5Mk`). Wire it up locally:

```bash
cd apps/operation/finance
cp config.example.json config.local.json
```

Edit `config.local.json`:

```json
{
  "spreadsheetId": "1spPgtYPa05YtK8jjw0g4hpfYXqE10043oP7A1dQe5Mk",
  "gogAccount": "elliot@myceli.ai",
  "forecastMonths": 6,
  "cashBalance": 120000,
  "cashBalanceAsOf": "2025-04-01"
}
```

(`cashBalance` is a ballpark; update when you know the real number.)

- [ ] **Step 2: Copy the three real CSVs into `secrets/input/`**

```bash
cp /tmp/opex/january.csv apps/operation/finance/secrets/input/2025-01.csv
cp /tmp/opex/february.csv apps/operation/finance/secrets/input/2025-02.csv
cp /tmp/opex/march.csv apps/operation/finance/secrets/input/2025-03.csv
```

- [ ] **Step 3: Run the rebuild, answer vendor prompts**

```bash
cd apps/operation/finance
node bin/rebuild-sheet.mjs
```

Expected: the script prints the number of unknown vendors, then prompts for each. For known messy cases, use these canonical answers (gives you a clean starting `vendors.json`):

| Raw name | Canonical | Category | Forecast |
|---|---|---|---|
| Vast.ai Inc. | Vast.ai | Compute | avg3 |
| Anthropic | Anthropic | Compute | 180 |
| Anthropic, PBC | Anthropic | Compute | 180 |
| Alibaba | Alibaba | Compute | avg3 |
| Alibaba (Netherlands) B.V. | Alibaba | Compute | avg3 |
| Microsoft | Microsoft Azure | Compute | avg3 |
| Microsoft Ireland Operations Limited | Microsoft Azure | Compute | avg3 |
| Google Cloud EMEA Limited | Google Cloud | Compute | avg3 |
| Google Ireland Limited | Google Cloud | Compute | avg3 |
| IO.net | IO.net | Compute | avg3 |
| Byteplus | Byteplus | Compute | avg3 |
| xAI | xAI | Compute | avg3 |
| Pruna | Pruna | Compute | avg3 |
| Runpod | Runpod | Compute | avg3 |
| Replicate | Replicate | Compute | avg3 |
| Retell.AI | Retell.AI | Productivity | avg3 |
| Daytona Platforms, Inc. | Daytona | Compute | avg3 |
| TELE2 EESTI AS | TELE2 | Compute | avg3 |
| Deel Inc. | Deel | Employee Salaries | 14000 |
| THOT SASU | THOT | Freelancer | none |
| SO LAB X | SO LAB X | Freelancer | 3000 |
| Ayushman Bhattacharya | Ayushman | Freelancer | none |
| ENTYTECH OÃ (or ENTYTECH OU) | ENTYTECH | Accounting | 284 |
| Gaswerkssiedlung Berlin GmbH | Gaswerkssiedlung | Office | 1167 |
| naturenergie hochrhein AG | naturenergie | Office | 33 |
| Amazon Web Services EMEA SARL | AWS | Office | avg3 |
| Barbara Yasmina Khamouguinoff | Barbara | Office | none |
| Zara | Zara | Office | none |
| Space Berlin | Space Berlin | Food / Drink | none |
| denn's Biomarkt Berlin GmbH | denn's Biomarkt | Food / Drink | none |
| Discord Netherlands B.V. | Discord | Community | 35 |
| Notion | Notion | Productivity | 46 |
| Canva | Canva | Productivity | 12 |
| Proton AG | Proton | Productivity | 18 |
| SLACK TECHNOLOGIES LIMITED | Slack | Productivity | 17 |
| Typeless | Typeless | Productivity | none |
| Wispr | Wispr | Productivity | none |
| OPENAI IRELAND LIMITED | OpenAI | Productivity | 57 |
| Buffer, Inc | Buffer | Productivity | 43 |
| Windsurf | Windsurf | Coding | avg3 |
| Anthropic, PBC | Anthropic Coding | Coding | none |
| Tinybird | Tinybird | Infra | 35 |
| GitHub | GitHub | Infra | none |
| Namecheap | Namecheap | Banking | none |
| Wise | Wise | Banking | none |
| Polar.sh | Polar.sh | Revenue | avg3 |
| Stripe | Stripe | Revenue | avg3 |
| Thomas Haferlach | Thomas | Compute | none |
| Unknown | Unknown | Banking | none |

(Note: if `Anthropic, PBC` was already used for the Compute API row, the Coding entry is a conflict. Pick one canonical name per raw — the list above uses "Anthropic" for Compute and leaves Coding for a separate future canonical.)

- [ ] **Step 4: Verify the sheet**

Open the sheet in the browser: `https://docs.google.com/spreadsheets/d/1spPgtYPa05YtK8jjw0g4hpfYXqE10043oP7A1dQe5Mk/edit`

Check:
- Title row at top, KPI row shows "Cash: €120,000 | Burn (avg3): -€XX,XXX | Runway: X.X months"
- Header row shows "Category | Vendor | Jan 2025 | Feb 2025 | Mar 2025 | Apr 2025 (MTD) | May 2025 (fcst) | Jun 2025 (fcst) | ..."
- Forecast columns have gray italic styling
- Current month column (Apr) has yellow background
- Each category has a bold header row and an italicized subtotal row
- `TOTAL EXPENSES` and `NET` rows are bold at the bottom
- `Running cash` row starts at €120,000 in April and walks forward
- Amounts show as EUR with red negatives

- [ ] **Step 5: Verify `secrets/vendors.json` was written and is gitignored**

```bash
cat apps/operation/finance/secrets/vendors.json | head
git status apps/operation/finance/secrets/
```
Expected: vendors.json is non-empty; `git status` shows `secrets/` as untracked-ignored (no mention of the folder). If `git status` mentions the files, the `.gitignore` is wrong — fix and re-commit.

- [ ] **Step 6: Re-run rebuild to verify idempotency**

```bash
node bin/rebuild-sheet.mjs
```

Expected: runs without prompting (all vendors now known), produces identical output. Refresh the sheet — no flicker, no drift.

- [ ] **Step 7: No commit**

This task verifies behavior but produces no committed artifacts (the populated `vendors.json`, `config.local.json`, and CSVs are all gitignored).

---

## Task 11: `add-month.mjs` and `forecast.mjs` orchestration

**Files:**
- Create: `apps/operation/finance/bin/add-month.mjs`
- Create: `apps/operation/finance/bin/forecast.mjs`

- [ ] **Step 1: Write `bin/add-month.mjs`**

Create `apps/operation/finance/bin/add-month.mjs`:

```js
#!/usr/bin/env node
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { parseCsv } from "../lib/parse-csv.mjs";
import { readText, copyIntoInput } from "../lib/io.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));

async function main() {
  const src = process.argv[2];
  if (!src) {
    console.error("usage: add-month.mjs <path-to-csv>");
    process.exit(1);
  }
  const absSrc = resolve(src);
  const text = await readText(absSrc);
  const rows = parseCsv(text, { filename: absSrc });
  if (rows.length === 0) {
    console.error(`${absSrc}: no rows`);
    process.exit(1);
  }
  const month = rows[0].date.slice(0, 7); // YYYY-MM
  const dest = `${month}.csv`;
  const copied = await copyIntoInput(absSrc, dest);
  console.log(`Copied ${absSrc} → ${copied}`);

  const rebuild = spawn("node", [join(HERE, "rebuild-sheet.mjs")], { stdio: "inherit" });
  rebuild.on("exit", (code) => process.exit(code ?? 1));
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
```

- [ ] **Step 2: Write `bin/forecast.mjs`**

Create `apps/operation/finance/bin/forecast.mjs`:

A thin wrapper that re-runs rebuild (CSV parsing is cheap enough that a separate "just recompute forecast" script would just be a duplicate of rebuild). For now, `forecast.mjs` simply exec's rebuild:

```js
#!/usr/bin/env node
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const child = spawn("node", [join(HERE, "rebuild-sheet.mjs")], { stdio: "inherit" });
child.on("exit", (code) => process.exit(code ?? 1));
```

This is deliberately minimal. If forecast re-computation ever becomes slow (it won't — the CSVs are a few hundred rows), we split it out then. YAGNI.

- [ ] **Step 3: Make executable and commit**

```bash
chmod +x apps/operation/finance/bin/add-month.mjs apps/operation/finance/bin/forecast.mjs
npx biome check --write apps/operation/finance/bin
git add apps/operation/finance/bin/add-month.mjs apps/operation/finance/bin/forecast.mjs
git commit -m "feat(finance): add add-month and forecast orchestration"
```

---

## Task 12: Full test pass + final cleanup

- [ ] **Step 1: Run all tests**

```bash
cd apps/operation/finance && npm test
```
Expected: all unit tests PASS (tasks 1–6). No warnings.

- [ ] **Step 2: Run biome across the entire app**

```bash
npx biome check --write apps/operation/finance
```
Expected: no errors, no unfixable warnings.

- [ ] **Step 3: Verify no secrets in the working tree**

```bash
git status apps/operation/finance
git ls-files apps/operation/finance
```
Expected:
- `git status` shows only tracked files, no stray CSVs or config.local.json
- `git ls-files` does NOT contain `config.local.json`, `secrets/vendors.json`, or any `secrets/input/*.csv`
- `git ls-files` DOES contain `test/fixtures/mini.csv` and `test/fixtures/vendors.json`

- [ ] **Step 4: Final commit if anything was cleaned up**

```bash
git status
# if any changes from biome or cleanup:
git add apps/operation/finance
git commit -m "chore(finance): final cleanup"
```

- [ ] **Step 5: Push the branch**

```bash
git push -u origin feat/finance-runway-tracker-spec
```

- [ ] **Step 6: Open the PR**

```bash
gh pr create --title "feat(finance): runway tracker v1" --body "$(cat <<'EOF'
- New CLI app under apps/operation/finance
- Ingests transaction CSVs, resolves vendor identity via gitignored alias file
- Writes a single-tab Google Sheet: vendors × months, left→right, with forecast columns
- Pure pipeline (parse → normalize → aggregate → forecast → layout) + one gog wrapper
- Spec: docs/superpowers/specs/2026-04-11-finance-runway-tracker-design.md
- v2 (cron + live provider APIs) is scoped as a follow-up that reuses vendors.json as the contract
EOF
)"
```

---

## Self-review notes

- **Spec coverage:** every confirmed decision (1–9) in the spec maps to one or more tasks. Layout (Q2.5), config location (Q3), vendor matching (Q4), forecast rules (Q7), cash balance (Q9) are all covered. The live-cell fallback to `avg3` in v1 (Q8) is implemented in `lib/forecast.mjs` and emitted in `matrix.liveCells` for future styling.
- **Placeholders:** none. All code steps have complete code. All command steps have exact commands.
- **Type consistency:** `aggregate()` returns `{months, vendors, data}`. `forecast()` consumes that shape and extends it with `{forecastMonths, liveCells}`. `buildLayout()` consumes the extended shape. `lib/gog.mjs` consumes `{range, format, fields}` objects emitted by `lib/layout.mjs`. Matched.
- **One known small risk:** `bin/rebuild-sheet.mjs` uses `var canonicalRows` inside a `for` loop to escape the loop scope. Biome may flag it. If so, refactor to return from the loop or use a `let` declared above. Not blocking — the plan's code is correct JS, Biome will either accept or auto-fix.
- **The huge vendor table in Task 10** is for a single manual smoke test and lives in the plan, not the repo. It is not committed anywhere.
