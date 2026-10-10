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
"description": "Daily Pollen: Paid (green) vs Quest (orange)."
```

---

## ClickHouse/Tinybird Queries

### Generation events: V2 only

`generation_event` V1 is retired. All observability dashboards and Tinybird queries must read from `generation_event_v2`; never restore or add a V1 fallback.

### Product-path attribution

BYOP and BYOM are independent dimensions: BYOP is end-user-authenticated consumption inside a developer app (`is_byop`), while BYOM is any community-model consumption (`is_community`). Direct API is neither BYOP nor BYOM. Additive product-path charts must expose four mutually exclusive paths—Direct API, BYOM direct, BYOP with Pollinations models, and BYOP with BYOM—and treat Paid versus Quest as a separate funding dimension.

### Active users and apps: funded requests only

The `users` and `apps` states in `generation_usage_hourly` and `byop_app_daily` count every request, including requests rejected with a 402 for lack of Pollen. Count active users and apps with `funding_source != 'unfunded'`, for example `uniqMergeIf(users, funding_source != 'unfunded')` or `uniqIfMergeIf(apps, funding_source != 'unfunded')`. Without the filter, WAU runs about 24% above the KPI app's WAU.

### ❌ Don't: Guess field values
A wrong value returns zero rows. Check the live values before filtering on a column.

### ✅ Do: Split funding with `funding_source`
`generation_usage_hourly` and `byop_app_daily` carry `funding_source` (`paid`, `quest`, `unfunded`), mapped from `selected_meter_slug` by their materialized pipes in `enter.pollinations.ai/observability/materializations/`. Filter on it instead of on meter slugs.

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
    user_id,
    minIf(start_time, selected_meter_slug = 'v1:meter:tier') as first_tier,
    minIf(start_time, selected_meter_slug = 'v1:meter:pack') as first_pack
  FROM generation_event_v2
  WHERE environment = 'production' AND total_price > 0
  GROUP BY user_id
  HAVING first_tier IS NOT NULL
)
```

### ✅ Do: Use first activity as signup proxy
If users who sign up but never use the product aren't meaningful, use **first event** as signup date instead of actual signup timestamp. This avoids cross-datasource joins and focuses on active users.

---

## Dashboard Variables

Every dashboard shows the **last 30 complete UTC days**: `"time": {"from": "now-30d/d", "to": "now-1d/d"}`, `"timezone": "utc"` and `"refresh": "1h"`, so no generation-data bar is a partial day and Grafana's days match the SQL's UTC days (Registrations' last bar fills in at the ~03:20 UTC d1_user sync). The app embeds Grafana in kiosk mode, which hides the time picker; its header picker sends 7, 30 or 90 days instead as `from=now-<n>d/d&to=now-1d/d` on the iframe URL, with 30 days as the default. Custom filter variables were intentionally removed to keep the dashboards simple and focused on answering strategic questions rather than ad-hoc filtering.

If you need to add variables in the future, edit the `templating.list` array in the dashboard JSON file directly (provisioned dashboards are read-only via API).

---

## Workflow

1. **Edit the dashboard JSON** in `provisioning/dashboards/` (Grafana refuses UI saves of provisioned dashboards)
2. **Run `npm test`** in `operations/observability`
3. **Deploy** through `.github/workflows/deploy-applications.yml` from `production`; Grafana loads the files on start

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
