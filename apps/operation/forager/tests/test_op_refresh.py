import json
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import pytest

from ingest import op_refresh


class FakeProd:
    def __init__(self, rows):
        self.rows = rows
        self.queries = []

    def sql(self, query):
        self.queries.append(query)
        return self.rows


class FakeRead:
    def __init__(self, rows):
        self.rows = rows
        self.queries = []

    def sql(self, query):
        self.queries.append(query)
        return self.rows


class FakeReplace:
    def __init__(self):
        self.calls = []

    def replace(self, datasource, rows, condition=None):
        self.calls.append((datasource, rows, condition))


def test_build_op_pollen_month_rows_from_usage_source():
    rows = op_refresh.build_op_pollen_month_rows(
        FakeProd([
            {
                "vendor": "openai",
                "model": "gpt-test",
                "cost_paid": 1.23,
                "price_paid": 1.23,
                "requests_paid": 7,
                "requests": 7,
            }
        ]),
        "2026-07",
        "2026-07-09",
    )

    assert rows == [
        {
            "source": "tinybird",
            "month": "2026-07",
            "vendor": "openai",
            "model": "gpt-test",
            "currency": "POLLEN",
            "cost_paid": 1.23,
            "cost_quests": 0.0,
            "price_paid": 1.23,
            "price_quests": 0.0,
            "byop_paid": 0.0,
            "byop_quests": 0.0,
            "model_paid": 0.0,
            "model_quests": 0.0,
            "requests_paid": 7,
            "requests_quests": 0,
        }
    ]


def test_replace_op_pollen_month_uses_scoped_condition_and_backup(tmp_path):
    read = FakeRead([{"month": "2026-06", "vendor": "openai"}])
    replace = FakeReplace()
    rows = [{"month": "2026-07", "vendor": "openai", "source": "tinybird"}]

    backup_dir = op_refresh.replace_op_pollen_month(
        read,
        replace,
        {"backup_dir": str(tmp_path)},
        "2026-07",
        rows,
    )

    assert replace.calls == [("op_pollen", rows, "month = '2026-07'")]
    lines = (backup_dir / "op_pollen.ndjson").read_text().strip().splitlines()
    assert [json.loads(line) for line in lines] == [{"month": "2026-06", "vendor": "openai"}]


def test_replace_op_pollen_month_refuses_empty_rows(tmp_path):
    with pytest.raises(ValueError, match="0 rows"):
        op_refresh.replace_op_pollen_month(
            FakeRead([]),
            FakeReplace(),
            {"backup_dir": str(tmp_path)},
            "2026-07",
            [],
        )


def test_month_validation_rejects_bad_month():
    with pytest.raises(ValueError, match="YYYY-MM"):
        op_refresh.build_op_pollen_month_rows(FakeProd([]), "2026-7", "2026-07-09")
