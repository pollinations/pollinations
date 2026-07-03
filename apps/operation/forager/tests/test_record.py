"""Tests for ingest.record CLI and related helpers.
All hermetic — no network, no SOPS, no real TB. Injectable tb_factory.
Run: cd apps/operation/forager && python3 -m pytest tests/test_record.py -q
"""
import json
import os
import sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import pytest

from ingest.connectors.providers import _brow, _mrow
from ingest import record
from ingest.connectors import registry


# ---------------------------------------------------------------------------
# _brow row shape
# ---------------------------------------------------------------------------

def test_brow_full():
    r = _brow("2026-07-03 14:05:00", "openrouter",
               granted=3000.0, spent=1372.48, left=1627.52,
               prepaid=None, currency="USD", source="api", note="")
    assert r == {
        "run_at": "2026-07-03 14:05:00",
        "provider": "openrouter",
        "granted_usd": 3000.0,
        "spent_usd": 1372.48,
        "left_usd": 1627.52,
        "prepaid_left_usd": None,
        "currency": "USD",
        "source": "api",
        "note": "",
    }


def test_brow_rounds_to_2dp():
    r = _brow("2026-07-03 00:00:00", "runpod", left=255.666)
    assert r["left_usd"] == 255.67


def test_brow_none_stays_none():
    r = _brow("2026-07-03 00:00:00", "deepinfra", granted=None, spent=None, left=None, prepaid=None)
    assert r["granted_usd"] is None
    assert r["spent_usd"] is None
    assert r["left_usd"] is None
    assert r["prepaid_left_usd"] is None


def test_brow_defaults():
    r = _brow("2026-07-03 00:00:00", "azure")
    assert r["currency"] == "USD"
    assert r["source"] == "api"
    assert r["note"] == ""


# ---------------------------------------------------------------------------
# _mrow row shape
# ---------------------------------------------------------------------------

def test_mrow_full():
    r = _mrow("2026-06", "deepinfra", 8.77, "prepaid", "api", "deepinfra /payment/usage", "2026-07-03")
    assert r == {
        "month": "2026-06",
        "provider": "deepinfra",
        "cost_usd": 8.77,
        "funding": "prepaid",
        "source": "api",
        "method": "deepinfra /payment/usage",
        "retrieved_at": "2026-07-03",
    }


def test_mrow_rounds_to_2dp():
    r = _mrow("2026-06", "vast.ai", 8.7777, "cash", "api", "method", "2026-07-03")
    assert r["cost_usd"] == 8.78


# ---------------------------------------------------------------------------
# registry.CANONICAL
# ---------------------------------------------------------------------------

def test_canonical_contains_expected_slugs():
    """CANONICAL must include known compute/infra slugs from harvest.PROVIDERS and wise.ALIAS,
    plus manual-forever providers."""
    must_have = [
        "vast.ai", "io.net", "perplexity", "lambda", "nebius",
        "bytedance", "modal", "elevenlabs",
        "google", "aws", "azure", "runpod", "deepinfra",
        "fireworks", "openrouter", "openai", "ovhcloud",
        "scaleway", "digitalocean", "daytona",
    ]
    for slug in must_have:
        assert slug in registry.CANONICAL, f"CANONICAL missing: {slug}"


def test_canonical_excludes_non_billing_slugs():
    """CANONICAL must NOT contain saas/payroll/other invoice-sender slugs."""
    must_not_have = [
        "deel", "google-workspace", "slack", "wise", "self-issued",
        "github", "typeless", "wispr", "tele2", "enty", "naturenergie",
        "exafunction",
    ]
    for slug in must_not_have:
        assert slug not in registry.CANONICAL, f"CANONICAL wrongly contains: {slug}"


def test_canonical_is_set_of_strings():
    assert isinstance(registry.CANONICAL, (set, frozenset, list))
    for s in registry.CANONICAL:
        assert isinstance(s, str)


def test_canonical_no_duplicates():
    lst = list(registry.CANONICAL)
    assert len(lst) == len(set(lst)), "CANONICAL has duplicates"


# ---------------------------------------------------------------------------
# registry.BALANCE / METER — populated by B3; METER still empty (B4-B5)
# ---------------------------------------------------------------------------

def test_balance_and_meter_are_lists():
    assert isinstance(registry.BALANCE, list)
    assert isinstance(registry.METER, list)


