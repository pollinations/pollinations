"""Hermetic tests for usage (B6) and stripe revenue (B6) connectors.

All hermetic: TB stub injected; http_json monkeypatched for stripe.
No network, no SOPS, no real credentials.

Run: cd apps/operation/forager && python3 -m pytest tests/test_usage_revenue.py -q
"""

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import pytest

import ingest.connectors.usage as _usage
import ingest.connectors.providers.stripe as _stripe

TODAY = "2026-07-03"
MONTHS = ["2026-04", "2026-05", "2026-06"]


# ---------------------------------------------------------------------------
# TB stub for usage tests
# ---------------------------------------------------------------------------


class TBStub:
    """Minimal TB stub that records sql() calls and returns canned data."""

    def __init__(self, canned_rows=None):
        self.queries = []
        self._canned = canned_rows if canned_rows is not None else []

    def sql(self, query):
        self.queries.append(query)
        return self._canned


# ---------------------------------------------------------------------------
# usage.monthly_rows tests
# ---------------------------------------------------------------------------


def test_usage_one_query_per_month():
    """monthly_rows must issue exactly one SQL query per month (timeout safety)."""
    tb = TBStub()
    _usage.monthly_rows(tb, MONTHS, TODAY)
    assert len(tb.queries) == len(MONTHS), (
        f"expected {len(MONTHS)} queries, got {len(tb.queries)}"
    )


def test_usage_window_strings_standard():
    """Query must contain correct start/end window strings for a normal month."""
    tb = TBStub()
    _usage.monthly_rows(tb, ["2026-05"], TODAY)
    q = tb.queries[0]
    assert "2026-05-01 00:00:00" in q
    assert "2026-06-01 00:00:00" in q


def test_usage_window_strings_december_wrap():
    """December query must wrap year: next_month = 2027-01."""
    tb = TBStub()
    _usage.monthly_rows(tb, ["2026-12"], TODAY)
    q = tb.queries[0]
    assert "2026-12-01 00:00:00" in q
    assert "2027-01-01 00:00:00" in q


def test_usage_window_strings_january():
    """January query window: start=YYYY-01-01, next=YYYY-02-01."""
    tb = TBStub()
    _usage.monthly_rows(tb, ["2026-01"], TODAY)
    q = tb.queries[0]
    assert "2026-01-01 00:00:00" in q
    assert "2026-02-01 00:00:00" in q


def test_usage_environment_production_in_query():
    """Every query must filter environment = 'production'."""
    tb = TBStub()
    _usage.monthly_rows(tb, MONTHS, TODAY)
    for q in tb.queries:
        assert "environment = 'production'" in q, (
            f"environment='production' missing in query: {q[:200]}"
        )


def test_usage_query_only_imports_successful_billed_resolved_models():
    """usage_monthly must not import non-billed undefined model groups."""
    tb = TBStub()
    _usage.monthly_rows(tb, ["2026-05"], TODAY)
    q = tb.queries[0]
    assert "is_billed_usage = true" in q
    assert "response_status >= 200 AND response_status < 300" in q
    assert "model_used != 'undefined'" in q
    assert "model_provider_used != 'undefined'" in q


def test_usage_rows_carry_month():
    """Each returned row must carry the 'month' field matching the queried month."""
    canned = [
        {
            "provider": "azure",
            "model": "gpt-4o",
            "price_paid": 1.0,
            "price_quests": 0.5,
            "cost_paid": 0.8,
            "cost_quests": 0.2,
        }
    ]
    tb = TBStub(canned_rows=canned)
    rows = _usage.monthly_rows(tb, ["2026-05"], TODAY)
    assert any(r["month"] == "2026-05" for r in rows)


def test_usage_provider_canonicalized_at_ingest():
    """provider is canonicalized via burn.CANON at ingest (bedrock → aws,
    vastai → vast.ai); freshness timestamps stay in ingest_runs."""
    canned = [
        {
            "provider": "bedrock",
            "model": "claude",
            "price_paid": 0.1,
            "price_quests": 0.0,
            "cost_paid": 0.05,
            "cost_quests": 0.0,
        },
        {
            "provider": "vastai",
            "model": "flux",
            "price_paid": 0.1,
            "price_quests": 0.0,
            "cost_paid": 0.02,
            "cost_quests": 0.0,
        },
    ]
    tb = TBStub(canned_rows=canned)
    rows = _usage.monthly_rows(tb, ["2026-06"], TODAY)
    assert {r["provider"] for r in rows} == {"aws", "vast.ai"}
    assert all(
        set(r) == {
            "month",
            "provider",
            "model",
            "currency",
            "price_paid",
            "price_quests",
            "cost_paid",
            "cost_quests",
        }
        for r in rows
    )


