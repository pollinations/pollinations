import pytest

from ingest.inspect import build_query


def test_build_query_filters_vendor_and_month():
    assert build_query("provider_monthly", "replicate", "2026-07", 200) == (
        "SELECT * FROM provider_monthly WHERE vendor = 'replicate' "
        "AND month = '2026-07' ORDER BY month DESC LIMIT 200"
    )


def test_build_query_transactions_month_uses_date_prefix():
    query = build_query("transactions", None, "2026-07", 50)
    assert "startsWith(toString(date), '2026-07')" in query


def test_build_query_rejects_bad_slug_and_month():
    with pytest.raises(ValueError):
        build_query("provider_monthly", "bad slug!", None, 10)
    with pytest.raises(ValueError):
        build_query("provider_monthly", None, "2026-13", 10)
    with pytest.raises(ValueError):
        build_query("revenue_monthly", "aws", None, 10)
