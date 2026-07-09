import json
from pathlib import Path

from ingest import backup


class FakeTB:
    def __init__(self, rows):
        self.rows = rows
        self.calls = []

    def sql(self, query):
        self.calls.append(("sql", query))
        return self.rows

    def append(self, datasource, rows):
        self.calls.append(("append", datasource, rows))
        return {"successful_rows": len(rows)}

    def replace(self, datasource, rows, condition=None):
        self.calls.append(("replace", datasource, rows, condition))
        return {"successful_rows": len(rows)}


class FailingRead:
    def __init__(self):
        self.calls = []

    def sql(self, query):
        self.calls.append(("sql", query))
        raise RuntimeError("backup failed")


def test_snapshot_writes_ndjson(tmp_path):
    rows = [{"month": "2026-06", "vendor": "aws", "credit": 1.0}]
    got = backup.snapshot_table(FakeTB(rows), "provider_monthly", tmp_path)
    assert got == rows
    lines = (tmp_path / "provider_monthly.ndjson").read_text().strip().splitlines()
    assert [json.loads(line) for line in lines] == rows


def test_snapshot_empty_table(tmp_path):
    assert backup.snapshot_table(FakeTB([]), "provider_monthly", tmp_path) == []
    assert (tmp_path / "provider_monthly.ndjson").read_text() == ""


def test_relative_backup_root_lives_in_forager_folder():
    root = backup.backup_root({"backup_dir": "backups"})
    assert root.name == "backups"
    assert root.parent.name == "forager"


def test_prune_backup_runs_keeps_newest_20(tmp_path):
    for day in range(25):
        (tmp_path / f"202607{day + 1:02d}T000000Z").mkdir()
    removed = backup.prune_backup_runs(
        {"backup_dir": str(tmp_path), "backup_retention": 20}
    )
    remaining = sorted(path.name for path in tmp_path.iterdir())
    assert len(removed) == 5
    assert len(remaining) == 20
    assert remaining[0] == "20260706T000000Z"


def test_diff_rows_added_removed():
    old = [{"a": 1}, {"a": 2}]
    new = [{"a": 2}, {"a": 3}]
    added, removed = backup.diff_rows(old, new)
    assert added == [json.dumps({"a": 3}, sort_keys=True)]
    assert removed == [json.dumps({"a": 1}, sort_keys=True)]


def test_append_with_backup_snapshots_before_write(tmp_path):
    client = FakeTB([{"existing": 1}])
    backup_dir, result = backup.append_with_backup(
        client,
        "op_cloud",
        [{"new": 1}],
        {"backup_dir": str(tmp_path)},
    )
    assert result == {"successful_rows": 1}
    assert client.calls == [
        ("sql", "SELECT * FROM op_cloud"),
        ("append", "op_cloud", [{"new": 1}]),
    ]
    lines = (backup_dir / "op_cloud.ndjson").read_text().strip().splitlines()
    assert [json.loads(line) for line in lines] == [{"existing": 1}]


def test_replace_with_backup_snapshots_before_write(tmp_path):
    read = FakeTB([{"existing": 1}])
    write = FakeTB([])
    rows = [{"new": 1}]
    backup_dir, result = backup.replace_with_backup(
        read,
        write,
        "op_pollen",
        rows,
        {"backup_dir": str(tmp_path)},
        condition="month = '2026-07'",
    )
    assert result == {"successful_rows": 1}
    assert read.calls == [("sql", "SELECT * FROM op_pollen")]
    assert write.calls == [
        ("replace", "op_pollen", rows, "month = '2026-07'"),
    ]
    lines = (backup_dir / "op_pollen.ndjson").read_text().strip().splitlines()
    assert [json.loads(line) for line in lines] == [{"existing": 1}]


def test_write_is_not_called_when_backup_fails(tmp_path):
    write = FakeTB([])
    import pytest

    with pytest.raises(RuntimeError, match="backup failed"):
        backup.replace_with_backup(
            FailingRead(),
            write,
            "op_cloud",
            [{"new": 1}],
            {"backup_dir": str(tmp_path)},
        )
    assert write.calls == []


