import copy
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).parent))
from common import filter_daily_gists, validate_gist
from generate_realtime import analyze_pr, build_full_gist, enrich_gist, generate_gist_image
from generate_daily import generate_summary
from generate_weekly import generate_digest
from publish_realtime import generate_snippet
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

    def test_rename_keeps_old_id_available_and_preserves_other_changes(self):
        old = {"name": "kimi", "aliases": [], "paid_only": False,
               "pricing": {"currency": "pollen", "promptTextTokens": "0.000001"}}
        new = {**old, "name": "moonshot/kimi-k3", "aliases": ["kimi"], "paid_only": True}
        events = model_changes([old], [new], {"number": 1})
        self.assertEqual(len(events), 1)
        self.assertEqual(events[0]["action"], "UPDATE")
        self.assertEqual(events[0]["model_id"], "moonshot/kimi-k3")
        self.assertEqual(events[0]["changes"]["model_id"], {"before": "kimi", "after": "moonshot/kimi-k3"})
        self.assertEqual(events[0]["changes"]["paid_only"], {"before": False, "after": True})
        self.assertNotIn("availability", events[0]["changes"])
        # Moving an ID onto an existing canonical model also preserves access.
        existing = {**new, "aliases": []}
        events = model_changes([old, existing], [new], {"number": 2})
        self.assertEqual([(e["model_id"], e["action"]) for e in events], [(new["name"], "UPDATE")])
        self.assertEqual(model_changes([old], [], {"number": 3})[0]["action"], "RETIRE")

    def test_catalog_install_runs_only_for_model_comparison_when_missing(self):
        pr = {"number": 1, "merge_commit_sha": "abc"}
        def run(args, **kwargs):
            if args[0] == sys.executable:
                Path(kwargs["env"]["CLASSIFICATION_OUTPUT"]).write_text(json.dumps(
                    {"area": "Models", "type": "Feature", "source": "Team"}))
        with patch("generate_realtime.subprocess.run", side_effect=run) as commands, \
             patch.object(Path, "is_dir", return_value=False), \
             patch("model_announcements.pr_comparison_refs", return_value=("before", "after")), \
             patch("model_announcements.announcements_for_pr", return_value=[]):
            enrich_gist({}, pr, ["README.md"], "test")
            self.assertFalse(any(c.args[0][0] == "npm" for c in commands.call_args_list))
            commands.reset_mock()
            enrich_gist({}, pr, ["shared/registry/text.ts"], "test")
            self.assertEqual([c.args[0] for c in commands.call_args_list if c.args[0][0] == "npm"],
                             [["npm", "ci", "--ignore-scripts"]])

    def test_enrichment_preserves_social_payload_and_records_failure(self):
        pr = {"number": 1, "title": "Example", "html_url": "https://github.com/example/repo/pull/1",
              "body": "Existing description", "merge_commit_sha": "abc", "labels": []}
        ai = dict(category="feature", user_facing=True, publish_tier="daily", importance="minor",
                  summary="Summary", keywords=[], image_prompt="Image")
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

    def test_same_facts_reach_social_readers_without_duplicate_text(self):
        pr = {"number": 1, "title": "Model price and account fix",
              "html_url": "https://github.com/example/repo/pull/1", "labels": [],
              "merged_at": "2026-10-07T00:00:00Z", "body": "PR description"}
        ai = dict(category="improvement", user_facing=True, publish_tier="daily", importance="major",
                  summary="Example model costs 1 → 2 Pollen. Account balance deduction is fixed.",
                  keywords=["models", "billing"], image_prompt="Bee fixing a honey jar")
        gist = build_full_gist(pr, ai, [])
        gist.update(area="Models", type="Task", source="Team", announcements=model_changes(
            [{"name": "example/model", "pricing": {"currency": "pollen", "image": "1"}}],
            [{"name": "example/model", "pricing": {"currency": "pollen", "image": "2"}}], pr))
        self.assertEqual(validate_gist(gist), [])
        with patch("generate_realtime.call_pollinations_api", return_value=json.dumps(ai)) as analysis:
            self.assertEqual(analyze_pr(pr, "shared/registry/image.ts", "test", gist), ai)
            self.assertIn('"image": "2"', analysis.call_args.args[1])
        self.assertEqual(gist["image"]["prompt"], ai["image_prompt"])
        self.assertNotIn("image_prompt", gist["gist"])
        self.assertNotIn("pr_body_excerpt", gist)
        with patch("generate_realtime.generate_image", return_value=(b"image", None)) as image,              patch("generate_realtime.commit_image_to_branch", return_value="https://example.com/image.jpg"):
            self.assertEqual(generate_gist_image(gist, "test", "test", "example", "repo"),
                             "https://example.com/image.jpg")
            image.assert_called_once_with(ai["image_prompt"], "test")
        old = copy.deepcopy(gist)
        old["gist"].update(headline="Old headline", blurb="Old blurb", impact="Old impact")
        old["pr_body_excerpt"] = "Old excerpt"
        self.assertEqual(filter_daily_gists([gist, old]), [gist, old])
        for module, generate in (
            ("generate_daily", lambda g: generate_summary([g], "2026-10-07", "test")),
            ("generate_weekly", lambda g: generate_digest([g], "2026-10-01", "2026-10-07", "test")),
            ("publish_realtime", lambda g: generate_snippet(g, "test")),
        ):
            with patch(f"{module}.call_pollinations_api", return_value='{"arcs": []}') as api:
                generate(gist)
                new_prompt = api.call_args.args[1]
                generate(old)
                self.assertEqual(api.call_args.args[1], new_prompt)
            for fact in ("Account balance deduction is fixed.", '"area": "Models"',
                         '"type": "Task"', '"source": "Team"', '"before": {', '"image": "1"',
                         '"image": "2"', '"effective_status": "unconfirmed"'):
                self.assertIn(fact, new_prompt)
            self.assertNotIn("Old excerpt", new_prompt)
        broken = copy.deepcopy(gist)
        broken["image"]["prompt"] = None
        self.assertIn("missing image.prompt", validate_gist(broken))
        broken["gist"]["summary"] = ""
        self.assertIn("gist.summary must be non-empty text", validate_gist(broken))

    def test_squash_after_syncing_main_excludes_unrelated_changes(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            def git(*args):
                return subprocess.run(["git", *args], cwd=root, check=True, capture_output=True, text=True).stdout.strip()
            git("init", "-b", "main")
            git("config", "user.name", "Test")
            git("config", "user.email", "test@example.com")
            (root / "model").write_text("0")
            git("add", "model")
            git("commit", "-m", "base")
            git("checkout", "-b", "feature")
            (root / "model").write_text("1")
            git("commit", "-am", "first model change")
            first = git("rev-parse", "HEAD")
            git("checkout", "main")
            (root / "unrelated").write_text("main change")
            git("add", "unrelated")
            git("commit", "-m", "unrelated main change")
            git("checkout", "feature")
            git("merge", "main", "--no-edit")
            sync = git("rev-parse", "HEAD")
            (root / "model").write_text("2")
            git("commit", "-am", "second model change")
            head = git("rev-parse", "HEAD")
            git("checkout", "main")
            (root / "model").write_text("2")
            git("commit", "-am", "squashed model changes")
            sha = git("rev-parse", "HEAD")
            self.assertEqual(pr_comparison_refs({"merge_commit_sha": sha, "commits": 3,
                                                "_commit_shas": [first, sync, head]}, root)[0], f"{sha}^1")

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
            git("checkout", "-b", "conflicted-rebase", "HEAD^1")
            for value in ("1-resolved", "2-resolved"):
                (root / "model").write_text(value)
                git("add", "model")
                git("commit", "-m", "rebased with resolution")
            pr["merge_commit_sha"] = git("rev-parse", "HEAD")
            with self.assertRaisesRegex(ValueError, "Cannot verify the full PR range"):
                pr_comparison_refs(pr, root)


if __name__ == "__main__":
    unittest.main()
