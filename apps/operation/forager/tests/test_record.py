"""Tests for ingest.record CLI and related helpers.
All hermetic — no network, no SOPS, no real TB. Injectable tb_factory.
Run: cd apps/operation/forager && python3 -m pytest tests/test_record.py -q
"""
import json
import os
import sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import pytest

from ingest.connectors.vendors import _mrow
from ingest.connectors.gpu_runs import stamp as _stamp
from ingest import record
from ingest.connectors import registry


# ---------------------------------------------------------------------------
# _mrow row shape
# ---------------------------------------------------------------------------

def test_mrow_full():
    r = _mrow("2026-06", "deepinfra", 8.77, "prepaid", "api", "2026-07-03")
    assert r == {
        "month": "2026-06",
        "vendor": "deepinfra",
        "currency": "USD",
        "category": "compute",
        "credit": 0.0,
        "paid": 8.77,
        "source": "api",
    }


def test_mrow_rounds_to_2dp():
    r = _mrow("2026-06", "vast.ai", 8.7777, "cash", "api", "2026-07-03")
    assert r["paid"] == 8.78
    assert r["currency"] == "USD"


def test_mrow_rejects_unknown_vendor():
    with pytest.raises(ValueError, match="unknown vendor"):
        _mrow("2026-06", "not-a-vendor", 8.77, "cash", "api", "2026-07-03")


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
    """CANONICAL must include known compute/infra and manual-forever vendors."""
    must_have = [
        "vast.ai", "io.net", "perplexity", "lambda", "nebius",
        "bytedance", "modal", "elevenlabs",
        "google", "aws", "azure", "runpod", "deepinfra",
        "fireworks", "openrouter", "openai", "ovhcloud",
        "scaleway", "digitalocean", "daytona",
    ]
    for slug in must_have:
        assert slug in registry.CANONICAL, f"CANONICAL missing: {slug}"


def test_canonical_contains_operating_vendor_slugs():
    """CANONICAL includes operating-expense slugs used by vendor filters."""
    must_have = [
        "deel", "google-workspace", "slack", "wise", "self-issued",
        "github", "typeless", "wispr", "tele2", "enty", "naturenergie",
        "exafunction",
    ]
    for slug in must_have:
        assert slug in registry.CANONICAL, f"CANONICAL missing: {slug}"


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
    # 16 connectors: aws is back via Umbrella Cost (the CE connector stayed retired); azure/openrouter/elevenlabs/runpod/anthropic/xai/alibaba/community/cloudflare added.
    assert len(registry.METER) == 16


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
        [
            "provider",
            "io.net",
            "2026-06",
            "--currency",
            "USD",
            "--credit",
            "1234.5",
            "--paid",
            "12.25",
        ],
        tb_factory=_make_factory(fake),
    )
    assert len(fake.appended) == 1
    ds, rows = fake.appended[0]
    assert ds == "provider_monthly"
    assert len(rows) == 1
    r = rows[0]
    assert r["vendor"] == "io.net"
    assert r["month"] == "2026-06"
    assert r["currency"] == "USD"
    assert r["credit"] == 1234.5
    assert r["paid"] == 12.25
    assert r["source"] == "manual"


def test_record_meter_defaults_missing_amount_side_to_zero():
    fake = _FakeTB()
    record.main(
        ["provider", "runpod", "2026-05", "--currency", "EUR", "--paid", "500.0"],
        tb_factory=_make_factory(fake),
    )
    r = fake.appended[0][1][0]
    assert r["currency"] == "EUR"
    assert r["credit"] == 0.0
    assert r["paid"] == 500.0


def test_record_meter_category_defaults_from_vendor_roster():
    """No --category → the vendor's vendor_aliases.json category, so infra
    vendors (digitalocean, tinybird) stop silently landing as compute."""
    fake = _FakeTB()
    record.main(
        ["provider", "digitalocean", "2026-06", "--currency", "USD", "--credit", "298"],
        tb_factory=_make_factory(fake),
    )
    assert fake.appended[0][1][0]["category"] == "infra"

    fake = _FakeTB()
    record.main(
        ["provider", "io.net", "2026-06", "--currency", "USD", "--credit", "10"],
        tb_factory=_make_factory(fake),
    )
    assert fake.appended[0][1][0]["category"] == "compute"

    # explicit flag still wins
    fake = _FakeTB()
    record.main(
        ["provider", "digitalocean", "2026-06", "--currency", "USD",
         "--credit", "10", "--category", "compute"],
        tb_factory=_make_factory(fake),
    )
    assert fake.appended[0][1][0]["category"] == "compute"


