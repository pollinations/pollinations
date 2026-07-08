"""Tests for gpu_runs datasource foundations: split_run_by_month + validator + stamp.

TDD: these tests are written first. Run failing before implementing.

    cd apps/operation/forager && python3 -m pytest tests/test_gpu_runs.py -q
"""
import datetime
import pytest

from ingest.connectors.gpu_runs import split_run_by_month, stamp
from ingest import run as ingest_run


# ---------------------------------------------------------------------------
# stamp — deployment-to-model mapping
# ---------------------------------------------------------------------------

def test_stamp_runpod_zimage():
    assert stamp("runpod", "zimage-4090-secure") == ("zimage", "gpu")

def test_stamp_runpod_zimage_upper():
    """Case-insensitive substring match."""
    assert stamp("runpod", "ZIMAGE-A100") == ("zimage", "gpu")

def test_stamp_runpod_klein():
    assert stamp("runpod", "klein-A5000") == ("klein", "gpu")

def test_stamp_runpod_klein_upper():
    assert stamp("runpod", "KLEIN-box") == ("klein", "gpu")

def test_stamp_runpod_storage_exact():
    """_storage is an exact match — must map to zimage."""
    assert stamp("runpod", "_storage") == ("zimage", "gpu")

def test_stamp_runpod_storage_substring_no_match():
    """_storage is exact — a name that merely contains '_storage' does NOT hit."""
    # e.g. "my_storage_bucket" should fall through to unmapped
    result = stamp("runpod", "my_storage_bucket")
    assert result == ("", "gpu")

def test_stamp_runpod_unknown():
    """An unknown runpod deployment returns empty model."""
    assert stamp("runpod", "randompod") == ("", "gpu")

def test_stamp_lambda_gh200():
    models_csv, kind = stamp("lambda", "gh200-cluster")
    assert models_csv == "ltx-2,acestep,sana"
    assert kind == "gpu"

def test_stamp_lambda_sana():
    assert stamp("lambda", "sana-inference")[0] == "ltx-2,acestep,sana"

def test_stamp_lambda_ltx():
    assert stamp("lambda", "ltx-node-01")[0] == "ltx-2,acestep,sana"

def test_stamp_lambda_ace():
    assert stamp("lambda", "ace-worker")[0] == "ltx-2,acestep,sana"

def test_stamp_lambda_gh200_case_insensitive():
    assert stamp("lambda", "GH200-large")[0] == "ltx-2,acestep,sana"

def test_stamp_lambda_unmapped():
    """Lambda deployment not matching any known pattern → empty model."""
    assert stamp("lambda", "mystery-box") == ("", "gpu")

def test_stamp_lambda_unmapped_kind_is_gpu():
    _, kind = stamp("lambda", "other-lambda-box")
    assert kind == "gpu"

def test_stamp_vast():
    """vast.ai catch-all → flux."""
    assert stamp("vast.ai", "any-deployment-name") == ("flux", "gpu")

def test_stamp_vast_empty_name():
    assert stamp("vast.ai", "") == ("flux", "gpu")

def test_stamp_modal_serverless():
    """modal always returns serverless kind."""
    models_csv, kind = stamp("modal", "any-modal-app")
    assert models_csv == "flux-klein,klein,klein-large"
    assert kind == "serverless"

def test_stamp_modal_empty_name():
    _, kind = stamp("modal", "")
    assert kind == "serverless"

def test_stamp_ionet():
    """io.net catch-all → flux,zimage."""
    assert stamp("io.net", "some-node") == ("flux,zimage", "gpu")

def test_stamp_unknown_vendor():
    """Completely unknown vendor returns unmapped."""
    assert stamp("nonexistent-cloud", "some-deployment") == ("", "gpu")


# ---------------------------------------------------------------------------
# split_run_by_month
# ---------------------------------------------------------------------------

def _dt(s):
    """Parse 'YYYY-MM-DD HH:MM:SS' to datetime."""
    return datetime.datetime.strptime(s, "%Y-%m-%d %H:%M:%S")


def test_split_single_month():
    """A run that starts and ends within the same month produces one entry."""
    started = _dt("2026-06-10 00:00:00")
    ended   = _dt("2026-06-20 00:00:00")
    parts = split_run_by_month(started, ended, cost=240.00)

    assert len(parts) == 1
    month, hours, cost = parts[0]
    assert month == "2026-06"
    assert hours > 0
    assert cost == pytest.approx(240.00, abs=0.001)


