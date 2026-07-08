"""Tests for ingest.run.refresh_provider_monthly: OVH is manual-only (its
connector must never be invoked from the refresh path) and GPU-basis
vendors' default "compute" rows are remapped to "compute-gpu" as part of
the refresh, not just via the pure remap_gpu_categories function (covered
separately in test_meter_dedupe.py).

Run: cd apps/operation/forager && python3 -m pytest tests/test_provider_monthly.py -q
"""
import pytest

from ingest import run as ingest_run
from ingest.connectors import registry


class _FakeProviderTB:
    """Minimal TB stub: capture replaces."""

    def __init__(self):
        self.replaced = []

    def replace(self, datasource, rows):
        self.replaced.append((datasource, list(rows)))


def _make_guard(existing_provider_monthly=None, yes=True, dry_run=False):
    return {
        "yes": yes,
        "dry_run": dry_run,
        "existing": {"provider_monthly": list(existing_provider_monthly or [])},
    }


_TODAY = "2026-07-08"
_CONFIG = {"months_start": "2026-01"}


def _fake_meter(rows):
    def fn(secrets, months, today):
        return list(rows)
    return fn


def _raising_meter(msg="ovh connector must not be invoked by refresh_provider_monthly"):
    def fn(secrets, months, today):
        raise AssertionError(msg)
    return fn


def test_refresh_provider_monthly_does_not_invoke_ovh_connector(monkeypatch):
    """OVH is manual-only now — refresh_provider_monthly must never call its
    meter connector, even when scanning the full registry."""
    fake_meter = [
        ("runpod", _fake_meter([
            {"month": "2026-06", "vendor": "runpod", "currency": "USD",
             "category": "compute", "credit": 100.0, "paid": 0.0, "source": "api"},
        ])),
        ("ovhcloud", _raising_meter()),
    ]
    monkeypatch.setattr(registry, "METER", fake_meter)

    guard = _make_guard()
    statuses = {}
    ops_replace = _FakeProviderTB()

    ingest_run.refresh_provider_monthly(
        ops_replace, secrets={}, config=_CONFIG, today=_TODAY,
        statuses=statuses, guard=guard, months=["2026-06"],
    )

    assert "provider:ovhcloud" not in statuses
    _, final_rows = ops_replace.replaced[0]
    assert all(r["vendor"] != "ovhcloud" for r in final_rows)


def test_refresh_provider_monthly_remaps_gpu_vendor_to_compute_gpu(monkeypatch):
    """A GPU-basis vendor's fresh default-compute row lands as compute-gpu;
    a non-GPU infra row (cloudflare) is untouched."""
    fake_meter = [
        ("runpod", _fake_meter([
            {"month": "2026-06", "vendor": "runpod", "currency": "USD",
             "category": "compute", "credit": 274.45, "paid": 0.0, "source": "api"},
        ])),
        ("cloudflare", _fake_meter([
            {"month": "2026-06", "vendor": "cloudflare", "currency": "USD",
             "category": "infra", "credit": 50.0, "paid": 0.0, "source": "api"},
        ])),
    ]
    monkeypatch.setattr(registry, "METER", fake_meter)

    guard = _make_guard()
    statuses = {}
    ops_replace = _FakeProviderTB()

    ingest_run.refresh_provider_monthly(
        ops_replace, secrets={}, config=_CONFIG, today=_TODAY,
        statuses=statuses, guard=guard, months=["2026-06"],
    )

    _, final_rows = ops_replace.replaced[0]
    runpod_row = next(r for r in final_rows if r["vendor"] == "runpod")
    assert runpod_row["category"] == "compute-gpu"
    cloudflare_row = next(r for r in final_rows if r["vendor"] == "cloudflare")
    assert cloudflare_row["category"] == "infra"


def test_refresh_provider_monthly_manual_explicit_category_not_remapped(monkeypatch):
    """A surviving manual GPU-vendor row with an explicit non-compute
    category (e.g. an infra correction) is left untouched by the remap —
    only the default "compute" bucket is unambiguous enough to retag."""
    fake_meter = [
        ("runpod", _fake_meter([])),
        ("aws", _fake_meter([
            {"month": "2026-06", "vendor": "aws", "currency": "USD",
             "category": "compute", "credit": 10.0, "paid": 0.0, "source": "api"},
        ])),
    ]
    monkeypatch.setattr(registry, "METER", fake_meter)

    existing = [
        {"month": "2026-06", "vendor": "runpod", "currency": "USD",
         "category": "infra", "credit": 5.0, "paid": 0.0, "source": "manual"},
    ]
    guard = _make_guard(existing_provider_monthly=existing)
    statuses = {}
    ops_replace = _FakeProviderTB()

    ingest_run.refresh_provider_monthly(
        ops_replace, secrets={}, config=_CONFIG, today=_TODAY,
        statuses=statuses, guard=guard, months=["2026-06"],
    )

    _, final_rows = ops_replace.replaced[0]
    runpod_row = next(r for r in final_rows if r["vendor"] == "runpod")
    assert runpod_row["category"] == "infra"
    assert runpod_row["source"] == "manual"


def test_parse_args_provider_vendor_rejects_ovhcloud():
    """ovhcloud is manual-only — --vendor ovhcloud --only provider must be
    rejected at parse time, pointing operators at ingest.record instead."""
    with pytest.raises(SystemExit):
        ingest_run.parse_args(["--vendor", "ovhcloud", "--only", "provider"])
