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
             patch.object(manager, "ask_ai", return_value={"area": "Models", "type": "Bug", "reward": 3, "reward_reason": "Fixes a model."}) as ask:
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
             patch.object(manager, "ask_ai", return_value={"area": None, "reward": 0, "reward_reason": "Promotion only."}), \
             patch.object(manager, "add_to_dev", return_value="item"), \
             patch.object(manager, "set_field") as write, \
             patch.object(manager, "set_issue_type") as native_type, \
             patch.object(manager, "write_reward_comment") as quote:
            manager.main()
            result = json.loads((Path(directory) / "classification.json").read_text())
            self.assertEqual(result, {"area": None, "type": None, "source": "Community"})
        write.assert_any_call("item", fields["Work type"], None)
        native_type.assert_not_called()
        self.assertEqual(quote.call_args.args[0]["reward"], 0)

    def test_missing_linked_issue_node_fails_and_is_not_cached(self):
        manager.closing_issues.cache_clear()
        linked = {"node": {"closingIssuesReferences": {"nodes": [], "pageInfo": {"hasNextPage": False, "endCursor": None}}}}
        with patch.object(manager, "graphql_request", side_effect=[{}, linked]):
            with self.assertRaises(SystemExit):
                manager.closing_issues()
            self.assertEqual(manager.closing_issues(), [])
        manager.closing_issues.cache_clear()

    def test_linked_issues_are_paginated_before_bounty_sum(self):
        manager.closing_issues.cache_clear()
        def page(number, cursor, repo="pollinations/pollinations"):
            return {"node": {"closingIssuesReferences": {"nodes": [{"number": number, "repository": {"nameWithOwner": repo}}],
                            "pageInfo": {"hasNextPage": cursor is not None, "endCursor": cursor}}}}
        with patch.object(manager, "graphql_request", side_effect=[page(1, "next"), page(2, "last", "someone/else"), page(3, None)]) as read:
            self.assertEqual([issue["number"] for issue in manager.closing_issues()], [1, 3])
            self.assertEqual(read.call_args_list[1].args[1]["after"], "next")
        manager.closing_issues.cache_clear()

    def test_full_dry_run_keeps_github_unchanged(self):
        fields = {name: {"id": name, "options": {}} for name in ("Area", "Source", "Priority")}
        with patch.multiple(manager, IS_PULL_REQUEST=False, ISSUE_NUMBER=42, ISSUE_NODE_ID="issue",
                            GITHUB_TOKEN="test", POLLINATIONS_TOKEN="test", GITHUB_EVENT={},
                            ITEM_DATA={"state": "open", "labels": []}, DRY_RUN=True), \
             patch.object(manager, "dev_fields", return_value=fields), \
             patch.object(manager, "current_priority", return_value=None), \
             patch.object(manager, "ask_ai", return_value={"area": "Models", "type": "Bug", "priority": "High", "reward": 1, "reward_reason": "Useful report."}), \
             patch.object(manager, "graphql_request") as graphql, \
             patch.object(manager.requests, "post") as create, patch.object(manager.requests, "patch") as edit:
            manager.main()
        graphql.assert_not_called()
        create.assert_not_called()
        edit.assert_not_called()


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

    def test_diff_input_is_bounded_and_bot_amount_is_zero(self):
        with patch.object(manager, "IS_PULL_REQUEST", True), \
             patch.object(manager, "ITEM_DATA", {"user": {"type": "Bot"}}), \
             patch.object(manager, "fetch_pr_files", return_value=[{"filename": "large.ts", "patch": "+code\n" * 10_000}]), \
             patch.object(manager, "closing_issues", return_value=[]), \
             patch.object(manager, "ask_ai", return_value={"area": "Models", "type": "Bug", "reward": 100, "reward_reason": "Expensive."}) as ask:
            answer = manager.classify("brief", ["Models"])
        self.assertEqual(answer["reward"], 0)
        excerpts = ask.call_args.args[1].split("Untrusted diff excerpts (may be incomplete):\n", 1)[1].rstrip()
        self.assertLessEqual(len(excerpts), manager.MAX_PATCH_CHARS)

    def test_exact_quest_promises_replace_ai_amount(self):
        def issue(number, body):
            return {"number": number, "body": body, "labels": {"nodes": [{"name": "POLLEN-QUEST"}]}}
        with patch.object(manager, "closing_issues", return_value=[issue(1, "### Reward\n2.5 Pollen\n"), issue(2, "### Reward\n3.5\n")]):
            self.assertEqual(manager.closing_bounty_reward()["reward"], 6)
        with patch.object(manager, "closing_issues", return_value=[issue(17689, "### Reward\n\n10 Pollen per merged server\n")]):
            self.assertEqual(manager.closing_bounty_reward()["reward"], 10)
        for body in ("### Reward\n101", "### Reward\n0", "### Reward\n-3", "### Reward\n3oops", "no reward"):
            with self.subTest(body=body), patch.object(manager, "closing_issues", return_value=[issue(1, body)]):
                self.assertEqual(manager.closing_bounty_reward()["reward"], 0)
        with patch.object(manager, "closing_issues", return_value=[issue(1, "### Reward\n70"), issue(2, "### Reward\n40")]):
            self.assertEqual(manager.closing_bounty_reward()["reward"], 0)


