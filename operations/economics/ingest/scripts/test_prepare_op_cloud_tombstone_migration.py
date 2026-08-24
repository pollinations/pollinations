import importlib.util
import unittest
from pathlib import Path


MODULE_PATH = Path(__file__).with_name("prepare-op-cloud-tombstone-migration.py")
SPEC = importlib.util.spec_from_file_location(
    "prepare_op_cloud_tombstone_migration", MODULE_PATH
)
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


def row(entry_id, source, evidence, recorded_at, paid=0, credit=0):
    return {
        "entry_id": entry_id,
        "source": source,
        "evidence": evidence,
        "paid": paid,
        "credit": credit,
        "recorded_at": recorded_at,
    }


class CloudTombstoneMigrationTest(unittest.TestCase):
    def test_converts_only_latest_implicit_tombstones(self):
        rows = [
            row("old", "dashboard", "Superseded total", "2026-08-01 00:00:00.000"),
            row("old", "dashboard", "Current row", "2026-08-02 00:00:00.000"),
            row("legacy", "invoice", "Superseded by detail", "2026-08-01 00:00:00.000"),
            row("explicit", "tombstone", "Superseded", "2026-08-01 00:00:00.000"),
            row("nonzero", "invoice", "Superseded", "2026-08-01 00:00:00.000", paid=-1),
        ]

        self.assertEqual(
            MODULE.legacy_tombstones(rows, "2026-08-03 00:00:00.000"),
            [
                {
                    **rows[2],
                    "base_recorded_at": "2026-08-01 00:00:00.000",
                    "source": "tombstone",
                    "recorded_at": "2026-08-03 00:00:00.000",
                }
            ],
        )

    def test_rejects_a_non_monotonic_correction_time(self):
        rows = [
            row("legacy", "invoice", "Superseded", "2026-08-03 00:00:00.000")
        ]

        with self.assertRaisesRegex(RuntimeError, "must be later"):
            MODULE.legacy_tombstones(rows, "2026-08-03 00:00:00.000")


if __name__ == "__main__":
    unittest.main()
