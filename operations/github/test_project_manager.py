import unittest

from project_manager import classification_answer


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


if __name__ == "__main__":
    unittest.main()
