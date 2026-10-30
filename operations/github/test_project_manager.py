import unittest
import json
import os
import tempfile
from pathlib import Path
from unittest.mock import Mock, patch

from operations.github import project_manager as manager
from operations.github.project_manager import classification_answer


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
             patch.object(manager, "fetch_pr_files", return_value=[{"filename": "shared/registry/text.ts", "patch": "-old\n+fixed"}]), \
             patch.object(manager, "closing_issues", return_value=linked), \
             patch.object(manager, "ask_ai", return_value={"area": "Models", "type": "Bug"}) as ask:
            answer = manager.classify("brief", ["Models"])
        self.assertEqual(answer["type"], "Bug")
        prompt = ask.call_args.args[1]
        self.assertIn('"number": 42, "type": "Bug"', prompt)
        self.assertIn("shared/registry/text.ts", prompt)
        self.assertIn("-old\n+fixed", prompt)
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

    def test_missing_linked_issue_node_fails_and_is_not_cached(self):
        manager.closing_issues.cache_clear()
        linked = {"node": {"closingIssuesReferences": {"nodes": []}}}
        with patch.object(manager, "graphql_request", side_effect=[{}, linked]):
            with self.assertRaises(SystemExit):
                manager.closing_issues()
            self.assertEqual(manager.closing_issues(), [])
        manager.closing_issues.cache_clear()


class RewardTest(unittest.TestCase):
    def test_validates_numeric_amount_and_ignores_model_selected_bucket(self):
        for amount in (0, 0.25, 2.5, 100):
            self.assertEqual(manager.reward_answer({"reward": amount, "reward_reason": " Useful\nfix. ", "bucket": "pack", "payee": "attacker"}),
                             {"reward": amount, "reward_reason": "Useful fix."})
        for amount in (True, False, None, "3", -1, 100.01, float("nan"), float("inf")):
            with self.subTest(amount=amount), self.assertRaises(ValueError):
                manager.reward_answer({"reward": amount, "reward_reason": "Reason."})
        for reason in (None, "", "  ", "x" * 401):
            with self.subTest(reason=reason), self.assertRaises(ValueError):
                manager.reward_answer({"reward": 3, "reward_reason": reason})

    def test_diff_input_is_bounded(self):
        with patch.object(manager, "IS_PULL_REQUEST", True), \
             patch.object(manager, "fetch_pr_files", return_value=[{"filename": "large.ts", "patch": "+code\n" * 10_000}]), \
             patch.object(manager, "closing_issues", return_value=[]), \
             patch.object(manager, "ask_ai", return_value={"area": "Models", "type": "Bug", "reward": 3, "reward_reason": "Fix."}) as ask:
            manager.classify("brief", ["Models"])
        excerpts = ask.call_args.args[1].split("Untrusted diff excerpts (may be incomplete):\n", 1)[1].rstrip()
        self.assertLessEqual(len(excerpts), manager.MAX_PATCH_CHARS)

    def test_app_submissions_and_census_responses_get_no_model_call_or_quote(self):
        fields = {name: {"id": name, "options": {}} for name in ("Area", "Source", "Priority")}
        for label in ("APP-SUBMISSION", "HONEY-CENSUS"):
            item = {"state": "open", "created_at": "2026-11-03T00:00:00Z", "user": {"type": "User"}, "labels": [{"name": label}]}
            with self.subTest(label=label), \
                 patch.multiple(manager, IS_PULL_REQUEST=False, ISSUE_NUMBER=42, ISSUE_NODE_ID="issue", GITHUB_TOKEN="test",
                                POLLINATIONS_TOKEN="test", GITHUB_EVENT={}, ITEM_DATA=item, DRY_RUN=True), \
                 patch.object(manager, "dev_fields", return_value=fields), \
                 patch.object(manager, "ask_ai") as ask, \
                 patch.object(manager, "write_reward_comment") as quote:
                manager.main()
            ask.assert_not_called()
            quote.assert_not_called()


