# Grafana Dashboard Guide: Pitfalls & Best Practices

> Lessons learned from building the pollinations.ai Observability Dashboard

---

## Panel Types & Visualization

### ❌ Don't: Use `barchart` type for combo charts
Bar chart panels cannot overlay lines. If you need bars + line, use `timeseries`.

### ✅ Do: Use `timeseries` with `drawStyle` overrides
```json
{
  "type": "timeseries",
  "fieldConfig": {
    "overrides": [
      {
        "matcher": { "id": "byName", "options": "my_bar_series" },
        "properties": [
          { "id": "custom.drawStyle", "value": "bars" },
          { "id": "custom.fillOpacity", "value": 80 }
        ]
      },
      {
        "matcher": { "id": "byName", "options": "my_line_series" },
        "properties": [
          { "id": "custom.drawStyle", "value": "line" },
          { "id": "custom.axisPlacement", "value": "right" }
        ]
      }
    ]
  }
}
```

---

## Percentage Formatting

### ❌ Don't: Double-multiply percentages
If your SQL returns `0.85` (decimal), don't also multiply by 100 in SQL. Grafana's `percentunit` already handles the conversion.

| SQL returns | Unit setting | Display |
|-------------|--------------|---------|
| `0.85` | `percentunit` | `85%` ✅ |
| `85` | `percentunit` | `8500%` ❌ |
| `0.85` | `percent` | `0.85%` ❌ |

### ✅ Do: Match SQL output to unit type
- SQL returns **0-1 decimal** → use `"unit": "percentunit"`
- SQL returns **0-100 number** → use `"unit": "percent"`
- Set `"max": 1` for percentunit, `"max": 100` for percent

---

## Legend Calculations

### ❌ Don't: Sum percentages
Summing daily percentages produces meaningless numbers (e.g., "4922%").

### ✅ Do: Use appropriate calcs per metric type
```json
"legend": {
  "calcs": ["sum", "mean"],
  "displayMode": "table"
}
```
- **sum**: Good for cumulative values (Pollen consumed)
- **mean**: Good for percentages and ratios

---

## X-Axis Labels

### ❌ Don't: Show every data point label
With 60+ days of data, labels overlap and become unreadable.

### ✅ Do: Increase label spacing
```json
"options": {
  "xTickLabelRotation": 0,
  "xTickLabelSpacing": 200
}
```
This shows ~1 label per week instead of per day.

---

## Panel Descriptions

### ❌ Don't: Use `\\n` for newlines in JSON
Grafana doesn't render escaped newlines in tooltips—they appear as literal `\n`.

### ✅ Do: Keep descriptions concise and single-line
```json
"description": "Daily Pollen: Paid (green) vs Free (orange). Subsidy % (red) = free share. Excludes Dec 30–Jan 8 bug window."
```

---

## ClickHouse/Tinybird Queries

### ❌ Don't: Guess field values
Meter slugs changed over time. Using one historical value can silently return incomplete data.

### ✅ Do: Use `IN` clauses for compatibility
```sql
WHERE selected_meter_slug IN ('v1:meter:pack', 'local:pack')
```

Keep legacy wire names inside SQL only. Display them as **Paid** and **Quest**.

### ❌ Don't: Forget time filters
Queries without `$__timeFilter()` return all data regardless of dashboard time picker.

### ✅ Do: Always include Grafana time macros
```sql
WHERE $__timeFilter(start_time)
  AND environment = 'production'
```

---

## Dual Y-Axis Panels

### ❌ Don't: Forget to set axis placement
Without explicit placement, all series use left axis.

### ✅ Do: Configure right axis in overrides
```json
{
  "matcher": { "id": "byName", "options": "percentage_series" },
  "properties": [
    { "id": "custom.axisPlacement", "value": "right" },
    { "id": "custom.axisLabel", "value": "%" },
    { "id": "unit", "value": "percentunit" },
    { "id": "min", "value": 0 },
    { "id": "max", "value": 1 }
  ]
}
```

---

## Hiding Helper Columns

### ❌ Don't: Show intermediate calculated columns
Columns like `developer_total` used only for percentage calculation clutter the legend.

### ✅ Do: Hide them with overrides
```json
{
  "matcher": { "id": "byName", "options": "developer_total" },
  "properties": [
    { "id": "custom.hideFrom", "value": { "legend": true, "tooltip": true, "viz": true } }
  ]
}
```

---

## Stacking

### ❌ Don't: Stack percentage lines with absolute values
Percentages on a different scale shouldn't be stacked with Pollen values.

### ✅ Do: Disable stacking for overlay lines
```json
{ "id": "custom.stacking", "value": { "mode": "none" } }
```

---

## Conversion & Business Logic Metrics

