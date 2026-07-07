# Treasury Insights Section — Implementation Plan (rev 2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an "Insights" section to the treasury web app: three derived tabs (P&L, Vendors, Models) that cross the five raw Tinybird pipes client-side to show monthly blended P&L, the paid/spent/registered three-way per vendor, and per-model unit economics (ecosystem-credit aware) via cost allocation.

**Architecture:** All derivation is pure TypeScript in `web/src/lib/` (new `fx.ts`, `insights.ts`), unit-tested hermetically; views stay thin tables reusing the existing `DataTable`/`Filters` idioms. No Tinybird changes, no new pipes, no forager changes. The raw tabs stay untouched except the shared filter-row placement; a new top-level section switch (`Insights | Raw`) is added to `App.tsx`.

**Tech Stack:** React 19, Vite 7, vitest 3, Tailwind 4, `@pollinations/ui` components only. Biome for formatting.

## Global Constraints

- Touch ONLY files under `apps/operation/treasury/web/src/`. Never touch `apps/operation/forager/`, `packages/ui/`, or Tinybird datafiles.
- `git add` ONLY the exact files you created/modified. NEVER `git add -A`, `git add .`, or `git commit -a` (other work may land in the tree in parallel).
- Branch: `feat/treasury-app` (verify with `git branch --show-current` before every commit). Commit messages: short, lowercase, imperative, NEVER mention Claude/AI, no Co-Authored-By.
- The domain word is **vendor** (renamed from provider on 2026-07-06) — row fields are `row.vendor`, the app state is `vendor`, UI labels say `vendor`. Never reintroduce "provider" in new code.
- All UI primitives from `@pollinations/ui` (`Table*`, `TabButton`, `Chip`, `Tooltip`, `Text`, `Alert`). Follow the table pattern of the existing views exactly (`TableScroller > DataTable > TableHead/TableBody`, `useSortableRows`, `withUniqueRowKeys`).
- Working directory for all npm/vitest commands: `/Users/comsom/Github/pollinations-B/apps/operation/treasury/web` (pass as `cwd`, do not `cd`).
- Run `npx biome check --write <changed files>` from the repo root before every commit.
- Missing data renders as `–` (en dash), NEVER as `0` or `$0`. A vendor with no meter row has UNKNOWN spend, not zero spend.
- Pollen ≈ USD 1:1 (`currency: "POLLEN"` converts 1:1).
- Money displays as whole dollars: `$1,234` / `−$1,234`.
- Tests are hermetic (no network; `now` is always a parameter, never `Date.now()` inside pure functions).
- Do not add dependencies.

## Design decisions (settled with Elliot — do not re-open)

- **Three planes per vendor/month:** *paid* = Enty `transactions` (category `compute`, bank leg), *spent* = vendor-reported `meter_monthly` (credit + paid), *registered* = our own metering `usage_monthly` (cost pollen). Deltas display only when both sides exist.
- **Ecosystem credits (added to `usage_monthly` 2026-07-06, fields shortened same day):** `price_paid`/`price_quests` are GROSS pollen. `byop_paid`/`byop_quests` = the app developer's share on BYOP usage; `model_paid`/`model_quests` = the community model owner's reward (Pollinations keeps 25%). **Retained paid pollen = price_paid − byop_paid − model_paid** — that is OUR revenue; model margins use retained, not gross. Ecosystem totals (paid+quests, byop vs model) are surfaced as adoption chips labeled with the pipe words `byop` and `model`.
- **Pollen vocabulary law (Elliot 2026-07-06):** the paid/quests meter names from the pipes are reused VERBATIM in every insight column and NEVER renamed — Models columns are `gross_paid`, `eco_paid`, `retained_paid`, `gross_quests`. No synonyms (no "sold", no "quest 🌱").
- **Paid/quests gauge (Elliot 2026-07-06):** every Models row renders a right-anchored bar in a `paid / quests` column — bar length ∝ the model's total pollen (gross_paid + gross_quests) relative to the largest model in view (grows right-to-left), split into a paid segment and a quests segment; hover tooltip gives exact percentages and the total; column sorts by paid share.
- **Model true cost = vendor actual × model's share of the vendor's registered cost.** Vendor actual waterfall: meter total if any meter row in scope, else compute-transactions cash, else registered cost itself (basis flagged: `meter` / `cash` / `registered`).
- **Effective multiplier stays gross** (`price_paid / cost_paid`) — it describes what the END USER pays vs cost; the ecosystem split doesn't change the user's price.
- **Cost basis is cash by transaction date** (Enty), with a one-line caveat in the UI footer.
- **FX:** hardcoded monthly EUR→USD averages (ECB via frankfurter.dev) in `lib/fx.ts`; display currency is USD everywhere in Insights.
- **Enty lag:** a month is "opex incomplete" until a LATER Enty batch exists (frontier month and everything after it is flagged, plus the current calendar month).
- **Filter UX — global state, per-tab rendering:** the period/vendor/category selections are app-global React state that persists across tabs AND sections (drill June through P&L → Vendors → Models). But the filter ROW renders below the tab nav and shows only the filters the active tab uses. Visibility matrix:

  | Tab | period | vendor | category |
  |---|---|---|---|
  | Insights → P&L | ✓ (year → matrix, month → drill-down) | – | – |
  | Insights → Vendors | ✓ | ✓ | – |
  | Insights → Models | ✓ | ✓ | – |
  | Raw → Transactions | ✓ | ✓ | ✓ |
  | Raw → Pollen Usage | ✓ | ✓ | – |
  | Raw → Compute Usage | ✓ | ✓ | – |
  | Raw → Revenue | ✓ | – | – |

  (This intentionally removes the category select from Pollen Usage/Revenue where it filtered nothing meaningful, and the vendor select from Revenue.)
- **P&L period drill-down (Elliot 2026-07-06):** the monthly matrix IS the yearly reading, so selecting a single month must show something the matrix cannot — the month's spend detail at category × vendor grain (cash per row, % of month spend, sorted biggest first) plus the credit-burn shadow per vendor and the month's headline stats. Year/all selection → matrix; single month → drill-down. Never render a one-row matrix.
- **No pricing simulator, no registry ingestion** in this phase.

---

## UI Wireframes

### Section navigation (App shell)

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ OPERATIONS                              [guide] [data 3h old] [Log out] [◐]  │
│ Treasury                                                                     │
│                                                                              │
│ [ Insights ]  [ Raw ]                          ← NEW section switch          │
│                                                                              │
│ [ P&L ] [ Vendors ] [ Models ]                 ← tabs of the active section  │
│   — or when section = Raw —                                                  │
│ [ Transactions ] [ Pollen Usage ] [ Compute Usage ] [ Revenue ]              │
│                                                                              │
│ period [2026] [Jan] [Feb] [Mar] [Apr] [May] [Jun] [Jul]   vendor [all ▾]     │
│                     ↑ filter row BELOW the tabs, per-tab visibility,         │
│                       selection persists app-globally across tabs            │
│ ┌──────────────────────────────────────────────────────────────────────────┐│
│ │  ...active tab table...                                                  ││
└──────────────────────────────────────────────────────────────────────────────┘
```
- Section switch = two `TabButton`s. Default section: **Insights**, default tab: **P&L**.
- Insight tab buttons get the same hover-tooltip treatment as raw tabs (derivation note).

### P&L tab (monthly blend) — filters: period

```
month     revenue   compute    saas    infra   office   admin   payroll   other │ spend     cash P&L    credit burn
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
Jul 26 ⚠  $1,076    –          –       –       –        –       –         –     │ –         –           ($640)
Jun 26 ⚠  $13,596   $160       –       –       –        –       –         –     │ $160      +$13,436    ($8,096)
May 26    $11,032   $12,410    $1,913  $95     $780     $310    $9,357    $88   │ $24,953   −$13,921    ($2,027)
Apr 26    $7,274    $14,861    $2,050  $95     $702     $410    $16,473   $30   │ $34,621   −$27,347    ($1,433)
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
total     $46,110   $52,113    ...                                              │ $131,004  −$84,894    ($15,213)

⚠ opex incomplete — Enty batch for this month has not landed yet
costs are cash-basis by transaction date · EUR→USD at monthly ECB averages · (credit burn) = vendor
spend covered by credits, shown as shadow — not part of cash P&L
```
- One row per month (desc) when the period is a year/all. `cash P&L = revenue − spend`; green positive (`text-intent-success-text`), red negative (`text-intent-danger-text`).
- `credit burn` soft/parenthesized (`text-theme-text-soft`) — a shadow column, not cash.
- Missing revenue or no transactions for a month → `–` (and no fake P&L). Totals row sums displayed rows.

**P&L with a single month selected — the drill-down (what the matrix can't show):**

```
period [2026] [Jan] [Feb] [Mar] [Apr] [May] [«Jun»] [Jul]

[ May 26 ] [ revenue $11,032 ] [ spend $24,953 ] [ cash P&L −$13,921 ] [ credit burn ($2,027) ]

category   vendor        cash       % of spend
────────────────────────────────────────────────
compute    aws           $4,698     18.8%
compute    google        $4,489     18.0%
payroll    deel          $9,357     37.5%
saas       anthropic     $713       2.9%
office     amazon        $214       0.9%
...one row per category × vendor, sorted biggest first
────────────────────────────────────────────────
credit burn (not cash)
azure       ($3,000)
deepinfra   ($2,210)
ovhcloud    ($1,022)

single-month drill-down: cash by category and vendor · pick the year pill for the monthly matrix
```

### Vendors tab (three-way reconciliation) — filters: period + vendor

```
month    vendor       paid (bank)   spent (meter)   of it credit   registered (us)   Δ spent vs reg
────────────────────────────────────────────────────────────────────────────────────────────────────
Jun 26   google       $5,171        $5,171          $0             $4,940            +4.7%
Jun 26   aws          $4,698        $4,698          $0             $3,573            +31.5%  ← red >25%
Jun 26   azure        –             $3,000          $3,000         $4,327            −30.7%  ← red
Jun 26   fireworks    $3,455        $6,433          $0             $7,135            −9.8%
Jun 26   runpod       $2,101        –               –              $2,691            –
────────────────────────────────────────────────────────────────────────────────────────────────────
paid = Enty compute transactions (bank leg, invoice fallback) · spent = vendor-reported meter ·
registered = our metering (Pollen ≈ $) · "–" = no data for that plane, never zero
```
- One row per (month, vendor) present in ANY plane. Sortable; default month desc.
- Δ red when |Δ| > 25% (registry unit-cost suspects), soft otherwise; `–` when either side missing.

### Models tab (unit economics + ecosystem) — filters: period + vendor

```
net ratio 91% · break-even 1.10× · ecosystem $312 (byop $204 · model $108) · scope: Jun 26