def test_usage_unknown_provider_fails_with_alias_guidance():
    """Unknown non-empty provider tags must be fixed in provider_aliases.json."""
    canned = [
        {
            "provider": "new-provider-tag",
            "model": "gpt-4o",
            "price_paid": 1.0,
            "price_quests": 0.0,
            "cost_paid": 0.5,
            "cost_quests": 0.0,
        }
    ]
    tb = TBStub(canned_rows=canned)

    with pytest.raises(ValueError, match="provider_aliases.json"):
        _usage.monthly_rows(tb, ["2026-06"], TODAY)


def test_usage_canonicalized_duplicates_are_summed():
    """Raw providers can collapse to one canonical provider; keep one row."""
    canned = [
        {
            "provider": "azure",
            "model": "gpt-4o",
            "price_paid": 1.5,
            "price_quests": 0.2,
            "cost_paid": 0.8,
            "cost_quests": 0.1,
        },
        {
            "provider": "azure-2",
            "model": "gpt-4o",
            "price_paid": 0.7,
            "price_quests": 0.4,
            "cost_paid": 0.3,
            "cost_quests": 0.2,
        },
    ]
    tb = TBStub(canned_rows=canned)
    rows = _usage.monthly_rows(tb, ["2026-06"], TODAY)

    assert len(rows) == 1
    assert rows[0]["provider"] == "azure"
    assert rows[0]["model"] == "gpt-4o"
    assert rows[0]["price_paid"] == pytest.approx(2.2)
    assert rows[0]["price_quests"] == pytest.approx(0.6)
    assert rows[0]["cost_paid"] == pytest.approx(1.1)
    assert rows[0]["cost_quests"] == pytest.approx(0.3)


def test_usage_multiple_months_correct_month_tags():
    """Each month's rows get the correct month tag (not the same month for all)."""
    canned = [
        {
            "provider": "azure",
            "model": "gpt-4o",
            "price_paid": 0.5,
            "price_quests": 0.0,
            "cost_paid": 0.3,
            "cost_quests": 0.0,
        }
    ]
    tb = TBStub(canned_rows=canned)
    rows = _usage.monthly_rows(tb, ["2026-04", "2026-05"], TODAY)
    months_seen = {r["month"] for r in rows}
    assert "2026-04" in months_seen
    assert "2026-05" in months_seen


def test_usage_empty_result_from_tb():
    """Empty TB result for a month → no rows for that month (no crash)."""
    tb = TBStub(canned_rows=[])
    rows = _usage.monthly_rows(tb, MONTHS, TODAY)
    assert rows == []


def test_usage_none_provider_kept_as_is():
    """None/missing provider field → kept verbatim (empty string or None, no placeholder)."""
    canned = [
        {
            "provider": None,
            "model": "gpt-4o",
            "price_paid": 0.0,
            "price_quests": 0.0,
            "cost_paid": 0.0,
            "cost_quests": 0.0,
        }
    ]
    tb = TBStub(canned_rows=canned)
    rows = _usage.monthly_rows(tb, ["2026-06"], TODAY)
    # The row must survive; provider is not replaced with a made-up string
    assert len(rows) == 1
    # The value should be None or "" (verbatim from TB), NOT a fabricated placeholder
    assert rows[0]["provider"] not in ("UNKNOWN", "unknown", "N/A", "n/a")


def test_usage_month_field_is_string():
    """month field must be a YYYY-MM string."""
    canned = [
        {
            "provider": "azure",
            "model": "gpt-4o",
            "price_paid": 0.1,
            "price_quests": 0.0,
            "cost_paid": 0.05,
            "cost_quests": 0.0,
        }
    ]
    tb = TBStub(canned_rows=canned)
    rows = _usage.monthly_rows(tb, ["2026-06"], TODAY)
    assert rows[0]["month"] == "2026-06"


# ---------------------------------------------------------------------------
# Stripe Capture helper
# ---------------------------------------------------------------------------


