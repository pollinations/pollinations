import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from ingest import op_reconcile


def test_aggregate_cloud_rows_by_month_vendor_type_currency():
    rows = [
        {
            "start": "2026-06-01 00:00:00",
            "vendor": "runpod",
            "type": "gpu",
            "currency": "USD",
            "credit": -10,
            "paid": -20,
        },
        {
            "start": "2026-06-15 00:00:00",
            "vendor": "runpod",
            "type": "gpu",
            "currency": "USD",
            "credit": 5,
            "paid": -3,
        },
    ]

    grouped = op_reconcile.aggregate_rows("op_cloud", rows)
    group = grouped[("2026-06", "runpod", "gpu", "USD")]

    assert group["row_count"] == 2
    assert group["credit"] == -5
    assert group["paid"] == -23
    assert group["total"] == -28


def test_reconcile_rows_reports_group_mismatch():
    expected = {
        "op_cloud": [
            {
                "start": "2026-06-01 00:00:00",
                "vendor": "runpod",
                "type": "gpu",
                "currency": "USD",
                "credit": 0,
                "paid": -100,
            }
        ],
    }
    actual = {
        "op_cloud": [
            {
                "start": "2026-06-01 00:00:00",
                "vendor": "runpod",
                "type": "gpu",
                "currency": "USD",
                "credit": 0,
                "paid": -90,
            }
        ],
    }

    result = op_reconcile.reconcile_rows(expected, actual)
    mismatch = result["checks"]["op_cloud"]["mismatches"][0]

    assert result["status"] == "mismatch"
    assert mismatch["key"] == {
        "month": "2026-06",
        "vendor": "runpod",
        "type": "gpu",
        "currency": "USD",
    }
    assert "paid" in mismatch["fields"]
    assert mismatch["diff"]["paid"] == 10


def test_reconcile_rows_filters_to_month():
    expected = {
        "op_transactions": [
            {
                "date": "2026-06-30",
                "vendor": "wise",
                "category": "admin",
                "currency": "EUR",
                "amount": -1,
            },
            {
                "date": "2026-07-01",
                "vendor": "wise",
                "category": "admin",
                "currency": "EUR",
                "amount": -99,
            },
        ],
    }
    actual = {
        "op_transactions": [
            {
                "date": "2026-06-30",
                "vendor": "wise",
                "category": "admin",
                "currency": "EUR",
                "amount": -1,
            }
        ],
    }

    result = op_reconcile.reconcile_rows(expected, actual, months=["2026-06"])

    assert result["status"] == "ok"
    assert result["checks"]["op_transactions"]["expected_rows"] == 1
    assert result["checks"]["op_transactions"]["actual_rows"] == 1


def test_pollen_request_fields_are_compared_as_integers():
    expected = {
        "op_pollen": [
            {
                "month": "2026-06",
                "vendor": "openai",
                "model": "gpt-test",
                "currency": "POLLEN",
                "requests_paid": 10,
                "requests_quests": 5,
            }
        ],
    }
    actual = {
        "op_pollen": [
            {
                "month": "2026-06",
                "vendor": "openai",
                "model": "gpt-test",
                "currency": "POLLEN",
                "requests_paid": 10,
                "requests_quests": 6,
            }
        ],
    }

    result = op_reconcile.reconcile_rows(expected, actual)
    mismatch = result["checks"]["op_pollen"]["mismatches"][0]

    assert "requests_quests" in mismatch["fields"]
    assert mismatch["diff"]["requests_quests"] == 1