class RewardCommentTest(unittest.TestCase):
    def setUp(self):
        self.item = {"state": "open", "created_at": "2026-11-03T00:00:00Z", "user": {"type": "User"}}
        self.context = patch.multiple(manager, IS_PULL_REQUEST=True, ISSUE_NUMBER=42, ITEM_DATA=self.item,
                                      DRY_RUN=False, CONTRIBUTION_REWARD_KEY="test-contribution-reward-key")
        self.context.start()
        self.addCleanup(self.context.stop)
        self.answer = {"reward": 2.5, "reward_reason": "Corrects a reproducible bug."}

    def comments(self, *pages):
        return [Mock(json=Mock(return_value=page)) for page in pages]

    def test_posts_one_signed_quote(self):
        # Same vector as the Enter test "quote signatures match the project manager's".
        signature = "dab6089f5883a110b3d8d0533410801a48c26f6b6dc128d37dbb4ceece40033f"
        others = [{"user": {"id": 123}, "body": manager.REWARD_COMMENT_MARKER + "\nReward: 100 quest"}]
        with patch.object(manager.requests, "get", side_effect=self.comments(others)), \
             patch.object(manager.requests, "post") as create, patch.object(manager.requests, "patch") as edit:
            manager.write_reward_comment(self.answer)
        edit.assert_not_called()
        body = create.call_args.kwargs["json"]["body"]
        self.assertTrue(body.startswith(f"{manager.REWARD_COMMENT_MARKER}\nReward: 2.5 quest\n<!-- signature: {signature} -->\n"))
        self.assertIn("POLLEN-QUEST", body)
        self.assertIn("https://enter.pollinations.ai/quests", body)

    def test_an_existing_quote_is_never_repriced(self):
        page = [{"user": {"id": 123}, "body": "discussion"}] * 100
        quote = {"user": {"id": manager.REWARD_BOT_ID}, "body": manager.REWARD_COMMENT_MARKER + "\nReward: 1 quest"}
        with patch.object(manager.requests, "get", side_effect=self.comments(page, [quote])) as read, \
             patch.object(manager.requests, "post") as create:
            manager.write_reward_comment(self.answer)
        self.assertEqual(read.call_args_list[1].kwargs["params"]["page"], 2)
        create.assert_not_called()

    def test_skips_bots_closed_and_pre_rollout_items_and_dry_runs(self):
        for changes in ({"ITEM_DATA": {**self.item, "user": {"type": "Bot"}}},
                        {"ITEM_DATA": {**self.item, "state": "closed"}},
                        {"ITEM_DATA": {**self.item, "created_at": "2026-11-01T23:59:59Z"}},
                        {"DRY_RUN": True}):
            with self.subTest(changes=changes), patch.multiple(manager, **changes), \
                 patch.object(manager.requests, "get") as read, patch.object(manager.requests, "post") as create:
                manager.write_reward_comment(self.answer)
                read.assert_not_called()
                create.assert_not_called()

    def test_invalid_reward_or_missing_key_fails_without_posting(self):
        for answer, key in (({"reward": 101, "reward_reason": "Too much."}, "key"), (self.answer, None)):
            with self.subTest(answer=answer, key=key), patch.object(manager, "CONTRIBUTION_REWARD_KEY", key), \
                 patch.object(manager.requests, "post") as create, self.assertRaises(SystemExit):
                manager.write_reward_comment(answer)
            create.assert_not_called()

    def test_issue_quote_names_the_issue_author(self):
        with patch.object(manager, "IS_PULL_REQUEST", False), \
             patch.object(manager.requests, "get", side_effect=self.comments([])), \
             patch.object(manager.requests, "post") as create:
            manager.write_reward_comment(self.answer)
        body = create.call_args.kwargs["json"]["body"]
        self.assertIn("The issue author", body)
        self.assertNotIn("POLLEN-QUEST", body)


if __name__ == "__main__":
    unittest.main()