vendor      model           gross_paid  eco_paid  retained_paid  gross_quests  paid / quests   registered  share  true_cost  basis  eff ×   margin
───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
fireworks   klein-large     $888        $9        $879           $5,479        ▓▓░░░░░░░░░░░█  $6,367      89.2%  $5,738     meter  0.99×   −$4,947
azure       gpt-5.5         $666        $7        $659           $3,300           ▓▓░░░░░░░░█  $3,966      91.7%  $3,968     reg    0.96×   −$3,368
google      gemini-2.5-pro  $2,940      $29       $2,911         $1,100            ▓▓▓▓▓▓░░░█  $2,912      59.3%  $3,066     meter  1.01×   −$447
elevenlabs  eleven-v3       $328        $0        $328           $0                       ▓▓█  $303        100%   $303       cash   1.08×   +$25
...                                                       sorted worst margin first (asc)
───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
paid / quests gauge: right-anchored bar — length = total pollen vs the biggest model in view,
▓ = paid share · ░ = quests share · hover = exact %s + total · sorts by paid share
margin = retained_paid × net-ratio − true cost · retained_paid = gross_paid − byop_paid − model_paid ·
eco_paid = byop_paid + model_paid · true cost = vendor actual × model share of registered cost ·
basis: meter = vendor-reported · cash = bank · reg = our metering (no vendor data yet)
```
- `eco_paid` = paid-side byop + model credits (what reduces OUR revenue). The header chip shows TOTAL ecosystem credits in scope (paid+quests, split byop/model) — the product-adoption signal.
- `eff ×` = gross price_paid / cost_paid (`–` for quests-only models). Margin colored pos/neg. Basis as a small `Chip`.

---

## File Structure

| File | Status | Responsibility |
|---|---|---|
| `web/src/lib/fx.ts` | create | Monthly EUR→USD table, `eurUsdRate`, `toUsd` |
| `web/src/lib/fx.test.ts` | create | Tests for fx |
| `web/src/lib/format.ts` | modify | Add `fmtUsd`, `fmtPct`, `fmtMultiplier` |
| `web/src/lib/format.test.ts` | modify | Tests for new formatters |
| `web/src/lib/insights.ts` | create | ALL derivations: revenue, P&L, vendor planes, model economics, ecosystem totals |
| `web/src/lib/insights.test.ts` | create | Hermetic tests for every derivation |
| `web/src/views/PnlTab.tsx` | create | P&L monthly blend table |
| `web/src/views/VendorsTab.tsx` | create | Three-way vendor table |
| `web/src/views/ModelsTab.tsx` | create | Model economics table + ecosystem chips |
| `web/src/App.tsx` | modify | Section switch, insight tabs, per-tab filter row below the nav |
| `web/src/fixtures.ts` | modify | Coherent fixture rows so `?fixtures=1` demos all three tabs |

Data types (`web/src/types.ts`) are already correct (vendor fields + the four ecosystem columns) — do not modify.

---

### Task 1: FX table + money formatters

**Files:**
- Create: `web/src/lib/fx.ts`
- Create: `web/src/lib/fx.test.ts`
- Modify: `web/src/lib/format.ts` (append)
- Modify: `web/src/lib/format.test.ts` (append)

**Interfaces:**
- Consumes: nothing.
- Produces: `eurUsdRate(month: string): number`, `toUsd(amount: number, currency: string, period: string): number`, `FX_EUR_USD: Record<string, number>`, `FX_EUR_USD_FALLBACK: number`, `fmtUsd(value: number | null | undefined): string`, `fmtPct(value: number | null): string`, `fmtMultiplier(value: number | null): string`. Later tasks import these exact names.

- [ ] **Step 1: Write the failing tests**

Create `web/src/lib/fx.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { eurUsdRate, FX_EUR_USD_FALLBACK, toUsd } from "./fx";

describe("eurUsdRate", () => {
    it("returns the table rate for a known month", () => {
        expect(eurUsdRate("2026-06")).toBeCloseTo(1.1518, 4);
    });

    it("falls back for unknown months", () => {
        expect(eurUsdRate("2031-01")).toBe(FX_EUR_USD_FALLBACK);
    });
});

describe("toUsd", () => {
    it("converts EUR at the month rate, accepting full dates", () => {
        expect(toUsd(100, "EUR", "2026-06-20")).toBeCloseTo(115.18, 2);
    });

    it("passes USD and POLLEN through 1:1", () => {
        expect(toUsd(42, "USD", "2026-06")).toBe(42);
        expect(toUsd(42, "POLLEN", "2026-06")).toBe(42);
    });

    it("treats a blank currency as USD (rows without that leg carry 0)", () => {
        expect(toUsd(0, "", "2026-06")).toBe(0);
    });

    it("throws on an unknown currency instead of guessing", () => {
        expect(() => toUsd(1, "GBP", "2026-06")).toThrow(/GBP/);
    });
});
```

Append to `web/src/lib/format.test.ts` (merge the vitest import with the existing one at the top of the file):

```ts
import { fmtMultiplier, fmtPct, fmtUsd } from "./format";

describe("fmtUsd", () => {
    it("renders whole dollars with thousands separators", () => {
        expect(fmtUsd(12409.6)).toBe("$12,410");
    });

    it("renders negatives with a minus sign", () => {
        expect(fmtUsd(-13921.4)).toBe("−$13,921");
    });

    it("renders missing values as an en dash", () => {
        expect(fmtUsd(null)).toBe("–");
        expect(fmtUsd(undefined)).toBe("–");
        expect(fmtUsd(Number.NaN)).toBe("–");
    });
});

describe("fmtPct", () => {
    it("renders signed one-decimal percentages", () => {
        expect(fmtPct(4.66)).toBe("+4.7%");
        expect(fmtPct(-30.71)).toBe("−30.7%");
    });

    it("renders null as an en dash", () => {
        expect(fmtPct(null)).toBe("–");
    });
});

