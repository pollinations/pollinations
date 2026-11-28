import importlib.util
import unittest
import json
import os
import subprocess
from contextlib import redirect_stdout
from io import StringIO
import tempfile
from pathlib import Path
from unittest.mock import Mock, call, patch

spec = importlib.util.spec_from_file_location("project_manager", Path(__file__).with_name("project_manager.py"))
manager = importlib.util.module_from_spec(spec)
spec.loader.exec_module(manager)
classification_answer = manager.classification_answer


class ClassificationTest(unittest.TestCase):
    def test_quest_label_classifies_issues_and_linked_prs(self):
        with patch.object(manager, "IS_PULL_REQUEST", False):
            self.assertEqual(manager.item_source({"QUEST"}), "Quests")
        linked = [{"labels": {"nodes": [{"name": "QUEST"}]}}]
        with patch.object(manager, "IS_PULL_REQUEST", True), \
             patch.object(manager, "closing_issues", return_value=linked):
            self.assertEqual(manager.item_source(set()), "Quests")

    def test_pr_type_has_no_issue_priority(self):
        for work_type in ("Bug", "Feature", "Task"):
            self.assertEqual(classification_answer({"area": "Models · Repair", "type": work_type, "priority": "High"}, ["Models · Repair"], True),
                             {"area": "Models · Repair", "type": work_type, "priority": None})
        with self.assertRaises(ValueError):
            classification_answer({"area": "Models", "type": "Question"}, ["Models"], True)
        with self.assertRaises(ValueError):
            classification_answer({"area": "Models", "type": None}, ["Models"], True)

    def test_models_areas_come_from_the_policy(self):
        areas = manager.area_names(manager.read_brief())
        self.assertEqual([a for a in areas if a.startswith("Models")],
                         ["Models · Add", "Models · Repair", "Models · Update", "Models · Retire"])
        self.assertNotIn("Models", areas)
        with self.assertRaises(ValueError):
            classification_answer({"area": "Models", "type": "Task", "priority": "Low"}, areas, False)

    def test_native_issue_question_and_priority_remain_supported(self):
        answer = {"area": "Docs & support", "type": "Question", "priority": "Low"}
        self.assertEqual(classification_answer(answer, ["Docs & support"], False), answer)
        with self.assertRaises(ValueError):
            classification_answer({**answer, "priority": None}, ["Docs & support"], False)

    def test_unclassified_work_does_not_get_type_or_priority(self):
        self.assertEqual(classification_answer({"area": None, "type": "Task", "priority": "High"}, ["Models"], True),
                         {"area": None, "type": None, "priority": None})
        with self.assertRaises(ValueError):
            classification_answer({"area": "Unknown", "type": "Task"}, ["Models"], True)


    def test_linked_issue_type_reaches_classifier_prompt(self):
        linked = [{"number": 42, "issueType": {"name": "Bug"}, "labels": {"nodes": []}}]
        with patch.object(manager, "IS_PULL_REQUEST", True), \
             patch.object(manager, "fetch_pr_files", return_value=["shared/registry/text.ts"]), \
             patch.object(manager, "closing_issues", return_value=linked), \
             patch.object(manager, "ask_ai", return_value={"area": "Models · Repair", "type": "Bug"}) as ask:
            answer = manager.classify("brief", ["Models · Repair"])
        self.assertEqual(answer["type"], "Bug")
        prompt = ask.call_args.args[1]
        self.assertIn('"number": 42, "type": "Bug"', prompt)
        self.assertIn("shared/registry/text.ts", prompt)
        self.assertIn("hints, verify against PR scope", prompt)

    def test_promotion_pr_clears_existing_work_type_through_main(self):
        fields = {name: {"id": name} for name in ("Area", "Source", "Work type")}
        context = {"IS_PULL_REQUEST": True, "ISSUE_NUMBER": 1, "ISSUE_NODE_ID": "pr-node",
                   "GITHUB_TOKEN": "test", "POLLINATIONS_TOKEN": "test", "GITHUB_EVENT": {},
                   "ITEM_DATA": {"labels": []}, "DRY_RUN": False}
        with tempfile.TemporaryDirectory() as directory, \
             patch.dict(os.environ, {"CLASSIFICATION_OUTPUT": str(Path(directory) / "classification.json")}), \
             patch.multiple(manager, **context), \
             patch.object(manager, "dev_fields", return_value=fields), \
             patch.object(manager, "fetch_pr_files", return_value=[]), \
             patch.object(manager, "closing_issues", return_value=[]), \
             patch.object(manager, "ask_ai", return_value={"area": None}), \
             patch.object(manager, "add_to_dev", return_value="item"), \
             patch.object(manager, "set_field") as write, \
             patch.object(manager, "set_issue_type") as native_type:
            manager.main()
            result = json.loads((Path(directory) / "classification.json").read_text())
            self.assertEqual(result, {"area": None, "type": None, "source": "Community"})
        write.assert_any_call("item", fields["Work type"], None)
        native_type.assert_not_called()

    def test_automation_labels_update_only_source(self):
        for label, source in (("APP-SUBMISSION", "Apps"), ("QUEST", "Quests")):
            with self.subTest(label=label), \
                 patch.multiple(manager, IS_PULL_REQUEST=False, ISSUE_NUMBER=42, ISSUE_NODE_ID="issue",
                                GITHUB_TOKEN="test", POLLINATIONS_TOKEN="test", GITHUB_EVENT={"action": "labeled"},
                                ITEM_DATA={"labels": [{"name": label}]}), \
                 patch.object(manager, "dev_fields", return_value={"Source": {"id": "source"}}), \
                 patch.object(manager, "classify") as classify, \
                 patch.object(manager, "add_to_dev", return_value="item"), patch.object(manager, "set_field") as write:
                manager.main()
            classify.assert_not_called()
            write.assert_called_once_with("item", {"id": "source"}, source)

    def test_missing_project_lookup_cannot_be_treated_as_empty(self):
        with patch.object(manager, "graphql_request", return_value={}), self.assertRaises(SystemExit):
            manager.current_dev_fields()

    def test_unavailable_classifier_skips_without_failing(self):
        context = {"IS_PULL_REQUEST": True, "ISSUE_NUMBER": 3, "ISSUE_NODE_ID": "pr-node",
                   "GITHUB_TOKEN": "test", "POLLINATIONS_TOKEN": "test", "GITHUB_EVENT": {},
                   "ITEM_DATA": {"labels": []}}
        with patch.multiple(manager, **context), \
             patch.object(manager, "dev_fields", return_value={}), \
             patch.object(manager, "fetch_pr_files", return_value=[]), \
             patch.object(manager, "closing_issues", return_value=[]), \
             patch.object(manager, "ask_ai", return_value=None), \
             patch.object(manager, "add_to_dev") as add:
            manager.main()
        add.assert_not_called()

    def test_rejected_ai_request_fails_at_once_but_outage_returns_none(self):
        with patch.object(manager.time, "sleep"):
            with patch.object(manager.requests, "post", return_value=Mock(status_code=503, text="")):
                self.assertIsNone(manager.ask_ai("system", "user"))
            with patch.object(manager.requests, "post", return_value=Mock(status_code=401, text="")) as post:
                with self.assertRaises(SystemExit):
                    manager.ask_ai("system", "user")
        post.assert_called_once()

    def test_missing_linked_issue_node_fails_and_is_not_cached(self):
        manager.closing_issues.cache_clear()
        linked = {"node": {"closingIssuesReferences": {"nodes": []}}}
        with patch.object(manager, "graphql_request", side_effect=[{}, linked]):
            with self.assertRaises(SystemExit):
                manager.closing_issues()
            self.assertEqual(manager.closing_issues(), [])
        manager.closing_issues.cache_clear()


