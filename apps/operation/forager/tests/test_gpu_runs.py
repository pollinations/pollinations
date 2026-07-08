"""Tests for gpu_runs datasource foundations: split_run_by_month + validator + stamp.

TDD: these tests are written first. Run failing before implementing.

    cd apps/operation/forager && python3 -m pytest tests/test_gpu_runs.py -q
"""
import datetime
import pytest

from ingest.connectors.gpu_runs import split_run_by_month, stamp, runs_rows_runpod, runs_rows_vast, runs_rows_modal
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


# ---------------------------------------------------------------------------
# runs_rows_vast — reuse _VAST_INVOICES fixture from test_gpu_billing
# ---------------------------------------------------------------------------

# Shared fixture (mirrors test_gpu_billing._VAST_INVOICES exactly — kept in sync).
# Canonical: two charge rows ($20 + $10) + one credit ($5, must be excluded).
_VAST_INVOICES_SHARED = [
    {
        "type": "charge",
        "timestamp": "1781474400",
        "quantity": 48,
        "amount": 20.0,
        "instance_id": 12345,
    },
    {
        "type": "charge",
        "timestamp": "1781474400",
        "quantity": 24,
        "amount": 10.0,
        "instance_id": 67890,
    },
    {
        "type": "credit",
        "timestamp": "1781474400",
        "quantity": 0,
        "amount": 5.0,
        "instance_id": 12345,
    },
]
from ingest.connectors.gpu_billing import monthly_rows_vast as _monthly_rows_vast  # noqa: E402

TODAY = "2026-07-08"
_VAST_MONTHS = ["2026-05", "2026-06"]


class _Proc:
    def __init__(self, stdout="[]", returncode=0, stderr=""):
        self.stdout = stdout
        self.returncode = returncode
        self.stderr = stderr


def _vast_run_cmd_shared(cmd, **kwargs):
    import json
    return _Proc(stdout=json.dumps(_VAST_INVOICES_SHARED))


def test_runs_rows_vast_total_cost_parity():
    """Σ cost from runs_rows_vast == Σ amount from monthly_rows_vast (both ≈ $30.00).

    The run-grain split must not change totals: same charge data, different grain.
    """
    run_rows = runs_rows_vast({}, _VAST_MONTHS, TODAY, run_cmd=_vast_run_cmd_shared)
    billing_rows = _monthly_rows_vast({}, _VAST_MONTHS, TODAY, run_cmd=_vast_run_cmd_shared)

    total_runs = sum(r["cost"] for r in run_rows)
    total_billing = sum(r["amount"] for r in billing_rows)

    assert total_runs == pytest.approx(30.0, abs=0.02), (
        f"runs total {total_runs} != ~30.00"
    )
    assert total_runs == pytest.approx(total_billing, abs=0.02), (
        f"runs total {total_runs} != billing total {total_billing}"
    )


def test_runs_rows_vast_both_instances_present():
    """Per-instance presence: instance ids 12345 and 67890 both appear."""
    rows = runs_rows_vast({}, _VAST_MONTHS, TODAY, run_cmd=_vast_run_cmd_shared)
    run_ids = {r["run_id"] for r in rows}
    assert "12345" in run_ids, f"instance 12345 missing from {run_ids}"
    assert "67890" in run_ids, f"instance 67890 missing from {run_ids}"


def test_runs_rows_vast_credit_row_excluded():
    """Credit row ($5) is excluded — only 'charge' type rows are processed."""
    rows = runs_rows_vast({}, _VAST_MONTHS, TODAY, run_cmd=_vast_run_cmd_shared)
    # If credit was included, total would exceed 30.00 significantly.
    total = sum(r["cost"] for r in rows)
    assert total == pytest.approx(30.0, abs=0.02), (
        f"credit appears to have been included: total={total}"
    )
    # No row should have a negative cost (credits would show up as negatives).
    assert all(r["cost"] >= 0 for r in rows), "negative cost row found (credit included?)"


def test_runs_rows_vast_started_before_ended():
    """Each row has started_at < ended_at and hours > 0."""
    rows = runs_rows_vast({}, _VAST_MONTHS, TODAY, run_cmd=_vast_run_cmd_shared)
    for row in rows:
        started = datetime.datetime.strptime(row["started_at"], "%Y-%m-%d %H:%M:%S")
        ended = datetime.datetime.strptime(row["ended_at"], "%Y-%m-%d %H:%M:%S")
        assert started < ended, f"started_at >= ended_at in row: {row}"
        assert row["hours"] > 0, f"hours <= 0 in row: {row}"


