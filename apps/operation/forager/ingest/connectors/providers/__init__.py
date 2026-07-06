"""Provider row builders shared by provider meter connectors."""

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


def _currency(value):
    code = str(value or "").strip().upper()
    if not code:
        raise ValueError("meter_monthly currency is required")
    return code


def _mrow(month, provider, amount, funding, source, today, currency="USD"):
    """Build a meter_monthly datasource row.

    Args:
        month:    "YYYY-MM" billing month
        provider: canonical provider slug
        amount:   metered cost in the source currency
        currency: source currency code, e.g. "USD" or "EUR"
        funding:  "credit" | "prepaid" | "cash"
        source:   "api" | "cli" | "bq" | "manual"
        today:    current ingest date (kept in the call signature for connector simplicity)
    """
    _validate_meter_values(provider, funding, source)
    return {
        "month": month,
        "provider": provider,
        "amount": round(float(amount), 2),
        "currency": _currency(currency),
        "funding": funding,
        "source": source,
    }
