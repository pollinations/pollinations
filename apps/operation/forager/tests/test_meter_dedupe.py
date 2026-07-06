"""dedupe_meter — meter_monthly holds one row per provider/month/funding/currency.

Precedence: manual rows are operator overrides for a provider/month/funding/currency
bucket. Otherwise source rank wins, then last-seen.

Run: cd apps/operation/forager && python3 -m pytest tests/test_meter_dedupe.py -q
"""

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from ingest.run import dedupe_meter, without_reset_manual_meter_rows


def _row(provider, month, cost, funding="credit", source="api", currency="USD"):
    return {
        "month": month,
        "provider": provider,
        "amount": cost,
        "currency": currency,
        "funding": funding,
        "source": source,
    }


def test_last_seen_wins_within_source():
    rows = [
        _row("aws", "2026-04", 100.0),
        _row("aws", "2026-04", 120.0),
        _row("aws", "2026-04", 110.0),
    ]
    out = dedupe_meter(rows)
    assert len(out) == 1
    assert out[0]["amount"] == 110.0


def test_manual_beats_api_for_same_bucket():
    rows = [
        _row("aws", "2026-04", 100.0, source="api"),
        _row("aws", "2026-04", 999.0, source="manual"),
    ]
    out = dedupe_meter(rows)
    assert len(out) == 1
    assert out[0]["source"] == "manual"
    assert out[0]["amount"] == 999.0


def test_manual_survives_when_alone():
    rows = [
        _row("assemblyai", "2026-06", 242.45, source="manual"),
        _row("openai", "2026-06", 531.25, source="api"),
    ]
    out = dedupe_meter(rows)
    assert len(out) == 2
    by_prov = {r["provider"]: r for r in out}
    assert by_prov["assemblyai"]["source"] == "manual"


def test_funding_classes_stay_separate():
    rows = [
        _row("aws", "2026-06", 1922.35, funding="credit"),
        _row("aws", "2026-06", 55.0, funding="cash"),
    ]
    out = dedupe_meter(rows)
    assert len(out) == 2
    assert {r["funding"] for r in out} == {"credit", "cash"}


def test_currency_classes_stay_separate():
    rows = [
        _row("aws", "2026-06", 1922.35, currency="USD"),
        _row("aws", "2026-06", 55.0, currency="EUR"),
    ]
    out = dedupe_meter(rows)
    assert len(out) == 2
    assert {r["currency"] for r in out} == {"USD", "EUR"}


def test_providers_and_months_never_cross_collapse():
    rows = [
        _row("aws", "2026-05", 1.0),
        _row("aws", "2026-06", 2.0),
        _row("google", "2026-06", 3.0),
    ]
    out = dedupe_meter(rows)
    assert len(out) == 3


def test_last_seen_wins_on_exact_tie():
    # Table read-back first, fresh connector row second: the fresh row wins.
    rows = [
        _row("aws", "2026-07", 10.0),
        _row("aws", "2026-07", 12.5),
    ]
    out = dedupe_meter(rows)
    assert len(out) == 1
    assert out[0]["amount"] == 12.5


def test_cli_and_bq_rank_between_api_and_manual():
    rows = [
        _row("ovhcloud", "2026-05", 1.0, source="cli"),
        _row("ovhcloud", "2026-05", 2.0, source="bq"),
    ]
    out = dedupe_meter(rows)
    assert len(out) == 1
    assert out[0]["source"] == "cli"


def test_empty_input():
    assert dedupe_meter([]) == []


def test_reset_override_ignores_manual_row():
    rows = [
        _row("aws", "2026-06", 0.0, source="manual"),
        _row("aws", "2026-06", 42.0, source="cli"),
        _row("openai", "2026-06", 9.0, source="manual"),
    ]
    overrides = {
        ("meter_monthly", "aws|2026-06|credit|USD", "reset_manual"): "1",
    }

    out = without_reset_manual_meter_rows(rows, overrides)

    assert out == [
        _row("aws", "2026-06", 42.0, source="cli"),
        _row("openai", "2026-06", 9.0, source="manual"),
    ]


def test_reset_override_zero_keeps_manual_row():
    rows = [_row("aws", "2026-06", 0.0, source="manual")]
    overrides = {
        ("meter_monthly", "aws|2026-06|credit|USD", "reset_manual"): "0",
    }

    assert without_reset_manual_meter_rows(rows, overrides) == rows