### ❌ Don't: Design metrics that are structurally always zero
Example: "Paid-only users" in a system where Quest balance is consumed before Paid balance.

**Business rule**: Everyone gets Quest Pollen → Quest consumed first → Paid consumed second.
**Result**: "Paid-only users" = 0 always (impossible to use Paid without first touching Quest).

### ✅ Do: Model the actual user journey
Use cohort-based conversion: measure time from **first Quest use** to **first Paid use**.

```sql
-- Cohort conversion: users who converted within 7 days
SELECT 
  countIf(first_paid IS NOT NULL
    AND dateDiff('day', first_quest, first_paid) <= 7) as converted_7d
FROM (
  SELECT 
    user_github_id,
    minIf(start_time, selected_meter_slug IN ('v1:meter:tier', 'local:tier')) as first_quest,
    minIf(start_time, selected_meter_slug IN ('v1:meter:pack', 'local:pack')) as first_paid
  FROM generation_event
  WHERE environment = 'production' AND total_price > 0
  GROUP BY user_github_id
  HAVING first_quest IS NOT NULL
)
```

### ✅ Do: Use first activity as signup proxy
If users who sign up but never use the product aren't meaningful, use **first event** as signup date instead of actual signup timestamp. This avoids cross-datasource joins and focuses on active users.

---

## Data Quality Filters

### ❌ Don't: Forget scope and history boundaries
Undefined values, non-production data, and the known January window skew results.

### ✅ Do: Build global filters into every query
```sql
WHERE $__timeFilter(start_time)
  AND environment = 'production'
  AND start_time >= toDateTime('2026-01-09 00:00:00')
  AND response_status >= 200 AND response_status < 300
  AND is_billed_usage
```

The rebuilt aggregates additionally retain `debug-prod-copy` as an isolated
Tinybird-staging fixture dimension. Local Grafana queries may select it; live
production results must select `production`.

---

## Dashboard Variables

This dashboard uses only the **built-in time range picker** (default: 30 days). Custom filter variables were intentionally removed to keep the dashboard simple and focused on answering strategic questions rather than ad-hoc filtering.

If you need to add variables in the future, edit the `templating.list` array in the dashboard JSON file directly (provisioned dashboards are read-only via API).

---

## Workflow

1. **Edit Tinybird datafiles locally**
2. **Validate and create a deployment in `pollinations_enter_staging`**
3. **Promote inside the Tinybird staging workspace only after explicit approval**
4. **Run Grafana locally with the staging read token**
5. **Edit dashboard JSON and restart local Grafana**
6. **Hard refresh browser and check container logs**

Do not deploy a Pollinations staging app for this workflow. Do not deploy or
promote Tinybird production assets unless the user explicitly requests it.

---

## XY Scatter Charts

### ❌ Don't: Use color dimension for continuous gradients
Grafana XY charts create a **separate Y-axis** for any field used as the color dimension, even if you only want it for coloring dots.

### ✅ Do: Use fixed colors for scatter plots
```json
{
  "fieldConfig": {
    "defaults": {
      "color": { "mode": "fixed", "fixedColor": "green" }
    }
  },
  "options": {
    "dims": { "x": "tier_cost", "y": "pack_cost" }
  }
}
```

If you need color gradients, consider using a table with color-coded cells instead.

---

## Terminology: Paid vs Quest

Use consistent terminology across all panels:

| Internal Field | Display Name | Meaning |
|----------------|--------------|---------|
| `pack_balance`, `v1:meter:pack` | **Paid Pollen** | Pollen purchased by the user |
| `tier_balance`, `v1:meter:tier` | **Quest Pollen** | Pollen granted through quests or other free funding |
| `paid_share` | **Paid share** | Share of consumption funded by Paid Pollen |

The `tier` and `pack` names survive only in legacy wire fields and meter slugs.
Never display **Tier**, **Pack**, or tier-plan names in the rebuilt dashboards.
Paid consumption is revenue-bearing usage; Quest consumption is not revenue.

---

## Quick Reference: Common Override Properties

| Property | Values | Use case |
|----------|--------|----------|
| `custom.drawStyle` | `line`, `bars`, `points` | Chart type per series |
| `custom.fillOpacity` | `0-100` | Area fill transparency |
| `custom.axisPlacement` | `left`, `right`, `hidden` | Dual axis |
| `custom.stacking` | `{ "mode": "normal" }` or `{ "mode": "none" }` | Stack control |
| `custom.lineWidth` | `1-10` | Line thickness |
| `custom.hideFrom` | `{ "legend": true, "tooltip": true, "viz": true }` | Hide series |
| `unit` | `short`, `percent`, `percentunit`, `currencyUSD` | Value formatting |
| `displayName` | string | Legend label |
| `color` | `{ "fixedColor": "green", "mode": "fixed" }` | Series color |
