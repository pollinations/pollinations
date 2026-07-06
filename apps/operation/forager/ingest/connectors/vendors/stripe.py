"""Stripe revenue connector.

revenue_rows(creds, months, today, _max_pages=100) -> list[dict]

Produces revenue_monthly rows (full-replace datasource) by paginating
Stripe's balance_transactions API.

Security:
  - API key sent as Bearer token in Authorization header ONLY.
  - Key never appears in the URL, exception messages, or log output.

Refund type identification:
  Types "refund", "payment_refund", "charge_refund" are treated as refunds
  (their amount is negative; we accumulate abs(amount) into refunds_amount).
  Other negative-amount non-payout types (e.g. adjustment, stripe_fee) still
  contribute to net via Σnet but are NOT counted as refunds.

Not registered in BALANCE or METER registries — stripe is a revenue connector,
not a vendor cost/credit connector.
"""
import datetime

from ..common import http_json

_STRIPE_BASE = "https://api.stripe.com/v1"
_REFUND_TYPES = frozenset({"refund", "payment_refund", "charge_refund"})


def _epoch_to_month(epoch: int) -> str:
    """Convert a Unix epoch (seconds) to a 'YYYY-MM' string (UTC)."""
    dt = datetime.datetime.utcfromtimestamp(epoch)
    return f"{dt.year:04d}-{dt.month:02d}"


def revenue_rows(creds, months, today, _max_pages=100):
    """Fetch Stripe balance_transactions and aggregate into revenue_monthly rows.

    Args:
        creds:      dict with STRIPE_API_KEY (restricted rk_ read-only key)
        months:     list of "YYYY-MM" strings to emit rows for
        today:      current ingest date
        _max_pages: hard cap on pagination (injectable for tests; default 100)

    Returns:
        list of revenue_monthly row dicts, one per month present in months arg
        with any nonzero transactions.
    """
    key = creds.get("STRIPE_API_KEY", "")
    headers = {"Authorization": f"Bearer {key}"}
    months_set = set(months)

    # Accumulators keyed by "YYYY-MM"
    gross: dict[tuple[str, str], float] = {}   # Σ positive amounts
    refunds: dict[tuple[str, str], float] = {} # Σ abs(amount) for refund-type txns
    net: dict[tuple[str, str], float] = {}     # Σ net for all non-payout txns

    url = f"{_STRIPE_BASE}/balance_transactions?limit=100"
    pages_fetched = 0

    while pages_fetched < _max_pages:
        page = http_json(url, headers=headers)
        pages_fetched += 1

        for txn in page.get("data", []):
            txn_type = txn.get("type", "")
            # Skip payouts entirely
            if txn_type == "payout":
                continue

            month = _epoch_to_month(txn.get("created", 0))
            currency = str(txn.get("currency") or "eur").upper()
            key = (month, currency)
            amount = txn.get("amount", 0)
            txn_net = txn.get("net", 0)

            # Accumulate gross (positive amounts only)
            if amount > 0:
                gross[key] = gross.get(key, 0.0) + amount

            # Accumulate refunds (refund-type txns with negative amounts)
            if txn_type in _REFUND_TYPES and amount < 0:
                refunds[key] = refunds.get(key, 0.0) + abs(amount)

            # Accumulate net (all non-payout txns)
            net[key] = net.get(key, 0.0) + txn_net

        if not page.get("has_more"):
            break

        # Pagination: starting_after = last id on this page
        data = page.get("data", [])
        if not data:
            break
        last_id = data[-1]["id"]
        url = f"{_STRIPE_BASE}/balance_transactions?limit=100&starting_after={last_id}"

    # Build output rows for requested months only
    rows = []
    all_keys = {
        key for key in set(gross) | set(refunds) | set(net) if key[0] in months_set
    }
    for month, currency in sorted(all_keys):
        # Compute fees in raw cents first to maintain identity: fees == (gross - refunds - net) / 100
        key = (month, currency)
        gross_cents = gross.get(key, 0.0)
        refunds_cents = refunds.get(key, 0.0)
        net_cents = net.get(key, 0.0)
        fees_cents = gross_cents - refunds_cents - net_cents

        # Stripe amounts are minor units in the transaction currency.
        g = round(gross_cents / 100, 2)
        r = round(refunds_cents / 100, 2)
        f = round(fees_cents / 100, 2)

        rows.append({
            "month": month,
            "gross_amount": g,
            "fees_amount": f,
            "refunds_amount": r,
            "currency": currency,
        })

    return rows
