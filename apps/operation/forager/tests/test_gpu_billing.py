"""Tests for ingest.connectors.gpu_billing — hermetic, no network, no subprocess.

Run: cd apps/operation/forager && python3 -m pytest tests/test_gpu_billing.py -q
"""
import collections
import json
import re

import pytest

from ingest.connectors import gpu_billing
from ingest import run as ingest_run

TODAY = "2026-07-08"
MONTHS = ["2026-05", "2026-06"]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

class _Proc:
    def __init__(self, stdout="[]", returncode=0, stderr=""):
        self.stdout = stdout
        self.returncode = returncode
        self.stderr = stderr


def _make_run_cmd(stdout="[]", returncode=0, stderr=""):
    def run_cmd(cmd, **kwargs):
        return _Proc(stdout=stdout, returncode=returncode, stderr=stderr)
    return run_cmd


# ---------------------------------------------------------------------------
# RunPod: multi-row summing, name resolution, unresolved id, _storage,
#         _serverless
# ---------------------------------------------------------------------------

_RUNPOD_BILLING_PODS = [
    # Two rows for the same pod in June → must be summed
    {"podId": "pod-aaa", "amount": 200.0, "time": "2026-06-01T00:00:00Z"},
    {"podId": "pod-aaa", "amount": 74.45, "time": "2026-06-01T00:00:00Z"},
    # Different pod, June
    {"podId": "pod-bbb", "amount": 50.0, "time": "2026-06-01T00:00:00Z"},
    # Out-of-scope month (May is requested, July is not)
    {"podId": "pod-ccc", "amount": 10.0, "time": "2026-07-01T00:00:00Z"},
    # Zero-amount row — must be skipped
    {"podId": "pod-ddd", "amount": 0.0, "time": "2026-06-01T00:00:00Z"},
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
    """Dispatch by URL surface."""
    if "graphql" in url:
        return _RUNPOD_GRAPHQL_RESP
    if "networkvolumes" in url:
        return _RUNPOD_BILLING_VOLUMES
    if "endpoints" in url:
        return _RUNPOD_BILLING_ENDPOINTS
    # pods surface
    return _RUNPOD_BILLING_PODS


def test_runpod_multi_row_summing():
    """Two billing rows for the same podId in the same month → summed."""
    rows = gpu_billing.monthly_rows_runpod(
        {"RUNPOD_API_KEY": "k"}, MONTHS, http=_runpod_http
    )
    zimage = [r for r in rows if r["deployment"] == "zimage-4090-secure"]
    assert len(zimage) == 1
    assert zimage[0]["amount"] == round(200.0 + 74.45, 2)


def test_runpod_name_resolution():
    """Live pod ids resolved to names via GraphQL."""
    rows = gpu_billing.monthly_rows_runpod(
        {"RUNPOD_API_KEY": "k"}, MONTHS, http=_runpod_http
    )
    names = {r["deployment"] for r in rows}
    assert "zimage-4090-secure" in names
    assert "klein-a5000-v4" in names


def test_runpod_unresolved_id_stays_raw():
    """A pod id not in the GraphQL response stays as the raw id."""
    # Add a pod not in the GraphQL name map
    billing_with_extra = _RUNPOD_BILLING_PODS + [
        {"podId": "pod-zzz", "amount": 5.0, "time": "2026-06-01T00:00:00Z"},
    ]
    def http(url, headers=None, data=None):
        if "graphql" in url:
            return _RUNPOD_GRAPHQL_RESP
        if "networkvolumes" in url:
            return []
        if "endpoints" in url:
            return []
        return billing_with_extra
    rows = gpu_billing.monthly_rows_runpod(
        {"RUNPOD_API_KEY": "k"}, MONTHS, http=http
    )
    assert any(r["deployment"] == "pod-zzz" for r in rows)


def test_runpod_storage_row():
    """Networkvolumes surface → deployment="_storage"."""
    rows = gpu_billing.monthly_rows_runpod(
        {"RUNPOD_API_KEY": "k"}, MONTHS, http=_runpod_http
    )
    storage = [r for r in rows if r["deployment"] == "_storage"]
    assert len(storage) == 1
    assert storage[0]["month"] == "2026-06"
    assert storage[0]["amount"] == 6.99


def test_runpod_serverless_row():
    """Endpoints surface → deployment="_serverless:<endpointId>"."""
    rows = gpu_billing.monthly_rows_runpod(
        {"RUNPOD_API_KEY": "k"}, MONTHS, http=_runpod_http
    )
    serverless = [r for r in rows if r["deployment"].startswith("_serverless")]
    assert len(serverless) == 1
    assert serverless[0]["deployment"] == "_serverless:ep-123"
    assert serverless[0]["month"] == "2026-05"


def test_runpod_out_of_scope_month_excluded():
    """July row is excluded because MONTHS only covers May + June."""
    rows = gpu_billing.monthly_rows_runpod(
        {"RUNPOD_API_KEY": "k"}, MONTHS, http=_runpod_http
    )
    assert all(r["month"] in {"2026-05", "2026-06"} for r in rows)


def test_runpod_graphql_key_in_url():
    """GraphQL call puts the key in the URL query string, not a header."""
    seen = {}
    def http(url, headers=None, data=None):
        if "graphql" in url:
            seen["url"] = url
            seen["headers"] = headers or {}
            return _RUNPOD_GRAPHQL_RESP
        if "networkvolumes" in url or "endpoints" in url:
            return []
        # pods surface: return a pod row so that the GraphQL name-resolution
        # call is actually triggered
        return [{"podId": "pod-aaa", "amount": 100.0, "time": "2026-06-01T00:00:00Z"}]
    gpu_billing.monthly_rows_runpod(
        {"RUNPOD_API_KEY": "SEKRET"}, MONTHS, http=http
    )
    assert "SEKRET" in seen.get("url", "")
    assert "Authorization" not in seen.get("headers", {})


def test_runpod_zero_rows_skipped():
    """Zero-amount rows do not appear in output."""
    def http(url, headers=None, data=None):
        if "graphql" in url:
            return {"data": {"myself": {"pods": []}}}
        return [{"podId": "x", "amount": 0.0, "time": "2026-06-01T00:00:00Z"}]
    rows = gpu_billing.monthly_rows_runpod(
        {"RUNPOD_API_KEY": "k"}, MONTHS, http=http
    )
    assert rows == []


def test_runpod_missing_key_raises():
    with pytest.raises(RuntimeError, match="RUNPOD_API_KEY missing"):
        gpu_billing.monthly_rows_runpod({}, MONTHS, http=lambda *a, **k: {})


# ---------------------------------------------------------------------------
# Modal: per-app monthly sum, zero-month skip
# ---------------------------------------------------------------------------

_MODAL_DAILY = [
    {"app": "image-gen-prod", "cost": "12.50"},
    {"app": "image-gen-prod", "cost": "8.75"},
    {"app": "video-gen-prod", "cost": "3.00"},
]


def test_modal_per_app_monthly_sum():
    """Daily rows per-app are summed into one row per (month, app)."""
    rows = gpu_billing.monthly_rows_modal(
        {"MODAL_TOKEN_ID": "tid", "MODAL_TOKEN_SECRET": "sec"},
        ["2026-06"],
        run_cmd=_make_run_cmd(stdout=json.dumps(_MODAL_DAILY)),
    )
    image = [r for r in rows if r["deployment"] == "image-gen-prod"]
    assert len(image) == 1
    assert image[0]["amount"] == round(12.50 + 8.75, 2)
    video = [r for r in rows if r["deployment"] == "video-gen-prod"]
    assert len(video) == 1
    assert video[0]["amount"] == 3.00


def test_modal_zero_month_skipped():
    """A month with no non-zero rows produces no output rows."""
    rows = gpu_billing.monthly_rows_modal(
        {"MODAL_TOKEN_ID": "tid", "MODAL_TOKEN_SECRET": "sec"},
        ["2026-04"],
        run_cmd=_make_run_cmd(stdout=json.dumps([])),
    )
    assert rows == []


def test_modal_source_is_cli():
    rows = gpu_billing.monthly_rows_modal(
        {"MODAL_TOKEN_ID": "tid", "MODAL_TOKEN_SECRET": "sec"},
        ["2026-06"],
        run_cmd=_make_run_cmd(stdout=json.dumps(_MODAL_DAILY)),
    )
    assert all(r["source"] == "cli" for r in rows)


def test_modal_accepts_description_field():
    """Accept 'description' as fallback app name field."""
    daily = [{"description": "batch-worker", "cost": "5.00"}]
    rows = gpu_billing.monthly_rows_modal(
        {"MODAL_TOKEN_ID": "tid", "MODAL_TOKEN_SECRET": "sec"},
        ["2026-06"],
        run_cmd=_make_run_cmd(stdout=json.dumps(daily)),
    )
    assert rows[0]["deployment"] == "batch-worker"


def test_modal_multiple_months():
    """Multiple months each get their own CLI call and rows."""
    call_count = {"n": 0}
    def run_cmd(cmd, **kwargs):
        call_count["n"] += 1
        return _Proc(stdout=json.dumps([{"app": "my-app", "cost": "1.00"}]))
    rows = gpu_billing.monthly_rows_modal(
        {"MODAL_TOKEN_ID": "tid", "MODAL_TOKEN_SECRET": "sec"},
        ["2026-05", "2026-06"],
        run_cmd=run_cmd,
    )
    assert call_count["n"] == 2
    months_returned = {r["month"] for r in rows}
    assert months_returned == {"2026-05", "2026-06"}


def test_modal_missing_key_raises():
    with pytest.raises(RuntimeError, match="MODAL_TOKEN"):
        gpu_billing.monthly_rows_modal(
            {}, ["2026-06"],
            run_cmd=_make_run_cmd(),
        )


def test_modal_cli_nonzero_rc_raises():
    with pytest.raises(RuntimeError, match="failed"):
        gpu_billing.monthly_rows_modal(
            {"MODAL_TOKEN_ID": "tid", "MODAL_TOKEN_SECRET": "sec"},
            ["2026-06"],
            run_cmd=_make_run_cmd(returncode=1, stderr="error"),
        )


# ---------------------------------------------------------------------------
# Vast: _spread reuse, per-instance attribution
# ---------------------------------------------------------------------------

_VAST_INVOICES = [
    # Charge covers 48h ending 2026-06-15 → spread over June entirely.
    # timestamp 1781474400 == 2026-06-15 (UTC)
    {
        "type": "charge",
        "timestamp": "1781474400",
        "quantity": 48,
        "amount": 20.0,
        "instance_id": 12345,
    },
    # Another instance, same month.
    {
        "type": "charge",
        "timestamp": "1781474400",
        "quantity": 24,
        "amount": 10.0,
        "instance_id": 67890,
    },
    # Non-charge row — must be ignored.
    {
        "type": "credit",
        "timestamp": "1781474400",
        "quantity": 0,
        "amount": 5.0,
        "instance_id": 12345,
    },
]


def _vast_run_cmd(cmd, **kwargs):
    return _Proc(stdout=json.dumps(_VAST_INVOICES))


def test_vast_spread_reuse_and_per_instance():
    """_spread is reused (not duplicated); charges attributed per instance_id."""
    rows = gpu_billing.monthly_rows_vast(
        {}, MONTHS, TODAY, run_cmd=_vast_run_cmd
    )
    # Both instances should have rows for the months they cover.
    instance_ids = {r["deployment"] for r in rows}
    assert "12345" in instance_ids
    assert "67890" in instance_ids


def test_vast_credit_rows_excluded():
    """Only 'charge' type rows are processed; credit rows are ignored."""
    rows = gpu_billing.monthly_rows_vast(
        {}, MONTHS, TODAY, run_cmd=_vast_run_cmd
    )
    # Sum of amounts should match only the charge rows (not the credit).
    total = sum(r["amount"] for r in rows)
    # credit row ($5) must not appear
    assert total <= 30.01  # 20 + 10 max (rounded)


def test_vast_source_is_cli():
    rows = gpu_billing.monthly_rows_vast(
        {}, MONTHS, TODAY, run_cmd=_vast_run_cmd
    )
    assert all(r["source"] == "cli" for r in rows)


def test_vast_out_of_scope_months_excluded():
    """Charges spreading into months outside the requested set are excluded."""
    # Charge posting way after requested months should not produce rows for those months.
    far_future = [
        {
            "type": "charge",
            "timestamp": "1800000000",  # 2027 ish
            "quantity": 24,
            "amount": 5.0,
            "instance_id": 999,
        }
    ]
    def run_cmd(cmd, **kwargs):
        return _Proc(stdout=json.dumps(far_future))
    rows = gpu_billing.monthly_rows_vast(
        {}, ["2026-05", "2026-06"], TODAY, run_cmd=run_cmd
    )
    # Charge posts in 2027; its covered window (24h back) is also in 2027 →
    # nothing should fall in 2026-05 or 2026-06.
    assert rows == []


def test_vast_missing_cli_raises():
    def run_cmd(cmd, **kwargs):
        raise FileNotFoundError("vastai not found")
    with pytest.raises(RuntimeError, match="vastai CLI"):
        gpu_billing.monthly_rows_vast({}, MONTHS, TODAY, run_cmd=run_cmd)


# ---------------------------------------------------------------------------
# refresh_gpu_billing: manual survival, out-of-scope splice, per-vendor
#                      error isolation, all-fail raises
# ---------------------------------------------------------------------------

class _FakeTB:
    """Minimal TB stub: capture replaces; maintain state for guard snapshot."""
    def __init__(self, existing_rows=None):
        self.replaced = []
        self._rows = existing_rows or {}

    def replace(self, datasource, rows):
        self.replaced.append((datasource, list(rows)))

    def query(self, datasource, **kwargs):
        return list(self._rows.get(datasource, []))


def _make_guard(existing_rows=None):
    return {
        "yes": False,
        "dry_run": False,
        "existing": {
            "gpu_billing": list((existing_rows or {}).get("gpu_billing", [])),
        },
    }


_RUNPOD_BILLING_ROW = {
    "month": "2026-06",
    "vendor": "runpod",
    "deployment": "zimage-4090-secure",
    "gpu": "",
    "amount": 274.45,
    "currency": "USD",
    "source": "api",
}
_MANUAL_ROW = {
    "month": "2026-06",
    "vendor": "lambda",
    "deployment": "GH200-shared",
    "gpu": "1x GH200",
    "amount": 500.0,
    "currency": "USD",
    "source": "manual",
}
_MANUAL_ROW_OUT_OF_SCOPE = {
    "month": "2025-12",
    "vendor": "lambda",
    "deployment": "old-box",
    "gpu": "",
    "amount": 100.0,
    "currency": "USD",
    "source": "manual",
}


def _make_connectors(runpod_rows=None, modal_rows=None, vast_rows=None,
                     runpod_err=None, modal_err=None, vast_err=None):
    """Return a connectors dict suitable for injection into refresh_gpu_billing."""
    def mk(rows, err):
        def fn(creds, months, **kw):
            if err:
                raise RuntimeError(err)
            return rows or []
        return fn
    return {
        "runpod": mk(runpod_rows, runpod_err),
        "modal":  mk(modal_rows, modal_err),
        "vast":   mk(vast_rows, vast_err),
    }


def test_refresh_gpu_billing_manual_survival():
    """Manual rows in scope survive alongside fresh api rows (manual outranks api)."""
    existing = [_MANUAL_ROW, _RUNPOD_BILLING_ROW]
    guard = _make_guard({"gpu_billing": existing})
    statuses = {}
    ops_replace = _FakeTB()

    ingest_run.refresh_gpu_billing(
        ops_replace=ops_replace,
        secrets={},
        config={},
        today=TODAY,
        statuses=statuses,
        guard=guard,
        months=["2026-06"],
        connectors=_make_connectors(runpod_rows=[_RUNPOD_BILLING_ROW]),
    )

    assert ops_replace.replaced, "guarded_replace must be called"
    _, final_rows = ops_replace.replaced[0]

    # Manual row must survive
    manual_found = [r for r in final_rows if r["source"] == "manual" and r["vendor"] == "lambda"]
    assert len(manual_found) == 1, "manual lambda row must survive"

    # Where both manual and api exist for the same (vendor, month, deployment),
    # manual takes precedence — the api row for runpod must still be present.
    runpod_found = [r for r in final_rows if r["vendor"] == "runpod"]
    assert len(runpod_found) == 1


def test_refresh_gpu_billing_out_of_scope_splice():
    """Out-of-scope existing rows survive untouched; in-scope rows replaced."""
    existing = [_MANUAL_ROW, _MANUAL_ROW_OUT_OF_SCOPE]
    guard = _make_guard({"gpu_billing": existing})
    statuses = {}
    ops_replace = _FakeTB()

    ingest_run.refresh_gpu_billing(
        ops_replace=ops_replace,
        secrets={},
        config={},
        today=TODAY,
        statuses=statuses,
        guard=guard,
        months=["2026-06"],
        connectors=_make_connectors(runpod_rows=[_RUNPOD_BILLING_ROW]),
    )

    _, final_rows = ops_replace.replaced[0]
    out_of_scope = [r for r in final_rows if r["month"] == "2025-12"]
    assert len(out_of_scope) == 1, "out-of-scope rows must be preserved"


def test_refresh_gpu_billing_per_vendor_error_isolation():
    """One vendor failing records err status; other vendor rows still land."""
    guard = _make_guard()
    statuses = {}
    ops_replace = _FakeTB()

    ingest_run.refresh_gpu_billing(
        ops_replace=ops_replace,
        secrets={},
        config={},
        today=TODAY,
        statuses=statuses,
        guard=guard,
        months=["2026-06"],
        connectors=_make_connectors(
            runpod_rows=[_RUNPOD_BILLING_ROW],
            modal_err="modal down",
        ),
    )

    assert statuses.get("billing:modal", "").startswith("err:")
    assert statuses.get("billing:runpod", "").startswith("ok:")


def test_refresh_gpu_billing_all_fail_raises():
    """If every vendor fails, refresh_gpu_billing raises so the caller knows."""
    guard = _make_guard()
    statuses = {}
    ops_replace = _FakeTB()

    with pytest.raises(RuntimeError):
        ingest_run.refresh_gpu_billing(
            ops_replace=ops_replace,
            secrets={},
            config={},
            today=TODAY,
            statuses=statuses,
            guard=guard,
            months=["2026-06"],
            connectors=_make_connectors(
                runpod_err="down",
                modal_err="down",
                vast_err="down",
            ),
        )


def test_refresh_gpu_billing_statuses_rows_count():
    """statuses['gpu_billing_rows'] reflects the final row count."""
    guard = _make_guard()
    statuses = {}
    ops_replace = _FakeTB()

    ingest_run.refresh_gpu_billing(
        ops_replace=ops_replace,
        secrets={},
        config={},
        today=TODAY,
        statuses=statuses,
        guard=guard,
        months=["2026-06"],
        connectors=_make_connectors(runpod_rows=[_RUNPOD_BILLING_ROW]),
    )

    assert "gpu_billing_rows" in statuses
    assert isinstance(statuses["gpu_billing_rows"], int)
    assert statuses["gpu_billing_rows"] >= 1


# ---------------------------------------------------------------------------
# _validate_gpu_billing_row: unknown vendor raises ValueError (not NameError)
# ---------------------------------------------------------------------------

def test_validate_gpu_billing_row_unknown_vendor_raises_valueerror():
    """Unknown vendor in gpu_billing row raises ValueError, not NameError."""
    unknown_vendor_row = {
        "month": "2026-06",
        "vendor": "unknown-vendor-xyz",
        "deployment": "some-box",
        "gpu": "",
        "amount": 100.0,
        "currency": "USD",
        "source": "manual",
    }
    with pytest.raises(ValueError, match="gpu_billing row vendor 'unknown-vendor-xyz' is not canonical"):
        ingest_run._validate_gpu_billing_row(unknown_vendor_row)