def test_diff_rows_ignores_integral_float_representation():
    old = [{"vendor": "aws", "paid": 0, "credit": 3000}]
    new = [{"vendor": "aws", "paid": 0.0, "credit": 3000.0}]
    added, removed = backup.diff_rows(old, new)
    assert added == [] and removed == []


def test_diff_rows_still_detects_real_value_changes():
    old = [{"vendor": "aws", "paid": 0.0}]
    new = [{"vendor": "aws", "paid": 0.5}]
    added, removed = backup.diff_rows(old, new)
    assert len(added) == 1 and len(removed) == 1


def test_manual_meter_rows_lost_filters_manual_sources():
    removed = [
        json.dumps({"vendor": "aws", "source": "cli"}, sort_keys=True),
        json.dumps({"vendor": "replicate", "source": "manual"}, sort_keys=True),
        json.dumps({"vendor": "azure", "source": "manual,api"}, sort_keys=True),
    ]
    lost = backup.manual_meter_rows_lost(removed, [])
    assert [row["vendor"] for row in lost] == ["replicate", "azure"]


def test_manual_meter_rows_lost_ignores_consolidated_manual():
    # A standalone manual row is replaced by a merged manual,api row for the
    # same (vendor, month, currency) — manual data survives, so NOT lost.
    removed = [
        json.dumps(
            {"vendor": "replicate", "month": "2026-07", "currency": "USD",
             "source": "manual"},
            sort_keys=True,
        ),
    ]
    new_rows = [
        {"vendor": "replicate", "month": "2026-07", "currency": "USD",
         "source": "manual,api"},
    ]
    assert backup.manual_meter_rows_lost(removed, new_rows) == []


def test_manual_meter_rows_lost_when_new_row_not_manual():
    # Removed manual row's key survives but only with a non-manual source —
    # the manual data is actually gone, so LOST.
    removed = [
        json.dumps(
            {"vendor": "replicate", "month": "2026-07", "currency": "USD",
             "source": "manual"},
            sort_keys=True,
        ),
    ]
    new_rows = [
        {"vendor": "replicate", "month": "2026-07", "currency": "USD",
         "source": "api"},
    ]
    lost = backup.manual_meter_rows_lost(removed, new_rows)
    assert [row["vendor"] for row in lost] == ["replicate"]


def test_manual_meter_rows_lost_when_no_new_row_for_key():
    # Removed manual row has no surviving row for its key — LOST.
    removed = [
        json.dumps(
            {"vendor": "replicate", "month": "2026-07", "currency": "USD",
             "source": "manual"},
            sort_keys=True,
        ),
    ]
    new_rows = [
        {"vendor": "aws", "month": "2026-07", "currency": "USD",
         "source": "manual,api"},
    ]
    lost = backup.manual_meter_rows_lost(removed, new_rows)
    assert [row["vendor"] for row in lost] == ["replicate"]


def test_guarded_replace_blocks_manual_loss_without_yes(tmp_path):
    import pytest
    from ingest.run import guarded_replace

    class FakeReplace:
        def __init__(self):
            self.calls = []

        def replace(self, datasource, rows):
            self.calls.append((datasource, rows))

    existing = [{"month": "2026-07", "vendor": "replicate", "currency": "USD",
                 "credit": 200.0, "paid": 0.0, "source": "manual"}]
    read = FakeTB(existing)
    guard = {
        "yes": False,
        "dry_run": False,
        "read": read,
        "config": {"backup_dir": str(tmp_path)},
        "backup_dir": tmp_path,
        "existing": {"provider_monthly": existing},
    }
    client = FakeReplace()
    with pytest.raises(RuntimeError, match="--yes"):
        guarded_replace(client, "provider_monthly", [], guard, {})
    assert client.calls == []

    guard["yes"] = True
    statuses = {}
    guarded_replace(client, "provider_monthly", [], guard, statuses)
    assert client.calls == [("provider_monthly", [])]
    assert statuses["provider_monthly_diff"] == "+0/-1"
