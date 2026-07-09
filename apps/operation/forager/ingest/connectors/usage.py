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
#
# Slug mapping: pack = Pollen Paid, tier = Pollen Quest. Everything else
# (`local:combined` — the pre-bucket metering week, exactly 2026-01-01..08,
# $21.3k — plus crypto crumbs) lands in the *_other columns and is split into
# paid/quests in monthly_rows by the observed paid/quest trend (Elliot's
# ruling 2026-07-07); dropping it silently was a $21k hole in pollen_monthly.
_SQL = """\
SELECT '{month}' AS month, model_provider_used AS vendor, model_used AS model,
  round(sumIf(total_cost, selected_meter_slug LIKE '%pack%'), 4) AS cost_paid,
  round(sumIf(total_cost, selected_meter_slug LIKE '%tier%'), 4) AS cost_quests,
  round(sumIf(total_cost, selected_meter_slug NOT LIKE '%pack%' AND selected_meter_slug NOT LIKE '%tier%'), 4) AS cost_other,
  round(sumIf(total_price, selected_meter_slug LIKE '%pack%'), 4) AS price_paid,
  round(sumIf(total_price, selected_meter_slug LIKE '%tier%'), 4) AS price_quests,
  round(sumIf(total_price, selected_meter_slug NOT LIKE '%pack%' AND selected_meter_slug NOT LIKE '%tier%'), 4) AS price_other,
  round(sumIf(total_price - dev_price, selected_meter_slug LIKE '%pack%' AND markup_rate > 0), 4) AS byop_paid,
  round(sumIf(total_price - dev_price, selected_meter_slug LIKE '%tier%' AND markup_rate > 0), 4) AS byop_quests,
  round(sumIf(total_price - dev_price, selected_meter_slug NOT LIKE '%pack%' AND selected_meter_slug NOT LIKE '%tier%' AND markup_rate > 0), 4) AS byop_other,
  round(sumIf(community_model_reward_amount, selected_meter_slug LIKE '%pack%'), 4) AS model_paid,
  round(sumIf(community_model_reward_amount, selected_meter_slug LIKE '%tier%'), 4) AS model_quests,
  round(sumIf(community_model_reward_amount, selected_meter_slug NOT LIKE '%pack%' AND selected_meter_slug NOT LIKE '%tier%'), 4) AS model_other,
  countIf(cache_hit = false AND selected_meter_slug LIKE '%pack%') AS requests_paid,
  countIf(cache_hit = false AND selected_meter_slug LIKE '%tier%') AS requests_quests,
  countIf(cache_hit = false AND selected_meter_slug NOT LIKE '%pack%' AND selected_meter_slug NOT LIKE '%tier%') AS requests_other,
  countIf(cache_hit = false) AS requests
FROM generation_event
WHERE environment = 'production'
  AND is_billed_usage = true
  AND response_status >= 200 AND response_status < 300
  AND model_used != 'undefined'
  AND model_provider_used != 'undefined'
  AND start_time >= '{month}-01 00:00:00' AND start_time < '{next_month}-01 00:00:00'
GROUP BY vendor, model\
"""

# Field pairs whose *_other slice gets split by the paid/quest ratio.
_SPLIT_FIELDS = ("cost", "price", "byop", "model")


def _paid_share(paid, quests):
    """Paid fraction of classified usage; None when nothing is classified."""
    total = paid + quests
    return paid / total if total > 0 else None


def _split_other(rows):
    """Split every row's *_other amounts into paid/quests in place.

    Ratio waterfall, closest trend first (all cost-based): the row's own
    classified paid/quest split → the vendor's month split → the month's
    global split → all quests (the combined week was the drip era; its
    price ≈ cost, so the choice is margin-neutral either way).
    Consumes (removes) the *_other keys.
    """
    vendor_totals = {}
    month_totals = {}
    for row in rows:
        vk = (row["month"], row["vendor"])
        vp, vq = vendor_totals.get(vk, (0.0, 0.0))
        vendor_totals[vk] = (vp + row["cost_paid"], vq + row["cost_quests"])
        mp, mq = month_totals.get(row["month"], (0.0, 0.0))
        month_totals[row["month"]] = (mp + row["cost_paid"], mq + row["cost_quests"])

    for row in rows:
        ratio = _paid_share(row["cost_paid"], row["cost_quests"])
        if ratio is None:
            ratio = _paid_share(*vendor_totals[(row["month"], row["vendor"])])
        if ratio is None:
            ratio = _paid_share(*month_totals[row["month"]])
        if ratio is None:
            ratio = 0.0
        for field in _SPLIT_FIELDS:
            other = row.pop(f"{field}_other", 0) or 0
            if other:
                row[f"{field}_paid"] = round(row[f"{field}_paid"] + other * ratio, 4)
                row[f"{field}_quests"] = round(
                    row[f"{field}_quests"] + other * (1 - ratio), 4
                )
        requests_other = int(row.pop("requests_other", 0) or 0)
        classified_requests = row["requests_paid"] + row["requests_quests"] + requests_other
        if requests_other:
            requests_paid = int(round(requests_other * ratio))
            row["requests_paid"] += requests_paid
            row["requests_quests"] += requests_other - requests_paid
        if classified_requests:
            row["requests"] = row["requests_paid"] + row["requests_quests"]
        else:
            row["requests_paid"] = int(row.get("requests") or 0)
            row["requests_quests"] = 0
    return rows


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
        (bedrock/aws-bedrock → aws, vastai → vast.ai, azure-2/bpai →
        pointsflyer: the collaborator's gifted compute, all credit).
    """
    from ..aliases import VENDOR_ALIASES, canonical_vendor_tag

    numeric_fields = (
        "cost_paid",
        "cost_quests",
        "cost_other",
        "price_paid",
        "price_quests",
        "price_other",
        "byop_paid",
        "byop_quests",
        "byop_other",
        "model_paid",
        "model_quests",
        "model_other",
        "requests_paid",
        "requests_quests",
        "requests_other",
        "requests",
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

    return _split_other([
        {
            "month": month,
            "vendor": vendor,
            "model": model,
            **values,
        }
        for (month, vendor, model), values in by_key.items()
    ])
