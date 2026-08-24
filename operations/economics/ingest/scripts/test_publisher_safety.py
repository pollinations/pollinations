import unittest

from publisher_safety import (
    assert_immutable_fields,
    assert_newer_versions,
    canonical_pollen_provider,
    latest_version_query,
    validate_recorded_at,
)


class PublisherSafetyTest(unittest.TestCase):
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

    def test_matches_the_endpoint_pollen_provider_relabel(self):
        self.assertEqual(
            canonical_pollen_provider("2026-03", "io.net", "flux"),
            "vast.ai",
        )
        self.assertEqual(
            canonical_pollen_provider("2026-04", "io.net", "flux"),
            "io.net",
        )


if __name__ == "__main__":
    unittest.main()