def test_runs_rows_vast_boundary_spanning_charge():
    """A charge spanning two months produces rows in each month, summing to charge amount.

    Fixture: charge ending 2026-06-02 02:00:00 (UTC) spanning 72h → covers
    2026-05-30 02:00:00 (May) and 2026-06-02 02:00:00 (June).
    Parts must both appear (one per month) and sum to the charge amount exactly.
    """
    import json
    # 2026-06-02 02:00:00 UTC = 1780365600 (calendar.timegm verified)
    ts_cross = 1780365600  # 2026-06-02 02:00:00 UTC
    cross_invoice = [
        {
            "type": "charge",
            "timestamp": str(ts_cross),
            "quantity": 72,         # 3 days: spans May 30 → Jun 2
            "amount": 9.99,
            "instance_id": 11111,
        }
    ]

    def run_cmd(cmd, **kwargs):
        return _Proc(stdout=json.dumps(cross_invoice))

    rows = runs_rows_vast({}, _VAST_MONTHS, TODAY, run_cmd=run_cmd)

    months_emitted = {r["month"] for r in rows}
    assert "2026-05" in months_emitted, f"2026-05 missing from {months_emitted}"
    assert "2026-06" in months_emitted, f"2026-06 missing from {months_emitted}"

    total = sum(r["cost"] for r in rows)
    assert total == pytest.approx(9.99, abs=0.001), (
        f"per-month parts do not sum to charge amount: {total} != 9.99"
    )


def test_runs_rows_vast_clipped_timestamps_within_month():
    """Each row's [started_at, ended_at] lies within its own calendar month."""
    import json
    # Use cross-boundary charge so we can verify clipping.
    ts_cross = 1780365600  # 2026-06-02 02:00:00 UTC
    cross_invoice = [
        {
            "type": "charge",
            "timestamp": str(ts_cross),
            "quantity": 72,
            "amount": 9.99,
            "instance_id": 22222,
        }
    ]

    def run_cmd(cmd, **kwargs):
        return _Proc(stdout=json.dumps(cross_invoice))

    rows = runs_rows_vast({}, _VAST_MONTHS, TODAY, run_cmd=run_cmd)
    assert rows, "expected at least one row"

    for row in rows:
        month = row["month"]
        year, m = int(month[:4]), int(month[5:7])
        month_start = datetime.datetime(year, m, 1)
        if m == 12:
            month_end = datetime.datetime(year + 1, 1, 1)
        else:
            month_end = datetime.datetime(year, m + 1, 1)

        started_at = datetime.datetime.strptime(row["started_at"], "%Y-%m-%d %H:%M:%S")
        ended_at = datetime.datetime.strptime(row["ended_at"], "%Y-%m-%d %H:%M:%S")

        assert started_at >= month_start, (
            f"started_at {started_at} is before month start {month_start} "
            f"for month {month}"
        )
        assert ended_at <= month_end, (
            f"ended_at {ended_at} is after month end {month_end} "
            f"for month {month}"
        )


def test_runs_rows_vast_shape():
    """Every row has all required gpu_runs fields."""
    required = {
        "month", "vendor", "run_id", "deployment", "gpu", "gpu_count",
        "started_at", "ended_at", "hours", "cost", "currency",
        "model", "kind", "source",
    }
    rows = runs_rows_vast({}, _VAST_MONTHS, TODAY, run_cmd=_vast_run_cmd_shared)
    assert rows, "should produce at least one row"
    for row in rows:
        missing = required - row.keys()
        assert not missing, f"row missing keys {missing}: {row}"


def test_runs_rows_vast_vendor_source_model_kind():
    """All rows: vendor='vast.ai', source='cli', kind='gpu', model='flux'."""
    rows = runs_rows_vast({}, _VAST_MONTHS, TODAY, run_cmd=_vast_run_cmd_shared)
    for row in rows:
        assert row["vendor"] == "vast.ai"
        assert row["source"] == "cli"
        assert row["kind"] == "gpu"
        assert row["model"] == "flux"


