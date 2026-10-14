import base64
import copy
import hashlib
import json
import os
import re
import subprocess
import sys
import tempfile
import unittest
from datetime import UTC, datetime
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

import requests

sys.path.insert(0, str(Path(__file__).parent))
import deliver
import posts
from common import (NEWS_REL_DIR, build_daily_summary_artifact, call_pollinations_api, daily_summary_input,
                    filter_daily_gists, monthly_digest_input, post_recap, validate_gist, weekly_digest_input)
from contributors import github_account, rank_contributors
from discord_pr import generate_snippet
from gist import (analyze_pr, announced_retirements, api_changes, api_changes_for_pr, api_surface, build_full_gist,
                  enrich_gist, generate_gist_image, model_changes, pr_comparison_refs)
from news_index import api_entries, build_index, highlight_entries, model_entries
from readme import get_top_highlights


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

    def test_new_and_retired_are_distinct(self):
        model = {"name": "example/model", "paid_only": False, "capabilities": []}
        new = model_changes([], [model], {"number": 1})[0]
        self.assertEqual(new["action"], "NEW")
        self.assertEqual(new["changes"]["paid_only"], {"before": None, "after": False})
        removed = model_changes([model], [], {"number": 2})[0]
        self.assertEqual(removed["action"], "RETIRE")

    def test_rename_keeps_old_id_available_and_preserves_other_changes(self):
        old = {"name": "kimi", "title": "Kimi", "aliases": [], "paid_only": False,
               "pricing": {"currency": "pollen", "promptTextTokens": "0.000001"}}
        new = {**old, "name": "moonshot/kimi-k3", "aliases": ["kimi"], "paid_only": True}
        events = model_changes([old], [new], {"number": 1})
        self.assertEqual(len(events), 1)
        self.assertEqual(events[0]["action"], "UPDATE")
        self.assertEqual(events[0]["model_id"], "moonshot/kimi-k3")
        self.assertEqual(events[0]["changes"]["model_id"], {"before": "kimi", "after": "moonshot/kimi-k3"})
        self.assertEqual(events[0]["changes"]["paid_only"], {"before": False, "after": True})
        self.assertNotIn("availability", events[0]["changes"])
        self.assertEqual(events[0]["previous_title"], "Kimi")
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
        with patch("gist.subprocess.run", side_effect=run) as commands, \
             patch.object(Path, "is_dir", return_value=False), \
             patch("gist.pr_comparison_refs", return_value=("before", "after")), \
             patch("gist.announcements_for_pr", return_value=[]):
            enrich_gist({}, pr, ["README.md"], "test")
            self.assertFalse(any(c.args[0][0] == "npm" for c in commands.call_args_list))
            commands.reset_mock()
            enrich_gist({}, pr, ["shared/registry/text.ts"], "test")
            self.assertEqual([c.args[0] for c in commands.call_args_list if c.args[0][0] == "npm"],
                             [["npm", "ci", "--ignore-scripts"]])

    def test_enrichment_keeps_the_social_payload_and_a_failure_stops_the_gist(self):
        pr = {"number": 1, "title": "Example", "html_url": "https://github.com/example/repo/pull/1",
              "body": "Existing description", "merge_commit_sha": "abc", "labels": []}
        ai = dict(category="feature", user_facing=True, publish_tier="daily", importance="minor",
                  summary="Summary", keywords=[], image_prompt="Image")
        gist = build_full_gist(pr, ai, [])
        original = copy.deepcopy(gist)
        def classification(args, **kwargs):
            if args[0] == sys.executable:  # not `npm ci`, which runs when tsx isn't installed
                Path(kwargs["env"]["CLASSIFICATION_OUTPUT"]).write_text(json.dumps(
                    {"area": "Models", "type": "Feature", "source": "Team"}))
        with patch("gist.subprocess.run", side_effect=classification):
            enrich_gist(gist, pr, [], "test")
        self.assertEqual(gist["gist"], original["gist"])
        self.assertEqual(gist["image"], original["image"])
        self.assertEqual(validate_gist(gist), [])
        # A failed classification or model-change lookup stops the gist: nothing is saved or posted.
        with patch("gist.subprocess.run", side_effect=OSError()), self.assertRaises(OSError):
            enrich_gist(copy.deepcopy(original), pr, [], "test")
        with patch("gist.subprocess.run", side_effect=classification), \
             patch("gist.pr_comparison_refs", side_effect=ValueError()), self.assertRaises(ValueError):
            enrich_gist(copy.deepcopy(original), pr, ["shared/registry/text.ts"], "test")
        gist.update(area="Models", type="Question", source="Team")
        self.assertIn("invalid type", validate_gist(gist))

    def test_same_facts_reach_social_readers_without_duplicate_text(self):
        pr = {"number": 1, "title": "Model price and account fix",
              "html_url": "https://github.com/example/repo/pull/1", "labels": [],
              "merged_at": "2026-10-07T00:00:00Z", "body": "PR description"}
        ai = dict(category="improvement", user_facing=True, publish_tier="daily", importance="major",
                  summary="Example model pricing changes. Account balance deduction is fixed.",
                  keywords=["models", "billing"], image_prompt="Bee fixing a honey jar")
        gist = build_full_gist(pr, ai, [])
        gist.update(area="Models", type="Task", source="Team", announcements=model_changes(
            [{"name": "example/model", "pricing": {"currency": "pollen", "image": "1"}}],
            [{"name": "example/model", "pricing": {"currency": "pollen", "image": "2"}}], pr))
        self.assertEqual(validate_gist(gist), [])
        with patch("gist.call_pollinations_api", return_value=json.dumps(ai)) as analysis:
            context = {**gist, "merge_commit_sha": "unused-commit"}
            self.assertEqual(analyze_pr(pr, "shared/registry/image.ts", "test", context), ai)
            self.assertIn('"image": "2"', analysis.call_args.args[1])
            self.assertNotIn("unused-commit", analysis.call_args.args[1])
        self.assertEqual(gist["image"]["prompt"], ai["image_prompt"])
        self.assertNotIn("image_prompt", gist["gist"])
        self.assertNotIn("pr_body_excerpt", gist)
        with patch("gist.generate_image", return_value=(b"image", None)) as image, \
             patch("gist.commit_image_to_branch", return_value="https://example.com/image.jpg"):
            self.assertEqual(generate_gist_image(gist, "test", "test", "example", "repo"),
                             "https://example.com/image.jpg")
            image.assert_called_once_with(ai["image_prompt"], "test")
        old = copy.deepcopy(gist)
        old["gist"].update(headline="Old headline", blurb="Old blurb", impact="Old impact")
        old["pr_body_excerpt"] = "Old excerpt"
        self.assertEqual(filter_daily_gists([gist, old]), [gist, old])
        def realtime(g):
            with patch("discord_pr.call_pollinations_api", return_value='{"arcs": []}') as api:
                generate_snippet(g, "test")
            return api.call_args.args[1]
        for module, prompt in (
            ("daily", lambda g: daily_summary_input([g], "2026-10-07")),
            ("weekly", lambda g: weekly_digest_input([g], "2026-10-01", "2026-10-07")),
            ("discord_pr", realtime),
        ):
            new_prompt = prompt(gist)
            self.assertEqual(prompt(old), new_prompt)
            for fact in ("Account balance deduction is fixed.", '"area": "Models"',
                         '"type": "Task"', '"source": "Team"'):
                self.assertIn(fact, new_prompt)
            self.assertNotIn("Old excerpt", new_prompt)
            # Only Discord states model prices; recaps feeding X, LinkedIn and Instagram never see them.
            check = self.assertIn if module == "discord_pr" else self.assertNotIn
            for value in ('"announcements"', '"image": "2"'):
                check(value, new_prompt)
        broken = copy.deepcopy(gist)
        broken["image"]["prompt"] = None
        self.assertIn("missing image.prompt", validate_gist(broken))
        broken["gist"]["summary"] = ""
        self.assertIn("gist.summary must be non-empty text", validate_gist(broken))
        gist.update(app_name="Example app", app_url="https://example.com/app")
        self.assertEqual(daily_summary_input([gist], "2026-10-07").count("https://example.com/app"), 1)

    def test_daily_summary_stores_its_highlights_for_the_index(self):
        summary = {"arcs": [{"headline": "New speech", "summary": "Eleven v4 added."}],
                   "highlights": [{"emoji": "🎵", "title": "Eleven v4", "text": "Generate speech.", "prs": [1]},
                                  {"title": "No text"}, "not an item"]}
        artifact = build_daily_summary_artifact(summary, [{"pr_number": 1}], "2026-10-06", "now")
        self.assertEqual(artifact["highlights"], [summary["highlights"][0]])
        quiet = build_daily_summary_artifact({"arcs": []}, [{"pr_number": 2}], "2026-10-07", "now")
        self.assertEqual(quiet["highlights"], [])

    def test_index_keeps_card_changes_and_skips_old_scheduled_retirements(self):
        def gist(number, merged_at, *announcements):
            return {"pr_number": number, "merged_at": merged_at, "announcements": list(announcements),
                    "url": f"https://github.com/example/repo/pull/{number}"}
        def event(model, action, changes, status="unconfirmed"):
            return {"id": f"{model}:{action}", "model_id": model, "title": model, "action": action,
                    "changes": changes, "effective_at": None, "effective_status": status}
        retire = {"availability": {"before": "Available", "after": "Retired"}}
        gists = [
            gist(1, "2026-08-01T00:00:00Z", event("old", "NEW", {"paid_only": {"before": None, "after": True}})),
            gist(2, "2026-10-01T00:00:00Z",
                 event("dated", "RETIRE", retire, "scheduled"),
                 event("removed", "RETIRE", retire),
                 event("routed", "UPDATE", {"supported_endpoints": {"before": [], "after": ["/v1"]}}),
                 event("priced", "UPDATE", {"pricing": {"before": {"a": "1"}, "after": {"a": "2"}},
                                            "supported_endpoints": {"before": [], "after": ["/v1"]}}),
                 {**event("replaced", "UPDATE", {"model_id": {"before": "old/id", "after": "replaced"},
                                                 "voices": {"before": ["a"], "after": ["b"]}}),
                  "previous_title": "Old"}),
        ]
        entries = model_entries(gists, "2026-09-08", "2026-10-08")
        self.assertEqual([e["model_id"] for e in entries], ["priced", "removed", "replaced"])
        self.assertEqual(set(entries[2]["changes"]), {"model_id", "voices"})
        self.assertEqual(entries[2]["previous_title"], "Old")
        self.assertEqual(entries[0]["changes"], {"pricing": {"before": {"a": "1"}, "after": {"a": "2"}}})
        self.assertEqual(entries[0]["url"], "https://github.com/example/repo/pull/2")

    def test_api_changes_mark_what_breaks_existing_clients(self):
        field = lambda type_, required=False: {"type": type_, "required": required}
        before = {
            "GET /old": {"parameters": {}, "body": {}},
            "POST /v1/chat": {"parameters": {"query:debug": field("boolean")},
                              "body": {"seed": field("integer|null"), "model": field("string")}},
        }
        after = {
            "GET /new": {"parameters": {}, "body": {}},
            "POST /v1/chat": {"parameters": {},
                              "body": {"seed": field("integer|null|string"), "model": field("string", True),
                                       "tools": field("array")}},
        }
        events = {e["endpoint"]: e for e in api_changes(before, after, {"number": 7})}
        self.assertEqual({k: (e["action"], e["breaking"]) for k, e in events.items()},
                         {"GET /new": ("ADD", False), "GET /old": ("REMOVE", True),
                          "POST /v1/chat": ("CHANGE", True)})
        chat = {c["field"]: c["breaking"] for c in events["POST /v1/chat"]["changes"]}
        # removed parameter and newly required field break clients; a widened type and an optional field do not
        self.assertEqual(chat, {"parameters:query:debug": True, "body:model": True,
                                "body:seed": False, "body:tools": False})
        self.assertEqual(events["GET /new"]["id"], "pr-7:GET /new")
        # Documentation gaps: an undocumented body on one side, or a type lost to "any".
        gap = api_changes(
            {"POST /x": {"parameters": {}, "body": {"a": field("string", True)}},
             "POST /y": {"parameters": {}, "body": {"b": field("string", True)}}},
            {"POST /x": {"parameters": {}, "body": {}},
             "POST /y": {"parameters": {}, "body": {"b": field("any")}}},
            {"number": 8})
        self.assertEqual(gap, [])

    def test_docs_pr_reports_api_changes_from_apidocs(self):
        docs = """## 🛠️ Endpoints

#### `GET` `/a` — A

⚙️ **Parameters**

| Param | In | Type | Description |
|---|---|---|---|
| `prompt` * | `path` | `string` | Prompt |
| `seed` | `query` | `integer` \\| `null` | Seed |

📥 **Request body** · `application/json`

| Field | Type | Description |
|---|---|---|
| `audio` * | `string` | — |
| `audio.voice` | `string` | nested, skipped |

📤 **Response**

| Field | Type | Description |
|---|---|---|
| `ignored` | `string` | — |
"""
        self.assertEqual(api_surface(docs), {"GET /a": {
            "summary": "A",
            "parameters": {"path:prompt": {"type": "string", "required": True},
                           "query:seed": {"type": "integer|null", "required": False}},
            "body": {"audio": {"type": "string", "required": True}}}})
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            def git(*args):
                return subprocess.run(["git", *args], cwd=root, check=True, capture_output=True, text=True).stdout.strip()
            git("init", "-b", "main")
            git("config", "user.name", "Test")
            git("config", "user.email", "test@example.com")
            (root / "APIDOCS.md").write_text(docs)
            git("add", "APIDOCS.md")
            git("commit", "-m", "docs: regenerate")
            (root / "APIDOCS.md").write_text(docs.replace("`audio` *", "`file` *").replace("`/a`", "`/b`", 1))
            git("commit", "-am", "docs: regenerate")
            second = {"number": 2, "merge_commit_sha": git("rev-parse", "HEAD"), "commits": 1}
            changes = api_changes_for_pr(second, root)
        self.assertEqual([(e["action"], e["endpoint"], e["summary"]) for e in changes],
                         [("REMOVE", "GET /a", "A"), ("ADD", "GET /b", "A")])
        gist = {"pr_number": 2, "merged_at": "2026-10-08T00:00:00Z",
                "url": "https://github.com/example/repo/pull/2", "api_changes": changes}
        old_gist = {**gist, "pr_number": 1, "merged_at": "2026-08-01T00:00:00Z"}
        entries = api_entries([old_gist, gist], "2026-09-08")
        self.assertEqual([(e["endpoint"], e["pr"], e["date"]) for e in entries],
                         [("GET /a", 2, "2026-10-08"), ("GET /b", 2, "2026-10-08")])

    def test_pr_description_announces_retirements_from_its_change_table(self):
        catalog = [{"name": "x-ai/grok-imagine", "title": "Grok Imagine", "category": "image"},
                   {"name": "qwen/qwen3-vl", "title": "Qwen3 VL"}]
        body = """Retires two models.

| Model | Action | Change | Before | After | Effective |
| --- | --- | --- | --- | --- | --- |
| `x-ai/grok-imagine` | RETIRE | Availability | Available | Retired | 2026-11-02 00:00 UTC |
| `qwen/qwen3-vl` | RETIRE | Availability | Available | Retired | 2026-11-09 08:00 +08:00 |
| `qwen/qwen3-vl` | RETIRE | Availability | Available | Retired | 2026-10-01 |
| `unknown/model` | RETIRE | Availability | Available | Retired | 2026-12-01 |
| `x-ai/grok-imagine` | RETIRE | Availability | Available | Retired | On production deployment |
"""
        pr = {"number": 5, "merged_at": "2026-10-08T00:00:00Z", "body": body}
        events = announced_retirements(pr, catalog)
        self.assertEqual([(e["model_id"], e["effective_at"], e["effective_status"]) for e in events],
                         [("x-ai/grok-imagine", "2026-11-02T00:00:00Z", "scheduled"),
                          ("qwen/qwen3-vl", "2026-11-09T00:00:00Z", "scheduled")])
        self.assertEqual(events[0]["source"], "pr_description")
        cancel = {**pr, "body": "| `x-ai/grok-imagine` | RETIRE | Availability | Retiring | Available | Cancelled |"}
        self.assertEqual(announced_retirements(cancel, catalog)[0]["effective_status"], "cancelled")

    def test_index_keeps_the_latest_announcement_until_the_model_is_removed(self):
        def gist(number, merged_at, *announcements):
            return {"pr_number": number, "merged_at": merged_at, "announcements": list(announcements),
                    "url": f"https://github.com/example/repo/pull/{number}"}
        def announced(model, status, effective_at=None):
            return {"id": f"{model}:retirement", "model_id": model, "title": model, "action": "RETIRE",
                    "changes": {}, "effective_at": effective_at, "effective_status": status,
                    "source": "pr_description"}
        removal = {"id": "gone:remove", "model_id": "gone", "title": "gone", "action": "RETIRE",
                   "changes": {}, "effective_at": None, "effective_status": "unconfirmed"}
        gists = [
            gist(1, "2026-09-20T00:00:00Z", announced("moved", "scheduled", "2026-10-20T00:00:00Z"),
                 announced("kept", "scheduled", "2026-10-25T00:00:00Z"),
                 announced("gone", "scheduled", "2026-10-02T00:00:00Z"),
                 announced("overdue", "scheduled", "2026-10-05T00:00:00Z"),
                 announced("withdrawn", "scheduled", "2026-10-30T00:00:00Z")),
            gist(2, "2026-10-01T00:00:00Z", announced("moved", "scheduled", "2026-12-01T00:00:00Z"),
                 announced("withdrawn", "cancelled")),
            gist(3, "2026-10-02T00:00:00Z", removal),
        ]
        entries = {e["model_id"]: e for e in model_entries(gists, "2026-09-08", "2026-10-08")}
        self.assertEqual(entries["moved"]["date"], "2026-12-01")
        self.assertEqual(entries["moved"]["previous_date"], "2026-10-20")
        self.assertEqual(entries["kept"]["status"], "scheduled")
        self.assertEqual(entries["withdrawn"]["status"], "cancelled")
        self.assertEqual(entries["withdrawn"]["previous_date"], "2026-10-30")
        self.assertNotIn("overdue", entries)
        self.assertNotIn("status", entries["gone"])  # the removal itself, not the announcement

    def test_index_highlights_cover_the_readme_and_feed_it(self):
        summaries = [{"date": f"2026-09-{day:02d}", "highlights": [
            {"emoji": "🎨", "title": f"Item {day}", "text": "Try it.", **({"kind": "app"} if day == 3 else {})}]}
            for day in range(1, 13)]
        self.assertEqual(len(highlight_entries(summaries, "2026-09-11")), 10)
        self.assertEqual(highlight_entries(summaries, "2026-09-11")[0]["title"], "Item 12")
        self.assertEqual(len(highlight_entries(summaries, "2026-09-01")), 12)
        with tempfile.TemporaryDirectory() as directory:
            news = Path(directory)
            (news / "daily/2026-09-12").mkdir(parents=True)
            (news / "daily/2026-09-12/summary.json").write_text(json.dumps(summaries[-1]))
            index = build_index(news, "2026-09-13")
        self.assertEqual(index["models"], [])
        self.assertEqual(get_top_highlights(index), ["- **2026-09-12** – **🎨 Item 12** Try it."])

    def test_platform_posts_keep_arc_facts_and_distinguish_selected_counts(self):
        digest = {
            "pr_count": 1,
            "pr_summary": "#1: Larger media inputs",
            "arcs": [{
                "headline": "Larger uploads",
                "summary": "Uploads increase from 32 MiB to 100 MiB.",
            }],
        }
        # Every platform post is written from this recap.
        recap = post_recap(digest)
        self.assertIn("32 MiB to 100 MiB", recap)
        self.assertIn("PRs selected for this recap: 1", recap)
        self.assertNotIn("Total PRs merged:", recap)
        month = monthly_digest_input([{"date": "2026-10-01", "summary": "One selected update", "pr_count": 1}], "2026-10")
        self.assertIn("PRs selected for daily recaps: 1", month)
        self.assertNotIn("Merged PRs:", month)

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


