import importlib.util
import unittest
import json
import os
import tempfile
from pathlib import Path
from unittest.mock import Mock, patch

spec = importlib.util.spec_from_file_location("project_manager", Path(__file__).with_name("project_manager.py"))
manager = importlib.util.module_from_spec(spec)
spec.loader.exec_module(manager)
classification_answer = manager.classification_answer


class ClassificationTest(unittest.TestCase):
    def test_pr_type_has_no_issue_priority(self):
        for work_type in ("Bug", "Feature", "Task"):
            self.assertEqual(classification_answer({"area": "Models", "type": work_type, "priority": "High"}, ["Models"], True),
                             {"area": "Models", "type": work_type, "priority": None})
        with self.assertRaises(ValueError):
            classification_answer({"area": "Models", "type": "Question"}, ["Models"], True)
        with self.assertRaises(ValueError):
            classification_answer({"area": "Models", "type": None}, ["Models"], True)

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
             patch.object(manager, "ask_ai", return_value={"area": "Models", "type": "Bug"}) as ask:
            answer = manager.classify("brief", ["Models"])
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


class RewardCommentTest(unittest.TestCase):
    def post(self, event, item, is_pr=True):
        with patch.multiple(manager, GITHUB_EVENT=event, ITEM_DATA=item, IS_PULL_REQUEST=is_pr, ISSUE_NUMBER=42), \
             patch.object(manager.requests, "post", return_value=Mock(status_code=201)) as create:
            manager.write_reward_comment()
        return create.call_args.kwargs["json"]["body"] if create.called else None

    def test_default_reward_is_announced_once_on_opening(self):
        opened, item = {"action": "opened"}, {"created_at": "2026-11-05T00:00:00Z", "user": {"type": "User"}}
        self.assertTrue(self.post(opened, item).startswith("Reward: 5 pollen\n"))
        self.assertTrue(self.post(opened, item, is_pr=False).startswith("Reward: 2 pollen\n"))
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
