# Observability Dashboard Plan
 
> Economic observability for pollinations.ai — focus on paid vs free consumption, model economics, and developer value.

---
 
## Goal
 
Build a Grafana "control room" that answers:
1. How can we refactor free Pollen allocation and make it dynamic?
2. How do we allocate to the right people (the ones who are actually spending)?
3. How do we fund the right developers?
4. **Which free consumption converts to paid?** (new)
5. **Is usage developer-driven or end-user-driven (BYOP)?** (new)
 
**Guiding principles:**
- Keep it simple, high-level first, then drill down for details
- **Cost-weighted metrics** (not request counts) for all economic analysis
- Tiers are **diagnostic overlays**, not ground truth
- "Paid consumption" not "revenue" (since `price == cost` today)
 
---
 
## Data Sources
 
| Source | Purpose |
|--------|---------|
| **Tinybird `generation_event`** | Event-level telemetry: usage, pricing, balances, models, users, API key types |
| **D1 (Drizzle schema)** | User accounts, tiers, API keys, signup timestamps |
 
### Key Fields
 
| Field | Description |
|-------|-------------|
| `selected_meter_slug` | `local:pack` = paid, `local:tier` = free |
| `resolved_model_requested` | Canonical model name (use this for grouping) |
| `total_price` | Pollen consumed (= cost, no margin currently) |
| `user_id` / `user_github_username` | Developer identity |
| `user_tier` | SPORE, Seed, Flower, Nectar |
| `api_key_name` | App identifier |
| `api_key_type` | **`temporary`** = end-user (BYOP), **`secret`/`publishable`** = developer |

### Global Data Filters (Applied to ALL Queries)

Every query in the dashboard includes these baseline filters:

```sql
WHERE environment = 'production'
  AND response_status >= 200 AND response_status < 300  -- Only successful requests
  AND total_price > 0                                    -- Only billable events
  AND user_github_id != '241978997'                      -- Exclude ROUTER service account
  AND (start_time < '2025-12-30T16:59:45Z' 
       OR start_time > '2026-01-08T18:19:58Z')           -- Exclude bug window
```

| Filter | Rationale |
|--------|-----------|
| `environment = 'production'` | Exclude dev/staging noise |
| `response_status >= 200 AND < 300` | Only count successful generations (2xx) |
| `total_price > 0` | Only billable events (excludes free/error requests) |
| `user_github_id != '241978997'` | Exclude `pollen-router` internal service account |
| Bug window exclusion | `meter:combined` bug made paid/free indistinguishable |

### Data Quality Notes

| Issue | Decision |
|-------|----------|
| `meter:combined` bug (Dec 30 – Jan 8, ~9 days) | Exclude entirely — can't split pack/tier |
| `undefined` API key names (last: Dec 15) | Exclude from app-level, keep in system totals (0.07%) |
| BYOP data (`api_key_type`) | Label as "Early signal" — only ~3 weeks of data |
| ROUTER account (`pollen@myceli.ai`) | Exclude from all metrics — internal service traffic |

### ROUTER Service Account

The `pollen-router` account (`user_github_id = '241978997'`) is an internal service account that powers various pollinations.ai tools and integrations. As of Jan 2026, it accounts for **~16% of total consumption**.

**Exclusion:** All economics panels exclude ROUTER via `user_github_id != '241978997'` to show only external user behavior.

**Diagnostic panel:** "ROUTER Usage % Over Time" in the Diagnostics row shows:
- **Left axis (blue/orange):** Total Pollen and ROUTER Pollen amounts
- **Right axis (purple):** ROUTER % of total consumption
- **Expected trend:** Downward as external usage grows

```
Nov 12         Dec 15         Dec 30 ████ Jan 8        ~Jan 1         Present
  │              │               │   BUG   │             │               │
  ├─ meter:tier  ├─ last         └─────────┘             ├─ BYOP data    │
  ├─ meter:pack     undefined                               starts       │
                    API key                                              │
```
 
---
 
## Core Metrics (Standardized)

All panels use these **cost-weighted** definitions:

| Metric | Formula | Description |
|--------|---------|-------------|
| `pack_cost` | `SUM(total_price) WHERE selected_meter_slug = 'local:pack'` | Pollen from purchased packs |
| `tier_cost` | `SUM(total_price) WHERE selected_meter_slug = 'local:tier'` | Pollen from tier allocation |
| `total_cost` | `pack_cost + tier_cost` | Total consumption |
| `pack_share` | `pack_cost / total_cost` | % of consumption from packs |
| `tier_share` | `tier_cost / total_cost` | % of consumption from tier |

> **Note:** Request-count ratios may be shown as secondary context but are never the headline metric.

---
 
## Variables
 