def test_record_provider_accepts_compute_gpu_category():
    """--category compute-gpu is accepted (OVH manual GPU-rent rows)."""
    fake = _FakeTB()
    record.main(
        ["provider", "ovhcloud", "2026-01", "--currency", "EUR",
         "--credit", "1856.80", "--category", "compute-gpu"],
        tb_factory=_make_factory(fake),
    )
    ds, rows = fake.appended[0]
    assert ds == "provider_monthly"
    r = rows[0]
    assert r["vendor"] == "ovhcloud"
    assert r["category"] == "compute-gpu"
    assert r["credit"] == 1856.80


def test_record_provider_rejects_invalid_category():
    with pytest.raises(SystemExit):
        record.main(
            ["provider", "ovhcloud", "2026-01", "--currency", "EUR",
             "--credit", "1.0", "--category", "not-a-category"],
            tb_factory=_make_factory(_FakeTB()),
        )


# ---------------------------------------------------------------------------
# Validation: bad month exits non-zero
# ---------------------------------------------------------------------------

def test_bad_month_year_only():
    with pytest.raises(SystemExit) as exc:
        record.main(
            ["provider", "deepinfra", "2026-13", "--currency", "USD", "--credit", "1.0"],
            tb_factory=_make_factory(_FakeTB()),
        )
    assert exc.value.code != 0


def test_bad_month_short_format():
    with pytest.raises(SystemExit) as exc:
        record.main(
            ["provider", "deepinfra", "26-06", "--currency", "USD", "--credit", "1.0"],
            tb_factory=_make_factory(_FakeTB()),
        )
    assert exc.value.code != 0


def test_bad_month_day_included():
    with pytest.raises(SystemExit) as exc:
        record.main(
            ["provider", "runpod", "2026-06-01", "--currency", "USD", "--credit", "1.0"],
            tb_factory=_make_factory(_FakeTB()),
        )
    assert exc.value.code != 0


def test_unknown_vendor_exits_nonzero():
    with pytest.raises(SystemExit) as exc:
        record.main(
            [
                "provider",
                "NOT_A_REAL_VENDOR_XYZ",
                "2026-06",
                "--currency",
                "USD",
                "--credit",
                "1.0",
            ],
            tb_factory=_make_factory(_FakeTB()),
        )
    assert exc.value.code != 0


def test_record_meter_requires_credit_or_cash():
    with pytest.raises(SystemExit) as exc:
        record.main(
            ["provider", "deepinfra", "2026-06", "--currency", "USD"],
            tb_factory=_make_factory(_FakeTB()),
        )
    assert exc.value.code != 0


# ---------------------------------------------------------------------------
# record.main: grant subcommand
# ---------------------------------------------------------------------------

def test_record_grant_appends_row():
    fake = _FakeTB()
    record.main(
        ["grant", "lambda", "--granted", "7500", "--currency", "USD",
         "--start", "2026-03-30"],
        tb_factory=_make_factory(fake),
    )
    ds, rows = fake.appended[0]
    assert ds == "grants"
    r = rows[0]
    assert r["vendor"] == "lambda"
    assert r["label"] == ""
    assert r["granted"] == 7500.0
    assert r["currency"] == "USD"
    assert r["start_date"] == "2026-03-30"
    assert r["expires"] == "1970-01-01"
    assert len(r["recorded_at"]) == 19  # "YYYY-MM-DD HH:MM:SS"


def test_record_grant_label_and_expiry():
    fake = _FakeTB()
    record.main(
        ["grant", "azure", "--granted", "250036", "--currency", "USD",
         "--start", "2026-04-06", "--expires", "2028-04-06", "--label", "lot 2"],
        tb_factory=_make_factory(fake),
    )
    r = fake.appended[0][1][0]
    assert r["label"] == "lot 2"
    assert r["expires"] == "2028-04-06"


