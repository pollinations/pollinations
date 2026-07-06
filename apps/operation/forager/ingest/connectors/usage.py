"""Usage connector: pull generation_event from Tinybird pollinations_enter prod.

monthly_rows(tb_prod, months, today) -> list[dict]

Produces usage_monthly rows (full-replace datasource) by querying the
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


_SQL = """\
SELECT '{month}' AS month, model_provider_used AS provider, model_used AS model,
  round(sumIf(total_cost, selected_meter_slug LIKE '%pack%'), 4) AS cost_paid_pollen,
  round(sumIf(total_cost, selected_meter_slug LIKE '%tier%'), 4) AS cost_quest_pollen,
  round(sumIf(total_price, selected_meter_slug LIKE '%pack%'), 4) AS billable_paid_pollen,
  round(sumIf(total_price, selected_meter_slug LIKE '%tier%'), 4) AS billable_quest_pollen
FROM generation_event
WHERE environment = 'production'
  AND is_billed_usage = true
  AND response_status >= 200 AND response_status < 300
  AND model_used != 'undefined'
  AND model_provider_used != 'undefined'
  AND start_time >= '{month}-01 00:00:00' AND start_time < '{next_month}-01 00:00:00'
GROUP BY provider, model\
"""


def monthly_rows(tb_prod, months, today):
    """Fetch usage_monthly rows from pollinations_enter prod for each month.

    Args:
        tb_prod:  ingest.tb.TB instance pointed at pollinations_enter prod
                  (TINYBIRD_PROD_READ_TOKEN). Only .sql(query) is called.
        months:   list of "YYYY-MM" strings to query
        today:    current ingest date

    Returns:
        list of usage_monthly row dicts, one per (month, provider, model) tuple
        with nonzero data. provider tags are canonicalized via provider aliases
        (bedrock/aws-bedrock → aws, azure-2 → azure, vastai → vast.ai).
    """
    from ..aliases import PROVIDER_ALIASES, canonical_provider_tag

    numeric_fields = (
        "cost_paid_pollen",
        "cost_quest_pollen",
        "billable_paid_pollen",
        "billable_quest_pollen",
    )
    by_key = {}
    for month in months:
        next_m = _next_month(month)
        query = _SQL.format(month=month, next_month=next_m)
        result = tb_prod.sql(query)
        for raw in result:
            # Guard against None/missing fields, but reject non-empty tags that
            # are not in the provider vocabulary. That makes missing aliases
            # visible in ingest_runs instead of silently becoming filter values.
            raw_provider = raw.get("provider")
            provider = canonical_provider_tag(raw_provider)
            if provider and provider not in PROVIDER_ALIASES:
                raise ValueError(
                    "unknown provider slug for usage_monthly: "
                    f"{raw_provider!r}; add it to config/provider_aliases.json"
                )
            key = (month, provider, raw.get("model"))
            row = by_key.setdefault(
                key,
                {
                    "month": month,
                    "provider": provider,
                    "model": raw.get("model"),
                    **{field: 0 for field in numeric_fields},
                },
            )
            for field in numeric_fields:
                row[field] += raw.get(field) or 0

    return [
        {
            "month": month,
            "provider": provider,
            "model": model,
            **values,
        }
        for (month, provider, model), values in by_key.items()
    ]