| Variable | Source | Type | Purpose |
|----------|--------|------|---------|
| `$timeRange` | (built-in) | Time picker | Default: 1d, 7d, 30d, 90d |
| `$model` | `resolved_model_requested` | Multi-select | Filter by model(s) |
| `$user` | `user_github_username` | Searchable | Drill into specific developer |
| `$tier` | `user_tier` | Multi-select | Compare tiers |
| `$keyType` | `api_key_type` | Toggle | All / Developer / End-user (BYOP) |
| `$topN` | (static) | Number | Control ranking limits (5, 10, 20, 50) |
 
---
 
## Panels (Revised)

> **Design rationale:** Merged redundant panels, added BYOP and conversion tracking, switched to cost-weighted metrics, renamed "revenue" → "paid consumption".

---

### 1. Paid vs Free Consumption Over Time

| | |
|---|---|
| **Type** | Stacked area chart + overlaid line |
| **Description** | `paid_cost` (green) vs `free_cost` (orange) stacked over time, with `subsidy_intensity` (free%) as an overlaid line. Switchable windows: 24h, 7D, 30D, 90D. |
| **Why** | **North star panel.** Single view of paid vs subsidized dynamics. Replaces old panels 1 + 8. |
| **Variables** | timeRange, tier, keyType |
| **Metrics** | `paid_cost`, `free_cost`, `subsidy_intensity` |

---

### 2. BYOP Split: End-user vs Developer Economics

| | |
|---|---|
| **Type** | Grouped bar chart or stacked series |
| **Description** | Two series: **Developer keys** (`secret` + `publishable`) vs **End-user keys** (`temporary`). Each split into `paid_cost` and `free_cost`. |
| **Why** | Answers: "Is paid usage coming from developers themselves or their end users?" Critical for funding decisions. |
| **Variables** | timeRange, model |
| **Metrics** | `paid_cost`, `free_cost` grouped by `api_key_type` |
| **Note** | ⚠️ Limited data (~3 weeks). Label as "Early signal" until more data accumulates. |

---

### 3. Free→Paid Cohort Conversion ✅