def test_runs_rows_vast_out_of_scope_months_excluded():
    """Rows for months outside the requested set are not emitted."""
    rows = runs_rows_vast({}, _VAST_MONTHS, TODAY, run_cmd=_vast_run_cmd_shared)
    for row in rows:
        assert row["month"] in set(_VAST_MONTHS), (
            f"row month {row['month']} not in {_VAST_MONTHS}"
        )


def test_runs_rows_vast_passes_validation():
    """All produced rows pass _validate_gpu_runs_row."""
    rows = runs_rows_vast({}, _VAST_MONTHS, TODAY, run_cmd=_vast_run_cmd_shared)
    for row in rows:
        ingest_run._validate_gpu_runs_row(row)


def test_runs_rows_vast_missing_cli_raises():
    """FileNotFoundError from subprocess propagates as RuntimeError."""
    def run_cmd(cmd, **kwargs):
        raise FileNotFoundError("vastai not found")
    with pytest.raises(RuntimeError, match="vastai CLI"):
        runs_rows_vast({}, _VAST_MONTHS, TODAY, run_cmd=run_cmd)


# ---------------------------------------------------------------------------
# runs_rows_modal — serverless shape + cost parity vs monthly_rows_modal
# ---------------------------------------------------------------------------

from ingest.connectors.gpu_billing import monthly_rows_modal as _monthly_rows_modal  # noqa: E402

_MODAL_DAILY = [
    {"app": "image-gen-prod", "cost": "12.50"},
    {"app": "image-gen-prod", "cost": "8.75"},
    {"app": "video-gen-prod", "cost": "3.00"},
]
_MODAL_SECRETS = {"MODAL_TOKEN_ID": "tid", "MODAL_TOKEN_SECRET": "sec"}
_MODAL_MONTHS = ["2026-05", "2026-06"]


class _ModalProc:
    def __init__(self, stdout="[]", returncode=0, stderr=""):
        self.stdout = stdout
        self.returncode = returncode
        self.stderr = stderr


def _modal_run_cmd_single(cmd, **kwargs):
    """Returns _MODAL_DAILY for every month call."""
    import json
    return _ModalProc(stdout=json.dumps(_MODAL_DAILY))


def test_runs_rows_modal_shape():
    """Every row has all required gpu_runs fields."""
    required = {
        "month", "vendor", "run_id", "deployment", "gpu", "gpu_count",
        "started_at", "ended_at", "hours", "cost", "currency",
        "model", "kind", "source",
    }
    rows = runs_rows_modal(_MODAL_SECRETS, ["2026-06"], run_cmd=_modal_run_cmd_single)
    assert rows, "should produce at least one row"
    for row in rows:
        missing = required - row.keys()
        assert not missing, f"row missing keys {missing}: {row}"


def test_runs_rows_modal_serverless_fields():
    """Serverless rows: kind='serverless', hours=None, empty times."""
    rows = runs_rows_modal(_MODAL_SECRETS, ["2026-06"], run_cmd=_modal_run_cmd_single)
    for row in rows:
        assert row["kind"] == "serverless", f"expected serverless kind, got {row['kind']}"
        assert row["hours"] is None, f"expected hours=None, got {row['hours']}"
        assert row["started_at"] == "", f"expected empty started_at, got {row['started_at']}"
        assert row["ended_at"] == "", f"expected empty ended_at, got {row['ended_at']}"


def test_runs_rows_modal_app_name_as_run_id_and_deployment():
    """app name is used as both run_id and deployment."""
    rows = runs_rows_modal(_MODAL_SECRETS, ["2026-06"], run_cmd=_modal_run_cmd_single)
    for row in rows:
        assert row["run_id"] == row["deployment"], (
            f"run_id {row['run_id']!r} != deployment {row['deployment']!r}"
        )
        assert row["run_id"] in {"image-gen-prod", "video-gen-prod"}, (
            f"unexpected run_id {row['run_id']!r}"
        )


def test_runs_rows_modal_model_from_stamp():
    """model comes from stamp('modal', app_name) — should be the modal csv."""
    expected_model, _ = stamp("modal", "image-gen-prod")
    rows = runs_rows_modal(_MODAL_SECRETS, ["2026-06"], run_cmd=_modal_run_cmd_single)
    image_rows = [r for r in rows if r["run_id"] == "image-gen-prod"]
    assert len(image_rows) == 1
    assert image_rows[0]["model"] == expected_model, (
        f"model {image_rows[0]['model']!r} != stamp result {expected_model!r}"
    )