def test_record_grant_unknown_vendor_exits():
    with pytest.raises(SystemExit) as exc:
        record.main(
            ["grant", "NOT_A_VENDOR", "--granted", "1", "--currency", "USD",
             "--start", "2026-01-01"],
            tb_factory=_make_factory(_FakeTB()),
        )
    assert exc.value.code != 0


def test_record_grant_bad_start_date_exits():
    with pytest.raises(SystemExit) as exc:
        record.main(
            ["grant", "lambda", "--granted", "1", "--currency", "USD",
             "--start", "2026-03"],
            tb_factory=_make_factory(_FakeTB()),
        )
    assert exc.value.code != 0


def test_record_grant_zero_granted_exits():
    with pytest.raises(SystemExit) as exc:
        record.main(
            ["grant", "lambda", "--granted", "0", "--currency", "USD",
             "--start", "2026-03-30"],
            tb_factory=_make_factory(_FakeTB()),
        )
    assert exc.value.code != 0


# ---------------------------------------------------------------------------
# record.main: gpu subcommand (writes gpu_runs — lump mode + run mode)
# ---------------------------------------------------------------------------

def test_record_gpu_lump_mode_appends_row():
    """No --started/--ended: one row for the positional month, times empty,
    hours None, cost = rounded amount, written to gpu_runs."""
    fake = _FakeTB()
    record.main(
        ["gpu", "runpod", "2026-06",
         "--deployment", "pod-abc123",
         "--amount", "312.50",
         "--gpu", "A100 80GB",
         "--currency", "USD"],
        tb_factory=_make_factory(fake),
    )
    assert len(fake.appended) == 1
    ds, rows = fake.appended[0]
    assert ds == "gpu_runs"
    assert len(rows) == 1
    r = rows[0]
    assert r["vendor"] == "runpod"
    assert r["month"] == "2026-06"
    assert r["run_id"] == "pod-abc123"
    assert r["deployment"] == "pod-abc123"
    assert r["gpu"] == "A100 80GB"
    assert r["gpu_count"] == 1
    assert r["started_at"] == ""
    assert r["ended_at"] == ""
    assert r["hours"] is None
    assert r["cost"] == 312.50
    assert r["currency"] == "USD"
    assert r["source"] == "manual"


def test_record_gpu_lump_mode_rounds_cost():
    fake = _FakeTB()
    record.main(
        ["gpu", "vast.ai", "2026-06",
         "--deployment", "node-99",
         "--amount", "99.999"],
        tb_factory=_make_factory(fake),
    )
    assert fake.appended[0][1][0]["cost"] == 100.0


def test_record_gpu_defaults_currency_gpu_run_id_gpu_count():
    fake = _FakeTB()
    record.main(
        ["gpu", "lambda", "2026-05",
         "--deployment", "inst-xyz",
         "--amount", "750.0"],
        tb_factory=_make_factory(fake),
    )
    r = fake.appended[0][1][0]
    assert r["currency"] == "USD"
    assert r["gpu"] == ""
    assert r["run_id"] == "inst-xyz"  # defaults to --deployment
    assert r["gpu_count"] == 1
    assert r["source"] == "manual"


def test_record_gpu_run_id_override():
    fake = _FakeTB()
    record.main(
        ["gpu", "lambda", "2026-05",
         "--deployment", "inst-xyz",
         "--run-id", "run-custom-1",
         "--amount", "750.0"],
        tb_factory=_make_factory(fake),
    )
    assert fake.appended[0][1][0]["run_id"] == "run-custom-1"


def test_record_gpu_count_custom_value():
    fake = _FakeTB()
    record.main(
        ["gpu", "runpod", "2026-06",
         "--deployment", "pod-x", "--amount", "10.0", "--gpu-count", "4"],
        tb_factory=_make_factory(fake),
    )
    assert fake.appended[0][1][0]["gpu_count"] == 4


def test_record_gpu_model_kind_default_from_stamp():
    """No --model/--kind: falls back to stamp(vendor, deployment)."""
    fake = _FakeTB()
    record.main(
        ["gpu", "runpod", "2026-06",
         "--deployment", "zimage-4090-secure",
         "--amount", "10.0"],
        tb_factory=_make_factory(fake),
    )
    r = fake.appended[0][1][0]
    expected_model, expected_kind = _stamp("runpod", "zimage-4090-secure")
    assert r["model"] == expected_model == "zimage"
    assert r["kind"] == expected_kind == "gpu"