describe("fmtMultiplier", () => {
    it("renders two-decimal multipliers", () => {
        expect(fmtMultiplier(1.098)).toBe("1.10×");
    });

    it("renders null and non-finite as an en dash", () => {
        expect(fmtMultiplier(null)).toBe("–");
        expect(fmtMultiplier(Number.POSITIVE_INFINITY)).toBe("–");
    });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run (cwd `apps/operation/treasury/web`): `npx vitest run src/lib/fx.test.ts src/lib/format.test.ts`
Expected: FAIL — `fx.ts` module not found; `fmtUsd` is not exported.

- [ ] **Step 3: Write the implementations**

Create `web/src/lib/fx.ts`:

```ts
// Monthly average EUR→USD (ECB rates via frankfurter.dev, pulled 2026-07-06).
// Append one line when a new month starts — the only maintenance this needs.
export const FX_EUR_USD: Record<string, number> = {
    "2026-01": 1.1738,
    "2026-02": 1.1824,
    "2026-03": 1.1558,
    "2026-04": 1.1706,
    "2026-05": 1.1673,
    "2026-06": 1.1518,
    "2026-07": 1.1411,
};

export const FX_EUR_USD_FALLBACK = 1.15;

export function eurUsdRate(month: string): number {
    return FX_EUR_USD[month] ?? FX_EUR_USD_FALLBACK;
}

// period may be "YYYY-MM" or a full "YYYY-MM-DD" date; only the month is used.
// Pollen is priced 1:1 with USD. A blank currency only ever accompanies a 0
// amount (the missing leg of a transaction).
export function toUsd(amount: number, currency: string, period: string): number {
    switch (currency.toUpperCase()) {
        case "EUR":
            return amount * eurUsdRate(period.slice(0, 7));
        case "USD":
        case "POLLEN":
        case "":
            return amount;
        default:
            throw new Error(`Unknown currency: ${currency}`);
    }
}
```

Append to `web/src/lib/format.ts`:

```ts
// Insight money: whole dollars, en dash for unknown. Uses U+2212 minus so
// negatives read cleanly next to the $.
export function fmtUsd(value: number | null | undefined): string {
    if (value == null || Number.isNaN(value)) return "–";
    const rounded = Math.round(value);
    const magnitude = Math.abs(rounded).toLocaleString("en-US");
    return rounded < 0 ? `−$${magnitude}` : `$${magnitude}`;
}

export function fmtPct(value: number | null): string {
    if (value == null || !Number.isFinite(value)) return "–";
    const magnitude = Math.abs(value).toFixed(1);
    return value < 0 ? `−${magnitude}%` : `+${magnitude}%`;
}

export function fmtMultiplier(value: number | null): string {
    if (value == null || !Number.isFinite(value)) return "–";
    return `${value.toFixed(2)}×`;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/fx.test.ts src/lib/format.test.ts`
Expected: PASS (all).

- [ ] **Step 5: Format and commit**

```bash
# from repo root
npx biome check --write apps/operation/treasury/web/src/lib/fx.ts apps/operation/treasury/web/src/lib/fx.test.ts apps/operation/treasury/web/src/lib/format.ts apps/operation/treasury/web/src/lib/format.test.ts
git add apps/operation/treasury/web/src/lib/fx.ts apps/operation/treasury/web/src/lib/fx.test.ts apps/operation/treasury/web/src/lib/format.ts apps/operation/treasury/web/src/lib/format.test.ts
git commit -m "add fx table and usd formatters for treasury insights"
```

---

### Task 2: Revenue derivations

**Files:**
- Create: `web/src/lib/insights.ts`
- Create: `web/src/lib/insights.test.ts`

**Interfaces:**
- Consumes: `toUsd` from `./fx`; `RevenueMonthlyRow` from `../types`.
- Produces (later tasks and views import these exact names):
  - `type MonthlyRevenue = { month: string; grossUsd: number; netUsd: number; netRatio: number | null }`
  - `monthlyRevenue(rows: RevenueMonthlyRow[]): MonthlyRevenue[]` (sorted month asc)
  - `globalNetRatio(rows: RevenueMonthlyRow[]): number | null`
  - `breakEvenMultiplier(netRatio: number | null): number | null`

- [ ] **Step 1: Write the failing tests**

Create `web/src/lib/insights.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { RevenueMonthlyRow } from "../types";
import {
    breakEvenMultiplier,
    globalNetRatio,
    monthlyRevenue,
} from "./insights";

const revenueRow = (
    month: string,
    gross: number,
    fees: number,
    refunds = 0,
): RevenueMonthlyRow => ({
    source: "stripe",
    month,
    currency: "EUR",
    gross_amount: gross,
    fees_amount: fees,
    refunds_amount: refunds,
});

describe("monthlyRevenue", () => {
    it("converts EUR to USD and computes net per month, sorted ascending", () => {
        const rows = [revenueRow("2026-06", 1000, 90, 10), revenueRow("2026-05", 500, 45)];
        const result = monthlyRevenue(rows);

        expect(result.map((entry) => entry.month)).toEqual(["2026-05", "2026-06"]);
        // 2026-06: gross 1000 EUR × 1.1518, net (1000-90-10) × 1.1518
        expect(result[1].grossUsd).toBeCloseTo(1151.8, 1);
        expect(result[1].netUsd).toBeCloseTo(1036.62, 1);
        expect(result[1].netRatio).toBeCloseTo(0.9, 4);
    });

    it("reports a null ratio when gross is zero", () => {
        expect(monthlyRevenue([revenueRow("2026-06", 0, 0)])[0].netRatio).toBeNull();
    });
});

describe("globalNetRatio", () => {
    it("volume-blends across months", () => {
        const rows = [revenueRow("2026-05", 500, 100), revenueRow("2026-06", 1500, 100)];
        const gross = 500 * 1.1673 + 1500 * 1.1518;
        const net = 400 * 1.1673 + 1400 * 1.1518;
        expect(globalNetRatio(rows)).toBeCloseTo(net / gross, 6);
    });

    it("is null with no revenue", () => {
        expect(globalNetRatio([])).toBeNull();
    });
});

describe("breakEvenMultiplier", () => {
    it("is the reciprocal of the net ratio", () => {
        expect(breakEvenMultiplier(0.91)).toBeCloseTo(1.0989, 4);
    });

    it("is null for null or zero ratios", () => {
        expect(breakEvenMultiplier(null)).toBeNull();
        expect(breakEvenMultiplier(0)).toBeNull();
    });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/insights.test.ts`
Expected: FAIL — `insights.ts` not found.

- [ ] **Step 3: Write the implementation**

Create `web/src/lib/insights.ts`:

```ts
import type { RevenueMonthlyRow } from "../types";
import { toUsd } from "./fx";

// ---------------------------------------------------------------- revenue

export type MonthlyRevenue = {
    month: string;
    grossUsd: number;
    netUsd: number;
    netRatio: number | null;
};

export function monthlyRevenue(rows: RevenueMonthlyRow[]): MonthlyRevenue[] {
    const byMonth = new Map<string, { gross: number; net: number }>();
    for (const row of rows) {
        const entry = byMonth.get(row.month) ?? { gross: 0, net: 0 };
        entry.gross += toUsd(row.gross_amount, row.currency, row.month);
        entry.net += toUsd(
            row.gross_amount - row.fees_amount - row.refunds_amount,
            row.currency,
            row.month,
        );
        byMonth.set(row.month, entry);
    }
    return [...byMonth.entries()]
        .map(([month, { gross, net }]) => ({
            month,
            grossUsd: gross,
            netUsd: net,
            netRatio: gross > 0 ? net / gross : null,
        }))
        .sort((a, b) => a.month.localeCompare(b.month));
}

export function globalNetRatio(rows: RevenueMonthlyRow[]): number | null {
    let gross = 0;
    let net = 0;
    for (const entry of monthlyRevenue(rows)) {
        gross += entry.grossUsd;
        net += entry.netUsd;
    }
    return gross > 0 ? net / gross : null;
}

export function breakEvenMultiplier(netRatio: number | null): number | null {
    return netRatio && netRatio > 0 ? 1 / netRatio : null;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/insights.test.ts`
Expected: PASS.

- [ ] **Step 5: Format and commit**

```bash
npx biome check --write apps/operation/treasury/web/src/lib/insights.ts apps/operation/treasury/web/src/lib/insights.test.ts
git add apps/operation/treasury/web/src/lib/insights.ts apps/operation/treasury/web/src/lib/insights.test.ts
git commit -m "add revenue derivations for treasury insights"
```

---

### Task 3: Transaction derivations (cash rule, P&L months, Enty completeness)

**Files:**
- Modify: `web/src/lib/insights.ts` (append)
- Modify: `web/src/lib/insights.test.ts` (append)

**Interfaces:**
- Consumes: `monthlyRevenue` (Task 2), `toUsd` from `./fx`, `Data`/`TransactionRow`/`MeterMonthlyRow` from `../types`.
- Produces:
  - `CATEGORY_ORDER: readonly string[]`
  - `transactionCashUsd(row: TransactionRow): number`
  - `opexIncompleteFrom(transactions: TransactionRow[], now: Date): string` — months `>=` this value are incomplete
  - `type PnlMonth = { month: string; revenueNetUsd: number | null; categories: Record<string, number>; spendUsd: number | null; cashPnlUsd: number | null; creditBurnUsd: number; opexIncomplete: boolean }`
  - `pnlByMonth(data: Data, now: Date): PnlMonth[]` (sorted month asc)
  - `categoryColumns(rows: PnlMonth[]): string[]` — `CATEGORY_ORDER` first, unknown categories appended sorted
  - `type MonthSpendRow = { category: string; vendor: string; cashUsd: number; pctOfSpend: number | null }`
  - `type MonthDetail = { summary: PnlMonth | null; spend: MonthSpendRow[]; creditBurn: { vendor: string; creditUsd: number }[] }`
  - `monthSpendDetail(data: Data, month: string, now: Date): MonthDetail` — the single-month drill-down; spend sorted cash desc, creditBurn sorted desc

- [ ] **Step 1: Write the failing tests**

Append to `web/src/lib/insights.test.ts` (extend the existing imports from `./insights` and `../types` — keep one import statement each):

```ts
import type { Data, MeterMonthlyRow, TransactionRow } from "../types";
import {
    CATEGORY_ORDER,
    categoryColumns,
    opexIncompleteFrom,
    pnlByMonth,
    transactionCashUsd,
} from "./insights";

const txn = (over: Partial<TransactionRow>): TransactionRow => ({
    date: "2026-05-10",
    vendor: "aws",
    category: "compute",
    charged_amount: 0,
    charged_currency: "",
    paid_amount: 0,
    paid_currency: "",
    invoice_ref: "",
    match_status: "matched",
    ...over,
});

const meter = (over: Partial<MeterMonthlyRow>): MeterMonthlyRow => ({
    month: "2026-05",
    vendor: "aws",
    currency: "USD",
    credit: 0,
    paid: 0,
    source: "api",
    ...over,
});

const emptyData = (over: Partial<Data>): Data => ({
    transactions: [],
    meterMonthly: [],
    usageMonthly: [],
    runs: [],
    revenueMonthly: [],
    ...over,
});

describe("transactionCashUsd", () => {
    it("uses the bank leg when present", () => {
        const row = txn({ paid_amount: 100, paid_currency: "USD", charged_amount: 90, charged_currency: "EUR" });
        expect(transactionCashUsd(row)).toBe(100);
    });

    it("falls back to the invoice leg, converting EUR by the row month", () => {
        const row = txn({ charged_amount: 100, charged_currency: "EUR" });
        expect(transactionCashUsd(row)).toBeCloseTo(116.73, 2);
    });

    it("is zero when both legs are empty", () => {
        expect(transactionCashUsd(txn({}))).toBe(0);
    });
});

describe("opexIncompleteFrom", () => {
    const now = new Date("2026-07-06T12:00:00Z");

    it("flags the newest transaction month (batches land after month close)", () => {
        const rows = [txn({ date: "2026-05-10" }), txn({ date: "2026-06-01" })];
        expect(opexIncompleteFrom(rows, now)).toBe("2026-06");
    });

    it("never trusts the current calendar month even without rows in it", () => {
        expect(opexIncompleteFrom([txn({ date: "2026-07-02" })], now)).toBe("2026-07");
    });

    it("flags everything when there are no transactions", () => {
        expect(opexIncompleteFrom([], now)).toBe("0000-00");
    });
});

describe("pnlByMonth", () => {
    const now = new Date("2026-07-06T12:00:00Z");

    it("blends revenue, category spend, and credit shadow per month", () => {
        const data = emptyData({
            transactions: [
                txn({ date: "2026-05-10", category: "compute", paid_amount: 1000, paid_currency: "USD" }),
                txn({ date: "2026-05-25", category: "payroll", paid_amount: 100, paid_currency: "EUR" }),
                txn({ date: "2026-06-01", category: "compute", paid_amount: 50, paid_currency: "USD" }),
            ],
            meterMonthly: [meter({ month: "2026-05", credit: 200 })],
            revenueMonthly: [
                {
                    source: "stripe",
                    month: "2026-05",
                    currency: "EUR",
                    gross_amount: 2000,
                    fees_amount: 180,
                    refunds_amount: 0,
                },
            ],
        });
        const [may, june] = pnlByMonth(data, now);

        expect(may.month).toBe("2026-05");
        expect(may.categories.compute).toBe(1000);
        expect(may.categories.payroll).toBeCloseTo(116.73, 2);
        expect(may.spendUsd).toBeCloseTo(1116.73, 2);
        expect(may.revenueNetUsd).toBeCloseTo(1820 * 1.1673, 1);
        expect(may.cashPnlUsd).toBeCloseTo(1820 * 1.1673 - 1116.73, 1);
        expect(may.creditBurnUsd).toBe(200);
        expect(may.opexIncomplete).toBe(false);

        expect(june.opexIncomplete).toBe(true);
        expect(june.revenueNetUsd).toBeNull();
        expect(june.cashPnlUsd).toBeNull();
    });

    it("reports null spend for a month with no transactions at all", () => {
        const data = emptyData({
            meterMonthly: [meter({ month: "2026-04", credit: 10 })],
        });
        const [april] = pnlByMonth(data, now);
        expect(april.month).toBe("2026-04");
        expect(april.spendUsd).toBeNull();
        expect(april.cashPnlUsd).toBeNull();
        expect(april.creditBurnUsd).toBe(10);
    });
});

describe("monthSpendDetail", () => {
    const now = new Date("2026-07-06T12:00:00Z");

    it("groups the month's cash by category and vendor with shares", () => {
        const data = emptyData({
            transactions: [
                txn({ date: "2026-05-10", vendor: "aws", category: "compute", paid_amount: 300, paid_currency: "USD" }),
                txn({ date: "2026-05-12", vendor: "aws", category: "compute", paid_amount: 100, paid_currency: "USD" }),
                txn({ date: "2026-05-25", vendor: "deel", category: "payroll", paid_amount: 100, paid_currency: "USD" }),
                txn({ date: "2026-04-01", vendor: "aws", category: "compute", paid_amount: 999, paid_currency: "USD" }),
            ],
            meterMonthly: [
                meter({ month: "2026-05", vendor: "azure", credit: 50 }),
                meter({ month: "2026-05", vendor: "aws", credit: 0, paid: 10 }),
            ],
        });
        const detail = monthSpendDetail(data, "2026-05", now);

        expect(detail.spend).toEqual([
            { category: "compute", vendor: "aws", cashUsd: 400, pctOfSpend: 80 },
            { category: "payroll", vendor: "deel", cashUsd: 100, pctOfSpend: 20 },
        ]);
        expect(detail.creditBurn).toEqual([{ vendor: "azure", creditUsd: 50 }]);
        expect(detail.summary?.month).toBe("2026-05");
    });

    it("returns empty structures for a month with no data", () => {
        const detail = monthSpendDetail(emptyData({}), "2026-05", now);
        expect(detail.spend).toEqual([]);
        expect(detail.creditBurn).toEqual([]);
        expect(detail.summary).toBeNull();
    });
});

describe("categoryColumns", () => {
    it("keeps the fixed order and appends unknown categories sorted", () => {
        const months = pnlByMonth(
            emptyData({
                transactions: [
                    txn({ date: "2026-05-01", category: "zulu", paid_amount: 1, paid_currency: "USD" }),
                    txn({ date: "2026-05-02", category: "compute", paid_amount: 1, paid_currency: "USD" }),
                ],
            }),
            new Date("2026-07-06T12:00:00Z"),
        );
        expect(categoryColumns(months)).toEqual([...CATEGORY_ORDER, "zulu"]);
    });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/insights.test.ts`
Expected: FAIL — `transactionCashUsd` etc. not exported.

- [ ] **Step 3: Write the implementation**

Append to `web/src/lib/insights.ts` (extend the type import from `../types` to include `Data` and `TransactionRow`):

```ts
// ---------------------------------------------------------- transactions

export const CATEGORY_ORDER = [
    "compute",
    "saas",
    "infra",
    "office",
    "admin",
    "payroll",
    "other",
] as const;

// Cash that left for this row: the bank leg when present, the invoice value
// as a fallback while the payment leg is still unmatched.
export function transactionCashUsd(row: TransactionRow): number {
    if (row.paid_amount > 0) {
        return toUsd(row.paid_amount, row.paid_currency, row.date);
    }
    if (row.charged_amount > 0) {
        return toUsd(row.charged_amount, row.charged_currency, row.date);
    }
    return 0;
}

const MONTH_KEY_RE = /^\d{4}-\d{2}$/;

// Enty batches arrive after a month closes and is filed, so the newest month
// holding rows is only trustworthy once a LATER batch exists. Months >= the
// returned value are incomplete; "0000-00" means nothing is trustworthy.
export function opexIncompleteFrom(
    transactions: TransactionRow[],
    now: Date,
): string {
    const months = transactions
        .map((row) => row.date.slice(0, 7))
        .filter((month) => MONTH_KEY_RE.test(month));
    const frontier = months.length > 0 ? months.reduce((a, b) => (a > b ? a : b)) : "0000-00";
    const current = now.toISOString().slice(0, 7);
    return frontier < current ? frontier : current;
}

export type PnlMonth = {
    month: string;
    revenueNetUsd: number | null;
    categories: Record<string, number>;
    spendUsd: number | null;
    cashPnlUsd: number | null;
    creditBurnUsd: number;
    opexIncomplete: boolean;
};

export function pnlByMonth(data: Data, now: Date): PnlMonth[] {
    const revenueByMonth = new Map(
        monthlyRevenue(data.revenueMonthly).map((entry) => [entry.month, entry]),
    );
    const incompleteFrom = opexIncompleteFrom(data.transactions, now);

    const months = new Set<string>();
    for (const row of data.transactions) months.add(row.date.slice(0, 7));
    for (const row of data.meterMonthly) months.add(row.month);
    for (const row of data.revenueMonthly) months.add(row.month);

    return [...months]
        .filter((month) => MONTH_KEY_RE.test(month))
        .sort()
        .map((month) => {
            const categories: Record<string, number> = {};
            for (const row of data.transactions) {
                if (row.date.slice(0, 7) !== month) continue;
                const key = row.category || "other";
                categories[key] = (categories[key] ?? 0) + transactionCashUsd(row);
            }
            const hasTransactions = Object.keys(categories).length > 0;
            const spendUsd = hasTransactions
                ? Object.values(categories).reduce((a, b) => a + b, 0)
                : null;

            let creditBurnUsd = 0;
            for (const row of data.meterMonthly) {
                if (row.month === month) {
                    creditBurnUsd += toUsd(row.credit, row.currency, month);
                }
            }

            const revenueNetUsd = revenueByMonth.get(month)?.netUsd ?? null;
            return {
                month,
                revenueNetUsd,
                categories,
                spendUsd,
                cashPnlUsd:
                    revenueNetUsd != null && spendUsd != null
                        ? revenueNetUsd - spendUsd
                        : null,
                creditBurnUsd,
                opexIncomplete: month >= incompleteFrom,
            };
        });
}

export function categoryColumns(rows: PnlMonth[]): string[] {
    const known = new Set<string>(CATEGORY_ORDER);
    const extra = new Set<string>();
    for (const row of rows) {
        for (const category of Object.keys(row.categories)) {
            if (!known.has(category)) extra.add(category);
        }
    }
    return [...CATEGORY_ORDER, ...[...extra].sort()];
}

export type MonthSpendRow = {
    category: string;
    vendor: string;
    cashUsd: number;
    pctOfSpend: number | null;
};

export type MonthDetail = {
    summary: PnlMonth | null;
    spend: MonthSpendRow[];
    creditBurn: { vendor: string; creditUsd: number }[];
};

// Single-month drill-down: where the month's cash actually went, at the
// grain the monthly matrix cannot show (category × vendor), plus the
// credit-burn shadow per vendor.
export function monthSpendDetail(
    data: Data,
    month: string,
    now: Date,
): MonthDetail {
    const summary =
        pnlByMonth(data, now).find((row) => row.month === month) ?? null;

    const byKey = new Map<string, MonthSpendRow>();
    for (const row of data.transactions) {
        if (row.date.slice(0, 7) !== month) continue;
        const category = row.category || "other";
        const key = `${category}|${row.vendor}`;
        const entry = byKey.get(key) ?? {
            category,
            vendor: row.vendor,
            cashUsd: 0,
            pctOfSpend: null,
        };
        entry.cashUsd += transactionCashUsd(row);
        byKey.set(key, entry);
    }
    const total = [...byKey.values()].reduce((a, row) => a + row.cashUsd, 0);
    const spend = [...byKey.values()]
        .map((row) => ({
            ...row,
            pctOfSpend: total > 0 ? (row.cashUsd / total) * 100 : null,
        }))
        .sort(
            (a, b) =>
                b.cashUsd - a.cashUsd ||
                a.category.localeCompare(b.category) ||
                a.vendor.localeCompare(b.vendor),
        );

    const creditByVendor = new Map<string, number>();
    for (const row of data.meterMonthly) {
        if (row.month !== month) continue;
        const credit = toUsd(row.credit, row.currency, month);
        if (credit <= 0) continue;
        creditByVendor.set(
            row.vendor,
            (creditByVendor.get(row.vendor) ?? 0) + credit,
        );
    }
    const creditBurn = [...creditByVendor.entries()]
        .map(([vendor, creditUsd]) => ({ vendor, creditUsd }))
        .sort((a, b) => b.creditUsd - a.creditUsd);

    return { summary, spend, creditBurn };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/insights.test.ts`
Expected: PASS.

- [ ] **Step 5: Format and commit**

```bash
npx biome check --write apps/operation/treasury/web/src/lib/insights.ts apps/operation/treasury/web/src/lib/insights.test.ts
git add apps/operation/treasury/web/src/lib/insights.ts apps/operation/treasury/web/src/lib/insights.test.ts
git commit -m "add pnl derivations from transactions and meter"
```

---

### Task 4: Vendor three-way planes

**Files:**
- Modify: `web/src/lib/insights.ts` (append)
- Modify: `web/src/lib/insights.test.ts` (append)

**Interfaces:**
- Consumes: `transactionCashUsd` (Task 3), `toUsd`, `Data`/`UsageMonthlyRow` types.
- Produces:
  - `type VendorPlanes = { month: string; vendor: string; paidUsd: number | null; spentUsd: number | null; creditUsd: number | null; registeredUsd: number | null; spentVsRegisteredPct: number | null }`
  - `vendorPlanes(data: Data): VendorPlanes[]` (sorted by month then vendor asc; the view re-sorts)
  - `insightVendorOptions(data: Data): string[]` — `["all", ...unique vendors across the three planes, sorted]`

- [ ] **Step 1: Write the failing tests**

Append to `web/src/lib/insights.test.ts` (extend the `./insights` import with `insightVendorOptions, vendorPlanes`; add a usage-row helper — note it includes the four ecosystem columns):

```ts
import type { UsageMonthlyRow } from "../types";
import { insightVendorOptions, vendorPlanes } from "./insights";

const usage = (over: Partial<UsageMonthlyRow>): UsageMonthlyRow => ({
    source: "tinybird",
    month: "2026-06",
    vendor: "google",
    model: "gemini-2.5-flash",
    currency: "POLLEN",
    cost_paid: 0,
    cost_quests: 0,
    price_paid: 0,
    price_quests: 0,
    byop_paid: 0,
    byop_quests: 0,
    model_paid: 0,
    model_quests: 0,
    ...over,
});

describe("vendorPlanes", () => {
    it("aligns the three planes on (month, vendor) and converts currencies", () => {
        const data = emptyData({
            transactions: [
                txn({ date: "2026-06-13", vendor: "google", category: "compute", paid_amount: 5000, paid_currency: "USD" }),
                txn({ date: "2026-06-14", vendor: "google", category: "saas", paid_amount: 999, paid_currency: "USD" }),
            ],
            meterMonthly: [
                meter({ month: "2026-06", vendor: "google", currency: "EUR", credit: 100, paid: 4389.35 }),
            ],
            usageMonthly: [
                usage({ vendor: "google", cost_paid: 3000, cost_quests: 1940 }),
            ],
        });
        const [row] = vendorPlanes(data);

        expect(row.month).toBe("2026-06");
        expect(row.vendor).toBe("google");
        expect(row.paidUsd).toBe(5000); // saas row excluded — compute only
        expect(row.spentUsd).toBeCloseTo(4489.35 * 1.1518, 1);
        expect(row.creditUsd).toBeCloseTo(100 * 1.1518, 2);
        expect(row.registeredUsd).toBe(4940);
        expect(row.spentVsRegisteredPct).toBeCloseTo(
            ((4489.35 * 1.1518 - 4940) / 4940) * 100,
            3,
        );
    });

    it("keeps missing planes null instead of zero", () => {
        const data = emptyData({
            usageMonthly: [usage({ vendor: "runpod", cost_paid: 10 })],
        });
        const [row] = vendorPlanes(data);
        expect(row.paidUsd).toBeNull();
        expect(row.spentUsd).toBeNull();
        expect(row.creditUsd).toBeNull();
        expect(row.registeredUsd).toBe(10);
        expect(row.spentVsRegisteredPct).toBeNull();
    });
});

describe("insightVendorOptions", () => {
    it("unions vendors across planes, compute transactions only", () => {
        const data = emptyData({
            transactions: [
                txn({ vendor: "aws", category: "compute" }),
                txn({ vendor: "deel", category: "payroll" }),
            ],
            meterMonthly: [meter({ vendor: "ovhcloud" })],
            usageMonthly: [usage({ vendor: "google" })],
        });
        expect(insightVendorOptions(data)).toEqual(["all", "aws", "google", "ovhcloud"]);
    });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/insights.test.ts`
Expected: FAIL — `vendorPlanes` not exported.

- [ ] **Step 3: Write the implementation**

Append to `web/src/lib/insights.ts`:

```ts
// ------------------------------------------------------ vendor three-way

export type VendorPlanes = {
    month: string;
    vendor: string;
    paidUsd: number | null;
    spentUsd: number | null;
    creditUsd: number | null;
    registeredUsd: number | null;
    spentVsRegisteredPct: number | null;
};

function pctDelta(a: number | null, b: number | null): number | null {
    if (a == null || b == null || b === 0) return null;
    return ((a - b) / b) * 100;
}

export function vendorPlanes(data: Data): VendorPlanes[] {
    const paid = new Map<string, number>();
    for (const row of data.transactions) {
        if (row.category !== "compute") continue;
        const key = `${row.date.slice(0, 7)}|${row.vendor}`;
        paid.set(key, (paid.get(key) ?? 0) + transactionCashUsd(row));
    }

    const spent = new Map<string, { total: number; credit: number }>();
    for (const row of data.meterMonthly) {
        const key = `${row.month}|${row.vendor}`;
        const entry = spent.get(key) ?? { total: 0, credit: 0 };
        entry.total += toUsd(row.credit + row.paid, row.currency, row.month);
        entry.credit += toUsd(row.credit, row.currency, row.month);
        spent.set(key, entry);
    }

    const registered = new Map<string, number>();
    for (const row of data.usageMonthly) {
        const key = `${row.month}|${row.vendor}`;
        registered.set(
            key,
            (registered.get(key) ?? 0) +
                toUsd(row.cost_paid + row.cost_quests, row.currency, row.month),
        );
    }

    const keys = new Set([...paid.keys(), ...spent.keys(), ...registered.keys()]);
    return [...keys]
        .sort()
        .map((key) => {
            const [month, vendor] = key.split("|");
            const spentEntry = spent.get(key);
            const spentUsd = spentEntry ? spentEntry.total : null;
            const registeredUsd = registered.get(key) ?? null;
            return {
                month,
                vendor,
                paidUsd: paid.get(key) ?? null,
                spentUsd,
                creditUsd: spentEntry ? spentEntry.credit : null,
                registeredUsd,
                spentVsRegisteredPct: pctDelta(spentUsd, registeredUsd),
            };
        });
}

export function insightVendorOptions(data: Data): string[] {
    const vendors = new Set<string>();
    for (const row of data.transactions) {
        if (row.category === "compute" && row.vendor.trim()) {
            vendors.add(row.vendor.trim());
        }
    }
    for (const row of data.meterMonthly) {
        if (row.vendor.trim()) vendors.add(row.vendor.trim());
    }
    for (const row of data.usageMonthly) {
        if (row.vendor.trim()) vendors.add(row.vendor.trim());
    }
    return ["all", ...[...vendors].sort((a, b) => a.localeCompare(b))];
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/insights.test.ts`
Expected: PASS.

- [ ] **Step 5: Format and commit**

```bash
npx biome check --write apps/operation/treasury/web/src/lib/insights.ts apps/operation/treasury/web/src/lib/insights.test.ts
git add apps/operation/treasury/web/src/lib/insights.ts apps/operation/treasury/web/src/lib/insights.test.ts
git commit -m "add vendor three-way planes derivation"
```

---

### Task 5: Model economics (allocation + ecosystem credits)

**Files:**
- Modify: `web/src/lib/insights.ts` (append)
- Modify: `web/src/lib/insights.test.ts` (append)

**Interfaces:**
- Consumes: `transactionCashUsd`, `toUsd`, `matchesMonth` from `./months`, types.
- Produces:
  - `type CostBasis = "meter" | "cash" | "registered"`
  - `type ModelEconomics = { vendor: string; model: string; grossPaidUsd: number; ecoPaidUsd: number; retainedPaidUsd: number; grossQuestsUsd: number; registeredCostUsd: number; sharePct: number; basis: CostBasis; trueCostUsd: number; marginUsd: number; effectiveMultiplier: number | null }` — field names follow the pipes' paid/quests vocabulary verbatim
  - `modelEconomics(data: Data, monthFilter: string, netRatio: number | null): ModelEconomics[]` — aggregates all rows within the `matchesMonth` scope; sorted margin ascending (worst first). `netRatio: null` → treated as 1. **margin = retainedPaidUsd × ratio − trueCostUsd.**
  - `type EcosystemTotals = { byopUsd: number; modelUsd: number }`
  - `ecosystemTotals(rows: UsageMonthlyRow[], monthFilter: string): EcosystemTotals` — paid+quest credits in scope (the adoption number)

- [ ] **Step 1: Write the failing tests**

Append to `web/src/lib/insights.test.ts` (extend the `./insights` import with `ecosystemTotals, modelEconomics`):

```ts
import { ecosystemTotals, modelEconomics } from "./insights";

describe("modelEconomics", () => {
    const data = emptyData({
        meterMonthly: [
            meter({ month: "2026-06", vendor: "google", currency: "USD", credit: 0, paid: 5000 }),
        ],
        transactions: [
            txn({ date: "2026-06-10", vendor: "elevenlabs", category: "compute", paid_amount: 300, paid_currency: "USD" }),
        ],
        usageMonthly: [
            usage({
                vendor: "google",
                model: "gemini-a",
                cost_paid: 600,
                cost_quests: 200,
                price_paid: 900,
                price_quests: 250,
                byop_paid: 50,
                model_paid: 100,
                byop_quests: 5,
            }),
            usage({ vendor: "google", model: "gemini-b", cost_paid: 100, cost_quests: 100, price_paid: 100, price_quests: 90 }),
            usage({ vendor: "elevenlabs", model: "eleven-v3", cost_paid: 200, cost_quests: 0, price_paid: 260, price_quests: 0 }),
            usage({ vendor: "azure", model: "gpt-x", cost_paid: 50, cost_quests: 50, price_paid: 40, price_quests: 45 }),
        ],
    });

    it("allocates vendor actuals by registered-cost share and margins on retained", () => {
        const rows = modelEconomics(data, "2026-06", 0.9);
        const geminiA = rows.find((row) => row.model === "gemini-a");
        if (!geminiA) throw new Error("gemini-a missing");

        expect(geminiA.basis).toBe("meter");
        expect(geminiA.registeredCostUsd).toBe(800);
        expect(geminiA.sharePct).toBeCloseTo(80, 5); // 800 of google's 1000
        expect(geminiA.trueCostUsd).toBeCloseTo(4000, 5); // 5000 × 0.8
        expect(geminiA.grossPaidUsd).toBe(900);
        expect(geminiA.ecoPaidUsd).toBe(150); // 50 byop + 100 model, paid side
        expect(geminiA.retainedPaidUsd).toBe(750);
        expect(geminiA.grossQuestsUsd).toBe(250);
        expect(geminiA.marginUsd).toBeCloseTo(750 * 0.9 - 4000, 5);
        expect(geminiA.effectiveMultiplier).toBeCloseTo(1.5, 5); // gross 900/600
    });

    it("falls back to cash then registered bases", () => {
        const rows = modelEconomics(data, "2026-06", null);
        const eleven = rows.find((row) => row.vendor === "elevenlabs");
        const azure = rows.find((row) => row.vendor === "azure");
        if (!eleven || !azure) throw new Error("rows missing");

        expect(eleven.basis).toBe("cash");
        expect(eleven.trueCostUsd).toBeCloseTo(300, 5);
        expect(azure.basis).toBe("registered");
        expect(azure.trueCostUsd).toBeCloseTo(100, 5);
        expect(azure.effectiveMultiplier).toBeCloseTo(0.8, 5); // 40/50
    });

    it("sorts worst margin first and respects the month filter", () => {
        const rows = modelEconomics(data, "2026-06", null);
        const margins = rows.map((row) => row.marginUsd);
        expect([...margins].sort((a, b) => a - b)).toEqual(margins);
        expect(modelEconomics(data, "2026-05", null)).toEqual([]);
    });

    it("reports a null multiplier for quest-only models", () => {
        const questOnly = emptyData({
            usageMonthly: [usage({ vendor: "aws", model: "free", cost_paid: 0, cost_quests: 10, price_paid: 0, price_quests: 12 })],
        });
        const [row] = modelEconomics(questOnly, "", null);
        expect(row.effectiveMultiplier).toBeNull();
        expect(row.basis).toBe("registered");
    });
});

describe("ecosystemTotals", () => {
    it("sums byop and model credits across paid and quests meters in scope", () => {
        const rows = [
            usage({
                month: "2026-06",
                byop_paid: 50,
                byop_quests: 5,
                model_paid: 100,
                model_quests: 8,
            }),
            usage({ month: "2026-05", byop_paid: 999 }),
        ];
        expect(ecosystemTotals(rows, "2026-06")).toEqual({
            byopUsd: 55,
            modelUsd: 108,
        });
        expect(ecosystemTotals(rows, "")).toEqual({
            byopUsd: 1054,
            modelUsd: 108,
        });
    });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/insights.test.ts`
Expected: FAIL — `modelEconomics` not exported.

- [ ] **Step 3: Write the implementation**

Append to `web/src/lib/insights.ts` (add `import { matchesMonth } from "./months";` at the top, and extend the types import with `UsageMonthlyRow`):

```ts
// ------------------------------------------------------- model economics

export type CostBasis = "meter" | "cash" | "registered";

export type ModelEconomics = {
    vendor: string;
    model: string;
    grossPaidUsd: number;
    ecoPaidUsd: number;
    retainedPaidUsd: number;
    grossQuestsUsd: number;
    registeredCostUsd: number;
    sharePct: number;
    basis: CostBasis;
    trueCostUsd: number;
    marginUsd: number;
    effectiveMultiplier: number | null;
};

// True model cost = the vendor's actual spend allocated by each model's share
// of the vendor's registered (metered) cost. Actual waterfall: vendor meter,
// else compute cash, else the registered cost itself. Margin is earned on
// RETAINED pollen — gross minus the byop/model shares we credit onward.
export function modelEconomics(
    data: Data,
    monthFilter: string,
    netRatio: number | null,
): ModelEconomics[] {
    const ratio = netRatio ?? 1;

    const spentByVendor = new Map<string, number>();
    for (const row of data.meterMonthly) {
        if (!matchesMonth(row.month, monthFilter)) continue;
        spentByVendor.set(
            row.vendor,
            (spentByVendor.get(row.vendor) ?? 0) +
                toUsd(row.credit + row.paid, row.currency, row.month),
        );
    }

    const cashByVendor = new Map<string, number>();
    for (const row of data.transactions) {
        if (row.category !== "compute") continue;
        if (!matchesMonth(row.date, monthFilter)) continue;
        cashByVendor.set(
            row.vendor,
            (cashByVendor.get(row.vendor) ?? 0) + transactionCashUsd(row),
        );
    }

    type Accumulator = {
        vendor: string;
        model: string;
        registered: number;
        costPaid: number;
        grossPaid: number;
        ecoPaid: number;
        quest: number;
    };
    const byModel = new Map<string, Accumulator>();
    const registeredByVendor = new Map<string, number>();
    for (const row of data.usageMonthly) {
        if (!matchesMonth(row.month, monthFilter)) continue;
        const key = `${row.vendor}|${row.model}`;
        const entry = byModel.get(key) ?? {
            vendor: row.vendor,
            model: row.model,
            registered: 0,
            costPaid: 0,
            grossPaid: 0,
            ecoPaid: 0,
            quest: 0,
        };
        const registered = toUsd(
            row.cost_paid + row.cost_quests,
            row.currency,
            row.month,
        );
        entry.registered += registered;
        entry.costPaid += toUsd(row.cost_paid, row.currency, row.month);
        entry.grossPaid += toUsd(row.price_paid, row.currency, row.month);
        entry.ecoPaid += toUsd(
            row.byop_paid + row.model_paid,
            row.currency,
            row.month,
        );
        entry.quest += toUsd(row.price_quests, row.currency, row.month);
        byModel.set(key, entry);
        registeredByVendor.set(
            row.vendor,
            (registeredByVendor.get(row.vendor) ?? 0) + registered,
        );
    }

    return [...byModel.values()]
        .map((entry) => {
            const registeredTotal = registeredByVendor.get(entry.vendor) ?? 0;
            const share = registeredTotal > 0 ? entry.registered / registeredTotal : 0;
            const basis: CostBasis = spentByVendor.has(entry.vendor)
                ? "meter"
                : cashByVendor.has(entry.vendor)
                  ? "cash"
                  : "registered";
            const vendorActual =
                basis === "meter"
                    ? (spentByVendor.get(entry.vendor) ?? 0)
                    : basis === "cash"
                      ? (cashByVendor.get(entry.vendor) ?? 0)
                      : registeredTotal;
            const trueCostUsd = vendorActual * share;
            const retainedPaidUsd = entry.grossPaid - entry.ecoPaid;
            return {
                vendor: entry.vendor,
                model: entry.model,
                grossPaidUsd: entry.grossPaid,
                ecoPaidUsd: entry.ecoPaid,
                retainedPaidUsd,
                grossQuestsUsd: entry.quest,
                registeredCostUsd: entry.registered,
                sharePct: share * 100,
                basis,
                trueCostUsd,
                marginUsd: retainedPaidUsd * ratio - trueCostUsd,
                effectiveMultiplier:
                    entry.costPaid > 0 ? entry.grossPaid / entry.costPaid : null,
            };
        })
        .sort((a, b) => a.marginUsd - b.marginUsd);
}

export type EcosystemTotals = { byopUsd: number; modelUsd: number };

// Product-adoption signal: everything credited onward to app developers
// (byop) and community model owners (model), across BOTH meters, in scope.
export function ecosystemTotals(
    rows: UsageMonthlyRow[],
    monthFilter: string,
): EcosystemTotals {
    let byop = 0;
    let model = 0;
    for (const row of rows) {
        if (!matchesMonth(row.month, monthFilter)) continue;
        byop += toUsd(
            row.byop_paid + row.byop_quests,
            row.currency,
            row.month,
        );
        model += toUsd(
            row.model_paid + row.model_quests,
            row.currency,
            row.month,
        );
    }
    return { byopUsd: byop, modelUsd: model };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/insights.test.ts`
Expected: PASS.

- [ ] **Step 5: Format and commit**

```bash
npx biome check --write apps/operation/treasury/web/src/lib/insights.ts apps/operation/treasury/web/src/lib/insights.test.ts
git add apps/operation/treasury/web/src/lib/insights.ts apps/operation/treasury/web/src/lib/insights.test.ts
git commit -m "add model economics with ecosystem credit allocation"
```

---

### Task 6: P&L view + Insights/Raw section navigation + per-tab filter row

**Files:**
- Create: `web/src/views/PnlTab.tsx`
- Create: `web/src/views/PnlTab.test.ts`
- Modify: `web/src/App.tsx`
- Modify: `web/src/fixtures.ts`

**Interfaces:**
- Consumes: `pnlByMonth`, `categoryColumns`, `insightVendorOptions` (Tasks 3+4); `fmtUsd` (Task 1); `matchesMonth`, `monthLabel`.
- Produces: `PnlTab({ data, month }: { data: Data; month?: string })` component; exported `totalsRow(rows, categories)` helper; the `Section`/`InsightTab` wiring and the filter-visibility logic that Tasks 7–8 extend. `type InsightTab = "pnl" | "vendors" | "models"` is declared in FULL here; the `INSIGHT_TABS` array gains entries in Tasks 7/8.

- [ ] **Step 1: Create the P&L view**

Create `web/src/views/PnlTab.tsx`:

```tsx
import {
    Chip,
    TableBody,
    TableCell,
    TableHead,
    TableHeaderCell,
    TableRow,
    Text,
} from "@pollinations/ui";
import { useMemo } from "react";
import { DataTable, TableScroller } from "../components/DataTable";
import { fmtUsd } from "../lib/format";
import {
    categoryColumns,
    monthSpendDetail,
    pnlByMonth,
    type PnlMonth,
} from "../lib/insights";
import { matchesMonth, monthLabel } from "../lib/months";
import type { Data } from "../types";

const MONTH_ONLY_RE = /^\d{4}-\d{2}$/;

function pnlTone(value: number | null) {
    if (value == null) return "";
    return value >= 0 ? "text-intent-success-text" : "text-intent-danger-text";
}

function sum(values: (number | null)[]): number | null {
    const present = values.filter((value): value is number => value != null);
    if (present.length === 0) return null;
    return present.reduce((a, b) => a + b, 0);
}

export function totalsRow(rows: PnlMonth[], categories: string[]) {
    return {
        revenueNetUsd: sum(rows.map((row) => row.revenueNetUsd)),
        spendUsd: sum(rows.map((row) => row.spendUsd)),
        cashPnlUsd: sum(rows.map((row) => row.cashPnlUsd)),
        creditBurnUsd: rows.reduce((a, row) => a + row.creditBurnUsd, 0),
        categories: Object.fromEntries(
            categories.map((category) => [
                category,
                sum(rows.map((row) => row.categories[category] ?? null)),
            ]),
        ),
    };
}

// The matrix IS the yearly reading; one selected month flips to the
// drill-down grain the matrix cannot show (category × vendor). Dispatch
// before any hooks so the hook order stays stable across mode switches.
export function PnlTab({ data, month = "" }: { data: Data; month?: string }) {
    if (MONTH_ONLY_RE.test(month)) {
        return <PnlMonthDetail data={data} month={month} />;
    }
    return <PnlMatrix data={data} month={month} />;
}

function PnlMatrix({ data, month = "" }: { data: Data; month?: string }) {
    const allRows = useMemo(() => pnlByMonth(data, new Date()), [data]);
    const rows = useMemo(
        () =>
            allRows
                .filter((row) => matchesMonth(row.month, month))
                .sort((a, b) => b.month.localeCompare(a.month)),
        [allRows, month],
    );
    const categories = useMemo(() => categoryColumns(rows), [rows]);
    const totals = useMemo(() => totalsRow(rows, categories), [rows, categories]);

    return (
        <div className="flex flex-col gap-3">
            <TableScroller>
                <DataTable>
                    <TableHead>
                        <TableRow>
                            <TableHeaderCell>month</TableHeaderCell>
                            <TableHeaderCell>revenue</TableHeaderCell>
                            {categories.map((category) => (
                                <TableHeaderCell key={category}>
                                    {category}
                                </TableHeaderCell>
                            ))}
                            <TableHeaderCell>spend</TableHeaderCell>
                            <TableHeaderCell>cash P&L</TableHeaderCell>
                            <TableHeaderCell>credit burn</TableHeaderCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {rows.map((row) => (
                            <TableRow key={row.month}>
                                <TableCell>
                                    <span className="inline-flex items-center gap-1.5">
                                        {monthLabel(row.month)}
                                        {row.opexIncomplete && (
                                            <span
                                                title="opex incomplete - the Enty batch for this month has not landed yet"
                                                className="text-intent-danger-text"
                                            >
                                                ⚠
                                            </span>
                                        )}
                                    </span>
                                </TableCell>
                                <TableCell>{fmtUsd(row.revenueNetUsd)}</TableCell>
                                {categories.map((category) => (
                                    <TableCell key={category}>
                                        {fmtUsd(row.categories[category] ?? null)}
                                    </TableCell>
                                ))}
                                <TableCell>{fmtUsd(row.spendUsd)}</TableCell>
                                <TableCell className={pnlTone(row.cashPnlUsd)}>
                                    {fmtUsd(row.cashPnlUsd)}
                                </TableCell>
                                <TableCell className="text-theme-text-soft">
                                    {row.creditBurnUsd > 0
                                        ? `(${fmtUsd(row.creditBurnUsd)})`
                                        : "–"}
                                </TableCell>
                            </TableRow>
                        ))}
                        {rows.length > 1 && (
                            <TableRow>
                                <TableCell className="font-semibold">
                                    total
                                </TableCell>
                                <TableCell className="font-semibold">
                                    {fmtUsd(totals.revenueNetUsd)}
                                </TableCell>
                                {categories.map((category) => (
                                    <TableCell
                                        key={category}
                                        className="font-semibold"
                                    >
                                        {fmtUsd(totals.categories[category])}
                                    </TableCell>
                                ))}
                                <TableCell className="font-semibold">
                                    {fmtUsd(totals.spendUsd)}
                                </TableCell>
                                <TableCell
                                    className={`font-semibold ${pnlTone(totals.cashPnlUsd)}`}
                                >
                                    {fmtUsd(totals.cashPnlUsd)}
                                </TableCell>
                                <TableCell className="font-semibold text-theme-text-soft">
                                    {totals.creditBurnUsd > 0
                                        ? `(${fmtUsd(totals.creditBurnUsd)})`
                                        : "–"}
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </DataTable>
            </TableScroller>
            <Text size="micro" tone="soft">
                costs are cash-basis by transaction date · EUR→USD at monthly
                ECB averages · (credit burn) = vendor spend covered by credits,
                not part of cash P&L · ⚠ = Enty batch not landed
            </Text>
        </div>
    );
}

function PnlMonthDetail({ data, month }: { data: Data; month: string }) {
    const detail = useMemo(
        () => monthSpendDetail(data, month, new Date()),
        [data, month],
    );
    const summary = detail.summary;

    return (
        <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center gap-2">
                <Chip size="sm">
                    {monthLabel(month)}
                    {summary?.opexIncomplete ? " ⚠" : ""}
                </Chip>
                <Chip size="sm">
                    revenue {fmtUsd(summary?.revenueNetUsd ?? null)}
                </Chip>
                <Chip size="sm">spend {fmtUsd(summary?.spendUsd ?? null)}</Chip>
                <Chip size="sm">
                    cash P&L {fmtUsd(summary?.cashPnlUsd ?? null)}
                </Chip>
                <Chip size="sm">
                    credit burn{" "}
                    {summary && summary.creditBurnUsd > 0
                        ? `(${fmtUsd(summary.creditBurnUsd)})`
                        : "–"}
                </Chip>
            </div>
            <TableScroller>
                <DataTable>
                    <TableHead>
                        <TableRow>
                            <TableHeaderCell>category</TableHeaderCell>
                            <TableHeaderCell>vendor</TableHeaderCell>
                            <TableHeaderCell>cash</TableHeaderCell>
                            <TableHeaderCell>% of spend</TableHeaderCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {detail.spend.map((row) => (
                            <TableRow key={`${row.category}|${row.vendor}`}>
                                <TableCell>{row.category}</TableCell>
                                <TableCell>{row.vendor}</TableCell>
                                <TableCell>{fmtUsd(row.cashUsd)}</TableCell>
                                <TableCell className="text-theme-text-soft">
                                    {row.pctOfSpend == null
                                        ? "–"
                                        : `${row.pctOfSpend.toFixed(1)}%`}
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </DataTable>
            </TableScroller>
            {detail.creditBurn.length > 0 && (
                <>
                    <Text size="micro" tone="soft">
                        credit burn (not cash)
                    </Text>
                    <TableScroller>
                        <DataTable>
                            <TableHead>
                                <TableRow>
                                    <TableHeaderCell>vendor</TableHeaderCell>
                                    <TableHeaderCell>credit</TableHeaderCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {detail.creditBurn.map((row) => (
                                    <TableRow key={row.vendor}>
                                        <TableCell>{row.vendor}</TableCell>
                                        <TableCell className="text-theme-text-soft">
                                            ({fmtUsd(row.creditUsd)})
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </DataTable>
                    </TableScroller>
                </>
            )}
            <Text size="micro" tone="soft">
                single-month drill-down: cash by category and vendor · pick the
                year pill for the monthly matrix · ⚠ = Enty batch not landed
            </Text>
        </div>
    );
}
```

- [ ] **Step 2: Write and run the totals-helper test**

Create `web/src/views/PnlTab.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { PnlMonth } from "../lib/insights";
import { totalsRow } from "./PnlTab";

const month = (over: Partial<PnlMonth>): PnlMonth => ({
    month: "2026-05",
    revenueNetUsd: null,
    categories: {},
    spendUsd: null,
    cashPnlUsd: null,
    creditBurnUsd: 0,
    opexIncomplete: false,
    ...over,
});

describe("totalsRow", () => {
    it("sums present values and keeps all-null columns null", () => {
        const rows = [
            month({ revenueNetUsd: 100, spendUsd: 40, cashPnlUsd: 60, creditBurnUsd: 5, categories: { compute: 40 } }),
            month({ month: "2026-06", categories: {} }),
        ];
        const totals = totalsRow(rows, ["compute", "saas"]);
        expect(totals.revenueNetUsd).toBe(100);
        expect(totals.spendUsd).toBe(40);
        expect(totals.cashPnlUsd).toBe(60);
        expect(totals.creditBurnUsd).toBe(5);
        expect(totals.categories.compute).toBe(40);
        expect(totals.categories.saas).toBeNull();
    });
});
```

Run: `npx vitest run src/views/PnlTab.test.ts` — Expected: PASS.

- [ ] **Step 3: Wire section switch + per-tab filter row into App.tsx**

Modify `web/src/App.tsx` with these exact edits:

3a. Add imports (after the existing view imports):

```tsx
import { insightVendorOptions } from "./lib/insights";
import { PnlTab } from "./views/PnlTab";
```

3b. Below `type Tab = ...` add:

```tsx
type Section = "insights" | "raw";
type InsightTab = "pnl" | "vendors" | "models";

const INSIGHT_TABS: {
    id: InsightTab;
    label: string;
    note: string;
}[] = [
    {
        id: "pnl",
        label: "P&L",
        note: "Monthly blend: Stripe net revenue minus cash spend per category, with credit burn as a shadow. Derived client-side from transactions, meter, and revenue pipes.",
    },
];
```

3c. Inside `App()`, next to the existing `tab` state add:

```tsx
const [section, setSection] = useState<Section>("insights");
const [insightTab, setInsightTab] = useState<InsightTab>("pnl");
```

3d. Filter visibility + active options. Replace the current line
`const showVendorFilter = vendorOptions.length > 1;` with:

```tsx
const insightVendors = useMemo(
    () => (data ? insightVendorOptions(data) : ["all"]),
    [data],
);
const showVendorFilter =
    section === "insights"
        ? insightTab !== "pnl"
        : tab !== "revenue" && vendorOptions.length > 1;
const activeVendorOptions =
    section === "insights" ? insightVendors : vendorOptions;
const showCategoryFilter = section === "raw" && tab === "transactions";
```

Point the vendor `FilterSelect` at `options={activeVendorOptions}`, and replace the `{tab !== "meter" && (` guard around the category `FilterSelect` with `{showCategoryFilter && (`. Also update the vendor-reset effect to use `activeVendorOptions`:

```tsx
useEffect(() => {
    if (vendor !== "all" && !activeVendorOptions.includes(vendor)) {
        setVendor("all");
    }
}, [vendor, activeVendorOptions]);
```

3e. Restructure the nav/filter order to: **section nav → tab nav → FilterBar → body**. Replace the single `<nav>` block with the two navs below, and MOVE the existing `<FilterBar>…</FilterBar>` block so it renders directly AFTER them:

```tsx
<nav className="flex flex-wrap gap-2">
    <TabButton
        active={section === "insights"}
        onClick={() => setSection("insights")}
    >
        Insights
    </TabButton>
    <TabButton
        active={section === "raw"}
        onClick={() => setSection("raw")}
    >
        Raw
    </TabButton>
</nav>

<nav className="flex flex-wrap gap-2">
    {section === "raw" &&
        TABS.map((item) => (
            <Tooltip
                key={item.id}
                triggerAs="span"
                content={
                    <span className="flex max-w-72 flex-col gap-1">
                        {item.codes.length > 0 && (
                            <span className="flex items-center gap-1.5">
                                {item.codes.map((code) => (
                                    <SourceMark key={code} code={code} />
                                ))}
                            </span>
                        )}
                        <span className="font-mono text-theme-text-soft">
                            {item.pipe}
                            {data ? ` · ${item.rows(data)} rows` : ""}
                        </span>
                        <span>{item.note}</span>
                    </span>
                }
            >
                <TabButton
                    active={tab === item.id}
                    onClick={() => setTab(item.id)}
                >
                    {item.label}
                </TabButton>
            </Tooltip>
        ))}
    {section === "insights" &&
        INSIGHT_TABS.map((item) => (
            <Tooltip
                key={item.id}
                triggerAs="span"
                content={
                    <span className="flex max-w-72 flex-col gap-1">
                        <span className="font-mono text-theme-text-soft">
                            derived · client-side
                        </span>
                        <span>{item.note}</span>
                    </span>
                }
            >
                <TabButton
                    active={insightTab === item.id}
                    onClick={() => setInsightTab(item.id)}
                >
                    {item.label}
                </TabButton>
            </Tooltip>
        ))}
</nav>
```

Inside the moved `<FilterBar>`, wrap the vendor/category selects' container so it only renders when at least one select is visible (avoids an empty flex row on P&L/Revenue):

```tsx
{(showVendorFilter || showCategoryFilter) && (
    <div className="flex flex-wrap gap-3">
        {showVendorFilter && (
            <FilterSelect
                label="vendor"
                value={vendor}
                onChange={setVendor}
                options={activeVendorOptions}
            />
        )}
        {showCategoryFilter && (
            <FilterSelect
                label="category"
                value={category}
                onChange={setCategory}
                options={categoryOptions}
            />
        )}
    </div>
)}
```

3f. Guard the raw tab bodies with the section and add the insight body. Replace each `{data && tab === "..." && (...)}` guard with `{data && section === "raw" && tab === "..." && (...)}` and append:

```tsx
{data && section === "insights" && insightTab === "pnl" && (
    <PnlTab data={data} month={activeMonth} />
)}
```

- [ ] **Step 4: Make the fixtures demo the P&L**

In `web/src/fixtures.ts`, extend the existing arrays (append, keep existing rows untouched):

```ts
// append to `transactions`
{
    date: "2026-05-25",
    vendor: "deel",
    category: "payroll",
    charged_amount: 0,
    charged_currency: "",
    paid_amount: 8015.44,
    paid_currency: "EUR",
    invoice_ref: "",
    match_status: "matched",
},
{
    date: "2026-05-12",
    vendor: "google",
    category: "compute",
    charged_amount: 3399.05,
    charged_currency: "EUR",
    paid_amount: 3967.75,
    paid_currency: "USD",
    invoice_ref: "",
    match_status: "matched",
},

// append to `meterMonthly`
{
    month: "2026-06",
    vendor: "google",
    currency: "EUR",
    credit: 0,
    paid: 4489.35,
    source: "bq",
},

// append to `revenueMonthly`
{
    source: "stripe",
    month: "2026-05",
    currency: "EUR",
    gross_amount: 10392.93,
    fees_amount: 941.58,
    refunds_amount: 0,
},
```

- [ ] **Step 5: Verify the app compiles and everything still passes**

Run (cwd `web`): `npx vitest run` — Expected: ALL tests pass.
Run: `npm run typecheck` — Expected: exit 0.
Run `npm run dev` in the background; load `http://127.0.0.1:4180/?fixtures=1` — the app opens on **Insights → P&L** showing May 26 (complete, revenue + payroll + compute) and Jun 26 (⚠) rows; only the period picker shows (no vendor/category select). Click the May pill — the matrix flips to the drill-down: headline chips (revenue/spend/cash P&L/credit burn) plus category × vendor cash rows (payroll deel, compute google) with % of spend; click the year pill to return to the matrix. Switch to Raw and confirm the four raw tabs render with the filter row below the tab nav (category select only on Transactions). Stop the dev server.

- [ ] **Step 6: Format and commit**

```bash
npx biome check --write apps/operation/treasury/web/src/views/PnlTab.tsx apps/operation/treasury/web/src/views/PnlTab.test.ts apps/operation/treasury/web/src/App.tsx apps/operation/treasury/web/src/fixtures.ts
git add apps/operation/treasury/web/src/views/PnlTab.tsx apps/operation/treasury/web/src/views/PnlTab.test.ts apps/operation/treasury/web/src/App.tsx apps/operation/treasury/web/src/fixtures.ts
git commit -m "add insights section with pnl tab and per-tab filters"
```

---

### Task 7: Vendors tab (three-way view)

**Files:**
- Create: `web/src/views/VendorsTab.tsx`
- Create: `web/src/views/VendorsTab.test.ts`
- Modify: `web/src/App.tsx`

**Interfaces:**
- Consumes: `vendorPlanes`, `VendorPlanes` (Task 4); `fmtUsd`, `fmtPct` (Task 1); `matchesMonth`, `monthLabel`; sortable-table helpers.
- Produces: `VendorsTab({ data, month, vendor })` component; exported pure helper `visiblePlaneRows({ rows, month, vendor }): VendorPlanes[]`.

- [ ] **Step 1: Write the failing test**

Create `web/src/views/VendorsTab.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { VendorPlanes } from "../lib/insights";
import { visiblePlaneRows } from "./VendorsTab";

const plane = (month: string, vendor: string): VendorPlanes => ({
    month,
    vendor,
    paidUsd: null,
    spentUsd: null,
    creditUsd: null,
    registeredUsd: 1,
    spentVsRegisteredPct: null,
});

describe("visiblePlaneRows", () => {
    const rows = [
        plane("2026-06", "aws"),
        plane("2026-07", "aws"),
        plane("2026-07", "google"),
    ];

    it("filters by month and vendor", () => {
        expect(
            visiblePlaneRows({ rows, month: "2026-07", vendor: "aws" }),
        ).toEqual([plane("2026-07", "aws")]);
    });

    it("returns everything for the all/empty filters", () => {
        expect(visiblePlaneRows({ rows, month: "", vendor: "all" })).toEqual(
            rows,
        );
    });
});
```

Run: `npx vitest run src/views/VendorsTab.test.ts` — Expected: FAIL (module not found).

- [ ] **Step 2: Create the view**

Create `web/src/views/VendorsTab.tsx`:

```tsx
import {
    TableBody,
    TableCell,
    TableHead,
    TableHeaderCell,
    TableRow,
    Text,
} from "@pollinations/ui";
import { useMemo } from "react";
import {
    DataTable,
    type SortColumn,
    TableScroller,
    useSortableRows,
    withUniqueRowKeys,
} from "../components/DataTable";
import { fmtPct, fmtUsd } from "../lib/format";
import { type VendorPlanes, vendorPlanes } from "../lib/insights";
import { matchesMonth, monthLabel } from "../lib/months";
import type { Data } from "../types";

const DELTA_ALARM_PCT = 25;

export function visiblePlaneRows({
    month,
    rows,
    vendor,
}: {
    month: string;
    rows: VendorPlanes[];
    vendor: string;
}) {
    return rows.filter(
        (row) =>
            matchesMonth(row.month, month) &&
            (vendor === "all" || row.vendor === vendor),
    );
}

export function VendorsTab({
    data,
    month = "",
    vendor = "all",
}: {
    data: Data;
    month?: string;
    vendor?: string;
}) {
    const allRows = useMemo(() => vendorPlanes(data), [data]);
    const baseRows = useMemo(
        () => visiblePlaneRows({ rows: allRows, month, vendor }),
        [allRows, month, vendor],
    );
    const sortColumns = useMemo<SortColumn<VendorPlanes>[]>(
        () => [
            { key: "month", value: (row) => row.month },
            { key: "vendor", value: (row) => row.vendor },
            { key: "paidUsd", value: (row) => row.paidUsd },
            { key: "spentUsd", value: (row) => row.spentUsd },
            { key: "creditUsd", value: (row) => row.creditUsd },
            { key: "registeredUsd", value: (row) => row.registeredUsd },
            {
                key: "spentVsRegisteredPct",
                value: (row) => row.spentVsRegisteredPct,
            },
        ],
        [],
    );
    const { headerProps, rows } = useSortableRows(baseRows, sortColumns, {
        key: "month",
        direction: "desc",
    });

    return (
        <div className="flex flex-col gap-3">
            <TableScroller>
                <DataTable>
                    <TableHead>
                        <TableRow>
                            <TableHeaderCell {...headerProps("month")}>
                                month
                            </TableHeaderCell>
                            <TableHeaderCell {...headerProps("vendor")}>
                                vendor
                            </TableHeaderCell>
                            <TableHeaderCell {...headerProps("paidUsd")}>
                                paid (bank)
                            </TableHeaderCell>
                            <TableHeaderCell {...headerProps("spentUsd")}>
                                spent (meter)
                            </TableHeaderCell>
                            <TableHeaderCell {...headerProps("creditUsd")}>
                                of it credit
                            </TableHeaderCell>
                            <TableHeaderCell {...headerProps("registeredUsd")}>
                                registered (us)
                            </TableHeaderCell>
                            <TableHeaderCell
                                {...headerProps("spentVsRegisteredPct")}
                            >
                                Δ spent vs reg
                            </TableHeaderCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {withUniqueRowKeys(
                            rows,
                            (row) => `${row.month}|${row.vendor}`,
                        ).map(({ key, row }) => (
                            <TableRow key={key}>
                                <TableCell>{monthLabel(row.month)}</TableCell>
                                <TableCell>{row.vendor}</TableCell>
                                <TableCell>{fmtUsd(row.paidUsd)}</TableCell>
                                <TableCell>{fmtUsd(row.spentUsd)}</TableCell>
                                <TableCell className="text-theme-text-soft">
                                    {fmtUsd(row.creditUsd)}
                                </TableCell>
                                <TableCell>
                                    {fmtUsd(row.registeredUsd)}
                                </TableCell>
                                <TableCell
                                    className={
                                        row.spentVsRegisteredPct != null &&
                                        Math.abs(row.spentVsRegisteredPct) >
                                            DELTA_ALARM_PCT
                                            ? "text-intent-danger-text"
                                            : "text-theme-text-soft"
                                    }
                                >
                                    {fmtPct(row.spentVsRegisteredPct)}
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </DataTable>
            </TableScroller>
            <Text size="micro" tone="soft">
                paid = Enty compute transactions (bank leg, invoice fallback) ·
                spent = vendor-reported meter · registered = our metering
                (Pollen ≈ $) · – = no data for that plane, never zero · Δ red
                when |Δ| &gt; {DELTA_ALARM_PCT}%
            </Text>
        </div>
    );
}
```

- [ ] **Step 3: Wire into App.tsx**

- Import: `import { VendorsTab } from "./views/VendorsTab";`
- Append to `INSIGHT_TABS`:

```tsx
{
    id: "vendors",
    label: "Vendors",
    note: "Three-way per vendor and month: what the bank paid, what the vendor metered, what our own metering registered - with the delta that exposes wrong registry unit costs.",
},
```

- Body: `{data && section === "insights" && insightTab === "vendors" && (<VendorsTab data={data} month={activeMonth} vendor={vendor} />)}`

- [ ] **Step 4: Run all tests, typecheck, and eyeball**

Run: `npx vitest run` — Expected: PASS.
Run: `npm run typecheck` — Expected: exit 0.
Dev server + `?fixtures=1`: Vendors tab shows the vendor select in the filter row; google Jun 26 with paid `–`, spent ≈ `$5,171`; `–` never `$0` for missing planes.

- [ ] **Step 5: Format and commit**

```bash
npx biome check --write apps/operation/treasury/web/src/views/VendorsTab.tsx apps/operation/treasury/web/src/views/VendorsTab.test.ts apps/operation/treasury/web/src/App.tsx
git add apps/operation/treasury/web/src/views/VendorsTab.tsx apps/operation/treasury/web/src/views/VendorsTab.test.ts apps/operation/treasury/web/src/App.tsx
git commit -m "add vendors three-way insight tab"
```

---

### Task 8: Models tab (unit economics + ecosystem)

**Files:**
- Create: `web/src/views/ModelsTab.tsx`
- Create: `web/src/views/ModelsTab.test.ts`
- Modify: `web/src/App.tsx`

**Interfaces:**
- Consumes: `modelEconomics`, `ecosystemTotals`, `globalNetRatio`, `breakEvenMultiplier`, `ModelEconomics` (Tasks 2+5); `fmtUsd`, `fmtMultiplier` (Task 1); `monthLabel`; sortable-table helpers; `Chip` from `@pollinations/ui`.
- Produces: `ModelsTab({ data, month, vendor })`; exported pure helpers `visibleModelRows(rows: ModelEconomics[], vendor: string): ModelEconomics[]` and `gaugeParts(paid: number, quests: number, maxTotal: number): { widthPct: number; paidPct: number; questsPct: number } | null`.

- [ ] **Step 1: Write the failing test**

Create `web/src/views/ModelsTab.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { ModelEconomics } from "../lib/insights";
import { gaugeParts, visibleModelRows } from "./ModelsTab";

const row = (vendor: string, model: string): ModelEconomics => ({
    vendor,
    model,
    grossPaidUsd: 0,
    ecoPaidUsd: 0,
    retainedPaidUsd: 0,
    grossQuestsUsd: 0,
    registeredCostUsd: 0,
    sharePct: 0,
    basis: "registered",
    trueCostUsd: 0,
    marginUsd: 0,
    effectiveMultiplier: null,
});

describe("visibleModelRows", () => {
    const rows = [row("aws", "nova"), row("google", "gemini")];

    it("filters by vendor", () => {
        expect(visibleModelRows(rows, "aws")).toEqual([row("aws", "nova")]);
    });

    it("passes everything through for all", () => {
        expect(visibleModelRows(rows, "all")).toEqual(rows);
    });
});

describe("gaugeParts", () => {
    it("scales the bar to the largest model and splits paid vs quests", () => {
        expect(gaugeParts(75, 25, 200)).toEqual({
            widthPct: 50,
            paidPct: 75,
            questsPct: 25,
        });
    });

    it("returns null when there is nothing to draw", () => {
        expect(gaugeParts(0, 0, 100)).toBeNull();
        expect(gaugeParts(1, 1, 0)).toBeNull();
    });
});
```

Run: `npx vitest run src/views/ModelsTab.test.ts` — Expected: FAIL (module not found).

- [ ] **Step 2: Create the view**

Create `web/src/views/ModelsTab.tsx`:

```tsx
import {
    Chip,
    TableBody,
    TableCell,
    TableHead,
    TableHeaderCell,
    TableRow,
    Text,
} from "@pollinations/ui";
import { useMemo } from "react";
import {
    DataTable,
    type SortColumn,
    TableScroller,
    useSortableRows,
    withUniqueRowKeys,
} from "../components/DataTable";
import { fmtMultiplier, fmtUsd } from "../lib/format";
import {
    breakEvenMultiplier,
    ecosystemTotals,
    globalNetRatio,
    type ModelEconomics,
    modelEconomics,
} from "../lib/insights";
import { monthLabel } from "../lib/months";
import type { Data } from "../types";

export function visibleModelRows(rows: ModelEconomics[], vendor: string) {
    return rows.filter((row) => vendor === "all" || row.vendor === vendor);
}

export function gaugeParts(paid: number, quests: number, maxTotal: number) {
    const total = paid + quests;
    if (total <= 0 || maxTotal <= 0) return null;
    return {
        widthPct: (total / maxTotal) * 100,
        paidPct: (paid / total) * 100,
        questsPct: (quests / total) * 100,
    };
}

// Right-anchored: the bar grows leftwards with total pollen, so scanning
// the column reads volume at a glance; the color split is the meter mix.
function PollenGauge({
    max,
    paid,
    quests,
}: {
    max: number;
    paid: number;
    quests: number;
}) {
    const parts = gaugeParts(paid, quests, max);
    if (!parts) return <span>–</span>;
    return (
        <div
            className="flex h-2.5 w-36 justify-end overflow-hidden rounded-sm bg-theme-bg-active"
            title={`paid ${parts.paidPct.toFixed(0)}% · quests ${parts.questsPct.toFixed(0)}% · total ${fmtUsd(paid + quests)}`}
        >
            <div
                className="flex h-full justify-end"
                style={{ width: `${parts.widthPct}%` }}
            >
                <div
                    className="h-full bg-intent-success-text/70"
                    style={{ width: `${parts.paidPct}%` }}
                />
                <div
                    className="h-full bg-theme-text-soft/40"
                    style={{ width: `${parts.questsPct}%` }}
                />
            </div>
        </div>
    );
}

function marginTone(value: number) {
    return value >= 0 ? "text-intent-success-text" : "text-intent-danger-text";
}

export function ModelsTab({
    data,
    month = "",
    vendor = "all",
}: {
    data: Data;
    month?: string;
    vendor?: string;
}) {
    const netRatio = useMemo(
        () => globalNetRatio(data.revenueMonthly),
        [data.revenueMonthly],
    );
    const breakEven = useMemo(() => breakEvenMultiplier(netRatio), [netRatio]);
    const ecosystem = useMemo(
        () => ecosystemTotals(data.usageMonthly, month),
        [data.usageMonthly, month],
    );
    const allRows = useMemo(
        () => modelEconomics(data, month, netRatio),
        [data, month, netRatio],
    );
    const baseRows = useMemo(
        () => visibleModelRows(allRows, vendor),
        [allRows, vendor],
    );
    const maxTotalPollen = useMemo(
        () =>
            baseRows.reduce(
                (max, row) =>
                    Math.max(max, row.grossPaidUsd + row.grossQuestsUsd),
                0,
            ),
        [baseRows],
    );
    const sortColumns = useMemo<SortColumn<ModelEconomics>[]>(
        () => [
            { key: "vendor", value: (row) => row.vendor },
            { key: "model", value: (row) => row.model },
            { key: "grossPaidUsd", value: (row) => row.grossPaidUsd },
            { key: "ecoPaidUsd", value: (row) => row.ecoPaidUsd },
            { key: "retainedPaidUsd", value: (row) => row.retainedPaidUsd },
            { key: "grossQuestsUsd", value: (row) => row.grossQuestsUsd },
            {
                key: "paid_share",
                value: (row) => {
                    const total = row.grossPaidUsd + row.grossQuestsUsd;
                    return total > 0 ? row.grossPaidUsd / total : null;
                },
            },
            { key: "registeredCostUsd", value: (row) => row.registeredCostUsd },
            { key: "sharePct", value: (row) => row.sharePct },
            { key: "trueCostUsd", value: (row) => row.trueCostUsd },
            { key: "basis", value: (row) => row.basis },
            {
                key: "effectiveMultiplier",
                value: (row) => row.effectiveMultiplier,
            },
            { key: "marginUsd", value: (row) => row.marginUsd },
        ],
        [],
    );
    const { headerProps, rows } = useSortableRows(baseRows, sortColumns, {
        key: "marginUsd",
        direction: "asc",
    });

    const scopeLabel = month === "" ? "all data" : monthLabel(month);

    return (
        <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2">
                <Chip size="sm">
                    net ratio{" "}
                    {netRatio == null ? "–" : `${(netRatio * 100).toFixed(0)}%`}
                </Chip>
                <Chip size="sm">break-even {fmtMultiplier(breakEven)}</Chip>
                <Chip size="sm">
                    ecosystem {fmtUsd(ecosystem.byopUsd + ecosystem.modelUsd)}{" "}
                    (byop {fmtUsd(ecosystem.byopUsd)} · model{" "}
                    {fmtUsd(ecosystem.modelUsd)})
                </Chip>
                <Chip size="sm">scope: {scopeLabel}</Chip>
            </div>
            <TableScroller>
                <DataTable>
                    <TableHead>
                        <TableRow>
                            <TableHeaderCell {...headerProps("vendor")}>
                                vendor
                            </TableHeaderCell>
                            <TableHeaderCell {...headerProps("model")}>
                                model
                            </TableHeaderCell>
                            <TableHeaderCell {...headerProps("grossPaidUsd")}>
                                gross_paid
                            </TableHeaderCell>
                            <TableHeaderCell {...headerProps("ecoPaidUsd")}>
                                eco_paid
                            </TableHeaderCell>
                            <TableHeaderCell
                                {...headerProps("retainedPaidUsd")}
                            >
                                retained_paid
                            </TableHeaderCell>
                            <TableHeaderCell
                                {...headerProps("grossQuestsUsd")}
                            >
                                gross_quests
                            </TableHeaderCell>
                            <TableHeaderCell {...headerProps("paid_share")}>
                                paid / quests
                            </TableHeaderCell>
                            <TableHeaderCell
                                {...headerProps("registeredCostUsd")}
                            >
                                registered
                            </TableHeaderCell>
                            <TableHeaderCell {...headerProps("sharePct")}>
                                share
                            </TableHeaderCell>
                            <TableHeaderCell {...headerProps("trueCostUsd")}>
                                true cost
                            </TableHeaderCell>
                            <TableHeaderCell {...headerProps("basis")}>
                                basis
                            </TableHeaderCell>
                            <TableHeaderCell
                                {...headerProps("effectiveMultiplier")}
                            >
                                eff ×
                            </TableHeaderCell>
                            <TableHeaderCell {...headerProps("marginUsd")}>
                                margin
                            </TableHeaderCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {withUniqueRowKeys(
                            rows,
                            (row) => `${row.vendor}|${row.model}`,
                        ).map(({ key, row }) => (
                            <TableRow key={key}>
                                <TableCell>{row.vendor}</TableCell>
                                <TableCell>{row.model}</TableCell>
                                <TableCell>{fmtUsd(row.grossPaidUsd)}</TableCell>
                                <TableCell className="text-theme-text-soft">
                                    {fmtUsd(row.ecoPaidUsd)}
                                </TableCell>
                                <TableCell>
                                    {fmtUsd(row.retainedPaidUsd)}
                                </TableCell>
                                <TableCell className="text-theme-text-soft">
                                    {fmtUsd(row.grossQuestsUsd)}
                                </TableCell>
                                <TableCell>
                                    <PollenGauge
                                        paid={row.grossPaidUsd}
                                        quests={row.grossQuestsUsd}
                                        max={maxTotalPollen}
                                    />
                                </TableCell>
                                <TableCell>
                                    {fmtUsd(row.registeredCostUsd)}
                                </TableCell>
                                <TableCell className="text-theme-text-soft">
                                    {row.sharePct.toFixed(1)}%
                                </TableCell>
                                <TableCell>{fmtUsd(row.trueCostUsd)}</TableCell>
                                <TableCell>
                                    <Chip size="sm">
                                        {row.basis === "registered"
                                            ? "reg"
                                            : row.basis}
                                    </Chip>
                                </TableCell>
                                <TableCell>
                                    {fmtMultiplier(row.effectiveMultiplier)}
                                </TableCell>
                                <TableCell className={marginTone(row.marginUsd)}>
                                    {fmtUsd(row.marginUsd)}
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </DataTable>
            </TableScroller>
            <Text size="micro" tone="soft">
                margin = retained_paid × net-ratio − true cost · retained_paid
                = gross_paid − byop_paid − model_paid · eco_paid = byop_paid +
                model_paid · paid / quests gauge: bar
                length = total pollen vs the biggest model in view, colored =
                paid, faded = quests · true cost = vendor actual × model share
                of registered cost · basis: meter = vendor-reported, cash =
                bank, reg = our metering (no vendor data yet) · sorted worst
                margin first
            </Text>
        </div>
    );
}
```

- [ ] **Step 3: Wire into App.tsx**

- Import: `import { ModelsTab } from "./views/ModelsTab";`
- Append to `INSIGHT_TABS`:

```tsx
{
    id: "models",
    label: "Models",
    note: "Per-model unit economics: retained pollen (gross minus byop/model shares) vs true cost allocated from vendor actuals, with the break-even floor and ecosystem adoption totals.",
},
```

- Body: `{data && section === "insights" && insightTab === "models" && (<ModelsTab data={data} month={activeMonth} vendor={vendor} />)}`

- [ ] **Step 4: Run all tests + typecheck + eyeball**

Run: `npx vitest run` — Expected: PASS.
Run: `npm run typecheck` — Expected: exit 0.
Dev server `?fixtures=1`: Models tab shows the ecosystem chip (non-zero byop from the google fixture rows), google rows basis `meter`, azure `gpt-5.5` basis `reg` with negative red margin, sorted worst-first; the `paid / quests` gauge renders right-anchored with the largest model's bar spanning the full track, hover tooltip shows exact percentages.

- [ ] **Step 5: Format and commit**

```bash
npx biome check --write apps/operation/treasury/web/src/views/ModelsTab.tsx apps/operation/treasury/web/src/views/ModelsTab.test.ts apps/operation/treasury/web/src/App.tsx
git add apps/operation/treasury/web/src/views/ModelsTab.tsx apps/operation/treasury/web/src/views/ModelsTab.test.ts apps/operation/treasury/web/src/App.tsx
git commit -m "add models unit economics insight tab"
```

---

### Task 9: Live verification sweep

**Files:** none created — verification only (fix anything found, in place).

- [ ] **Step 1: Full hermetic suite**

Run (cwd `web`): `npx vitest run` — Expected: ALL green.
Run: `npm run typecheck` — Expected: exit 0.
Run from repo root: `npx biome check apps/operation/treasury/web/src` — Expected: no diagnostics.

- [ ] **Step 2: Fixtures walkthrough**

`npm run dev` (background), open `http://127.0.0.1:4180/?fixtures=1`:
- Lands on Insights → P&L, filter row below the tabs, period picker only. May 26 has revenue/payroll/compute and NO ⚠; Jun 26 and later have ⚠. Clicking a month pill flips to the category × vendor drill-down with headline chips; the year pill restores the matrix; the selected month carries over to Vendors/Models.
- Vendors tab: vendor select appears; google Jun 26 spent ≈ $5,171 (4489.35 EUR × 1.1518), paid `–`.
- Models tab: ecosystem chip non-zero; sorted worst margin first; basis chips visible; zero console errors.
- Raw section: four original tabs render with the same data as before; category select only on Transactions.

- [ ] **Step 3: Live-data spot checks (password auth, real pipes)**

With the dev server running, log in with the treasury password (`sops -d apps/operation/treasury/secrets/web.json` → `TREASURY_PASSWORD`) and verify against Tinybird truths (fetch the pipe JSON with the read token from the same file):
- P&L June `compute` column ≈ Σ over June compute transactions of (paid_amount || charged_amount) converted at 1.1518 for EUR rows.
- Vendors June google `spent` == google June meter row: `(credit+paid) EUR × 1.1518`.
- Models June: every vendor with a June meter row shows basis `meter`; vendors present only in usage show `reg`; for one model, `retained == gross − (byop_paid + model_paid)` from the raw Pollen Usage tab.
- No row anywhere renders `$0` for a missing plane — must be `–`.

- [ ] **Step 4: Commit any fixes**

If steps 1–3 forced code changes, re-run the affected tests, then commit the touched files only: `git commit -m "polish insights rendering after live verification"`.

---

## Self-Review Notes

- Vocabulary: every identifier, prop, column, and prose line uses **vendor** (rename landed 2026-07-06); the insight tab is "Vendors".
- Ecosystem columns are consumed in T5 (`modelEconomics` retained/eco + `ecosystemTotals`) and rendered in T8; the usage test helper includes all four columns so `Partial<UsageMonthlyRow>` stays honest.
- Pollen vocabulary law applied: every Models column and every `ModelEconomics` field uses the pipes' `paid`/`quests` tokens (`gross_paid`, `eco_paid`, `retained_paid`, `gross_quests`; `grossQuestsUsd` not `questUsd`); the paid/quests gauge (`gaugeParts` + `PollenGauge`, sort key `paid_share`) is tested in T8 Step 1.
- Type names cross-checked: `PnlMonth`/`pnlByMonth`/`categoryColumns`/`totalsRow`/`MonthDetail`/`monthSpendDetail` (T3→T6), `VendorPlanes`/`vendorPlanes`/`insightVendorOptions` (T4→T6/T7), `ModelEconomics`/`modelEconomics`/`CostBasis`/`EcosystemTotals`/`ecosystemTotals` (T5→T8), `fmtUsd`/`fmtPct`/`fmtMultiplier` (T1→T6/7/8), `globalNetRatio`/`breakEvenMultiplier` (T2→T8).
- P&L dual mode: `PnlTab` dispatches BEFORE any hooks (month regex → `PnlMonthDetail`, else `PnlMatrix`) so React hook order stays stable when the period selection changes.
- FX values are real ECB monthly means (frankfurter.dev, pulled 2026-07-06); test expectations use those exact constants.
- Filter behavior: state global (persists across tabs and sections), rendering per-tab below the nav, matrix in Design decisions. The category select intentionally leaves Pollen Usage/Revenue.
- `matchesMonth` semantics (empty = all, year prefix, month prefix) reused verbatim from `lib/months.ts`.