def test_meter_is_empty():
    # METER is populated in B4-B5; must still be empty after B3.
    assert registry.METER == []


# ---------------------------------------------------------------------------
# record.main: balance subcommand
# ---------------------------------------------------------------------------

class _FakeTB:
    """Minimal TB stub that captures append calls."""
    def __init__(self):
        self.appended = []

    def append(self, datasource, rows):
        self.appended.append((datasource, rows))
        return {"successful_rows": len(rows)}


def _make_factory(fake_tb):
    return lambda token: fake_tb


def test_record_balance_appends_row():
    fake = _FakeTB()
    record.main(["balance", "runpod", "--left", "255.66"], tb_factory=_make_factory(fake))
    assert len(fake.appended) == 1
    ds, rows = fake.appended[0]
    assert ds == "balances"
    assert len(rows) == 1
    r = rows[0]
    assert r["provider"] == "runpod"
    assert r["left_usd"] == 255.66
    assert r["source"] == "manual"


def test_record_balance_all_optional_fields():
    fake = _FakeTB()
    record.main([
        "balance", "openrouter",
        "--granted", "3000",
        "--spent", "1372.48",
        "--left", "1627.52",
        "--prepaid", "0.0",
        "--note", "manual entry",
    ], tb_factory=_make_factory(fake))
    r = fake.appended[0][1][0]
    assert r["granted_usd"] == 3000.0
    assert r["spent_usd"] == 1372.48
    assert r["left_usd"] == 1627.52
    assert r["prepaid_left_usd"] == 0.0
    assert r["note"] == "manual entry"
    assert r["source"] == "manual"


def test_record_balance_prints_row(capsys):
    fake = _FakeTB()
    record.main(["balance", "azure", "--left", "100.0"], tb_factory=_make_factory(fake))
    out = capsys.readouterr().out
    assert "azure" in out


# ---------------------------------------------------------------------------
# record.main: meter subcommand
# ---------------------------------------------------------------------------

def test_record_meter_appends_row():
    fake = _FakeTB()
    record.main(
        ["meter", "io.net", "2026-06", "1234.5", "--funding", "credit"],
        tb_factory=_make_factory(fake),
    )
    assert len(fake.appended) == 1
    ds, rows = fake.appended[0]
    assert ds == "meter_monthly"
    assert len(rows) == 1
    r = rows[0]
    assert r["provider"] == "io.net"
    assert r["month"] == "2026-06"
    assert r["cost_usd"] == 1234.5
    assert r["funding"] == "credit"
    assert r["source"] == "manual"


def test_record_meter_default_funding_cash():
    fake = _FakeTB()
    record.main(["meter", "runpod", "2026-05", "500.0"], tb_factory=_make_factory(fake))
    r = fake.appended[0][1][0]
    assert r["funding"] == "cash"


def test_record_meter_method_field():
    fake = _FakeTB()
    record.main(
        ["meter", "deepinfra", "2026-06", "8.77", "--method", "deepinfra /payment/usage"],
        tb_factory=_make_factory(fake),
    )
    r = fake.appended[0][1][0]
    assert r["method"] == "deepinfra /payment/usage"


# ---------------------------------------------------------------------------
# Validation: bad month exits non-zero
# ---------------------------------------------------------------------------

def test_bad_month_year_only():
    with pytest.raises(SystemExit) as exc:
        record.main(["meter", "deepinfra", "2026-13", "1.0"], tb_factory=_make_factory(_FakeTB()))
    assert exc.value.code != 0


def test_bad_month_short_format():
    with pytest.raises(SystemExit) as exc:
        record.main(["meter", "deepinfra", "26-06", "1.0"], tb_factory=_make_factory(_FakeTB()))
    assert exc.value.code != 0


def test_bad_month_day_included():
    with pytest.raises(SystemExit) as exc:
        record.main(["meter", "runpod", "2026-06-01", "1.0"], tb_factory=_make_factory(_FakeTB()))
    assert exc.value.code != 0


def test_unknown_provider_exits_nonzero():
    with pytest.raises(SystemExit) as exc:
        record.main(["balance", "NOT_A_REAL_PROVIDER_XYZ", "--left", "1.0"],
                    tb_factory=_make_factory(_FakeTB()))
    assert exc.value.code != 0
