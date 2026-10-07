import copy
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).parent))
from common import validate_gist
from generate_realtime import build_full_gist, enrich_gist
from model_announcements import model_changes, pr_comparison_refs


class GistEnrichmentTest(unittest.TestCase):
    def test_exact_price_balance_capabilities_and_official_models(self):
        old = {"name": "example/model", "paid_only": False,
               "pricing": {"currency": "pollen", "promptTextTokens": "0.000001"},
               "pricing_units": {"promptTextTokens": {"unit": "token"}},
               "capabilities": ["tool_calling"], "health": {"status": "healthy"}}
        new = {**old, "paid_only": True, "capabilities": [],
               "pricing": {"currency": "pollen", "promptTextTokens": "0.000002"}}
        event = model_changes([old], [new], {"number": 1})[0]
        self.assertEqual(event["action"], "UPDATE")
        self.assertEqual(set(event["changes"]), {"paid_only", "pricing", "capabilities"})
        self.assertEqual(event["changes"]["pricing"], {"before": old["pricing"], "after": new["pricing"]})
        self.assertIsNone(event["effective_at"])
        self.assertEqual(model_changes([old], [{**old, "health": {}}], {"number": 1}), [])
        self.assertEqual(model_changes([], [{**new, "community": True}], {"number": 1}), [])

    def test_new_retired_and_scheduled_are_distinct(self):
        model = {"name": "example/model", "paid_only": False, "capabilities": []}
        new = model_changes([], [model], {"number": 1})[0]
        self.assertEqual(new["action"], "NEW")
        self.assertEqual(new["changes"]["paid_only"], {"before": None, "after": False})
        removed = model_changes([model], [], {"number": 2})[0]
        self.assertEqual(removed["action"], "RETIRE")
        scheduled = model_changes([model], [{**model, "retirement_at": "2026-10-10T00:00:00Z"}], {"number": 3})
        self.assertEqual(len(scheduled), 1)
        self.assertEqual(scheduled[0]["effective_status"], "scheduled")
        self.assertEqual(scheduled[0]["action"], "RETIRE")
        cancelled = model_changes([{**model, "retirement_at": "2026-10-10T00:00:00Z"}], [model], {"number": 4})[0]
        self.assertEqual(cancelled["action"], "UPDATE")
        self.assertEqual(cancelled["changes"]["retirement_at"]["after"], None)

    def test_enrichment_preserves_social_payload_and_records_failure(self):
        pr = {"number": 1, "title": "Example", "html_url": "https://github.com/example/repo/pull/1",
              "body": "Existing description", "merge_commit_sha": "abc", "labels": []}
        ai = dict(category="feature", user_facing=True, publish_tier="daily", importance="minor",
                  headline="Headline", blurb="Blurb", summary="Summary", impact="Impact", keywords=[], image_prompt="Image")
        gist = build_full_gist(pr, ai, [])
        original = copy.deepcopy(gist)
        def classification(args, **kwargs):
            Path(kwargs["env"]["CLASSIFICATION_OUTPUT"]).write_text(json.dumps(
                {"area": "Models", "type": "Feature", "source": "Team"}))
        with patch("generate_realtime.subprocess.run", side_effect=classification):
            enrich_gist(gist, pr, [], "test")
        self.assertEqual(gist["gist"], original["gist"])
        self.assertEqual(gist["image"], original["image"])
        self.assertEqual(validate_gist(gist), [])
        with patch("generate_realtime.subprocess.run", side_effect=OSError()), \
             patch("model_announcements.pr_comparison_refs", side_effect=ValueError()):
            enrich_gist(gist, pr, ["shared/registry/text.ts"], "test")
        self.assertEqual(gist["enrichment"], {"classification": "failed", "models": "failed"})
        self.assertIsNone(gist["type"])
        self.assertEqual(gist["gist"], original["gist"])
        self.assertEqual(validate_gist(gist), [])
        gist["enrichment"]["classification"] = "complete"
        gist.update(area="Models", type="Question", source="Team")
        self.assertIn("invalid type", validate_gist(gist))

    def test_multi_commit_rebase_and_squash_compare_correct_parent(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            def git(*args):
                return subprocess.run(["git", *args], cwd=root, check=True, capture_output=True, text=True).stdout.strip()
            git("init", "-b", "main")
            git("config", "user.name", "Test")
            git("config", "user.email", "test@example.com")
            for n in range(3):
                (root / "model").write_text(str(n))
                git("add", "model")
                git("commit", "-m", f"change {n}")
            commits = git("rev-list", "--reverse", "HEAD~2..HEAD").splitlines()
            pr = {"merge_commit_sha": commits[-1], "commits": 2, "_commit_shas": commits}
            self.assertEqual(pr_comparison_refs(pr, root)[0], f"{commits[-1]}~2")
            git("checkout", "-b", "squash", "HEAD~2")
            (root / "model").write_text("2")
            git("add", "model")
            git("commit", "-m", "squashed changes")
            pr["merge_commit_sha"] = git("rev-parse", "HEAD")
            self.assertEqual(pr_comparison_refs(pr, root)[0], f"{pr['merge_commit_sha']}^1")


if __name__ == "__main__":
    unittest.main()