def test_record_gpu_model_kind_explicit_override():
    fake = _FakeTB()
    record.main(
        ["gpu", "runpod", "2026-06",
         "--deployment", "zimage-4090-secure",
         "--amount", "10.0",
         "--model", "custom-model",
         "--kind", "serverless"],
        tb_factory=_make_factory(fake),
    )
    r = fake.appended[0][1][0]
    assert r["model"] == "custom-model"
    assert r["kind"] == "serverless"


def test_record_gpu_kind_invalid_choice_exits():
    with pytest.raises(SystemExit) as exc:
        record.main(
            ["gpu", "runpod", "2026-06",
             "--deployment", "x", "--amount", "1.0", "--kind", "spot"],
            tb_factory=_make_factory(_FakeTB()),
        )
    assert exc.value.code != 0


def test_record_gpu_unknown_vendor_exits():
    with pytest.raises(SystemExit) as exc:
        record.main(
            ["gpu", "NOT_A_VENDOR", "2026-06",
             "--deployment", "x", "--amount", "1.0"],
            tb_factory=_make_factory(_FakeTB()),
        )
    assert exc.value.code != 0


def test_record_gpu_accepts_canonical_vendor_even_if_not_roster_gpu():
    """fireworks is in CANONICAL, so it should be accepted even though
    it's not a cost_basis=gpu vendor in vendor_aliases.json."""
    fake = _FakeTB()
    record.main(
        ["gpu", "fireworks", "2026-06",
         "--deployment", "x", "--amount", "1.0"],
        tb_factory=_make_factory(fake),
    )
    assert len(fake.appended) == 1
    ds, rows = fake.appended[0]
    assert ds == "gpu_runs"
    assert rows[0]["vendor"] == "fireworks"


def test_record_gpu_accepts_ovhcloud_gpu_deployment():
    """ovhcloud is canonical but not roster-GPU; should accept GPU line items."""
    fake = _FakeTB()
    record.main(
        ["gpu", "ovhcloud", "2026-02",
         "--deployment", "gpu-instance-123", "--amount", "150.75"],
        tb_factory=_make_factory(fake),
    )
    assert len(fake.appended) == 1
    ds, rows = fake.appended[0]
    assert ds == "gpu_runs"
    assert rows[0]["vendor"] == "ovhcloud"
    assert rows[0]["cost"] == 150.75


def test_record_gpu_unknown_vendor_still_rejected():
    """Unknown vendors (not in CANONICAL) should still be rejected."""
    with pytest.raises(SystemExit) as exc:
        record.main(
            ["gpu", "nonexistent-vendor", "2026-06",
             "--deployment", "x", "--amount", "1.0"],
            tb_factory=_make_factory(_FakeTB()),
        )
    assert exc.value.code != 0


def test_record_gpu_zero_amount_exits():
    with pytest.raises(SystemExit) as exc:
        record.main(
            ["gpu", "runpod", "2026-06",
             "--deployment", "x", "--amount", "0"],
            tb_factory=_make_factory(_FakeTB()),
        )
    assert exc.value.code != 0


def test_record_gpu_negative_amount_exits():
    with pytest.raises(SystemExit) as exc:
        record.main(
            ["gpu", "runpod", "2026-06",
             "--deployment", "x", "--amount", "-5.0"],
            tb_factory=_make_factory(_FakeTB()),
        )
    assert exc.value.code != 0


def test_record_gpu_bad_month_exits():
    with pytest.raises(SystemExit) as exc:
        record.main(
            ["gpu", "runpod", "26-06",
             "--deployment", "x", "--amount", "1.0"],
            tb_factory=_make_factory(_FakeTB()),
        )
    assert exc.value.code != 0


# --- run mode (--started + --ended) ---