# One reply carrying every field any post reads.
REPLY = {
    "pr_summary": "#1: Larger media inputs", "pr_count": 2, "one_liner": "Uploads grow.", "theme": "Bigger inputs.",
    "arcs": [{"headline": "Larger uploads", "summary": "Uploads increase from 32 MiB to 100 MiB — größer."}],
    "highlights": [{"emoji": "🚀", "title": "Larger uploads", "text": "Upload up to 100 MiB.", "prs": [1]}],
    "tweet": "Uploads now take 100 MiB.", "title": "Larger uploads", "body": "Uploads grow to 100 MiB.",
    "hook": "Uploads grew.", "closing": "The repo is public.", "hashtags": ["#AI", "#OpenSource"],
    "message": "Hi <@&1424461167883194418>", "caption": "Bigger boxes.", "image_prompt": "Bee carrying a big box",
    "images": [{"prompt": f"Bee scene {n}"} for n in (1, 2, 3)],
    "models_md_section": "## 2026-10-14\n\n### Added\n- `new` (text)", "discord_text": "<@&MODEL_ROLE_ID> Model updates",
}


def gist(number, merged_at, tier="daily"):
    return {"pr_number": number, "title": f"PR {number}", "author": "someone", "merged_at": merged_at,
            "url": f"https://github.com/pollinations/pollinations/pull/{number}", "labels": [],
            "area": "Models", "type": "Feature", "source": "Team", "image": {"prompt": "Bee"},
            "gist": {"category": "feature", "user_facing": True, "publish_tier": tier, "importance": "major",
                     "summary": f"Change {number} ships. Ünïcode ✓", "keywords": ["models"]}}


