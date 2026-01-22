# Grafana Dashboard Guide: Pitfalls & Best Practices

> Lessons learned from building the pollinations.ai Economics Dashboard

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
Meter slugs changed over time (`v1:meter:tier` → `local:tier`). Using wrong values returns zero data.

### ✅ Do: Use `IN` clauses for compatibility
```sql
WHERE selected_meter_slug IN ('v1:meter:pack', 'local:pack')
```

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
Example: "Paid-only users" in a system where free tier is consumed before paid pack.

**Business rule**: Everyone gets free Pollen → Tier consumed first → Pack consumed second.
**Result**: "Paid-only users" = 0 always (impossible to use pack without first touching tier).

### ✅ Do: Model the actual user journey
Use cohort-based conversion: measure time from **first tier use** to **first pack use**.

```sql
-- Cohort conversion: users who converted within 7 days
SELECT 
  countIf(first_pack IS NOT NULL 
    AND dateDiff('day', first_tier, first_pack) <= 7) as converted_7d
FROM (
  SELECT 
    user_github_id,
    minIf(start_time, selected_meter_slug IN ('v1:meter:tier', 'local:tier')) as first_tier,
    minIf(start_time, selected_meter_slug IN ('v1:meter:pack', 'local:pack')) as first_pack
  FROM generation_event
  WHERE environment = 'production' AND total_price > 0
  GROUP BY user_github_id
  HAVING first_tier IS NOT NULL
)
```

### ✅ Do: Use first activity as signup proxy
If users who sign up but never use the product aren't meaningful, use **first event** as signup date instead of actual signup timestamp. This avoids cross-datasource joins and focuses on active users.

---

## Data Quality Filters

### ❌ Don't: Forget to exclude known bad data
Bug windows, undefined values, and non-production data skew results.

### ✅ Do: Build global filters into every query
```sql
WHERE $__timeFilter(start_time)
  AND environment = 'production'
  AND response_status >= 200 AND response_status < 300
  AND total_price > 0
  AND (start_time < toDateTime('2025-12-30 16:59:45') 
       OR start_time > toDateTime('2026-01-08 18:19:58'))
```

---

## Dashboard Variables

### ❌ Don't: Assume MCP can write to provisioned dashboards
Provisioned dashboards from JSON files are read-only via API.

### ✅ Do: Edit JSON files directly for provisioned dashboards
Variables go in `templating.list`:
```json
"templating": {
  "list": [
    {
      "name": "model",
      "type": "query",
      "datasource": { "uid": "YOUR_DATASOURCE_UID" },
      "query": "SELECT DISTINCT model FROM events",
      "refresh": 2,
      "includeAll": true,
      "multi": true
    }
  ]
}
```

---

## Workflow

1. **Edit JSON** → Save file
2. **Restart Grafana** → `docker compose restart grafana`
3. **Hard refresh browser** → Cmd+Shift+R
4. **Check for errors** → `docker logs grafana | grep -i error`

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

## Terminology: Pack vs Tier

Use consistent terminology across all panels:

| Internal Field | Display Name | Meaning |
|----------------|--------------|---------|
| `paid_cost` | **Pack ρ** | Pollen from purchased packs |
| `free_cost` | **Tier ρ** | Pollen from tier allocation |
| `paid_share` | **Pack %** | % of consumption from packs |

**Never use:** "paid/free", "revenue/subsidy" in user-facing labels.

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
