"""merge_meter_rows — provider_monthly holds one row per vendor/month/currency.

Precedence: manual rows are operator overrides for a vendor/month/currency
bucket. Otherwise source rank wins, then last-seen.

Run: cd apps/operation/forager && python3 -m pytest tests/test_meter_dedupe.py -q
"""

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from ingest.run import (
    existing_manual_meter_rows,
    merge_meter_rows,
)


def _row(
    vendor,
    month,
    credit=0.0,
    cash=0.0,
    source="api",
    currency="USD",
):
    return {
        "month": month,
        "vendor": vendor,
        "currency": currency,
        "credit": credit,
        "paid": cash,
        "source": source,
    }


def test_last_seen_wins_within_source_for_same_amount_side():
    rows = [
        _row("aws", "2026-04", credit=100.0),
        _row("aws", "2026-04", credit=120.0),
        _row("aws", "2026-04", credit=110.0),
    ]
    out = merge_meter_rows(rows)
    assert len(out) == 1
    assert out[0]["credit"] == 110.0


def test_manual_beats_api_for_same_bucket():
    rows = [
        _row("aws", "2026-04", credit=100.0, source="api"),
        _row("aws", "2026-04", credit=999.0, source="manual"),
    ]
    out = merge_meter_rows(rows)
    assert len(out) == 1
    assert out[0]["source"] == "manual"
    assert out[0]["credit"] == 999.0


def test_credit_and_cash_merge_into_one_row():
    rows = [
        _row("aws", "2026-06", credit=1922.35, source="cli"),
        _row("aws", "2026-06", cash=55.0, source="cli"),
    ]
    out = merge_meter_rows(rows)
    assert out == [_row("aws", "2026-06", credit=1922.35, cash=55.0, source="cli")]


def test_currency_classes_stay_separate():
    rows = [
        _row("aws", "2026-06", credit=1922.35, currency="USD"),
        _row("aws", "2026-06", cash=55.0, currency="EUR"),
    ]
    out = merge_meter_rows(rows)
    assert len(out) == 2
    assert {r["currency"] for r in out} == {"USD", "EUR"}


def test_vendors_and_months_never_cross_collapse():
    rows = [
        _row("aws", "2026-05", credit=1.0),
        _row("aws", "2026-06", credit=2.0),
        _row("google", "2026-06", credit=3.0),
    ]
    out = merge_meter_rows(rows)
    assert len(out) == 3


def test_cli_and_bq_rank_between_api_and_manual():
    rows = [
        _row("ovhcloud", "2026-05", credit=1.0, source="cli"),
        _row("ovhcloud", "2026-05", credit=2.0, source="bq"),
    ]
    out = merge_meter_rows(rows)
    assert len(out) == 1
    assert out[0]["source"] == "cli"


def test_different_selected_sources_are_combined():
    rows = [
        _row("google", "2026-05", credit=1.0, source="api"),
        _row("google", "2026-05", cash=2.0, source="bq"),
    ]
    out = merge_meter_rows(rows)
    assert len(out) == 1
    assert out[0]["source"] == "api,bq"


def test_empty_input():
    assert merge_meter_rows([]) == []


def test_existing_manual_meter_rows_drops_stale_automatic_rows():
    rows = [
        _row("aws", "2026-01", cash=45767.52, source="cli"),
        _row("aws", "2026-06", cash=42.0, source="manual"),
    ]

    assert existing_manual_meter_rows(rows) == [
        _row("aws", "2026-06", cash=42.0, source="manual"),
    ]