class TextCallTest(unittest.TestCase):
    def test_a_failed_or_empty_answer_is_asked_once_and_stops_the_caller(self):
        answer = lambda content: reply(200, {"choices": [{"message": {"content": content}, "finish_reason": "stop"}]})
        for response, expected in ((answer("Hello"), "Hello"), (answer(""), None), (answer(None), None),
                                   (reply(503), None)):
            with self.subTest(response=response.status_code), \
                 patch("common.requests.post", return_value=response) as post:
                self.assertEqual(call_pollinations_api("system", "user", "token"), expected)
                self.assertEqual(post.call_count, 1)


class ContributorsTest(unittest.TestCase):
    def test_monthly_contributors_are_every_merging_account_and_noreply_coauthors(self):
        user = lambda user_id, login, kind="User", created="2020-01-01T00:00:00Z": {
            "id": user_id, "login": login, "type": kind, "created_at": created,
            "avatar_url": f"av{user_id}", "html_url": f"gh/{login}"}
        github = {
            "user/12345": user(12345, "FabioArieiraBaia"),        # a trailer whose id matches its login
            "user/1": user(1, "voodoohop"),
            "user/555": user(555, "art-otakus", "Organization"),  # an agent guessed someone else's id...
            "users/GoodCoder": user(173, "GoodCoder"),            # ...so the login's own account gets it
            "user/808": user(808, "TechMitten"),                  # renamed: the old login is gone
            "user/909": user(909, "2Thm83", "Mannequin"),         # a placeholder, and no such login
            "user/160": user(160, "mentatbot[bot]", "Bot"),       # an app's bot signing as "MentatBot"
            "users/MentatBot": user(173, "MentatBot"),            # an unrelated user with that name
            "users/Tolerable": user(2303, "Tolerable"),           # an app submitter named by login only
            "users/pixArt": user(4040, "pixArt", created="2026-08-17T00:00:00Z"),  # the name taken later
            "users/voodoohop": user(1, "voodoohop"),
            "users/thomash": user(1145, "ThomasH"),               # a stranger: thomash is Thomas's git alias
        }
        prs = [
            {"author": {"login": "voodoohop", "databaseId": 1, "avatarUrl": "a", "url": "u"},
             "mergedAt": "2026-01-15T10:00:00Z",
             # Thomas's own git alias: credits voodoohop, who already has this PR, not the stranger.
             "mergeCommit": {"message": "fix: one\n\nCo-authored-by: Thomas <thomash@users.noreply.github.com>"}},
            {"author": {"__typename": "Bot", "login": "pollinations-ai", "databaseId": 99, "avatarUrl": "bot",
                        "url": "https://github.com/apps/pollinations-ai"},
             "mergedAt": "2026-01-15T10:00:00Z",
             "mergeCommit": {"message": (
                 "Co-authored-by: Pix <pixArt@users.noreply.github.com>\n"
                 "Add app\n\n"
                 "Co-authored-by: Fabio <12345+FabioArieiraBaia@users.noreply.github.com>\n"
                 "Co-authored-by: pollinations-ai[bot] <99+pollinations-ai[bot]@users.noreply.github.com>\n"
                 "Co-authored-by: Claude <noreply@anthropic.com>\n"
                 "Co-authored-by: Tolerable <Tolerable@users.noreply.github.com>\n"  # the bot's submitter
                 "Co-authored-by: Good <555+GoodCoder@users.noreply.github.com>\n"
                 "Co-authored-by: Tech <808+techcow2@users.noreply.github.com>\n"
                 "Co-authored-by: Shark <909+sharktide@users.noreply.github.com>\n"
                 "Co-authored-by: MentatBot <160+MentatBot@users.noreply.github.com>\n"
             )}},
            # The same account under an earlier login still counts once, by its id.
            {"author": {"login": "VoodooHop-old", "databaseId": 1, "avatarUrl": "a", "url": "u"},
             "mergeCommit": {"message": "Co-authored-by: voodoohop <1+voodoohop@users.noreply.github.com>"}},
            {"author": None, "mergeCommit": None},
        ]
        with patch("contributors.github_account", side_effect=lambda path, _token: github.get(path)):
            ranked = rank_contributors(prs, "test")
        # No credit: pixArt (the account did not exist yet), the placeholder account (sharktide's
        # 909) and the app's own bot as a co-author (bots count as PR authors only).
        self.assertEqual([(p["id"], p["login"], p["prs"]) for p in ranked],
                         [(1, "voodoohop", 2), (12345, "FabioArieiraBaia", 1), (173, "GoodCoder", 1),
                          (99, "pollinations-ai[bot]", 1), (808, "TechMitten", 1), (2303, "Tolerable", 1)])
        self.assertEqual(ranked[1]["avatar_url"], "av12345")
        self.assertEqual(ranked[4]["url"], "gh/TechMitten")
        self.assertEqual(ranked[3]["url"], "https://github.com/apps/pollinations-ai")

        # A rate limit or outage stops the count; only a 404 means the account is gone.
        with patch("contributors.github_api_request") as api:
            api.return_value.status_code = 403
            with self.assertRaises(RuntimeError):
                github_account("user/403-test", "test")
            api.return_value.status_code = 404
            self.assertIsNone(github_account("user/404-test", "test"))


