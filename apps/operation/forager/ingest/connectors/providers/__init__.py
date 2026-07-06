"""Provider row builders shared by provider meter connectors."""

from ...aliases import PROVIDER_ALIASES

ALLOWED_FUNDING = {"cash", "credit", "prepaid"}
ALLOWED_METER_SOURCES = {"api", "bq", "cli", "manual"}


def _validate_meter_values(provider, funding, source):
    if provider not in PROVIDER_ALIASES:
        raise ValueError(f"unknown provider slug for meter_monthly: {provider}")
    if funding not in ALLOWED_FUNDING:
        raise ValueError(f"unknown funding for meter_monthly: {funding}")
    _validate_meter_source(source)


def _meter_sources(source):
    normalized = str(source or "").replace("+", ",").replace("/", ",").replace(" ", ",")
    return [part.strip() for part in normalized.split(",") if part.strip()]


def _validate_meter_source(source):
    parts = _meter_sources(source)
    if not parts:
        raise ValueError("meter_monthly source is required")
    for part in parts:
        if part not in ALLOWED_METER_SOURCES:
            raise ValueError(f"unknown source for meter_monthly: {source}")


def _source(value):
    _validate_meter_source(value)
    return ",".join(dict.fromkeys(_meter_sources(value)))


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
        funding:  "credit" | "prepaid" | "cash"; prepaid is stored as paid
        source:   "api" | "cli" | "bq" | "manual"
        today:    current ingest date (kept in the call signature for connector simplicity)
    """
    _validate_meter_values(provider, funding, source)
    amount = round(float(amount), 2)
    return {
        "month": month,
        "provider": provider,
        "currency": _currency(currency),
        "credit": amount if funding == "credit" else 0.0,
        "paid": amount if funding in {"cash", "prepaid"} else 0.0,
        "source": _source(source),
    }