class StripeCapture:
    """Monkeypatch-friendly http_json replacement for Stripe API calls."""

    def __init__(self, pages):
        """pages: list of dicts (balance_transactions pages)."""
        self._pages = list(pages)
        self._idx = 0
        self.calls = []

    def __call__(self, url, headers=None, timeout=30, data=None, method=None):
        self.calls.append({"url": url, "headers": headers or {}})
        if self._idx < len(self._pages):
            page = self._pages[self._idx]
            self._idx += 1
            return page
        # Fallback empty page
        return {"data": [], "has_more": False}


# ---------------------------------------------------------------------------
# Stripe fixture: 2-page response
# ---------------------------------------------------------------------------

# Epochs (UTC):
#   2026-06-15 = 1781827200
#   2026-06-20 = 1782259200
#   2026-05-10 = 1778803200  (unused but shows multi-month)
_JUN_EPOCH1 = 1781827200  # 2026-06-15
_JUN_EPOCH2 = 1782259200  # 2026-06-20

_STRIPE_PAGE1 = {
    "data": [
        # charge: +1000 cents, net=938 cents
        {
            "id": "txn_001",
            "type": "charge",
            "amount": 1000,
            "net": 938,
            "created": _JUN_EPOCH1,
        },
        # another charge: +500 cents, net=462 cents
        {
            "id": "txn_002",
            "type": "charge",
            "amount": 500,
            "net": 462,
            "created": _JUN_EPOCH1,
        },
        # refund: -200 cents, net=-200 cents (type=payment_refund)
        {
            "id": "txn_003",
            "type": "payment_refund",
            "amount": -200,
            "net": -200,
            "created": _JUN_EPOCH2,
        },
        # payout: must be skipped
        {
            "id": "txn_004",
            "type": "payout",
            "amount": -1000,
            "net": -1000,
            "created": _JUN_EPOCH2,
        },
    ],
    "has_more": True,
}

_STRIPE_PAGE2 = {
    "data": [
        # charge: +300 cents, net=283 cents
        {
            "id": "txn_005",
            "type": "charge",
            "amount": 300,
            "net": 283,
            "created": _JUN_EPOCH2,
        },
        # refund (charge_refund type): -100 cents, net=-100 cents
        {
            "id": "txn_006",
            "type": "charge_refund",
            "amount": -100,
            "net": -100,
            "created": _JUN_EPOCH2,
        },
    ],
    "has_more": False,
}

# Expected for 2026-06:
#   gross = (1000 + 500 + 300) / 100 = 18.00
#   refunds = (200 + 100) / 100 = 3.00   (payment_refund + charge_refund)
#   net = (938 + 462 + (-200) + 283 + (-100)) / 100 = 1383 / 100 = 13.83
#   fees = gross - refunds - net = 18.00 - 3.00 - 13.83 = 1.17

_STRIPE_CREDS = {"STRIPE_API_KEY": "rk_test_fakekeyvalue"}


# ---------------------------------------------------------------------------
# stripe.revenue_rows tests
# ---------------------------------------------------------------------------


def test_stripe_pagination_starting_after(monkeypatch):
    """Second page request must include starting_after=<last id of page 1>.

    Note: starting_after uses the last item of page data INCLUDING payouts.
    Payouts are skipped in processing (not accumulated in gross/net/fees), but they
    are used for pagination cursoring. This ensures all txns are fetched.
    """
    cap = StripeCapture([_STRIPE_PAGE1, _STRIPE_PAGE2])
    monkeypatch.setattr(_stripe, "http_json", cap)
    _stripe.revenue_rows(_STRIPE_CREDS, ["2026-06"], TODAY)
    assert len(cap.calls) == 2
    # Second call URL must include starting_after=txn_004 (last id of page 1, a payout)
    second_url = cap.calls[1]["url"]
    assert "starting_after=txn_004" in second_url, (
        f"starting_after param wrong in: {second_url}"
    )


def test_stripe_payouts_excluded(monkeypatch):
    """Payout transactions must not contribute to gross/net/fees."""
    cap = StripeCapture([_STRIPE_PAGE1, _STRIPE_PAGE2])
    monkeypatch.setattr(_stripe, "http_json", cap)
    rows = _stripe.revenue_rows(_STRIPE_CREDS, ["2026-06"], TODAY)
    row = next(r for r in rows if r["month"] == "2026-06")
    # If payout (-1000 cents) was included, gross would differ (or net very negative)
    # gross must be exactly 18.00 (only charges count)
    assert row["gross_amount"] == 18.00