class RewardCommentTest(unittest.TestCase):
    def setUp(self):
        self.head = "a" * 40
        self.item = {"state": "open", "title": "Useful fix", "body": "Details", "head": {"sha": self.head}, "user": {"type": "User"}}
        self.context = patch.multiple(manager, IS_PULL_REQUEST=True, ISSUE_NUMBER=42,
                                      ISSUE_TITLE=self.item["title"], ISSUE_BODY=self.item["body"],
                                      ITEM_DATA=self.item, DRY_RUN=False)
        self.context.start()
        self.addCleanup(self.context.stop)
        self.answer = {"reward": 2.5, "reward_reason": "Corrects a reproducible bug."}

    def response(self, data):
        return Mock(json=Mock(return_value=data))

    def comment(self, comment_id, user=None, body=None):
        return {"id": comment_id,
                "body": body or manager.REWARD_COMMENT_MARKER + "\nReward: 1 quest",
                "user": user or {"id": manager.REWARD_BOT_ID, "type": "Bot", "login": "pollinations-ai[bot]"}}

    def test_creates_one_quote_without_editing_human_or_impersonated_comments(self):
        comments = [self.comment(1, {"id": 5099901, "type": "User", "login": "voodoohop"}),
                    self.comment(2, {"id": 123, "type": "Bot", "login": "pollinations-ai[bot]"})]
        with patch.object(manager.requests, "get", side_effect=[self.response(comments), self.response(self.item)]), \
             patch.object(manager.requests, "post") as create, patch.object(manager.requests, "patch") as edit:
            manager.write_reward_comment(self.answer)
        create.assert_called_once()
        edit.assert_not_called()
        body = create.call_args.kwargs["json"]["body"]
        self.assertTrue(body.startswith(manager.REWARD_COMMENT_MARKER + "\nReward: 2.5 quest\n"))
        self.assertIn(f"<!-- head: {self.head} -->", body)
        self.assertIn("https://enter.pollinations.ai/quests", body)

    def test_updates_own_quote_beyond_first_comment_page(self):
        others = [self.comment(i, {"id": 123, "type": "User"}) for i in range(100)]
        with patch.object(manager.requests, "get", side_effect=[self.response(others), self.response([self.comment(200)]), self.response(self.item)]) as read, \
             patch.object(manager.requests, "post") as create, patch.object(manager.requests, "patch") as edit:
            manager.write_reward_comment(self.answer)
        self.assertEqual(read.call_args_list[1].kwargs["params"]["page"], 2)
        create.assert_not_called()
        edit.assert_called_once()
        self.assertTrue(edit.call_args.args[0].endswith("/issues/comments/200"))

    def test_dry_run_and_closed_items_do_not_write(self):
        for changes in ({"DRY_RUN": True}, {"ITEM_DATA": {**self.item, "state": "closed"}},
                        {"ITEM_DATA": {**self.item, "merged_at": "2026-10-30T00:00:00Z"}}):
            with self.subTest(changes=changes), patch.multiple(manager, **changes), \
                 patch.object(manager.requests, "get") as read, patch.object(manager.requests, "post") as create, \
                 patch.object(manager.requests, "patch") as edit:
                manager.write_reward_comment(self.answer)
                read.assert_not_called()
                create.assert_not_called()
                edit.assert_not_called()

    def test_changed_or_closed_live_item_does_not_get_a_stale_quote(self):
        for changes in ({"state": "closed"}, {"head": {"sha": "b" * 40}}, {"body": "new scope"}):
            with self.subTest(changes=changes), \
                 patch.object(manager.requests, "get", side_effect=[self.response([]), self.response({**self.item, **changes})]), \
                 patch.object(manager.requests, "post") as create, patch.object(manager.requests, "patch") as edit:
                manager.write_reward_comment(self.answer)
                create.assert_not_called()
                edit.assert_not_called()

    def test_issue_quote_has_no_pr_head(self):
        with patch.object(manager, "IS_PULL_REQUEST", False), \
             patch.object(manager.requests, "get", side_effect=[self.response([]), self.response(self.item)]), \
             patch.object(manager.requests, "post") as create:
            manager.write_reward_comment(self.answer)
        body = create.call_args.kwargs["json"]["body"]
        self.assertNotIn("<!-- head:", body)
        self.assertIn("The issue author", body)


if __name__ == "__main__":
    unittest.main()