class PostsTest(unittest.TestCase):
    """posts.py on fixtures: its model calls and pictures, and the files it saves."""

    def setUp(self):
        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        self.root = Path(directory.name)
        self.checkout("news")
        for patcher in (patch.dict(os.environ, {"POLLINATIONS_TOKEN": "test", "GITHUB_TOKEN": "test",
                                                "GITHUB_REPOSITORY": "pollinations/pollinations",
                                                "DISCORD_MODELS_ROLE_ID": "42"}),
                        patch("posts.month_counts", side_effect=lambda month, token, repository: {
                            "month": month, "merged_prs": 3, "contributors": [{"id": 1, "login": "a", "prs": 3}]}),
                        patch("time.sleep")):
            patcher.start()
            self.addCleanup(patcher.stop)

    def checkout(self, name):
        self.news, self.work = self.root / name, self.root / f"{name}-work"
        (self.news / NEWS_REL_DIR).mkdir(parents=True)

    def put(self, path, data):
        file = self.news / NEWS_REL_DIR / path
        file.parent.mkdir(parents=True, exist_ok=True)
        file.write_text(data if isinstance(data, str) else json.dumps(data), encoding="utf-8")

    def files(self):
        return {str(path.relative_to(self.news)): path.read_bytes() for path in self.news.rglob("*") if path.is_file()}

    def fakes(self, long_linkedin=False, **changes):
        calls, images = [], []
        def model(system_prompt, user_prompt, token, temperature=0.7, response_format=None):
            calls.append((system_prompt, user_prompt, temperature))
            reply = {**REPLY, **changes}
            if long_linkedin and "Create a LinkedIn post" in user_prompt and "The previous draft" not in user_prompt:
                reply["body"] = "x" * 1300
            return json.dumps(reply)
        def image(prompt, token, width=2048, height=2048, index=0, model=None):
            images.append((prompt, width, height, index))
            return prompt.encode() + b" picture", None
        return calls, images, model, image

    def new(self, job, date, overwrite=False, **options):
        calls, images, model, image = self.fakes(**options)
        before = self.files()
        with patch("posts.call_pollinations_api", model), patch("posts.generate_image", image):
            posts.write(job, date, self.news, self.work, overwrite)
            posts.save(job, date, self.news, self.work, overwrite)
        return calls, images, {path: data for path, data in self.files().items() if before.get(path) != data}

    def assertDeliverable(self, job, base, saved):
        """Each file deliver.py sends is saved with its text and its pictures' saved urls."""
        for name in deliver.POSTS[job]:
            post = json.loads(saved[f"{base}/{name}"])
            self.assertTrue(post["text"].strip())
            pictures = deliver.get_post_image_urls(post)
            self.assertTrue(pictures)
            for url in pictures:
                self.assertIn(url.split("/news/", 1)[1], saved)

    def test_daily(self):
        for number in (1, 2):
            self.put(f"gists/2026-10-06/PR-{number}.json", gist(number, "2026-10-06T10:00:00Z"))
        self.put("gists/2026-10-06/PR-3.json", gist(3, "2026-10-06T11:00:00Z", tier="discord_only"))
        self.put("gists/2026-10-07/PR-4.json", gist(4, "2026-10-07T11:00:00Z", tier="discord_only"))
        calls, images, saved = self.new("daily", "2026-10-06")
        base = f"{NEWS_REL_DIR}/daily/2026-10-06"
        self.assertEqual(sorted(saved), [f"{base}/{name}" for name in (
            "images/twitter.jpg", "summary.json", "twitter.json")])
        self.assertDeliverable("daily", base, saved)
        # The summary, then the X post, from the day's daily-tier gists only.
        self.assertEqual([temperature for _, _, temperature in calls], [0.3, 0.8])
        self.assertIn("PR 2", calls[0][1])
        self.assertNotIn("PR 3", calls[0][1])
        self.assertEqual(images, [("Bee carrying a big box", 2048, 2048, 0)])
        twitter = json.loads(saved[f"{base}/twitter.json"])
        self.assertEqual((twitter["text"], twitter["images"][0]["url"]), (
            "Uploads now take 100 MiB.",
            f"https://raw.githubusercontent.com/pollinations/pollinations/news/{base}/images/twitter.jpg"))
        self.assertEqual(json.loads(saved[f"{base}/summary.json"])["pr_count"], 2)
        # A day without daily-tier gists writes and saves nothing.
        self.assertEqual(self.new("daily", "2026-10-07"), ([], [], {}))
        # A post whose text is missing stops the run instead of being saved empty.
        with self.assertRaisesRegex(SystemExit, "missing tweet"):
            self.new("daily", "2026-10-06", overwrite=True, tweet=None)

    def test_weekly_with_and_without_the_linkedin_rewrite(self):
        for long_linkedin, temperatures in ((False, [0.3, 0.7, 0.7, 0.7, 0.8]),
                                            (True, [0.3, 0.7, 0.7, 0.7, 0.7, 0.8])):
            with self.subTest(long_linkedin=long_linkedin):
                self.checkout(f"news-{long_linkedin}")
                for number, day in ((1, "2026-09-27"), (2, "2026-09-30"), (3, "2026-10-03"), (4, "2026-10-04")):
                    self.put(f"gists/{day}/PR-{number}.json", gist(number, f"{day}T10:00:00Z"))
                calls, images, saved = self.new("weekly", "2026-10-04", long_linkedin=long_linkedin)
                base = f"{NEWS_REL_DIR}/weekly/2026-10-04"
                self.assertEqual(len(saved), 11)
                self.assertDeliverable("weekly", base, saved)
                self.assertLessEqual(len(json.loads(saved[f"{base}/linkedin.json"])["text"]), 1248)
                self.assertEqual([temperature for _, _, temperature in calls], temperatures)
                summary = json.loads(saved[f"{base}/summary.json"])
                self.assertEqual((summary["period_start"], summary["period_end"]), ("2026-09-27", "2026-10-03"))
                # The Sunday's own gist belongs to the next week.
                self.assertIn("PR 3", calls[0][1])
                self.assertNotIn("PR 4", "".join(user for _, user, _ in calls))
                self.assertEqual([image for image in images if image[0].startswith("Bee scene")],
                                 [(f"Bee scene {n}", 2048, 2048, n - 1) for n in (1, 2, 3)])
                self.assertEqual(len(json.loads(saved[f"{base}/instagram.json"])["images"]), 3)
                # An overlong LinkedIn draft is rewritten once.
                linkedin = [user for _, user, _ in calls if "Create a LinkedIn post" in user]
                self.assertEqual(["The previous draft" in user for user in linkedin],
                                 [False, True] if long_linkedin else [False])

    def test_monthly(self):
        # The cover's picture prompt is trimmed; the other posts' prompts never are.
        for reply, picture in (({}, "Bee carrying a big box"), ({"image_prompt": "  Bee at a desk \n"}, "Bee at a desk")):
            with self.subTest(reply=reply):
                self.checkout(f"news-{len(reply)}")
                for day in ("2026-09-01", "2026-09-15", "2026-09-30", "2026-10-01"):
                    self.put(f"daily/{day}/summary.json", {"date": day, "title": f"Day {day}", "pr_count": 2,
                                                           "summary": "Things shipped.",
                                                           "prs": [{"number": 1, "date": day}]})
                calls, images, saved = self.new("monthly", "2026-09", **reply)
                base = f"{NEWS_REL_DIR}/monthly/2026-09"
                self.assertEqual(sorted(saved), [f"{base}/contributors.json", f"{base}/images/cover.jpg",
                                                 f"{base}/summary.json"])
                self.assertEqual(json.loads(saved[f"{base}/contributors.json"]),
                                 {"month": "2026-09", "merged_prs": 3, "contributors": [{"id": 1, "login": "a", "prs": 3}]})
                self.assertEqual([temperature for _, _, temperature in calls], [0.3, 0.7])
                self.assertIn("Day 2026-09-30", calls[0][1])
                self.assertNotIn("Day 2026-10-01", calls[0][1])
                self.assertEqual([image[0] for image in images], [picture])
        # A month without daily summaries writes no page but still has its counts.
        self.assertEqual(sorted(self.new("monthly", "2026-08")[2]), [f"{NEWS_REL_DIR}/monthly/2026-08/contributors.json"])

    def test_model_post_and_a_week_without_changes_saves_only_the_snapshot(self):
        previous = {"text": [{"name": "kept", "paid_only": False}], "image": [], "video": [], "audio": [],
                    "embeddings": []}
        current = {**previous, "text": [{"name": "kept", "paid_only": True}, {"name": "new", "title": "Nëw"}]}
        changelog = "# Pollinations Model Changelog\n\n## 2026-10-07\n\n- Older section\n"
        self.put("models/snapshots/2026-10-07.json", previous)
        self.put("models/snapshots/2026-10-21.json", current)  # later than the post: not its baseline
        self.put("models/models.md", changelog)
        models = f"{NEWS_REL_DIR}/models"
        with patch("posts.fetch_all_snapshots", return_value=copy.deepcopy(current)):
            calls, images, saved = self.new("models", "2026-10-14")
        # One call compares with the last snapshot before the post, and four files are saved together.
        self.assertEqual([temperature for _, _, temperature in calls], [0.4])
        self.assertIn("2026-10-07", calls[0][1])
        self.assertEqual(sorted(saved), [f"{models}/2026-10-14/discord.json", f"{models}/diffs/2026-10-14.json",
                                         f"{models}/models.md", f"{models}/snapshots/2026-10-14.json"])
        self.assertIn('"text": "<@&42> Model updates"', saved[f"{models}/2026-10-14/discord.json"].decode())
        self.assertEqual(json.loads(saved[f"{models}/snapshots/2026-10-14.json"]), current)
        self.assertLess(saved[f"{models}/models.md"].decode().index("## 2026-10-14"),
                        saved[f"{models}/models.md"].decode().index("## 2026-10-07"))
        # A week without changes makes no call and saves only the snapshot.
        with patch("posts.fetch_all_snapshots", return_value=copy.deepcopy(current)):
            calls, _, saved = self.new("models", "2026-10-28")
        self.assertEqual((calls, list(saved)), ([], [f"{models}/snapshots/2026-10-28.json"]))
        # A saved model post is never replaced; a week without changes can be taken again.
        with patch("posts.fetch_all_snapshots", return_value=copy.deepcopy(current)):
            with self.assertRaisesRegex(SystemExit, "has a saved model post"):
                self.new("models", "2026-10-14", overwrite=True)
            self.assertEqual(self.new("models", "2026-10-28", overwrite=True)[0], [])

    def test_model_baseline_is_never_silently_rebuilt(self):
        self.put("models/models.md", "# Pollinations Model Changelog\n")
        with patch("posts.fetch_all_snapshots", return_value={"text": [{"name": "a"}]}):
            with self.assertRaisesRegex(SystemExit, "refusing to rebuild the baseline"):
                posts.write("models", "2026-10-14", self.news, self.work)
            with patch.dict(os.environ, {"ALLOW_BASELINE_REBUILD": "1"}):
                new = self.new("models", "2026-10-14")
        self.assertEqual(list(new[2]), [f"{NEWS_REL_DIR}/models/snapshots/2026-10-14.json"])

    def test_a_saved_date_is_replaced_only_when_asked_and_keeps_its_delivery_record(self):
        self.put("gists/2026-10-06/PR-1.json", gist(1, "2026-10-06T10:00:00Z"))
        self.new("daily", "2026-10-06")
        delivery = self.news / NEWS_REL_DIR / "daily/2026-10-06/delivery.json"
        delivery.write_text('{"daily-x": "done"}')
        _, _, model, image = self.fakes()
        with patch("posts.call_pollinations_api", model), patch("posts.generate_image", image):
            for command in (posts.write, posts.save):
                with self.assertRaisesRegex(SystemExit, "already saved"):
                    command("daily", "2026-10-06", self.news, self.work)
            posts.write("daily", "2026-10-06", self.news, self.work, overwrite=True)
            posts.save("daily", "2026-10-06", self.news, self.work, overwrite=True)
            for job, date in (("weekly", "2026-10-05"), ("daily", "2026-10-6"), ("monthly", "2026-10-06")):
                with self.assertRaisesRegex(SystemExit, "is not a"):
                    posts.write(job, date, self.news, self.work)
            with self.assertRaisesRegex(SystemExit, "not a checkout"):
                posts.write("daily", "2026-10-06", self.root, self.work)
        self.assertEqual(delivery.read_text(), '{"daily-x": "done"}')