def test_record_gpu_run_mode_two_months_split():
    """--started/--ended spanning two months -> 2 rows, exact-cents split,
    source manual, clipped timestamps at the month boundary."""
    fake = _FakeTB()
    record.main(
        ["gpu", "io.net", "2025-12",
         "--deployment", "vmaas-b72b6c49",
         "--amount", "388.80",
         "--started", "2025-12-29 15:52:19",
         "--ended", "2026-01-25 15:56:43"],
        tb_factory=_make_factory(fake),
    )
    ds, rows = fake.appended[0]
    assert ds == "gpu_runs"
    assert len(rows) == 2
    months = {r["month"] for r in rows}
    assert months == {"2025-12", "2026-01"}
    assert all(r["source"] == "manual" for r in rows)
    assert all(r["gpu_count"] == 1 for r in rows)
    total = round(sum(r["cost"] for r in rows), 2)
    assert total == 388.80

    dec_row = next(r for r in rows if r["month"] == "2025-12")
    jan_row = next(r for r in rows if r["month"] == "2026-01")
    assert dec_row["started_at"] == "2025-12-29 15:52:19"
    assert dec_row["ended_at"] == "2026-01-01 00:00:00"
    assert jan_row["started_at"] == "2026-01-01 00:00:00"
    assert jan_row["ended_at"] == "2026-01-25 15:56:43"
    assert dec_row["hours"] is not None and jan_row["hours"] is not None


def test_record_gpu_run_mode_prints_all_rows_as_json():
    fake = _FakeTB()
    import contextlib
    import io
    buf = io.StringIO()
    with contextlib.redirect_stdout(buf):
        record.main(
            ["gpu", "io.net", "2025-12",
             "--deployment", "vmaas-b72b6c49",
             "--amount", "388.80",
             "--started", "2025-12-29 15:52:19",
             "--ended", "2026-01-25 15:56:43"],
            tb_factory=_make_factory(fake),
        )
    lines = [line for line in buf.getvalue().splitlines() if line.strip()]
    assert len(lines) == 2
    for line in lines:
        json.loads(line)  # each row printed as its own JSON line


def test_record_gpu_run_mode_single_month():
    """A run entirely within one month -> 1 row, guard month matches."""
    fake = _FakeTB()
    record.main(
        ["gpu", "lambda", "2026-06",
         "--deployment", "gh200-cluster",
         "--amount", "50.0",
         "--started", "2026-06-01 00:00:00",
         "--ended", "2026-06-02 00:00:00"],
        tb_factory=_make_factory(fake),
    )
    ds, rows = fake.appended[0]
    assert ds == "gpu_runs"
    assert len(rows) == 1
    assert rows[0]["month"] == "2026-06"
    assert rows[0]["cost"] == 50.0


def test_record_gpu_run_mode_guard_month_mismatch_exits():
    """Positional month must match one of the split's produced months."""
    with pytest.raises(SystemExit) as exc:
        record.main(
            ["gpu", "io.net", "2026-03",
             "--deployment", "vmaas-b72b6c49",
             "--amount", "388.80",
             "--started", "2025-12-29 15:52:19",
             "--ended", "2026-01-25 15:56:43"],
            tb_factory=_make_factory(_FakeTB()),
        )
    assert exc.value.code != 0


def test_record_gpu_one_of_started_ended_errors():
    """Only one of --started/--ended given must error (both or neither)."""
    with pytest.raises(SystemExit) as exc:
        record.main(
            ["gpu", "io.net", "2025-12",
             "--deployment", "vmaas-b72b6c49",
             "--amount", "100.0",
             "--started", "2025-12-29 15:52:19"],
            tb_factory=_make_factory(_FakeTB()),
        )
    assert exc.value.code != 0

    with pytest.raises(SystemExit) as exc2:
        record.main(
            ["gpu", "io.net", "2025-12",
             "--deployment", "vmaas-b72b6c49",
             "--amount", "100.0",
             "--ended", "2025-12-30 00:00:00"],
            tb_factory=_make_factory(_FakeTB()),
        )
    assert exc2.value.code != 0


def test_record_gpu_bad_started_format_exits():
    with pytest.raises(SystemExit) as exc:
        record.main(
            ["gpu", "io.net", "2025-12",
             "--deployment", "x", "--amount", "10.0",
             "--started", "2025-12-29", "--ended", "2025-12-30 00:00:00"],
            tb_factory=_make_factory(_FakeTB()),
        )
    assert exc.value.code != 0
