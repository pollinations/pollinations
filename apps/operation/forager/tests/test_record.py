"""Tests for ingest.record CLI and related helpers.
All hermetic — no network, no SOPS, no real TB. Injectable tb_factory.
Run: cd apps/operation/forager && python3 -m pytest tests/test_record.py -q
"""
import json
import os
import sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import pytest

from ingest.connectors.providers import _mrow
from ingest import record
from ingest.connectors import registry


# ---------------------------------------------------------------------------
# _mrow row shape
# ---------------------------------------------------------------------------

def test_mrow_full():
    r = _mrow("2026-06", "deepinfra", 8.77, "prepaid", "api", "2026-07-03")
    assert r == {
        "month": "2026-06",
        "provider": "deepinfra",
        "cost_usd": 8.77,
        "funding": "prepaid",
        "source": "api",
    }


def test_mrow_rounds_to_2dp():
    r = _mrow("2026-06", "vast.ai", 8.7777, "cash", "api", "2026-07-03")
    assert r["cost_usd"] == 8.78


def test_mrow_rejects_unknown_provider():
    with pytest.raises(ValueError, match="unknown provider"):
        _mrow("2026-06", "not-a-provider", 8.77, "cash", "api", "2026-07-03")


def test_mrow_rejects_unknown_funding():
    with pytest.raises(ValueError, match="unknown funding"):
        _mrow("2026-06", "vast.ai", 8.77, "coupon", "api", "2026-07-03")


def test_mrow_rejects_unknown_source():
    with pytest.raises(ValueError, match="unknown source"):
        _mrow("2026-06", "vast.ai", 8.77, "cash", "spreadsheet", "2026-07-03")


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
    """CANONICAL must NOT contain operating-expense invoice-sender slugs."""
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
# registry.METER
# ---------------------------------------------------------------------------

def test_meter_is_list():
    assert isinstance(registry.METER, list)


def test_meter_is_populated():
    # METER is populated in B5 with 7 connectors.
    assert len(registry.METER) == 7


class _FakeTB:
    """Minimal TB stub that captures append calls."""
    def __init__(self):
        self.appended = []

    def append(self, datasource, rows):
        self.appended.append((datasource, rows))
        return {"successful_rows": len(rows)}


def _make_factory(fake_tb):
    return lambda token: fake_tb


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


def test_record_meter_default_funding_prepaid():
    fake = _FakeTB()
    record.main(["meter", "runpod", "2026-05", "500.0"], tb_factory=_make_factory(fake))
    r = fake.appended[0][1][0]
    assert r["funding"] == "prepaid"


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
        record.main(["meter", "NOT_A_REAL_PROVIDER_XYZ", "2026-06", "1.0"],
                    tb_factory=_make_factory(_FakeTB()))
    assert exc.value.code != 0
