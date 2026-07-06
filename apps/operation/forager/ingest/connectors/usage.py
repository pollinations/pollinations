"""Usage connector: pull generation_event from Tinybird pollinations_enter prod.

monthly_rows(tb_prod, months, today) -> list[dict]

Produces pollen_monthly rows (full-replace datasource) by querying the
generation_event pipe in the pollinations_enter production workspace.

One SQL query per month (timeout safety — never one giant scan).
The TB instance passed in is pointed at pollinations_enter prod and uses
TINYBIRD_PROD_READ_TOKEN (read-only SQL API).
"""


def _next_month(month: str) -> str:
    """Return the first day of the month following month ('YYYY-MM').

    Handles year wrap: 2026-12 -> 2027-01.
    """
    y, m = int(month[:4]), int(month[5:7])
    if m == 12:
        return f"{y + 1:04d}-01"
    return f"{y:04d}-{m + 1:02d}"


# NOTE: `model_provider_used` is the PROD generation-event column name; it is
# mapped to the forager `vendor` row key at ingest and must NOT be renamed here.
_SQL = """\
SELECT '{month}' AS month, model_provider_used AS vendor, model_used AS model,
  round(sumIf(total_cost, selected_meter_slug LIKE '%pack%'), 4) AS cost_paid,
  round(sumIf(total_cost, selected_meter_slug LIKE '%tier%'), 4) AS cost_quests,
  round(sumIf(total_price, selected_meter_slug LIKE '%pack%'), 4) AS price_paid,
  round(sumIf(total_price, selected_meter_slug LIKE '%tier%'), 4) AS price_quests,
  round(sumIf(total_price - dev_price, selected_meter_slug LIKE '%pack%' AND markup_rate > 0), 4) AS byop_paid,
  round(sumIf(total_price - dev_price, selected_meter_slug LIKE '%tier%' AND markup_rate > 0), 4) AS byop_quests,
  round(sumIf(community_model_reward_amount, selected_meter_slug LIKE '%pack%'), 4) AS model_paid,
  round(sumIf(community_model_reward_amount, selected_meter_slug LIKE '%tier%'), 4) AS model_quests
FROM generation_event
WHERE environment = 'production'
  AND is_billed_usage = true
  AND response_status >= 200 AND response_status < 300
  AND model_used != 'undefined'
  AND model_provider_used != 'undefined'
  AND start_time >= '{month}-01 00:00:00' AND start_time < '{next_month}-01 00:00:00'
GROUP BY vendor, model\
"""


def monthly_rows(tb_prod, months, today):
    """Fetch pollen_monthly rows from pollinations_enter prod for each month.

    Args:
        tb_prod:  ingest.tb.TB instance pointed at pollinations_enter prod
                  (TINYBIRD_PROD_READ_TOKEN). Only .sql(query) is called.
        months:   list of "YYYY-MM" strings to query
        today:    current ingest date

    Returns:
        list of pollen_monthly row dicts, one per (month, vendor, model) tuple
        with nonzero data. vendor tags are canonicalized via vendor aliases
        (bedrock/aws-bedrock → aws, azure-2 → azure, vastai → vast.ai).
    """
    from ..aliases import VENDOR_ALIASES, canonical_vendor_tag

    numeric_fields = (
        "cost_paid",
        "cost_quests",
        "price_paid",
        "price_quests",
        "byop_paid",
        "byop_quests",
        "model_paid",
        "model_quests",
    )
    by_key = {}
    for month in months:
        next_m = _next_month(month)
        query = _SQL.format(month=month, next_month=next_m)
        result = tb_prod.sql(query)
        for raw in result:
            # Guard against None/missing fields, but reject non-empty tags that
            # are not in the vendor vocabulary. That makes missing aliases
            # visible in ingest_runs instead of silently becoming filter values.
            raw_vendor = raw.get("vendor")
            vendor = canonical_vendor_tag(raw_vendor)
            if vendor and vendor not in VENDOR_ALIASES:
                raise ValueError(
                    "unknown vendor slug for pollen_monthly: "
                    f"{raw_vendor!r}; add it to config/vendor_aliases.json"
                )
            key = (month, vendor, raw.get("model"))
            row = by_key.setdefault(
                key,
                {
                    "month": month,
                    "vendor": vendor,
                    "model": raw.get("model"),
                    "currency": "POLLEN",
                    **{field: 0 for field in numeric_fields},
                },
            )
            for field in numeric_fields:
                row[field] += raw.get(field) or 0

    return [
        {
            "month": month,
            "vendor": vendor,
            "model": model,
            **values,
        }
        for (month, vendor, model), values in by_key.items()
    ]