jsonlib = json


def reply(status, body=None):
    return SimpleNamespace(status_code=status, json=lambda: body or {}, text="", headers={})


class DeliverTest(unittest.TestCase):
    """deliver.py against the news branch as GitHub's contents API keeps it, and fake channels."""

    def setUp(self):
        self.store, self.faults, self.calls, self.broken = {}, [], [], {}
        env = {"GITHUB_TOKEN": "test", "BUFFER_ACCESS_TOKEN": "test", "DISCORD_MODELS_ROLE_ID": "42",
               "DISCORD_WEEKLY_WEBHOOK_URL": "https://discord.test/weekly",
               "DISCORD_MODELS_WEBHOOK_URL": "https://discord.test/models"}
        for patcher in (
            patch.dict(os.environ, env),
            patch.dict(deliver.START, {"daily": "2026-10-01", "weekly": "2026-10-01", "models": "2026-10-01"}),
            patch.dict(deliver.BUFFER_CHANNELS, {"twitter": "x", "linkedin": "li", "instagram": "ig"}),
            patch("deliver.github", self.github),
            patch("deliver.requests.post", self.post),
            patch("deliver.requests.head", return_value=reply(200)),
            patch("deliver.requests.get", return_value=SimpleNamespace(
                status_code=200, headers={"content-type": "image/jpeg"}, content=b"jpeg")),
            patch("time.sleep"),
        ):
            patcher.start()
            self.addCleanup(patcher.stop)

    def github(self, method, path, params=None, json=None):
        """A stale sha gets 409 and a create over an existing file 422, as on GitHub."""
        current = self.store.get(path)
        if method == "GET":
            if current is None:
                return reply(404)
            return reply(200, {"content": base64.b64encode(current).decode(),
                               "sha": hashlib.sha1(current).hexdigest()})
        fault = self.faults.pop(0) if self.faults else None
        if fault == "409":
            return reply(409)
        if fault == "taken":  # another run's claim lands just before this one
            record = jsonlib.loads(base64.b64decode(json["content"]))
            taken = {post: {**entry, "run": "other"} for post, entry in record.items() if entry["run"] == deliver.RUN}
            self.store[path] = jsonlib.dumps({**record, **taken}).encode()
            return reply(409)
        if current is not None and json.get("sha") != hashlib.sha1(current).hexdigest():
            return reply(409 if "sha" in json else 422)
        self.store[path] = base64.b64decode(json["content"])
        return reply(502 if fault == "502" else 201)

    def post(self, url, json=None, files=None, timeout=None, headers=None):
        self.calls.append((url, json, files))
        answers = self.broken.get(url) or []
        trouble = answers.pop(0) if answers else None
        if isinstance(trouble, Exception):
            raise trouble
        if trouble:
            return reply(*trouble)
        if url == deliver.BUFFER_URL:
            due = json["variables"]["input"]["dueAt"]
            return reply(200, {"data": {"createPost": {"__typename": "PostActionSuccess",
                                                       "post": {"id": f"b{len(self.calls)}", "dueAt": due}}}})
        return reply(200, {"id": f"m{len(self.calls)}"})

    def save(self, job, date, posts, summary=True):
        folder = f"{deliver.JOB_DIRS[job]}/{date}"
        if summary:
            self.store[f"{folder}/summary.json"] = b"{}"
        for name, post in posts.items():
            self.store[f"{folder}/{name}"] = json.dumps(post).encode()

    def record(self, job, date):
        content = self.store.get(f"{deliver.JOB_DIRS[job]}/{date}/delivery.json")
        return {post: entry["state"] for post, entry in json.loads(content).items()} if content else {}

    def sent(self, target):
        return [call for call in self.calls if call[0] == target]

    def weekly(self, date="2026-10-11"):
        pictures = [{"url": f"https://raw.githubusercontent.com/pollinations/pollinations/news/{n}.jpg"} for n in range(3)]
        picture = pictures[0]
        self.save("weekly", date, {
            "twitter.json": {"text": "Shipped.", "images": [picture]},
            "linkedin.json": {"text": "A week of work.", "images": [picture]},
            "instagram.json": {"text": "Cozy.", "images": pictures},
            "discord.json": {"text": "Hi <@&1424461167883194418>", "images": [picture]},
        })

    def test_each_post_goes_out_once_as_today(self):
        self.weekly()
        for _ in range(2):
            deliver.run("schedule", "weekly", "2026-10-11")
            deliver.run("send", "weekly", "2026-10-11")
        self.assertEqual(self.record("weekly", "2026-10-11"), {
            "twitter.json": "done", "linkedin.json": "done", "instagram.json": "done",
            "discord.json": "done"})
        buffer = [call[1] for call in self.sent(deliver.BUFFER_URL)]
        self.assertEqual(len(buffer), 3)
        # Buffer only schedules, at today's slots; nothing is posted right away.
        for request in buffer:
            self.assertEqual(request["query"], deliver.CREATE_POST)
            self.assertEqual((request["variables"]["input"]["mode"],
                              request["variables"]["input"]["schedulingType"]), ("customScheduled", "automatic"))
        x, linkedin, instagram = (request["variables"]["input"] for request in buffer)
        self.assertEqual((len(x["assets"]), len(instagram["assets"])), (1, 3))
        self.assertEqual(instagram["metadata"], {"instagram": {"type": "post", "shouldShareToFeed": True}})
        self.assertNotIn("metadata", linkedin)
        # The weekly Discord post carries its picture and, as today, pings nobody.
        (_, payload, files), = self.sent("https://discord.test/weekly?wait=true")
        self.assertIsNone(payload)
        self.assertEqual(json.loads(files["payload_json"][1]), {"content": "Hi <@&1424461167883194418>"})
        # A rerun whose checks would fail doesn't report the posts that went out.
        with patch("deliver.weekly_discord", side_effect=ValueError("no webhook")):
            deliver.run("send", "weekly", "2026-10-11")

    def test_slots_are_todays(self):
        def slot(channel, *when):
            return deliver.next_slot(channel, datetime(2026, 10, *when, tzinfo=UTC))
        self.assertEqual(slot("twitter", 12, 6, 30), "2026-10-12T15:00:00Z")    # Monday's daily
        self.assertEqual(slot("twitter", 11, 6, 30), "2026-10-12T15:00:00Z")    # Sunday's weekly X → Monday
        self.assertEqual(slot("twitter", 12, 14, 55), "2026-10-13T15:00:00Z")   # 10 minutes ahead at least
        self.assertEqual(slot("linkedin", 11, 6, 30), "2026-10-11T18:00:00Z")
        self.assertEqual(slot("instagram", 11, 17, 55), "2026-10-18T18:00:00Z")

    def test_text_limits_are_todays(self):
        # As today, a post whose pictures don't load is scheduled anyway.
        deliver.requests.head.return_value = reply(404)
        self.save("weekly", "2026-10-11", {
            "twitter.json": {"text": "x" * 281, "images": [{"url": "https://raw.githubusercontent.com/p.jpg"}]},
            "linkedin.json": {"text": "y" * 1249},
            "instagram.json": {"text": "z" * 2201},
        })
        with self.assertRaisesRegex(SystemExit, "linkedin.json"):
            deliver.run("schedule", "weekly", "2026-10-11")
        texts = [call[1]["variables"]["input"]["text"] for call in self.sent(deliver.BUFFER_URL)]
        self.assertEqual(texts, ["x" * 277 + "...", "z" * 2197 + "..."])
        self.assertNotIn("linkedin.json", self.record("weekly", "2026-10-11"))

    def test_an_unclear_send_waits_for_a_person_and_the_rest_goes_out(self):
        self.weekly()
        self.broken[deliver.BUFFER_URL] = [requests.ReadTimeout()]
        self.broken["https://discord.test/weekly?wait=true"] = [(503,)]
        for command in ("schedule", "send"):
            for _ in range(2):
                with self.assertRaisesRegex(SystemExit, "Not delivered"):
                    deliver.run(command, "weekly", "2026-10-11")
        self.assertEqual(self.record("weekly", "2026-10-11"), {
            "twitter.json": "attempt", "linkedin.json": "done", "instagram.json": "done",
            "discord.json": "attempt"})
        self.assertEqual(len(self.sent(deliver.BUFFER_URL)), 3)
        # A person found the X post and the Discord message missing: one is done, one goes again.
        deliver.mark("weekly", "2026-10-11", "twitter.json", "done")
        deliver.mark("weekly", "2026-10-11", "discord.json", "failed")
        deliver.run("schedule", "weekly", "2026-10-11")
        deliver.run("send", "weekly", "2026-10-11")
        self.assertEqual((len(self.sent(deliver.BUFFER_URL)), len(self.sent("https://discord.test/weekly?wait=true"))), (3, 2))
        self.assertEqual(self.record("weekly", "2026-10-11")["discord.json"], "done")

    def test_a_clean_failure_is_sent_again_and_false_conflicts_resolve(self):
        self.save("daily", "2026-10-11", {"twitter.json": {"text": "Shipped."}})
        self.broken[deliver.BUFFER_URL] = [(401, {"errors": [{"extensions": {"code": "UNAUTHENTICATED"}}]})]
        with self.assertRaisesRegex(SystemExit, "Not delivered"):
            deliver.run("schedule", "daily", "2026-10-11")
        self.assertEqual(self.record("daily", "2026-10-11"), {"twitter.json": "failed"})
        # A commit landing in the same instant gives a false 409; a 502 can hide a write that landed.
        self.faults = ["409", None, "502"]
        deliver.run("schedule", "daily", "2026-10-11")
        deliver.run("schedule", "daily", "2026-10-11")
        self.assertEqual(self.record("daily", "2026-10-11"), {"twitter.json": "done"})
        self.assertEqual(len(self.sent(deliver.BUFFER_URL)), 2)

    def test_only_saved_dates_from_the_start_date_are_delivered(self):
        self.save("daily", "2026-10-10", {"twitter.json": {"text": "Saturday"}})        # never delivered
        self.save("weekly", "2026-10-04", {"twitter.json": {"text": "Week"}})           # discord.json missing
        for date in ("2026-10-10", "2026-10-07"):                                       # 10-07: nothing saved
            deliver.run("schedule", "daily", date)
        with self.assertRaisesRegex(SystemExit, "discord.json"):
            deliver.run("send", "weekly", "2026-10-04")
        self.assertEqual(self.calls, [])
        # A post saved without its summary still goes out.
        self.save("daily", "2026-10-09", {"twitter.json": {"text": "Friday"}}, summary=False)
        deliver.run("schedule", "daily", "2026-10-09")
        self.assertEqual(len(self.sent(deliver.BUFFER_URL)), 1)
        for start, date in ((None, "2026-10-08"), ("2026-10-09", "2026-10-08")):
            with patch.dict(deliver.START, {"daily": start}), self.assertRaisesRegex(SystemExit, "start date"):
                deliver.run("schedule", "daily", date)

    def test_a_post_claimed_by_another_run_is_left_to_it(self):
        self.save("daily", "2026-10-11", {"twitter.json": {"text": "Shipped."}})
        self.faults = ["taken"]
        deliver.run("schedule", "daily", "2026-10-11")
        self.assertEqual(self.calls, [])
        self.assertEqual(self.record("daily", "2026-10-11"), {"twitter.json": "attempt"})

    def test_a_half_sent_discord_post_is_finished_by_hand(self):
        self.save("weekly", "2026-10-11", {"discord.json": {"text": "line\n" * 400}})
        self.broken["https://discord.test/weekly?wait=true"] = [None, (429,)]
        with self.assertRaisesRegex(SystemExit, "discord.json"):
            deliver.run("send", "weekly", "2026-10-11")
        with self.assertRaisesRegex(SystemExit, "by hand"):
            deliver.mark("weekly", "2026-10-11", "discord.json", "failed")
        deliver.mark("weekly", "2026-10-11", "discord.json", "done")
        deliver.run("send", "weekly", "2026-10-11")
        self.assertEqual(len(self.sent("https://discord.test/weekly?wait=true")), 2)

    def test_model_post_is_sent_once_from_work_and_never_saved_with_another_text(self):
        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        work = Path(directory.name)
        raw = {"job": "models", "date": "2026-10-14", "previous_date": "2026-10-07", "generated_at": "now",
               "outputs": {"model-post": {"discord_text": "<@&MODEL_ROLE_ID> " + "a " * 1000}}}
        (work / "raw.json").write_text(json.dumps(raw))
        for _ in range(2):
            deliver.run("send", "models", "2026-10-14", work)
        (_, payload, _), = self.sent("https://discord.test/models?wait=true")
        self.assertEqual(payload["allowed_mentions"], {"parse": ["roles"]})
        self.assertEqual(payload["content"], deliver.safe_truncate(("<@&42> " + "a " * 1000).strip(), 1900))
        # A person who marks it done keeps it tied to the text that went out.
        deliver.mark("models", "2026-10-14", "discord.json", "done")
        deliver.run("send", "models", "2026-10-14", work)
        raw["outputs"]["model-post"]["discord_text"] = "<@&MODEL_ROLE_ID> other"
        (work / "raw.json").write_text(json.dumps(raw))
        with self.assertRaisesRegex(SystemExit, "this WORK's text"):
            deliver.run("send", "models", "2026-10-14", work)
        # A week without changes has nothing to send, and save then keeps the snapshot.
        raw["outputs"] = {}
        (work / "raw.json").write_text(json.dumps({**raw, "date": "2026-10-21"}))
        deliver.run("send", "models", "2026-10-21", work)
        self.assertEqual(len(self.calls), 1)
        self.assertEqual(self.record("models", "2026-10-21"), {})


if __name__ == "__main__":
    unittest.main()