def test_runs_rows_modal_vendor_and_source():
    """All rows: vendor='modal', source='cli', currency='USD'."""
    rows = runs_rows_modal(_MODAL_SECRETS, ["2026-06"], run_cmd=_modal_run_cmd_single)
    for row in rows:
        assert row["vendor"] == "modal"
        assert row["source"] == "cli"
        assert row["currency"] == "USD"


def test_runs_rows_modal_cost_parity_vs_monthly_rows_modal():
    """Per-(app, month) cost matches monthly_rows_modal on the same fixture.

    The reshaping to gpu_runs schema must not change billed amounts.
    """
    billing_rows = _monthly_rows_modal(
        _MODAL_SECRETS, ["2026-06"], run_cmd=_modal_run_cmd_single
    )
    run_rows = runs_rows_modal(
        _MODAL_SECRETS, ["2026-06"], run_cmd=_modal_run_cmd_single
    )

    billing_map = {(r["month"], r["deployment"]): r["amount"] for r in billing_rows}
    runs_map    = {(r["month"], r["deployment"]): r["cost"]   for r in run_rows}

    assert billing_map == runs_map, (
        f"cost mismatch between billing and runs connectors:\n"
        f"billing={billing_map}\nruns={runs_map}"
    )


def test_runs_rows_modal_multiple_months():
    """One CLI call per month; rows emitted for each requested month."""
    call_count = {"n": 0}

    def run_cmd(cmd, **kwargs):
        call_count["n"] += 1
        import json
        return _ModalProc(stdout=json.dumps([{"app": "my-app", "cost": "1.00"}]))

    rows = runs_rows_modal(_MODAL_SECRETS, _MODAL_MONTHS, run_cmd=run_cmd)
    assert call_count["n"] == len(_MODAL_MONTHS), (
        f"expected {len(_MODAL_MONTHS)} CLI calls, got {call_count['n']}"
    )
    months_returned = {r["month"] for r in rows}
    assert months_returned == set(_MODAL_MONTHS)


def test_runs_rows_modal_zero_cost_skipped():
    """A month with no non-zero rows produces no output rows."""
    def run_cmd(cmd, **kwargs):
        return _ModalProc(stdout="[]")

    rows = runs_rows_modal(_MODAL_SECRETS, ["2026-04"], run_cmd=run_cmd)
    assert rows == []


def test_runs_rows_modal_missing_key_raises():
    with pytest.raises(RuntimeError, match="MODAL_TOKEN"):
        runs_rows_modal({}, ["2026-06"], run_cmd=_modal_run_cmd_single)


def test_runs_rows_modal_cli_nonzero_rc_raises():
    def run_cmd(cmd, **kwargs):
        return _ModalProc(returncode=1, stderr="modal error")
    with pytest.raises(RuntimeError, match="failed"):
        runs_rows_modal(_MODAL_SECRETS, ["2026-06"], run_cmd=run_cmd)


def test_runs_rows_modal_env_merge(monkeypatch):
    """run_cmd receives env with MODAL_TOKEN_ID/SECRET merged into os.environ."""
    captured_env = {}

    def run_cmd(cmd, env=None, **kwargs):
        captured_env.update(env or {})
        return _ModalProc(stdout="[]")

    monkeypatch.setenv("EXISTING_VAR", "existing_value")
    runs_rows_modal(_MODAL_SECRETS, ["2026-06"], run_cmd=run_cmd)

    assert captured_env.get("MODAL_TOKEN_ID") == "tid"
    assert captured_env.get("MODAL_TOKEN_SECRET") == "sec"
    assert captured_env.get("EXISTING_VAR") == "existing_value", (
        "existing env vars must be preserved in the merged env"
    )


def test_runs_rows_modal_passes_validation():
    """All produced rows pass _validate_gpu_runs_row."""
    rows = runs_rows_modal(_MODAL_SECRETS, ["2026-06"], run_cmd=_modal_run_cmd_single)
    for row in rows:
        ingest_run._validate_gpu_runs_row(row)
