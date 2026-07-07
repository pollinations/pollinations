"""Community models meter connector.

Community vendors are users who deploy their own models through our API and
earn pollen when the model is used (75% creator / 25% platform; pollen is
never cashed out). No external billing system exists, so OUR pollen ledger IS
the provider meter of record: this connector mirrors pollen_monthly
(vendor=community) into provider_monthly as credit rows — credit because the
usage is settled in pollen, never in cash.

Reads the ops workspace itself (tb_ops_api + TINYBIRD_OPS_INGEST_TOKEN).
Ordering caveat: a full `ingest.run` refreshes provider_monthly before
pollen_monthly, so the mirror reflects the previous pollen refresh — one run
behind at worst; a scoped `--only provider` run reads the current table.

Source: api
"""

from . import _mrow

_SQL = (
    "SELECT month, round(sum(cost_paid) + sum(cost_quests), 2) AS cost "
    "FROM pollen_monthly WHERE vendor = 'community' "
    "GROUP BY month ORDER BY month"
)


def meter(creds, months, today, tb_client=None):
    """Mirror community pollen cost per month as provider credit rows.

    Args:
        creds:     dict with TINYBIRD_OPS_INGEST_TOKEN
        months:    list of "YYYY-MM" strings to include in output
        today:     current ingest date
        tb_client: injectable TB client with a .sql() method (for testing)

    Returns:
        list of _mrow dicts; one credit row per month with nonzero cost.
    """
    if tb_client is None:
        token = creds.get("TINYBIRD_OPS_INGEST_TOKEN")
        if not token:
            raise RuntimeError("TINYBIRD_OPS_INGEST_TOKEN missing")
        from ... import creds as _creds
        from ... import tb as _tb
        tb_client = _tb.TB(_creds.load_config()["tb_ops_api"], token)

    month_set = set(months)
    rows = []
    for r in tb_client.sql(_SQL):
        month = r.get("month") or ""
        cost = round(float(r.get("cost") or 0), 2)
        if month not in month_set or not cost:
            continue
        rows.append(_mrow(
            month=month,
            vendor="community",
            amount=cost,
            currency="USD",
            funding="credit",
            source="api",
            today=today,
        ))
    return rows
