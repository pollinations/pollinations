import unittest

from publisher_safety import (
    assert_base_versions,
    assert_explicit_tombstones,
    assert_immutable_fields,
    assert_no_new_duplicates,
    assert_newer_versions,
    assert_opening_balance_integrity,
    assert_pollen_reason_transitions,
    assert_production_confirmation,
    canonical_pollen_provider,
    latest_version_query,
    validate_recorded_at,
)


class PublisherSafetyTest(unittest.TestCase):
    def test_requires_an_explicit_production_append_confirmation(self):
        with self.assertRaisesRegex(RuntimeError, "confirm-production"):
            assert_production_confirmation("production", False, False)

        assert_production_confirmation("production", True, False)
        assert_production_confirmation("production", False, True)
        assert_production_confirmation("staging", False, False)

    def test_rejects_missing_or_invalid_recorded_at(self):
        with self.assertRaisesRegex(RuntimeError, "valid recorded_at"):
            validate_recorded_at([{"entry_id": "a"}])

    def test_requires_corrections_to_advance_the_version(self):
        current = [{"entry_id": "a", "recorded_at": "2026-08-24 10:00:00.000"}]
        with self.assertRaisesRegex(RuntimeError, "later than the stored version"):
            assert_newer_versions(
                [{"entry_id": "a", "recorded_at": "2026-08-24 10:00:00.000"}],
                current,
            )
        assert_newer_versions(
            [{"entry_id": "a", "recorded_at": "2026-08-24 10:00:00.001"}],
            current,
        )

    def test_requires_corrections_to_match_the_source_snapshot(self):
        current = [{"entry_id": "a", "recorded_at": "2026-08-24 10:00:00.123"}]
        with self.assertRaisesRegex(RuntimeError, "base_recorded_at"):
            assert_base_versions(
                [{"entry_id": "a", "recorded_at": "2026-08-24 11:00:00.000"}],
                current,
            )
        with self.assertRaisesRegex(RuntimeError, "snapshot is stale"):
            assert_base_versions(
                [
                    {
                        "entry_id": "a",
                        "base_recorded_at": "2026-08-24 10:00:00.122",
                        "recorded_at": "2026-08-24 11:00:00.000",
                    }
                ],
                current,
            )
        assert_base_versions(
            [
                {
                    "entry_id": "a",
                    "base_recorded_at": "2026-08-24 10:00:00.123",
                    "recorded_at": "2026-08-24 11:00:00.000",
                },
                {
                    "entry_id": "new",
                    "recorded_at": "2026-08-24 11:00:00.000",
                },
            ],
            current,
        )

    def test_quotes_entry_ids_and_restricts_tables(self):
        query = latest_version_query("op_cloud", ["normal", "quote'id"])
        self.assertIn("'quote''id'", query)
        with self.assertRaisesRegex(RuntimeError, "Unsupported"):
            latest_version_query("secret_table", ["a"])

    def test_rejects_immutable_field_changes(self):
        current = [{"entry_id": "a", "reason": "workspace_snapshot"}]
        assert_immutable_fields(
            [{"entry_id": "a", "reason": "workspace_snapshot"}],
            current,
            ["reason"],
        )
        with self.assertRaisesRegex(RuntimeError, "a.reason"):
            assert_immutable_fields(
                [{"entry_id": "a", "reason": "manual_correction"}],
                current,
                ["reason"],
            )

    def test_requires_explicit_zero_value_tombstones(self):
        assert_explicit_tombstones(
            [
                {
                    "entry_id": "a",
                    "source": "tombstone",
                    "credit": 0,
                    "paid": 0,
                    "evidence": "replaced by detail rows",
                }
            ],
            ["credit", "paid"],
        )
        with self.assertRaisesRegex(RuntimeError, "zero financial values"):
            assert_explicit_tombstones(
                [
                    {
                        "entry_id": "a",
                        "source": "tombstone",
                        "credit": 1,
                        "paid": 0,
                    }
                ],
                ["credit", "paid"],
            )
        with self.assertRaisesRegex(RuntimeError, "source=tombstone"):
            assert_explicit_tombstones(
                [
                    {
                        "entry_id": "a",
                        "source": "manual",
                        "credit": 0,
                        "paid": 0,
                        "evidence": "superseded by detail rows",
                    }
                ],
                ["credit", "paid"],
            )

    def test_allows_only_safe_pollen_retractions(self):
        current = [
            {
                "entry_id": "a",
                "month": "2026-07",
                "provider": "aws",
                "model": "model",
                "reason": "manual_correction",
                "price_paid": 10,
            },
            {
                "entry_id": "snapshot",
                "month": "2026-07",
                "provider": "aws",
                "model": "other",
                "reason": "workspace_snapshot",
                "price_paid": 10,
            },
        ]
        assert_pollen_reason_transitions(
            [
                {
                    **current[0],
                    "reason": "tombstone",
                    "price_paid": 0,
                }
            ],
            current,
            ["price_paid"],
        )
        with self.assertRaisesRegex(RuntimeError, "a.metrics"):
            assert_pollen_reason_transitions(
                [{**current[0], "reason": "tombstone"}],
                current,
                ["price_paid"],
            )
        with self.assertRaisesRegex(RuntimeError, "snapshot.reason"):
            assert_pollen_reason_transitions(
                [
                    {
                        **current[1],
                        "reason": "tombstone",
                        "price_paid": 0,
                    }
                ],
                current,
                ["price_paid"],
            )

    def test_guards_opening_balances_across_publish_runs(self):
        current = [
            {
                "entry_id": "opening-eur",
                "kind": "opening_balance",
                "date": "2026-01-01",
                "currency": "EUR",
            },
            {
                "entry_id": "bank-a",
                "kind": "transaction",
                "date": "2026-01-02",
                "currency": "EUR",
            },
        ]
        assert_opening_balance_integrity(
            [{**current[0], "amount": 100}], current
        )
        with self.assertRaisesRegex(RuntimeError, "new-opening.currency"):
            assert_opening_balance_integrity(
                [
                    {
                        "entry_id": "new-opening",
                        "kind": "opening_balance",
                        "date": "2026-01-01",
                        "currency": "EUR",
                    }
                ],
                current,
            )
        with self.assertRaisesRegex(RuntimeError, "bank-a.kind"):
            assert_opening_balance_integrity(
                [{**current[1], "kind": "opening_balance"}], current
            )

    def test_matches_the_endpoint_pollen_provider_relabel(self):
        self.assertEqual(
            canonical_pollen_provider("2026-03", "io.net", "flux"),
            "vast.ai",
        )
        self.assertEqual(
            canonical_pollen_provider("2026-04", "io.net", "flux"),
            "io.net",
        )

    def test_rejects_new_ids_for_the_same_fact(self):
        fields = ["month", "vendor", "category", "amount"]
        current = [
            {
                "entry_id": "forecast-a",
                "month": "2026-09-01",
                "vendor": "openai",
                "category": "development",
                "amount": -200,
            }
        ]
        assert_no_new_duplicates([{**current[0], "amount": -201}], current, fields)
        with self.assertRaisesRegex(RuntimeError, "forecast-a/forecast-b"):
            assert_no_new_duplicates(
                [{**current[0], "entry_id": "forecast-b"}], current, fields
            )


if __name__ == "__main__":
    unittest.main()