def test_stripe_minor_units_to_amount(monkeypatch):
    """Amounts must be divided by 100 from Stripe minor units."""
    page = {
        "data": [
            {
                "id": "txn_A",
                "type": "charge",
                "amount": 10000,
                "net": 9725,
                "created": _JUN_EPOCH1,
            },
        ],
        "has_more": False,
    }
    cap = StripeCapture([page])
    monkeypatch.setattr(_stripe, "http_json", cap)
    rows = _stripe.revenue_rows(_STRIPE_CREDS, ["2026-06"], TODAY)
    assert rows[0]["gross_amount"] == pytest.approx(100.00, abs=0.001)
    assert rows[0]["currency"] == "EUR"
    # fees = (10000 - 0 - 9725) / 100 = 2.75 — net contributes in cents
    assert rows[0]["fees_amount"] == pytest.approx(2.75, abs=0.001)


def test_stripe_gross_sum(monkeypatch):
    """gross_amount = sum of positive amounts / 100."""
    cap = StripeCapture([_STRIPE_PAGE1, _STRIPE_PAGE2])
    monkeypatch.setattr(_stripe, "http_json", cap)
    rows = _stripe.revenue_rows(_STRIPE_CREDS, ["2026-06"], TODAY)
    row = next(r for r in rows if r["month"] == "2026-06")
    assert row["gross_amount"] == 18.00


def test_stripe_refunds_sum(monkeypatch):
    """refunds_amount = sum of abs(amount) for refund-type txns / 100."""
    cap = StripeCapture([_STRIPE_PAGE1, _STRIPE_PAGE2])
    monkeypatch.setattr(_stripe, "http_json", cap)
    rows = _stripe.revenue_rows(_STRIPE_CREDS, ["2026-06"], TODAY)
    row = next(r for r in rows if r["month"] == "2026-06")
    assert row["refunds_amount"] == 3.00


def test_stripe_net_sum(monkeypatch):
    """net is summed for all non-payout txns (in cents) and surfaces via fees.
    net_amount was dropped from the schema, so the accumulation is observable only
    through fees = gross - refunds - net. If the payout's net (-1000 cents) leaked
    into the sum, fees would come out at 11.17 instead."""
    cap = StripeCapture([_STRIPE_PAGE1, _STRIPE_PAGE2])
    monkeypatch.setattr(_stripe, "http_json", cap)
    rows = _stripe.revenue_rows(_STRIPE_CREDS, ["2026-06"], TODAY)
    row = next(r for r in rows if r["month"] == "2026-06")
    # net = (938 + 462 + (-200) + 283 + (-100)) / 100 = 13.83 → fees = 18 - 3 - 13.83
    assert row["fees_amount"] == 1.17


def test_stripe_fees_formula(monkeypatch):
    """fees_amount = gross - refunds - net (computed in raw cents, then /100)."""
    cap = StripeCapture([_STRIPE_PAGE1, _STRIPE_PAGE2])
    monkeypatch.setattr(_stripe, "http_json", cap)
    rows = _stripe.revenue_rows(_STRIPE_CREDS, ["2026-06"], TODAY)
    row = next(r for r in rows if r["month"] == "2026-06")
    net_amount = 13.83  # Σnet from the fixture (net_amount itself is no longer emitted)
    expected_fees = row["gross_amount"] - row["refunds_amount"] - net_amount
    assert row["fees_amount"] == pytest.approx(expected_fees, abs=1e-9)
    # Concrete check: 18.00 - 3.00 - 13.83 = 1.17
    assert row["fees_amount"] == 1.17


def test_stripe_fees_rounding_regression(monkeypatch):
    """Regression: fees must be computed in raw cents, not from rounded values.

    The fix ensures fees_cents = gross_cents - refunds_cents - net_cents is computed
    first, then converted to EUR. This preserves the mathematical identity exactly
    (within floating-point precision).
    """
    page = {
        "data": [
            {
                "id": "txn_1",
                "type": "charge",
                "amount": 1999,
                "net": 1870,
                "created": _JUN_EPOCH1,
            },
            {
                "id": "txn_2",
                "type": "refund",
                "amount": -100,
                "net": -100,
                "created": _JUN_EPOCH1,
            },
        ],
        "has_more": False,
    }
    cap = StripeCapture([page])
    monkeypatch.setattr(_stripe, "http_json", cap)
    rows = _stripe.revenue_rows(_STRIPE_CREDS, ["2026-06"], TODAY)
    row = rows[0]
    # Exact values (no rounding tolerance)
    assert row["gross_amount"] == 19.99
    assert row["refunds_amount"] == 1.00
    # The identity must hold (within floating-point precision):
    # fees == (gross - refunds - net) computed in raw cents, then /100
    net_amount = (1870 - 100) / 100  # Σnet from the fixture = 17.70
    expected_fees = row["gross_amount"] - row["refunds_amount"] - net_amount
    assert row["fees_amount"] == pytest.approx(expected_fees, abs=1e-9)
    # Verify it equals 1.29 when properly rounded
    assert row["fees_amount"] == 1.29