def test_split_exact_cents_sum_two_months():
    """io.net vmaas-b72b6c49: Dec 29 → Jan 25, $388.80.

    Both parts must be positive and must sum EXACTLY to 388.80.
    """
    started = _dt("2025-12-29 15:52:19")
    ended   = _dt("2026-01-25 15:56:43")
    parts = split_run_by_month(started, ended, cost=388.80)

    assert len(parts) == 2
    months = [p[0] for p in parts]
    assert "2025-12" in months
    assert "2026-01" in months

    costs = [p[2] for p in parts]
    assert all(c > 0 for c in costs), f"all parts must be positive, got {costs}"

    total = sum(costs)
    assert total == 388.80, f"sum {total!r} != 388.80 (exact cents invariant broken)"


def test_split_three_month_span():
    """A run spanning Dec → Feb produces exactly 3 parts that sum exactly."""
    started = _dt("2025-12-15 00:00:00")
    ended   = _dt("2026-02-15 00:00:00")
    parts = split_run_by_month(started, ended, cost=300.00)

    assert len(parts) == 3
    months = [p[0] for p in parts]
    assert months == ["2025-12", "2026-01", "2026-02"]

    hours_list = [p[1] for p in parts]
    assert all(h > 0 for h in hours_list)

    costs = [p[2] for p in parts]
    assert all(c > 0 for c in costs)

    total = sum(costs)
    assert total == 300.00, f"sum {total!r} != 300.00 (exact cents invariant broken)"


def test_split_ended_before_started_raises():
    """ended_at <= started_at must raise ValueError."""
    started = _dt("2026-06-10 12:00:00")
    ended   = _dt("2026-06-10 12:00:00")  # equal
    with pytest.raises(ValueError):
        split_run_by_month(started, ended, cost=100.00)

    ended_before = _dt("2026-06-09 12:00:00")
    with pytest.raises(ValueError):
        split_run_by_month(started, ended_before, cost=100.00)


def test_split_hours_positive_and_proportional():
    """Hours per month must be positive and proportional to cost."""
    started = _dt("2026-01-01 00:00:00")
    ended   = _dt("2026-03-01 00:00:00")  # Jan (31d) + Feb (28d)
    parts = split_run_by_month(started, ended, cost=590.00)

    assert len(parts) == 2
    jan_hours = parts[0][1]
    feb_hours = parts[1][1]
    jan_cost  = parts[0][2]
    feb_cost  = parts[1][2]

    # Jan has 31 days, Feb 28 — cost ratio must roughly match hours ratio
    ratio_hours = jan_hours / feb_hours
    ratio_cost  = jan_cost / feb_cost
    assert abs(ratio_hours - ratio_cost) < 0.01, (
        f"cost ratio {ratio_cost:.4f} should match hours ratio {ratio_hours:.4f}"
    )


# ---------------------------------------------------------------------------
# _validate_gpu_runs_row
# ---------------------------------------------------------------------------

def _valid_row(**overrides):
    """Return a minimal valid gpu_runs row."""
    base = {
        "month":       "2026-06",
        "vendor":      "runpod",
        "run_id":      "pod-abc123",
        "deployment":  "zimage-4090-secure",
        "gpu":         "RTX 4090",
        "gpu_count":   1,
        "started_at":  "2026-06-01 00:00:00",
        "ended_at":    "2026-06-30 23:59:59",
        "hours":       719.99,
        "cost":        200.0,
        "currency":    "USD",
        "model":       "zimage",
        "kind":        "gpu",
        "source":      "api",
    }
    base.update(overrides)
    return base


def test_validate_gpu_runs_accepts_valid_row():
    ingest_run._validate_gpu_runs_row(_valid_row())  # must not raise


def test_validate_gpu_runs_unknown_vendor_raises():
    with pytest.raises(ValueError, match="vendor"):
        ingest_run._validate_gpu_runs_row(_valid_row(vendor="unknown-xyz"))


def test_validate_gpu_runs_invalid_month_raises():
    with pytest.raises(ValueError, match="month"):
        ingest_run._validate_gpu_runs_row(_valid_row(month="2026-13"))
    with pytest.raises(ValueError, match="month"):
        ingest_run._validate_gpu_runs_row(_valid_row(month="2026/06"))
    with pytest.raises(ValueError, match="month"):
        ingest_run._validate_gpu_runs_row(_valid_row(month=""))