class WeaverTest(unittest.TestCase):
    def test_saved_configuration_matches_markdown_and_rejects_drift(self):
        script = ["bash", str(manager.WEAVER_DIR / "config.sh")]
        config = json.loads(subprocess.check_output(script))
        self.assertEqual(config, json.loads((manager.WEAVER_DIR / "agent.json").read_text()))
        prompt = (manager.WEAVER_DIR / "system-prompt.md").read_text().strip()
        self.assertEqual(config["systemPrompt"], prompt)
        self.assertLessEqual(len(prompt.encode("utf-16-le")) // 2, 8000)
        self.assertEqual((config["baseModel"], config["visibility"], config["mcpServers"]),
                         (manager.AI_MODEL, "private", []))
        saved = dict(config, id="id", model="community/pollinations-ai/weaver", type="prompt_agent")
        for change in ({}, {"systemPrompt": prompt + " changed"}, {"visibility": "public"},
                       {"mcpServers": ["pollinations"]}, {"baseModel": "other"}, {"id": "other"}, {"model": "other"}):
            with self.subTest(change=list(change)):
                status = subprocess.run(script + ["verify", "id", saved["model"]], text=True,
                                        input=json.dumps({**saved, **change}), capture_output=True)
                self.assertEqual(status.returncode == 0, not change)

    def test_hosted_request_sends_only_facts_and_accepts_one_json_fence(self):
        response = Mock(status_code=200)
        response.json.return_value = {"choices": [{"message": {"content": '```json\n{"area":null}\n```'}}]}
        with patch.object(manager.requests, "post", return_value=response) as post:
            self.assertEqual(manager.ask_ai("reviewed policy", "item facts", hosted_model="weaver"), {"area": None})
            payload = post.call_args.kwargs["json"]
            self.assertEqual(payload["messages"], [{"role": "user", "content": "item facts"}])
            self.assertEqual(payload["model"], "weaver")
            self.assertNotIn("response_format", payload)
            response.json.return_value["choices"][0]["message"]["content"] = "{}"
            manager.ask_ai("original", "item facts")
            direct = post.call_args.kwargs["json"]
            self.assertEqual(direct["messages"][0], {"role": "system", "content": "original"})
            self.assertEqual(direct["response_format"], {"type": "json_object"})

    def test_invalid_hosted_output_and_rejected_key_fail(self):
        with patch.object(manager.time, "sleep"):
            for content in ("Here is {}.", "{} {}", "[]", "```json\n{}\n``` followed by advice"):
                response = Mock(status_code=200)
                response.json.return_value = {"choices": [{"message": {"content": content}}]}
                with patch.object(manager.requests, "post", return_value=response) as post, self.assertRaisesRegex(SystemExit, "invalid output"):
                    manager.ask_ai("", "facts", hosted_model="weaver")
                self.assertEqual(post.call_count, 3)
            with patch.object(manager.requests, "post", return_value=Mock(status_code=403)) as post, self.assertRaisesRegex(SystemExit, "403"):
                manager.ask_ai("", "facts", hosted_model="weaver")
            post.assert_called_once()

    def test_writer_preserves_set_priorities(self):
        priority = {"id": "Priority"}
        fields = {"Area": {}, "Priority": priority, "Source": {}}
        for existing in (None, "Medium", "Express"):
            with self.subTest(existing=existing), \
                 patch.multiple(manager, IS_PULL_REQUEST=False, ISSUE_NUMBER=42, ISSUE_NODE_ID="node",
                                POLLINATIONS_TOKEN="test", GITHUB_TOKEN="test", GITHUB_EVENT={}, ITEM_DATA={}), \
                 patch.object(manager, "dev_fields", return_value=fields), \
                 patch.object(manager, "classify", return_value={"area": "Models", "type": "Bug", "priority": "High"}), \
                 patch.object(manager, "current_dev_fields", return_value={"priority": {"name": existing}}), \
                 patch.object(manager, "add_to_dev", return_value="item"), patch.object(manager, "set_issue_type"), \
                 patch.object(manager, "set_field") as write:
                manager.main()
            writes = [c for c in write.call_args_list if c.args[1] is priority]
            self.assertEqual(writes, [] if existing else [call("item", priority, "High")])

    def test_every_classification_uses_weaver_and_rejects_invalid_fields(self):
        good = {"area": "Models · Repair", "type": "Bug", "priority": "Medium", "reasoning": "One model fails."}
        with patch.dict(os.environ, {"WEAVER_MODEL": "weaver"}), patch.object(manager, "IS_PULL_REQUEST", False):
            for action, expected in (("opened", "weaver"), (None, "weaver")):
                with patch.object(manager, "GITHUB_EVENT", {"action": action}), patch.object(manager, "ask_ai", return_value=good) as ask:
                    manager.classify("brief", ["Models · Repair"])
                    self.assertEqual(ask.call_args.kwargs["hosted_model"], expected)
            for invalid in ({}, {**good, "priority": "Express"}, {**good, "area": None}, {**good, "extra": "instruction"}):
                with patch.object(manager, "GITHUB_EVENT", {"action": "opened"}), patch.object(manager, "ask_ai", return_value=invalid), self.assertRaises(SystemExit):
                    manager.classify("brief", ["Models · Repair"])
        with self.assertRaises(ValueError):
            manager.classification_answer(good, ["Models · Repair"], True, hosted=True)

    def test_opening_outage_warns_and_records_missing_reward_without_writes(self):
        item = {"created_at": "2026-11-20T00:00:00Z", "user": {"type": "User"}}
        with tempfile.TemporaryDirectory() as directory:
            summary = Path(directory) / "summary"
            with patch.dict(os.environ, {"WEAVER_MODEL": "weaver", "GITHUB_STEP_SUMMARY": str(summary),
                                         "GITHUB_SERVER_URL": "https://github.com", "GITHUB_REPOSITORY": "org/repo", "GITHUB_RUN_ID": "123"}), \
                 patch.multiple(manager, IS_PULL_REQUEST=False, ISSUE_NUMBER=42, ISSUE_NODE_ID="node", GITHUB_TOKEN="test",
                                POLLINATIONS_TOKEN="test", GITHUB_EVENT={"action": "opened"}, ITEM_DATA=item), \
                 patch.object(manager, "dev_fields", return_value={}), patch.object(manager, "add_to_dev") as add, \
                 patch.object(manager, "write_reward_comment") as reward, patch.object(manager.time, "sleep"), \
                 patch.object(manager.requests, "post", return_value=Mock(status_code=429)), redirect_stdout(StringIO()) as out:
                manager.main()
            add.assert_not_called()
            reward.assert_not_called()
            self.assertIn("::warning::", out.getvalue())
            for expected in ("#42", "Skipped project and type writes", "Missed opening reward", "/actions/runs/123"):
                self.assertIn(expected, summary.read_text())


class RewardCommentTest(unittest.TestCase):
    def post(self, event, item, is_pr=True):
        with patch.multiple(manager, GITHUB_EVENT=event, ITEM_DATA=item, IS_PULL_REQUEST=is_pr, ISSUE_NUMBER=42), \
             patch.object(manager.requests, "post", return_value=Mock(status_code=201)) as create:
            manager.write_reward_comment()
        return create.call_args.kwargs["json"]["body"] if create.called else None

    def test_default_reward_is_announced_once_on_opening(self):
        opened, item = {"action": "opened"}, {"created_at": "2026-11-05T00:00:00Z", "user": {"type": "User"}}
        self.assertTrue(self.post(opened, item).startswith("Earns 🌱 $5 in Quest balance\n"))
        self.assertTrue(self.post(opened, item, is_pr=False).startswith("Earns 🌱 $2 in Quest balance\n"))
        # Bots, re-runs (the manual dispatch has no action) and items from before the rollout get none.
        self.assertIsNone(self.post(opened, {**item, "user": {"type": "Bot"}}))
        self.assertIsNone(self.post({}, item))
        self.assertIsNone(self.post(opened, {**item, "created_at": "2026-11-04T23:59:59Z"}))

    def test_app_submissions_access_requests_and_census_responses_get_no_reward_comment(self):
        fields = {name: {"id": name, "options": {}} for name in ("Area", "Source", "Priority")}
        for label, title in (("APP-SUBMISSION", ""), ("HONEY-CENSUS", ""), ("BUG", "[Community Model Publisher Access] me")):
            item = {"created_at": "2026-11-05T00:00:00Z", "user": {"type": "User"}, "labels": [{"name": label}]}
            with self.subTest(label=label), \
                 patch.multiple(manager, IS_PULL_REQUEST=False, ISSUE_NUMBER=42, ISSUE_NODE_ID="issue", GITHUB_TOKEN="test", ISSUE_TITLE=title,
                                POLLINATIONS_TOKEN="test", GITHUB_EVENT={"action": "opened"}, ITEM_DATA=item, DRY_RUN=True), \
                 patch.object(manager, "dev_fields", return_value=fields), \
                 patch.object(manager, "classify", return_value={"area": "Community models", "type": None, "priority": None}), \
                 patch.object(manager.requests, "post") as create:
                manager.main()
            create.assert_not_called()


if __name__ == "__main__":
    unittest.main()
