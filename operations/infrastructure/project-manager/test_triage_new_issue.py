import os
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest.mock import MagicMock, Mock, patch

from triage_new_issue import API, collect_evidence, decision, eligible, main


class TriageTest(unittest.TestCase):
    evidence = {"issue-42": {"url": "https://github.com/pollinations/pollinations/issues/42"},
                "src/file.ts#L3": {"url": "https://github.com/pollinations/pollinations/blob/rev/src/file.ts#L3"},
                "APIDOCS.md#L3": {"url": "https://github.com/pollinations/pollinations/blob/rev/APIDOCS.md#L3"},
                "gen.pollinations.ai/src/routes/docs-samples.ts#L3": {"url": "https://github.com/pollinations/pollinations/blob/rev/gen.pollinations.ai/src/routes/docs-samples.ts#L3"}}

    def verdict(self, action, source=None, confidence=0.9):
        return decision({"action": action, "comment": "Details", "source": source, "confidence": confidence,
                         "sensitive": False}, self.evidence)

    def test_closures_need_matching_evidence_and_confidence(self):
        for action, source in (("resolved", "issue-42"), ("resolved", "APIDOCS.md#L3"),
                               ("resolved", "gen.pollinations.ai/src/routes/docs-samples.ts#L3"),
                               ("duplicate", "issue-41"), ("duplicate", None)):
            with self.assertRaises(ValueError):
                self.verdict(action, source)
        self.assertEqual(self.verdict("duplicate", "issue-42", 0.84), (None, None))
        reply, reason = self.verdict("duplicate", "issue-42")
        self.assertIn(self.evidence["issue-42"]["url"], reply)
        self.assertEqual(reason, "not_planned")
        self.assertEqual(self.verdict("resolved", "src/file.ts#L3")[1], "completed")

    def test_reply_and_spam(self):
        self.assertEqual(self.verdict("reply"), ("Details", None))
        self.assertEqual(self.verdict("spam"), (None, "not_planned"))
        self.assertEqual(self.verdict("spam", confidence=0.8), (None, None))

    def test_replies_ask_or_point_to_an_issue_with_one_link(self):
        self.assertEqual(self.verdict("reply", "src/file.ts#L3"), (None, None))
        url = self.evidence["issue-42"]["url"]
        comment = "Covered by the open report. [Evidence](issue-42) [src/file.ts#L3] Keep `[DONE]`."
        answer = {"action": "reply", "comment": comment, "source": "issue-42", "confidence": 0.9, "sensitive": False}
        reply, reason = decision(answer, self.evidence)
        self.assertEqual(reply, f"Covered by the open report. Keep `[DONE]`.\n\n[issue-42]({url})")
        self.assertIsNone(reason)
        for own_link in ("[Evidence](issue-42)", "Already tracked in #42.", f"See {url} for details."):
            with self.subTest(own_link=own_link), self.assertRaises(ValueError):
                decision({**answer, "comment": own_link}, self.evidence)

    def test_sensitive_reports_get_no_public_action(self):
        for action, source in (("reply", None), ("duplicate", "issue-42"), ("resolved", "src/file.ts#L3"), ("spam", None)):
            answer = {"action": action, "comment": "Details", "source": source, "confidence": 0.95}
            with self.subTest(action=action):
                self.assertEqual(decision({**answer, "sensitive": True}, self.evidence), (None, None))
                with self.assertRaises(ValueError):
                    decision(answer, self.evidence)

    def test_exhausted_inference_fails_but_an_explicit_skip_passes(self):
        issue = {"number": 41, "title": "Timeout", "body": "", "state": "open",
                 "labels": [], "user": {"login": "reporter", "type": "User"}}
        terms = {"issue_terms": "timeout", "code_terms": []}
        for answers, fails in (([None], True), ([terms, None], True), ([terms, {"action": "skip"}], False)):
            session = Mock(headers={})
            session.get.side_effect = [Mock(json=Mock(return_value=value)) for value in (
                issue, {"incomplete_results": False, "items": []})]
            with self.subTest(answers=answers), patch.dict(os.environ, {"ISSUE_NUMBER": "41", "GH_TOKEN": "test", "DRY_RUN": ""}), \
                 patch("triage_new_issue.requests.Session", return_value=session), \
                 patch("triage_new_issue.ask_ai", side_effect=answers):
                if fails:
                    with self.assertRaises(SystemExit):
                        main()
                else:
                    main()
            session.post.assert_not_called()
            session.patch.assert_not_called()

    def test_existing_workflow_exclusions(self):
        issue = {"user": {"type": "User", "login": "reporter"}, "labels": []}
        self.assertTrue(eligible(issue))
        for label in ("APP-SUBMISSION", "POLLI", "BEE-CENSUS", "HONEY-CENSUS"):
            self.assertFalse(eligible({**issue, "labels": [{"name": label}]}))
        self.assertFalse(eligible({**issue, "user": {"login": "release[bot]", "type": "Bot"}}))
        self.assertFalse(eligible({**issue, "pull_request": {}}))


    def test_empty_code_terms_keep_issue_evidence_without_git(self):
        session = Mock()
        session.get.return_value.json.return_value = {"incomplete_results": False, "items": [
            {"number": 43, "state": "open"},
            {"number": 44, "state": "open"},
            {"number": 42, "state": "open", "title": "Related question", "body": "",
             "html_url": self.evidence["issue-42"]["url"]},
        ]}
        with patch("triage_new_issue.subprocess.check_output") as git:
            evidence = collect_evidence(session, {"number": 43}, {"issue_terms": "rate limit", "code_terms": []})
        git.assert_not_called()
        self.assertEqual(set(evidence), {"issue-42"})

    def test_search_parses_a_real_production_match_with_colons(self):
        session = Mock()
        session.get.return_value.json.return_value = {"incomplete_results": False, "items": []}
        with tempfile.TemporaryDirectory() as temp:
            repo = Path(temp)
            path = repo / "gen" / "src" / "route.ts"
            path.parent.mkdir(parents=True)
            path.write_text('const response = { error: "example: timeout" };\n')
            cwd = Path.cwd()
            try:
                os.chdir(repo)
                for args in (["init", "-q"], ["add", "."],
                             ["-c", "user.email=test@example.com", "-c", "user.name=Test", "commit", "-qm", "fixture"],
                             ["update-ref", "refs/remotes/origin/production", "HEAD"]):
                    subprocess.run(["git", *args], check=True, capture_output=True)
                revision = subprocess.check_output(["git", "rev-parse", "HEAD"], text=True).strip()
                evidence = collect_evidence(
                    session, {"number": 41}, {"issue_terms": "timeout", "code_terms": ["example: timeout"]}
                )
            finally:
                os.chdir(cwd)
        self.assertEqual(evidence["gen/src/route.ts#L1"], {
            "url": f"https://github.com/pollinations/pollinations/blob/{revision}/gen/src/route.ts#L1",
            "text": '1: const response = { error: "example: timeout" };',
        })

    def test_duplicate_comments_then_closes_and_retry_reuses_reply(self):
        issue = {"number": 43, "title": "Timeout", "body": "", "state": "open",
                 "labels": [], "user": {"login": "reporter", "type": "User"}}
        search = {"incomplete_results": False, "items": [{**issue, "number": 42,
                  "html_url": self.evidence["issue-42"]["url"]}]}
        terms = {"issue_terms": "timeout", "code_terms": []}
        verdict = {"action": "duplicate", "source": "issue-42", "confidence": 0.9, "comment": "Details", "sensitive": False}
        for prior in (False, True):
            comments = [{"user": {"login": "github-actions[bot]"},
                         "body": "Details\n\n<!-- new-issue-triage:43:not_planned -->"}] if prior else []
            session = MagicMock()
            session.get.side_effect = [Mock(json=Mock(return_value=value), links={})
                                       for value in (issue, search, issue, issue, comments)]
            with self.subTest(prior=prior), patch.dict(os.environ, {"ISSUE_NUMBER": "43", "GH_TOKEN": "test", "DRY_RUN": ""}), \
                 patch("triage_new_issue.requests.Session", return_value=session), \
                 patch("triage_new_issue.ask_ai", side_effect=[terms, verdict]):
                main()
            writes = [entry for entry in session.mock_calls if entry[0] in ("post", "patch")]
            self.assertEqual([entry[0] for entry in writes], ["patch"] if prior else ["post", "patch"])
            if not prior:
                self.assertIn("<!-- new-issue-triage:43:not_planned -->", writes[0].kwargs["json"]["body"])
            session.patch.assert_called_once_with(f"{API}/issues/43", json={"state": "closed", "state_reason": "not_planned"}, timeout=30)

    def test_reopened_issue_and_closed_original_are_left_alone(self):
        issue = {"number": 43, "title": "Timeout", "body": "", "state": "open",
                 "labels": [], "user": {"login": "reporter", "type": "User"}}
        search = {"incomplete_results": False, "items": [{**issue, "number": 42,
                  "html_url": self.evidence["issue-42"]["url"]}]}
        verdict = {"action": "duplicate", "source": "issue-42", "confidence": 0.9, "comment": "Details", "sensitive": False}
        for later in ([{**issue, "state_reason": "reopened"}], [issue, {**issue, "state": "closed"}]):
            session = MagicMock()
            session.get.side_effect = [Mock(json=Mock(return_value=value), links={}) for value in (issue, search, *later)]
            with self.subTest(later=later), patch.dict(os.environ, {"ISSUE_NUMBER": "43", "GH_TOKEN": "test", "DRY_RUN": ""}), \
                 patch("triage_new_issue.requests.Session", return_value=session), \
                 patch("triage_new_issue.ask_ai", side_effect=[{"issue_terms": "timeout", "code_terms": []}, verdict]):
                main()
            session.post.assert_not_called()
            session.patch.assert_not_called()

    def test_malformed_verdict_logs_and_exits_without_writes(self):
        issue = {"number": 41, "title": "Timeout", "body": "", "state": "open",
                 "labels": [], "user": {"login": "reporter", "type": "User"}}
        session = Mock(headers={})
        session.get.side_effect = [Mock(json=Mock(return_value=value)) for value in (
            issue, {"incomplete_results": False, "items": []},
        )]
        with patch.dict(os.environ, {"ISSUE_NUMBER": "41", "GH_TOKEN": "test", "DRY_RUN": ""}), \
             patch("triage_new_issue.requests.Session", return_value=session), \
             patch("triage_new_issue.ask_ai", side_effect=[
                 {"issue_terms": "timeout", "code_terms": []},
                 {"action": "duplicate", "source": "issue-42", "confidence": 0.9, "sensitive": False},
             ]), patch("builtins.print") as log:
            main()
        log.assert_called_once_with("Skipping #41: Unknown evidence reference")
        session.post.assert_not_called()
        session.patch.assert_not_called()
