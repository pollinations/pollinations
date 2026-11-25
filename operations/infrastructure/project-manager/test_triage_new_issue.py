import unittest

from triage_new_issue import decision, eligible


class TriageTest(unittest.TestCase):
    evidence = {"issue-42": {"url": "https://github.com/pollinations/pollinations/issues/42"},
                "src/file.ts#L3": {"url": "https://github.com/pollinations/pollinations/blob/rev/src/file.ts#L3"}}

    def verdict(self, action, source=None, confidence=0.9):
        return decision({"action": action, "comment": "Details", "source": source, "confidence": confidence}, self.evidence)

    def test_closures_need_matching_evidence_and_confidence(self):
        for action, source in (("resolved", "issue-42"), ("duplicate", "issue-41"), ("duplicate", None)):
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

    def test_existing_workflow_exclusions(self):
        issue = {"user": {"type": "User", "login": "reporter"}, "labels": []}
        self.assertTrue(eligible(issue))
        for label in ("APP-SUBMISSION", "POLLI", "BEE-CENSUS", "HONEY-CENSUS"):
            self.assertFalse(eligible({**issue, "labels": [{"name": label}]}))
        self.assertFalse(eligible({**issue, "user": {"login": "release[bot]", "type": "Bot"}}))
        self.assertFalse(eligible({**issue, "pull_request": {}}))
