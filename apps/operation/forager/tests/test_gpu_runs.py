"""Tests for gpu_runs datasource foundations: split_run_by_month + validator + stamp.

TDD: these tests are written first. Run failing before implementing.

    cd apps/operation/forager && python3 -m pytest tests/test_gpu_runs.py -q
"""
import datetime
import pytest

from ingest.connectors.gpu_runs import split_run_by_month, stamp, runs_rows_runpod
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


# ---------------------------------------------------------------------------
# runs_rows_runpod — reuse billing fixture from test_gpu_billing patterns
# ---------------------------------------------------------------------------

MONTHS = ["2026-05", "2026-06"]

# Mirror of the fixtures used in test_gpu_billing for runpod — same data so we
# can assert cost parity between the billing and runs connectors.
_RUNPOD_BILLING_PODS = [
    {"podId": "pod-aaa", "amount": 200.0, "time": "2026-06-01T00:00:00Z"},
    {"podId": "pod-aaa", "amount": 74.45, "time": "2026-06-01T00:00:00Z"},
    {"podId": "pod-bbb", "amount": 50.0,  "time": "2026-06-01T00:00:00Z"},
    # Out-of-scope month
    {"podId": "pod-ccc", "amount": 10.0,  "time": "2026-07-01T00:00:00Z"},
    # Zero-amount — must be skipped
    {"podId": "pod-ddd", "amount": 0.0,   "time": "2026-06-01T00:00:00Z"},
]
_RUNPOD_BILLING_VOLUMES = [
    {"startDate": "2026-06-01T00:00:00Z", "amount": 6.99},
]
_RUNPOD_BILLING_ENDPOINTS = [
    {"endpointId": "ep-123", "amount": 2.87, "time": "2026-05-01T00:00:00Z"},
]
_RUNPOD_GRAPHQL_RESP = {
    "data": {"myself": {"pods": [
        {"id": "pod-aaa", "name": "zimage-4090-secure"},
        {"id": "pod-bbb", "name": "klein-a5000-v4"},
    ]}}
}


def _runpod_http(url, headers=None, data=None):
    if "graphql" in url:
        return _RUNPOD_GRAPHQL_RESP
    if "networkvolumes" in url:
        return _RUNPOD_BILLING_VOLUMES
    if "endpoints" in url:
        return _RUNPOD_BILLING_ENDPOINTS
    return _RUNPOD_BILLING_PODS


def test_runs_rows_runpod_shape():
    """Every row has all required gpu_runs fields."""
    required = {
        "month", "vendor", "run_id", "deployment", "gpu", "gpu_count",
        "started_at", "ended_at", "hours", "cost", "currency",
        "model", "kind", "source",
    }
    rows = runs_rows_runpod({"RUNPOD_API_KEY": "k"}, MONTHS, http=_runpod_http)
    assert rows, "should produce at least one row"
    for row in rows:
        missing = required - row.keys()
        assert not missing, f"row missing keys {missing}: {row}"


def test_runs_rows_runpod_cost_parity():
    """Per-(pod,month) cost equals what monthly_rows_runpod produces for same fixture.

    The transform must not change billed amounts — only reshape the schema.
    """
    from ingest.connectors.gpu_billing import monthly_rows_runpod

    billing_rows = monthly_rows_runpod(
        {"RUNPOD_API_KEY": "k"}, MONTHS, http=_runpod_http
    )
    run_rows = runs_rows_runpod(
        {"RUNPOD_API_KEY": "k"}, MONTHS, http=_runpod_http
    )

    # Build (month, deployment) → amount/cost maps for comparison.
    billing_map = {(r["month"], r["deployment"]): r["amount"] for r in billing_rows}
    runs_map    = {(r["month"], r["deployment"]): r["cost"]   for r in run_rows}

    assert billing_map == runs_map, (
        f"cost mismatch between billing and runs connectors:\n"
        f"billing={billing_map}\nruns={runs_map}"
    )


def test_runs_rows_runpod_serverless_kind():
    """_serverless:<id> rows always have kind='serverless', regardless of stamp."""
    rows = runs_rows_runpod({"RUNPOD_API_KEY": "k"}, MONTHS, http=_runpod_http)
    serverless = [r for r in rows if r["deployment"].startswith("_serverless")]
    assert len(serverless) == 1
    assert serverless[0]["kind"] == "serverless"
    assert serverless[0]["deployment"] == "_serverless:ep-123"


