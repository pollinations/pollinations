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
  countIf(selected_meter_slug LIKE '%pack%') AS billable_requests_paid_pollen,
  countIf(selected_meter_slug LIKE '%tier%') AS billable_requests_quest_pollen,
  round(sumIf(total_cost, selected_meter_slug LIKE '%pack%'), 4) AS cost_paid_pollen,
  round(sumIf(total_cost, selected_meter_slug LIKE '%tier%'), 4) AS cost_quest_pollen,
  round(sumIf(total_price, selected_meter_slug LIKE '%pack%'), 4) AS billable_paid_pollen,
  round(sumIf(total_price, selected_meter_slug LIKE '%tier%'), 4) AS billable_quest_pollen
FROM generation_event
WHERE environment = 'production'
  AND start_time >= '{month}-01 00:00:00' AND start_time < '{next_month}-01 00:00:00'
GROUP BY provider, model\
"""


def monthly_rows(tb_prod, months, today):
    """Fetch usage_monthly rows from pollinations_enter prod for each month.

    Args:
        tb_prod:  ingest.tb.TB instance pointed at pollinations_enter prod
                  (TINYBIRD_PROD_READ_TOKEN). Only .sql(query) is called.
        months:   list of "YYYY-MM" strings to query
        today:    retrieved_at date string "YYYY-MM-DD"

    Returns:
        list of usage_monthly row dicts, one per (month, provider, model) tuple
        with nonzero data. provider is canonicalized via burn.CANON
        (bedrock/aws-bedrock → aws, azure-2 → azure, vastai → vast.ai).
    """
    from ..burn import CANON

    rows = []
    for month in months:
        next_m = _next_month(month)
        query = _SQL.format(month=month, next_month=next_m)
        result = tb_prod.sql(query)
        for raw in result:
            # Guard against None/missing fields — keep verbatim, no fabricated placeholders
            row = {
                "month": month,
                "provider": CANON.get(
                    (raw.get("provider") or "").strip().lower(), raw.get("provider")
                ),
                "model": raw.get("model"),
                "billable_requests_paid_pollen": raw.get(
                    "billable_requests_paid_pollen"
                ),
                "billable_requests_quest_pollen": raw.get(
                    "billable_requests_quest_pollen"
                ),
                "cost_paid_pollen": raw.get("cost_paid_pollen"),
                "cost_quest_pollen": raw.get("cost_quest_pollen"),
                "billable_paid_pollen": raw.get("billable_paid_pollen"),
                "billable_quest_pollen": raw.get("billable_quest_pollen"),
            }
            rows.append(row)
    return rows