| | |
|---|---|
| **Type** | Stat panels (4 stats in a row) |
| **Description** | True cohort conversion tracking: measures days between first tier use (≈ signup) → first pack use (≈ conversion). Shows Active Users, Converted within 7D, Converted within 30D, and Conversion Rate (7D). |
| **Why** | Answers "what % of users who start using the platform end up paying?" — core for dynamic tier allocation and growth analysis. |
| **Variables** | None (all-time metrics) |
| **Metrics** | `active_users`, `converted_7d`, `converted_30d`, `conversion_rate_7d` |
| **Implementation Notes** | Uses first tier event as signup proxy (if a user signs up but never uses the product, they're not counted). Avoids the flawed "paid-only users" metric which is structurally always 0 since tier is consumed before pack. |

---

### 4. Model Economics Leaderboard

| | |
|---|---|
| **Type** | Table |
| **Description** | Per `resolved_model_requested`: `total_cost`, `paid_cost`, `free_cost`, `paid_share`, `avg_cost_per_request`, `request_count` (secondary). **Default sort: `paid_share` descending** (most economically healthy first). |
| **Why** | One panel answers "which models are profitable" AND "which are subsidy sinks" + unit economics. |
| **Variables** | timeRange, tier, keyType, topN |
| **Metrics** | All core metrics + `avg_cost_per_request = total_cost / request_count` |

---

### 5. Top Models by Paid Consumption

| | |
|---|---|
| **Type** | Horizontal bar chart |
| **Description** | Top N models ranked by `paid_cost`. Shows where the money signal actually is. |
| **Why** | Quick visual of paying model distribution. |
| **Variables** | timeRange, tier, topN |
| **Metrics** | `paid_cost` |
| **Note** | "Paid consumption" = pack-funded usage, not literal cash-in. Users buy packs separately from spending them. |

---

### 6. Top Models by Subsidy Burn

| | |
|---|---|
| **Type** | Horizontal bar chart |
| **Description** | Top N models by `free_cost`. Includes % of total platform subsidy per model. |
| **Why** | Identifies candidates for throttling, pricing, or promotion to paid. |
| **Variables** | timeRange, tier, topN |
| **Metrics** | `free_cost`, `free_cost / total_platform_free_cost` |

---

### 7. Developer Economics Scatter ✅

| | |
|---|---|
| **Type** | XY Scatter plot |
| **Description** | **X** = `tier_cost` (Tier ρ), **Y** = `pack_cost` (Pack ρ). Each dot = one developer. Green color, hover shows developer name. |
| **Why** | Instantly see "who costs us money vs who funds themselves." Bottom-right = tier-heavy (subsidy risk), top-left = pack-efficient (valuable). |
| **Variables** | timeRange |
| **Metrics** | `tier_cost`, `pack_cost` per developer |
| **Note** | Color gradient by pack_share was attempted but Grafana XY charts create extra axes for color dimensions. Simplified to single green color. |

---

### 8. App Economy Leaderboard ✅

| | |
|---|---|
| **Type** | Table |
| **Description** | Columns: app → developer → Pack % → Total ρ → Pack ρ → Tier ρ → Requests. Sorted by Pack % descending. |
| **Why** | Finds which apps deserve promotion, support, or constraints. Economics-first, not volume. |
| **Variables** | timeRange |
| **Metrics** | `pack_share`, `total_cost`, `pack_cost`, `tier_cost`, `requests` per app |
| **Note** | Developer column shows app owner for context. Minimum threshold: 100 Pollen total. |

---

### 9. Developer Economics & Momentum

| | |
|---|---|
| **Type** | Table |
| **Description** | Per user: `paid_cost`, `free_cost`, `paid_share`, `active_days_30D`, `momentum` (7D paid / 30D paid), `end_user_share`. |
| **Why** | Direct input to "fund the right developers" + tier redesign. Momentum identifies rising stars. |
| **Variables** | timeRange, model, topN |
| **Metrics** | All core metrics + `momentum = paid_cost_7D / paid_cost_30D`, `active_days_30D` |
| **Note** | ⚠️ **Minimum volume threshold required** (e.g., `paid_cost_30D > 10 Pollen`) to avoid ratio noise from tiny users. |

---

### 10. Tier Overlay Diagnostic

| | |
|---|---|
| **Type** | Box plot or violin plot |
| **Description** | Distribution of `paid_share` within each tier (SPORE, Seed, Flower, Nectar). Shows overlap between tiers. |
| **Why** | Tests if current tiers reflect economic reality. Heavy overlap = tiers need redesign. |
| **Variables** | timeRange, model |
| **Metrics** | `paid_share` distribution per `user_tier` |
| **Note** | ⚠️ **Diagnostic only.** Tiers are not ground truth — this panel validates or invalidates them. |

---

## Panel Summary

| # | Panel | Core Question | Change from v1 |
|---|-------|---------------|----------------|
| 1 | Pack vs Tier Consumption Over Time | How much is pack vs tier? | ✅ Done |
| 2 | BYOP Split | Is usage developer-driven or end-user-driven? | ✅ Done |
| 3 | Tier→Pack Cohort Conversion | What % of users convert within 7D/30D? | ✅ Done |
| 4 | Model Economics Leaderboard | Which models are economically healthy? | ✅ Done |
| 5 | Top Models by Pack Usage | Where does pack consumption come from? | ✅ Done |
| 6 | Top Models by Tier Usage | Where does tier consumption go? | ✅ Done |
| 7 | Developer Economics Scatter | Who's valuable vs tier-heavy? | ✅ Done |
| 8 | App Economy Leaderboard | Which apps matter economically? | ✅ Done |
| 9 | Developer Economics & Momentum | Who should we fund? Who's rising? | ⏳ Pending |
| 10 | Tier Overlay Diagnostic | Does our tier system make sense? | ⏳ Pending |

---

## Implementation Status

1. [x] Confirm Tinybird `generation_event` schema field names
2. [x] Set up Grafana datasource (Tinybird UID: `PAD1A0A25CD30D456`)
3. [x] Build dashboard with variables (`$model`, `$tier`, `$keyType`, `$topN`)
4. [x] **Panel #1**: Pack vs Tier Consumption Over Time — timeseries with stacked areas + Tier % line
5. [x] **Panel #2**: BYOP Split — combo chart (bars + line) showing developer vs end-user economics
6. [x] **Panel #3**: Tier→Pack Cohort Conversion — stat panels with true 7D/30D conversion tracking
7. [x] **Panel #4**: Model Economics Leaderboard — table with pack/tier split per model
8. [x] **Panel #5**: Top Models by Pack Usage — table ranked by pack consumption
9. [x] **Panel #6**: Top Models by Tier Usage — table ranked by tier consumption
10. [x] **Panel #7**: Developer Economics Scatter — XY scatter (tier vs pack)
11. [x] **Panel #8**: App Economy Leaderboard — table with developer, pack %, economics
12. [x] **Diagnostics**: ROUTER Usage % Over Time — monitors internal service account
13. [ ] **Panel #9**: Developer Economics & Momentum
14. [ ] **Panel #10**: Tier Overlay Diagnostic

## Learnings & Decisions

- **Panel type**: Use `timeseries` with `custom.drawStyle` overrides for combo charts (bars + line), not `barchart`
- **Percentage formatting**: Use `percentunit` (expects 0-1 from SQL), not `percent`
- **Legend calcs**: Use `sum` for costs, `mean` for percentages
- **Conversion tracking**: "Paid-only users" is structurally always 0 (tier consumed before pack), so use first-use cohort approach instead
- **Signup proxy**: First tier event = first use = signup (users who sign up but never use aren't counted)

## Open Questions

- [ ] Minimum volume thresholds for momentum/leaderboard panels