def test_validate_gpu_runs_negative_cost_raises():
    with pytest.raises(ValueError, match="cost"):
        ingest_run._validate_gpu_runs_row(_valid_row(cost=-1.0))


def test_validate_gpu_runs_zero_cost_ok():
    """cost == 0 is allowed (e.g. credit-covered month)."""
    ingest_run._validate_gpu_runs_row(_valid_row(cost=0.0))


def test_validate_gpu_runs_invalid_kind_raises():
    with pytest.raises(ValueError, match="kind"):
        ingest_run._validate_gpu_runs_row(_valid_row(kind="spot"))


def test_validate_gpu_runs_valid_kinds():
    ingest_run._validate_gpu_runs_row(_valid_row(kind="gpu"))
    ingest_run._validate_gpu_runs_row(_valid_row(kind="serverless"))


def test_validate_gpu_runs_invalid_source_raises():
    with pytest.raises(ValueError, match="source"):
        ingest_run._validate_gpu_runs_row(_valid_row(source="bq"))
    with pytest.raises(ValueError, match="source"):
        ingest_run._validate_gpu_runs_row(_valid_row(source="web"))


def test_validate_gpu_runs_valid_sources():
    for src in ("api", "cli", "manual"):
        ingest_run._validate_gpu_runs_row(_valid_row(source=src))


def test_validate_gpu_runs_null_hours_ok():
    """hours=None is valid (serverless rows, unknown hours)."""
    ingest_run._validate_gpu_runs_row(_valid_row(hours=None))


def test_validate_gpu_runs_negative_hours_raises():
    with pytest.raises(ValueError, match="hours"):
        ingest_run._validate_gpu_runs_row(_valid_row(hours=-1.0))


def test_validate_gpu_runs_empty_times_ok():
    """Empty string times are valid (unknown/not-yet-ended)."""
    ingest_run._validate_gpu_runs_row(_valid_row(started_at="", ended_at=""))


def test_validate_gpu_runs_invalid_time_format_raises():
    with pytest.raises(ValueError, match="started_at"):
        ingest_run._validate_gpu_runs_row(_valid_row(started_at="2026-06-01"))
    with pytest.raises(ValueError, match="ended_at"):
        ingest_run._validate_gpu_runs_row(_valid_row(ended_at="bad-date"))


def test_validate_gpu_runs_missing_cost_raises():
    """A row with no 'cost' key must raise ValueError — absent cost is invalid."""
    row = _valid_row()
    del row["cost"]
    with pytest.raises(ValueError, match="cost"):
        ingest_run._validate_gpu_runs_row(row)


def test_split_exact_cents_sum_six_month_span():
    """Exact-cents invariant holds over a 6-month span with non-round cost.

    The sum of parts, rounded to the nearest cent, must equal cost in cents.
    We compare in integer cents to avoid IEEE754 accumulation errors.
    """
    started = _dt("2025-07-01 00:00:00")
    ended   = _dt("2025-12-31 23:59:59")
    cost = 100.01
    parts = split_run_by_month(started, ended, cost=cost)

    assert len(parts) == 6
    total_cents = sum(round(p[2] * 100) for p in parts)
    cost_cents = round(cost * 100)
    assert total_cents == cost_cents, (
        f"sum in cents {total_cents} != {cost_cents} (exact-cents invariant broken over 6 months)"
    )


def test_split_exact_cents_sum_twelve_months():
    """Reviewer-found case: cost=100.01 over 12 months must sum exactly.

    Sum compared in integer cents; the reviewer's original float sum drifted
    to 100.00999999999999 — this test pins the integer-cents fix.
    """
    started = _dt("2025-01-01 00:00:00")
    ended   = _dt("2025-12-31 23:59:59")
    cost = 100.01
    parts = split_run_by_month(started, ended, cost=cost)

    assert len(parts) == 12
    total_cents = sum(round(p[2] * 100) for p in parts)
    cost_cents = round(cost * 100)
    assert total_cents == cost_cents, (
        f"sum in cents {total_cents} != {cost_cents} (exact-cents invariant broken over 12 months)"
    )
