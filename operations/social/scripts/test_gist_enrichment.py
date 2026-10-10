import copy
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import requests

sys.path.insert(0, str(Path(__file__).parent))
from common import filter_daily_gists, generate_image, generate_platform_post, normalize_platform_post, validate_gist
from generate_realtime import analyze_pr, build_full_gist, enrich_gist, generate_gist_image
from api_changes import api_changes, api_changes_for_pr, api_surface
from build_news_index import api_entries, build_index, highlight_entries, model_entries
from generate_daily import build_daily_summary_artifact, generate_summary
from generate_monthly import generate_digest as generate_monthly_digest
from generate_monthly import count_cast, draw_checked, generate_website_post, rank_contributors, read_earlier_pages
from generate_weekly import generate_digest, generate_discord_post
from publish_realtime import generate_snippet
from model_announcements import announced_retirements, model_changes, pr_comparison_refs
from update_readme import get_top_highlights


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
                  summary="Example model pricing changes. Account balance deduction is fixed.",
                  keywords=["models", "billing"], image_prompt="Bee fixing a honey jar")
        gist = build_full_gist(pr, ai, [])
        gist.update(area="Models", type="Task", source="Team", announcements=model_changes(
            [{"name": "example/model", "pricing": {"currency": "pollen", "image": "1"}}],
            [{"name": "example/model", "pricing": {"currency": "pollen", "image": "2"}}], pr))
        self.assertEqual(validate_gist(gist), [])
        with patch("generate_realtime.call_pollinations_api", return_value=json.dumps(ai)) as analysis:
            context = {**gist, "merge_commit_sha": "unused-commit", "enrichment": {"models": "complete"}}
            self.assertEqual(analyze_pr(pr, "shared/registry/image.ts", "test", context), ai)
            self.assertIn('"image": "2"', analysis.call_args.args[1])
            self.assertNotIn("unused-commit", analysis.call_args.args[1])
            self.assertNotIn('"enrichment"', analysis.call_args.args[1])
        self.assertEqual(gist["image"]["prompt"], ai["image_prompt"])
        self.assertNotIn("image_prompt", gist["gist"])
        self.assertNotIn("pr_body_excerpt", gist)
        with patch("generate_realtime.generate_image", return_value=(b"image", None)) as image, \
             patch("generate_realtime.commit_image_to_branch", return_value="https://example.com/image.jpg"):
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
            ("generate_monthly", lambda g: generate_monthly_digest([g], [], "2026-10", "test")),
            ("publish_realtime", lambda g: generate_snippet(g, "test")),
        ):
            with patch(f"{module}.call_pollinations_api", return_value='{"arcs": []}') as api:
                generate(gist)
                new_prompt = api.call_args.args[1]
                generate(old)
                self.assertEqual(api.call_args.args[1], new_prompt)
            for fact in ("Account balance deduction is fixed.", '"area": "Models"',
                         '"type": "Task"', '"source": "Team"'):
                self.assertIn(fact, new_prompt)
            self.assertNotIn("Old excerpt", new_prompt)
            # Only Discord states model prices; recaps feeding X/Reddit/LinkedIn/Instagram never see them.
            check = self.assertIn if module == "publish_realtime" else self.assertNotIn
            for value in ('"announcements"', '"image": "2"'):
                check(value, new_prompt)
        broken = copy.deepcopy(gist)
        broken["image"]["prompt"] = None
        self.assertIn("missing image.prompt", validate_gist(broken))
        broken["gist"]["summary"] = ""
        self.assertIn("gist.summary must be non-empty text", validate_gist(broken))
        gist.update(app_name="Example app", app_url="https://example.com/app")
        with patch("generate_daily.call_pollinations_api", return_value="{}") as api:
            generate_summary([gist], "2026-10-07", "test")
        self.assertEqual(api.call_args.args[1].count("https://example.com/app"), 1)

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
            {"emoji": "🎨", "title": f"Item {day}", "text": "Try it.", **({"app": True} if day == 3 else {})}]}
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
        for module, generate in (
            ("common", lambda: generate_platform_post("twitter", digest, "test", "Write a recap")),
            ("generate_weekly", lambda: generate_discord_post(digest, "test", "2026-10-04")),
        ):
            with patch(f"{module}.call_pollinations_api", return_value='{"message": "Recap"}') as api:
                generate()
                task = api.call_args.args[1]
            self.assertIn("32 MiB to 100 MiB", task)
            self.assertIn("PRs selected for this recap: 1", task)
            self.assertNotIn("Total PRs merged:", task)
        with patch("generate_monthly.call_pollinations_api", return_value='{"arcs": []}') as api:
            generate_monthly_digest([], [{"date": "2025-10-01", "summary": "One selected update", "pr_count": 1}], "2025-10", "test")
        self.assertIn("PRs selected for this recap: 1", api.call_args.args[1])
        self.assertIn("One selected update", api.call_args.args[1])

    def test_monthly_contributors_are_every_merging_account_and_noreply_coauthors(self):
        prs = [
            {"author": {"login": "voodoohop", "avatarUrl": "a", "url": "u"}, "mergeCommit": {"message": "fix: one"}},
            {"author": {"login": "pollinations-ai", "avatarUrl": "bot", "url": "https://github.com/apps/pollinations-ai"},
             "mergeCommit": {"message": (
                 "Add app\n\n"
                 "Co-authored-by: Fabio <12345+FabioArieiraBaia@users.noreply.github.com>\n"
                 "Co-authored-by: pollinations-ai[bot] <99+pollinations-ai[bot]@users.noreply.github.com>\n"
                 "Co-authored-by: Claude <noreply@anthropic.com>\n"
             )}},
            {"author": {"login": "VoodooHop", "avatarUrl": "a", "url": "u"},
             "mergeCommit": {"message": "Co-authored-by: voodoohop <1+voodoohop@users.noreply.github.com>"}},
            {"author": None, "mergeCommit": None},
        ]
        ranked = rank_contributors(prs)
        self.assertEqual([(p["login"], p["prs"]) for p in ranked],
                         [("voodoohop", 2), ("FabioArieiraBaia", 1), ("pollinations-ai", 1)])
        self.assertEqual(ranked[1]["avatar_url"], "https://github.com/FabioArieiraBaia.png?size=80")
        self.assertEqual(ranked[2]["url"], "https://github.com/apps/pollinations-ai")

    def test_monthly_story_follows_the_latest_page_and_covers_start_from_page_one(self):
        page = lambda month, story: normalize_platform_post(
            platform="website", scope="monthly", date=f"{month}-28", period_start=f"{month}-01",
            period_end=f"{month}-28", generated_at="now",
            raw_post={"title": "T", "summary": "S", "story": story, "image": {"url": f"https://x/{month}.jpg"}})
        with tempfile.TemporaryDirectory() as root:
            for month, story in (("2026-07", "A greenhouse frame stands."), ("2026-09", "The greenhouse glows.")):
                (Path(root) / f"operations/social/news/monthly/{month}").mkdir(parents=True)
                (Path(root) / f"operations/social/news/monthly/{month}/website.json").write_text(json.dumps(page(month, story)))
            self.assertEqual(read_earlier_pages("2026-07", root), [])
            self.assertEqual([p["metadata"]["story"] for p in read_earlier_pages("2026-09", root)],
                             ["A greenhouse frame stands."])
            first, previous = read_earlier_pages("2026-10", root)
        self.assertEqual(first["images"], [{"url": "https://x/2026-07.jpg"}])
        self.assertEqual(previous["metadata"]["story"], "The greenhouse glows.")

        digest = {"pr_count": 1, "arcs": [{"headline": "Apps", "summary": "A new Apps directory."}]}
        for previous_page, expected in ((previous, "The greenhouse glows."), (None, "this cover is page one")):
            with patch("common.call_pollinations_api", return_value='{"title": "T"}') as api:
                generate_website_post(digest, "test", previous_page)
            task = api.call_args.args[1]
            self.assertIn("## Monthly Story", task)
            self.assertIn(expected, task)

        with patch("common.requests.get", side_effect=requests.ConnectionError) as get, patch("common.time.sleep"):
            generate_image("A garden", "test", references=["https://x/2026-09.jpg"])
            self.assertEqual(get.call_args.kwargs["params"]["image"].split("|")[1], "https://x/2026-09.jpg")
            generate_image("A garden", "test", references=["https://x/2026-09.jpg"], cast=False)
            self.assertEqual(get.call_args.kwargs["params"]["image"], "https://x/2026-09.jpg")

        page_one = normalize_platform_post(
            platform="website", scope="monthly", date="d", period_start="p", period_end="e", generated_at="g",
            raw_post={"story": "Page one.", "garden": "https://x/garden.jpg"})
        self.assertEqual(page_one["metadata"], {"story": "Page one.", "garden": "https://x/garden.jpg"})

    def test_monthly_cover_is_redrawn_until_each_character_appears_once(self):
        one_of_each = {"bees": 1, "monitor_robots": 1, "nomnom": 1, "black_cats": 0, "humans": 0}
        two_bees = {**one_of_each, "bees": 2}
        limits = {**one_of_each}
        with patch("generate_monthly.generate_image", side_effect=[(b"first", None), (b"second", None)]) as draw, \
             patch("generate_monthly.count_cast", side_effect=[two_bees, one_of_each]):
            self.assertEqual(draw_checked("A garden", "test", [], limits), b"second")
        self.assertEqual(draw.call_count, 2)
        with patch("generate_monthly.generate_image", return_value=(b"cover", None)) as draw, \
             patch("generate_monthly.count_cast", return_value={**one_of_each, "humans": 1}):
            self.assertIsNone(draw_checked("A garden", "test", [], limits))
        self.assertEqual(draw.call_count, 3)

        # The cover goes to the vision model as an image; each listed character counts once.
        listed = {"characters": [{"kind": "bee"}, {"kind": "bee"}, {"kind": "monitor_robot"}, {"kind": "other"}]}
        with patch("generate_monthly.call_pollinations_api", return_value=json.dumps(listed)) as vision:
            self.assertEqual(count_cast(b"one", "test"),
                             {"bees": 2, "monitor_robots": 1, "nomnom": 0, "black_cats": 0, "humans": 0})
        self.assertIn("data:image/jpeg;base64,b25l", json.dumps(vision.call_args.args[1]))  # base64 of b"one"
        self.assertEqual(vision.call_args.kwargs["model"], "google/gemini-3.8-flash")

    def test_index_lists_months_with_their_pages_and_top_contributors_of_twelve_months(self):
        with tempfile.TemporaryDirectory() as directory:
            news = Path(directory)
            for number in range(1, 14):
                month = f"{2025 + (number - 1) // 12}-{(number - 1) % 12 + 1:02d}"
                (news / f"monthly/{month}").mkdir(parents=True)
                (news / f"monthly/{month}/summary.json").write_text(json.dumps({
                    "period_start": f"{month}-01", "merged_prs": number,
                    "contributors": [{"login": "early" if number == 1 else "Agent", "avatar_url": f"a{number}",
                                      "url": "u", "prs": number}],
                }))
            (news / "monthly/2026-01/website.json").write_text(json.dumps({
                "period_start": "2026-01-01", "title": "Apps", "text": "A new Apps directory.",
                "images": [{"url": "https://x/2026-01.jpg"}]}))
            index = build_index(news, "2026-02-01")
        self.assertEqual(len(index["months"]), 13)
        self.assertEqual(index["months"][0], {"month": "2025-01", "merged_prs": 1, "title": None, "summary": None, "image": None})
        self.assertEqual(index["months"][-1], {"month": "2026-01", "merged_prs": 13, "title": "Apps",
                                               "summary": "A new Apps directory.", "image": "https://x/2026-01.jpg"})
        self.assertEqual(index["contributors"], [{"login": "Agent", "avatar_url": "a13", "url": "u", "prs": sum(range(2, 14))}])

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