def test_stripe_only_requested_months_emitted(monkeypatch):
    """Only months present in the months arg are emitted."""
    # Page has June txns but we only request May
    cap = StripeCapture([_STRIPE_PAGE1, _STRIPE_PAGE2])
    monkeypatch.setattr(_stripe, "http_json", cap)
    rows = _stripe.revenue_rows(_STRIPE_CREDS, ["2026-05"], TODAY)
    # No May txns in fixture → empty
    assert rows == []


def test_stripe_hard_cap_pages(monkeypatch):
    """Pagination must stop at _max_pages even if has_more is always True."""
    call_count = [0]

    def infinite_http(url, headers=None, timeout=30, data=None, method=None):
        call_count[0] += 1
        return {
            "data": [
                {
                    "id": f"txn_{call_count[0]}",
                    "type": "charge",
                    "amount": 100,
                    "net": 97,
                    "created": _JUN_EPOCH1,
                }
            ],
            "has_more": True,
        }

    monkeypatch.setattr(_stripe, "http_json", infinite_http)
    cap_pages = 5
    _stripe.revenue_rows(_STRIPE_CREDS, ["2026-06"], TODAY, _max_pages=cap_pages)
    assert call_count[0] == cap_pages, (
        f"expected {cap_pages} pages, made {call_count[0]} requests"
    )


def test_stripe_bearer_in_header_not_url(monkeypatch):
    """API key must appear in Authorization header, never in the URL."""
    cap = StripeCapture([_STRIPE_PAGE1, _STRIPE_PAGE2])
    monkeypatch.setattr(_stripe, "http_json", cap)
    _stripe.revenue_rows(_STRIPE_CREDS, ["2026-06"], TODAY)
    for call in cap.calls:
        assert "rk_test_fakekeyvalue" not in call["url"], "key leaked into URL"
        auth = call["headers"].get("Authorization", "")
        assert "rk_test_fakekeyvalue" in auth, "key missing from Authorization header"


def test_stripe_row_shape(monkeypatch):
    """Returned rows must have exactly the revenue_monthly schema fields."""
    cap = StripeCapture([_STRIPE_PAGE1, _STRIPE_PAGE2])
    monkeypatch.setattr(_stripe, "http_json", cap)
    rows = _stripe.revenue_rows(_STRIPE_CREDS, ["2026-06"], TODAY)
    assert rows
    required = {
        "month",
        "currency",
        "gross_amount",
        "fees_amount",
        "refunds_amount",
    }
    for r in rows:
        assert set(r.keys()) == required, f"row fields mismatch: {r}"


def test_stripe_refund_type_identification(monkeypatch):
    """refund, payment_refund, charge_refund types are all treated as refunds."""
    page = {
        "data": [
            {
                "id": "t1",
                "type": "charge",
                "amount": 1000,
                "net": 970,
                "created": _JUN_EPOCH1,
            },
            {
                "id": "t2",
                "type": "refund",
                "amount": -100,
                "net": -100,
                "created": _JUN_EPOCH1,
            },
            {
                "id": "t3",
                "type": "payment_refund",
                "amount": -50,
                "net": -50,
                "created": _JUN_EPOCH1,
            },
            {
                "id": "t4",
                "type": "charge_refund",
                "amount": -25,
                "net": -25,
                "created": _JUN_EPOCH1,
            },
        ],
        "has_more": False,
    }
    cap = StripeCapture([page])
    monkeypatch.setattr(_stripe, "http_json", cap)
    rows = _stripe.revenue_rows(_STRIPE_CREDS, ["2026-06"], TODAY)
    row = rows[0]
    # All three refund types counted: (100 + 50 + 25) / 100 = 1.75
    assert row["refunds_amount"] == pytest.approx(1.75, abs=0.001)
