import json
from pathlib import Path

from ingest import backup


class FakeTB:
    def __init__(self, rows):
        self.rows = rows

    def sql(self, query):
        return self.rows


def test_snapshot_writes_ndjson(tmp_path):
    rows = [{"month": "2026-06", "provider": "aws", "credit": 1.0}]
    got = backup.snapshot_table(FakeTB(rows), "meter_monthly", tmp_path)
    assert got == rows
    lines = (tmp_path / "meter_monthly.ndjson").read_text().strip().splitlines()
    assert [json.loads(line) for line in lines] == rows


def test_snapshot_empty_table(tmp_path):
    assert backup.snapshot_table(FakeTB([]), "meter_monthly", tmp_path) == []
    assert (tmp_path / "meter_monthly.ndjson").read_text() == ""


def test_diff_rows_added_removed():
    old = [{"a": 1}, {"a": 2}]
    new = [{"a": 2}, {"a": 3}]
    added, removed = backup.diff_rows(old, new)
    assert added == [json.dumps({"a": 3}, sort_keys=True)]
    assert removed == [json.dumps({"a": 1}, sort_keys=True)]


def test_diff_rows_ignores_integral_float_representation():
    old = [{"provider": "aws", "paid": 0, "credit": 3000}]
    new = [{"provider": "aws", "paid": 0.0, "credit": 3000.0}]
    added, removed = backup.diff_rows(old, new)
    assert added == [] and removed == []


def test_diff_rows_still_detects_real_value_changes():
    old = [{"provider": "aws", "paid": 0.0}]
    new = [{"provider": "aws", "paid": 0.5}]
    added, removed = backup.diff_rows(old, new)
    assert len(added) == 1 and len(removed) == 1


def test_manual_meter_rows_lost_filters_manual_sources():
    removed = [
        json.dumps({"provider": "aws", "source": "cli"}, sort_keys=True),
        json.dumps({"provider": "replicate", "source": "manual"}, sort_keys=True),
        json.dumps({"provider": "azure", "source": "manual,api"}, sort_keys=True),
    ]
    lost = backup.manual_meter_rows_lost(removed, [])
    assert [row["provider"] for row in lost] == ["replicate", "azure"]


def test_manual_meter_rows_lost_ignores_consolidated_manual():
    # A standalone manual row is replaced by a merged manual,api row for the
    # same (provider, month, currency) — manual data survives, so NOT lost.
    removed = [
        json.dumps(
            {"provider": "replicate", "month": "2026-07", "currency": "USD",
             "source": "manual"},
            sort_keys=True,
        ),
    ]
    new_rows = [
        {"provider": "replicate", "month": "2026-07", "currency": "USD",
         "source": "manual,api"},
    ]
    assert backup.manual_meter_rows_lost(removed, new_rows) == []


def test_manual_meter_rows_lost_when_new_row_not_manual():
    # Removed manual row's key survives but only with a non-manual source —
    # the manual data is actually gone, so LOST.
    removed = [
        json.dumps(
            {"provider": "replicate", "month": "2026-07", "currency": "USD",
             "source": "manual"},
            sort_keys=True,
        ),
    ]
    new_rows = [
        {"provider": "replicate", "month": "2026-07", "currency": "USD",
         "source": "api"},
    ]
    lost = backup.manual_meter_rows_lost(removed, new_rows)
    assert [row["provider"] for row in lost] == ["replicate"]


def test_manual_meter_rows_lost_when_no_new_row_for_key():
    # Removed manual row has no surviving row for its key — LOST.
    removed = [
        json.dumps(
            {"provider": "replicate", "month": "2026-07", "currency": "USD",
             "source": "manual"},
            sort_keys=True,
        ),
    ]
    new_rows = [
        {"provider": "aws", "month": "2026-07", "currency": "USD",
         "source": "manual,api"},
    ]
    lost = backup.manual_meter_rows_lost(removed, new_rows)
    assert [row["provider"] for row in lost] == ["replicate"]


def test_guarded_replace_blocks_manual_loss_without_yes():
    import pytest
    from ingest.run import guarded_replace

    class FakeReplace:
        def __init__(self):
            self.calls = []

        def replace(self, datasource, rows):
            self.calls.append((datasource, rows))

    existing = [{"month": "2026-07", "provider": "replicate", "currency": "USD",
                 "credit": 200.0, "paid": 0.0, "source": "manual"}]
    guard = {"yes": False, "dry_run": False, "existing": {"meter_monthly": existing}}
    client = FakeReplace()
    with pytest.raises(RuntimeError, match="--yes"):
        guarded_replace(client, "meter_monthly", [], guard, {})
    assert client.calls == []

    guard["yes"] = True
    statuses = {}
    guarded_replace(client, "meter_monthly", [], guard, statuses)
    assert client.calls == [("meter_monthly", [])]
    assert statuses["meter_monthly_diff"] == "+0/-1"
