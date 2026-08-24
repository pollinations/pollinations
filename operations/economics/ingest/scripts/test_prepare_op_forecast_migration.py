import importlib.util
import unittest
from pathlib import Path


MODULE_PATH = Path(__file__).with_name("prepare-op-forecast-migration.py")
SPEC = importlib.util.spec_from_file_location("prepare_op_forecast_migration", MODULE_PATH)
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class OpeningBalanceMigrationTest(unittest.TestCase):
    def test_rejects_conflicting_balances_at_the_same_statement_time(self):
        rows = [
            {
                "Date": "31-12-2025",
                "Date Time": "31-12-2025 23:59:59.000",
                "Currency": "EUR",
                "Running Balance": "100",
            },
            {
                "Date": "31-12-2025",
                "Date Time": "31-12-2025 23:59:59.000",
                "Currency": "EUR",
                "Running Balance": "200",
            },
        ]

        with self.assertRaisesRegex(RuntimeError, "Conflicting EUR"):
            MODULE.opening_balances(rows)

    def test_uses_the_latest_pre_anchor_balance_per_currency(self):
        rows = [
            {
                "Date": "30-12-2025",
                "Date Time": "30-12-2025 23:59:59.000",
                "Currency": "EUR",
                "Running Balance": "100",
            },
            {
                "Date": "31-12-2025",
                "Date Time": "31-12-2025 23:59:59.000",
                "Currency": "EUR",
                "Running Balance": "125",
            },
        ]

        self.assertEqual(MODULE.opening_balances(rows), {"EUR": 125})


if __name__ == "__main__":
    unittest.main()
