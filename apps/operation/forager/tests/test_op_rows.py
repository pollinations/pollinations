import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from ingest import op_rows


RECORDED_AT = "2026-07-09 00:00:00"


def test_provider_monthly_maps_to_signed_op_cloud():
    row = op_rows.provider_monthly_to_cloud(
        {
            "month": "2026-06",
            "vendor": "openai",
            "currency": "USD",
            "category": "compute",
            "credit": 12.34,
            "paid": 56.78,
            "source": "api",
        },
        RECORDED_AT,
    )

    assert row["type"] == "inference"
    assert row["start"] == "2026-06-01 00:00:00"
    assert row["end"] == "2026-07-01 00:00:00"
    assert row["credit"] == -12.34
    assert row["paid"] == -56.78


def test_gpu_runs_maps_serverless_to_inference_and_gpu_to_gpu():
    serverless = op_rows.gpu_run_to_cloud(
        {
            "month": "2026-04",
            "vendor": "runpod",
            "run_id": "_serverless:abc",
            "deployment": "pollinations-flux",
            "gpu": "RTX 5090",
            "started_at": "",
            "ended_at": "",
            "cost": 114.21,
            "currency": "USD",
            "model": "flux",
            "kind": "serverless",
            "source": "manual",
        },
        RECORDED_AT,
    )
    gpu = op_rows.gpu_run_to_cloud(
        {
            "month": "2026-06",
            "vendor": "lambda",
            "run_id": "pod-1",
            "deployment": "sana",
            "gpu": "gpu_1x_gh200",
            "gpu_count": 2,
            "started_at": "2026-06-01 00:00:00",
            "ended_at": "2026-07-01 00:00:00",
            "cost": 1648.8,
            "currency": "USD",
            "model": "ltx-2,acestep,sana",
            "kind": "gpu",
            "source": "manual",
        },
        RECORDED_AT,
    )

    assert serverless["type"] == "inference"
    assert serverless["end"] == ""
    assert serverless["paid"] == -114.21
    assert serverless["evidence"]
    assert gpu["type"] == "gpu"
    assert gpu["start"] == "2026-06-01 00:00:00"
    assert gpu["paid"] == -1648.8
    assert gpu["resource_count"] == 2.0


def test_grants_become_positive_cloud_credit_events():
    row = op_rows.grant_to_cloud(
        {
            "vendor": "runpod",
            "label": "startup credits",
            "granted": 1000,
            "currency": "USD",
            "start_date": "2026-01-01",
            "expires": "1970-01-01",
        },
        RECORDED_AT,
    )

    assert row["type"] == "gpu"
    assert row["start"] == "2026-01-01 00:00:00"
    assert row["credit"] == 1000
    assert row["paid"] == 0
    assert row["end"] == ""
    assert row["evidence"]


def test_grant_expiry_is_normalized_to_utc_midnight():
    row = op_rows.grant_to_cloud(
        {
            "vendor": "scaleway",
            "label": "startup",
            "granted": 1000,
            "currency": "EUR",
            "start_date": "2026-01-01",
            "expires": "2026-02-28",
        },
        RECORDED_AT,
    )

    assert row["start"] == "2026-01-01 00:00:00"
    assert row["end"] == "2026-02-28 00:00:00"


def test_legacy_transactions_map_compute_to_cloud_and_negative_amount():
    row = op_rows.legacy_transaction_to_op(
        {
            "date": "2026-06-01",
            "vendor": "runpod",
            "category": "compute",
            "charged_amount": 10,
            "charged_currency": "EUR",
        },
        RECORDED_AT,
    )

    assert row["source"] == "wise"
    assert row["category"] == "cloud"
    assert row["amount"] == -10


def test_cloud_builder_prefers_gpu_run_detail_over_provider_gpu_aggregate():
    rows = op_rows.build_cloud_rows(
        provider_rows=[
            {
                "month": "2026-06",
                "vendor": "runpod",
                "currency": "USD",
                "category": "compute-gpu",
                "credit": 0,
                "paid": 100,
                "source": "api",
            }
        ],
        gpu_rows=[
            {
                "month": "2026-06",
                "vendor": "runpod",
                "run_id": "pod-1",
                "deployment": "flux",
                "gpu": "RTX 4090",
                "started_at": "2026-06-01 00:00:00",
                "ended_at": "2026-07-01 00:00:00",
                "cost": 100,
                "currency": "USD",
                "model": "flux",
                "kind": "gpu",
                "source": "api",
            }
        ],
        grant_rows=[],
        recorded_at=RECORDED_AT,
    )

    assert len(rows) == 1
    assert rows[0]["resource_id"] == "pod-1"


def test_cloud_validation_rejects_non_cloud_sources():
    try:
        op_rows.validate_cloud_rows([
            {
                "source": "wise",
                "vendor": "runpod",
                "type": "gpu",
                "start": "2026-06-01 00:00:00",
                "end": "2026-07-01 00:00:00",
                "credit": 0,
                "paid": -1,
                "currency": "USD",
                "resource_id": "",
                "resource_name": "",
                "resource_sku": "",
                "resource_count": 1,
                "model": "",
                "evidence": "",
                "recorded_at": RECORDED_AT,
            }
        ])
    except ValueError as error:
        assert "invalid source" in str(error)
    else:
        raise AssertionError("expected invalid source")


def test_pollen_request_split_preserves_zero_paid_requests():
    row = op_rows.pollen_monthly_to_op(
        {
            "month": "2026-07",
            "vendor": "assemblyai",
            "model": "universal-3-pro",
            "currency": "POLLEN",
            "requests_paid": 0,
            "requests_quests": 17,
            "requests": 17,
        }
    )

    assert row["requests_paid"] == 0
    assert row["requests_quests"] == 17
    assert "requests" not in row


def test_pollen_conversion_rejects_bad_request_split():
    try:
        op_rows.pollen_monthly_to_op(
            {
                "month": "2026-07",
                "vendor": "assemblyai",
                "model": "universal-3-pro",
                "currency": "POLLEN",
                "requests_paid": 17,
                "requests_quests": 17,
                "requests": 17,
            }
        )
    except ValueError as error:
        assert "request split" in str(error)
    else:
        raise AssertionError("expected bad request split")