def test_runs_rows_runpod_zimage_model():
    """zimage pod maps to model='zimage'."""
    rows = runs_rows_runpod({"RUNPOD_API_KEY": "k"}, MONTHS, http=_runpod_http)
    zimage = [r for r in rows if r["deployment"] == "zimage-4090-secure"]
    assert len(zimage) == 1
    assert zimage[0]["model"] == "zimage"
    assert zimage[0]["kind"] == "gpu"


def test_runs_rows_runpod_dead_pod_keeps_pod_id():
    """A pod not in GraphQL keeps pod_id as deployment with empty times."""
    billing_with_dead = _RUNPOD_BILLING_PODS + [
        {"podId": "pod-dead", "amount": 9.99, "time": "2026-06-01T00:00:00Z"},
    ]
    def http(url, headers=None, data=None):
        if "graphql" in url:
            return _RUNPOD_GRAPHQL_RESP  # pod-dead not in name map
        if "networkvolumes" in url:
            return []
        if "endpoints" in url:
            return []
        return billing_with_dead

    rows = runs_rows_runpod({"RUNPOD_API_KEY": "k"}, MONTHS, http=http)
    dead = [r for r in rows if r["run_id"] == "pod-dead"]
    assert len(dead) == 1
    assert dead[0]["deployment"] == "pod-dead", "dead pod must keep raw pod_id as deployment"
    assert dead[0]["started_at"] == ""
    assert dead[0]["hours"] is None


def test_runs_rows_runpod_vendor_and_source():
    """All rows have vendor='runpod' and source='api'."""
    rows = runs_rows_runpod({"RUNPOD_API_KEY": "k"}, MONTHS, http=_runpod_http)
    assert all(r["vendor"] == "runpod" for r in rows)
    assert all(r["source"] == "api" for r in rows)


def test_runs_rows_runpod_out_of_scope_excluded():
    """July row is excluded because MONTHS only covers May + June."""
    rows = runs_rows_runpod({"RUNPOD_API_KEY": "k"}, MONTHS, http=_runpod_http)
    assert all(r["month"] in {"2026-05", "2026-06"} for r in rows)


def test_runs_rows_runpod_zero_rows_skipped():
    """Zero-amount rows do not appear in output."""
    def http(url, headers=None, data=None):
        if "graphql" in url:
            return {"data": {"myself": {"pods": []}}}
        return [{"podId": "x", "amount": 0.0, "time": "2026-06-01T00:00:00Z"}]
    rows = runs_rows_runpod({"RUNPOD_API_KEY": "k"}, MONTHS, http=http)
    assert rows == []


def test_runs_rows_runpod_missing_key_raises():
    with pytest.raises(RuntimeError, match="RUNPOD_API_KEY missing"):
        runs_rows_runpod({}, MONTHS, http=lambda *a, **k: {})


def test_runs_rows_runpod_graphql_key_in_url():
    """GraphQL call puts key in URL query string, not Authorization header."""
    seen = {}
    def http(url, headers=None, data=None):
        if "graphql" in url:
            seen["url"] = url
            seen["headers"] = headers or {}
            return _RUNPOD_GRAPHQL_RESP
        if "networkvolumes" in url or "endpoints" in url:
            return []
        return [{"podId": "pod-aaa", "amount": 100.0, "time": "2026-06-01T00:00:00Z"}]

    runs_rows_runpod({"RUNPOD_API_KEY": "SEKRET"}, MONTHS, http=http)
    assert "SEKRET" in seen.get("url", "")
    assert "Authorization" not in seen.get("headers", {})


def test_runs_rows_runpod_multi_row_summing():
    """Two billing rows for the same podId in the same month are summed."""
    rows = runs_rows_runpod({"RUNPOD_API_KEY": "k"}, MONTHS, http=_runpod_http)
    zimage = [r for r in rows if r["deployment"] == "zimage-4090-secure"]
    assert len(zimage) == 1
    assert zimage[0]["cost"] == round(200.0 + 74.45, 2)


def test_runs_rows_runpod_storage_row():
    """Networkvolumes surface → deployment='_storage', model='zimage'."""
    rows = runs_rows_runpod({"RUNPOD_API_KEY": "k"}, MONTHS, http=_runpod_http)
    storage = [r for r in rows if r["deployment"] == "_storage"]
    assert len(storage) == 1
    assert storage[0]["month"] == "2026-06"
    assert storage[0]["cost"] == 6.99
    assert storage[0]["model"] == "zimage"


def test_runs_rows_runpod_passes_validation():
    """All produced rows pass _validate_gpu_runs_row."""
    rows = runs_rows_runpod({"RUNPOD_API_KEY": "k"}, MONTHS, http=_runpod_http)
    for row in rows:
        ingest_run._validate_gpu_runs_row(row)  # must not raise
