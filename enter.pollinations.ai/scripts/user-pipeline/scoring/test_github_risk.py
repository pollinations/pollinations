import unittest
from datetime import datetime, timezone

from github_score import assess_profile_risk


class GithubRiskTests(unittest.TestCase):
    def test_flags_bursty_empty_repositories(self) -> None:
        recent = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
        data = {
            "repositories": {
                "totalCount": 8,
                "nodes": [{"diskUsage": 0, "createdAt": recent} for _ in range(5)],
            }
        }

        result = assess_profile_risk(data, "burst-bot")

        self.assertEqual(result["risk_status"], "suspicious")
        self.assertIn("burst_empty_repos", result["risk_flags"])

    def test_keeps_normal_profiles_clear(self) -> None:
        older = "2024-01-01T00:00:00Z"
        data = {
            "repositories": {
                "totalCount": 4,
                "nodes": [
                    {"diskUsage": 120, "createdAt": older},
                    {"diskUsage": 80, "createdAt": older},
                    {"diskUsage": 50, "createdAt": older},
                    {"diskUsage": 0, "createdAt": older},
                ],
            }
        }

        result = assess_profile_risk(data, "healthy-user")

        self.assertEqual(result["risk_status"], "ok")
        self.assertEqual(result["risk_flags"], [])


if __name__ == "__main__":
    unittest.main()
