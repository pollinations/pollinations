"""Provider row builders shared by provider connectors.

_brow  — legacy helper for provider balance probes; not written by ingest.run.
_mrow  — build one meter_monthly row (run.py dedupes to one row per
         provider-month-funding and full-replaces the table each run)

Provider connector modules (openrouter, deepinfra, runpod, vast, …) are added
in Tasks B3–B5 and import these builders.
"""

from ...aliases import PROVIDER_ALIASES

ALLOWED_FUNDING = {"cash", "credit", "prepaid"}
ALLOWED_METER_SOURCES = {"api", "bq", "cli", "manual"}


def _validate_meter_values(provider, funding, source):
    if provider not in PROVIDER_ALIASES:
        raise ValueError(f"unknown provider slug for meter_monthly: {provider}")
    if funding not in ALLOWED_FUNDING:
        raise ValueError(f"unknown funding for meter_monthly: {funding}")
    if source not in ALLOWED_METER_SOURCES:
        raise ValueError(f"unknown source for meter_monthly: {source}")


def _brow(now, provider, granted=None, spent=None, left=None, prepaid=None,
          source="api", note=""):
    """Build a balances datasource row.

    Args:
        now:      run_at timestamp string "YYYY-MM-DD HH:MM:SS"
        provider: canonical provider slug (e.g. "openrouter")
        granted:  total credit granted in USD (None if unknown)
        spent:    total spent in USD (None if unknown)
        left:     remaining credit in USD (None if unknown)
        prepaid:  remaining prepaid (non-grant) balance in USD (None if not applicable)
        source:   "api" | "manual" | "cli"
        note:     free-text annotation
    """
    r2 = lambda v: None if v is None else round(float(v), 2)
    return {
        "run_at": now,
        "provider": provider,
        "granted_usd": r2(granted),
        "spent_usd": r2(spent),
        "left_usd": r2(left),
        "prepaid_left_usd": r2(prepaid),
        "source": source,
        "note": note,
    }


def _mrow(month, provider, cost_usd, funding, source, today):
    """Build a meter_monthly datasource row.

    Args:
        month:    "YYYY-MM" billing month
        provider: canonical provider slug
        cost_usd: metered cost in USD
        funding:  "credit" | "prepaid" (legacy connectors may still emit "cash")
        source:   "api" | "cli" | "bq" | "manual"
        today:    current ingest date (kept in the call signature for connector simplicity)
    """
    _validate_meter_values(provider, funding, source)
    return {
        "month": month,
        "provider": provider,
        "cost_usd": round(float(cost_usd), 2),
        "funding": funding,
        "source": source,
    }
