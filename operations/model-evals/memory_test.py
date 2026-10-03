"""Run: uv run --with inspect-ai==0.3.276 --with mcp==2.2.0 python -m unittest discover -s operations/model-evals -p '*_test.py'
Set VAULT_EVAL_URL=http://127.0.0.1:8799/ to also exercise the real local MCP worker.
The scripted Inspect model tests plumbing, not memory quality.
"""

import json
import os
import tempfile
import unittest

from inspect_ai import Task, eval
from inspect_ai.dataset import Sample
from inspect_ai.model import ChatMessageTool, ModelOutput, get_model
from inspect_ai.scorer import match
from memory import INGEST_PROMPT, memory_session, samples


def row(identifier="one", category="single-session-user"):
    return {
        "question_id": identifier,
        "question_type": category,
        "question": "QUESTION_SENTINEL",
        "question_date": "2024/03/01",
        "answer": 42,
        "answer_session_ids": ["secret-evidence-marker"],
        "haystack_dates": ["2024/02/01", "2024/01/01"],
        "haystack_sessions": [
            [{"role": "user", "content": "new fact", "has_answer": True}],
            [{"role": "user", "content": "old fact", "has_answer": False}],
        ],
    }


class DatasetTests(unittest.TestCase):
    def test_ingestion_excludes_question_and_answer_markers(self):
        sample = samples([row()])[0]
        history = "\n".join(sample.metadata["sessions"])
        for marker in ["QUESTION_SENTINEL", "has_answer", "secret-evidence-marker"]:
            self.assertNotIn(marker, history)
        self.assertEqual(sample.target, "42")
        self.assertLess(history.index("old fact"), history.index("new fact"))

    def test_selection_is_fixed_balanced_and_capped(self):
        rows = [row(f"{i:03}", str(i % 6)) for i in range(60)] + [row("test_abs")]
        selected = samples(rows)
        self.assertEqual(len(selected), 20)
        self.assertEqual([s.id for s in selected], [s.id for s in samples(rows[::-1])])
        self.assertEqual(
            {s.metadata["category"] for s in selected},
            set(map(str, range(6))) | {"abstention"},
        )

    def test_full_context_uses_history_without_tools(self):
        def reply(messages, tools, *_):
            self.assertEqual(tools, [])
            self.assertIn("old fact", messages[-1].text)
            self.assertIn("new fact", messages[-1].text)
            self.assertIn("QUESTION_SENTINEL", messages[-1].text)
            return ModelOutput.from_content("mockllm/model", "42")

        self.run_task(samples([row()]), False, reply)

    def run_task(self, data, use_vault, reply):
        with tempfile.TemporaryDirectory() as logs:
            result = eval(
                Task(
                    dataset=data,
                    solver=memory_session(use_vault),
                    scorer=match(),
                    token_limit=10000,
                    time_limit=30,
                ),
                model=get_model("mockllm/model", custom_outputs=reply),
                max_samples=1,
                log_dir=logs,
                display="none",
            )[0]
            self.assertEqual(result.status, "success", result.error)
            self.assertEqual(len(result.samples), len(data))
            for sample in result.samples:
                self.assertIsNone(sample.error)
                self.assertEqual(sample.scores["match"].value, "C")

    @unittest.skipUnless(os.environ.get("VAULT_EVAL_URL"), "needs local Vault worker")
    def test_real_vault_ingestion_recall_and_sample_isolation(self):
        def reply(messages, tools, *_):
            ingest = messages[0].text == INGEST_PROMPT
            if ingest:
                self.assertNotIn(
                    "QUESTION_SENTINEL", "\n".join(m.text for m in messages)
                )
                if isinstance(messages[-1], ChatMessageTool):
                    self.assertIsNone(messages[-1].error)
                    return ModelOutput.from_content("mockllm/model", "Saved")
                return ModelOutput.for_tool_call(
                    "mockllm/model",
                    next(t.name for t in tools if t.name.endswith("write")),
                    {"nodes": [{"id": messages[-1].text, "name": messages[-1].text}]},
                )
            self.assertFalse(any(t.name.endswith("write") for t in tools))
            self.assertNotIn("Saved", "\n".join(m.text for m in messages))
            if isinstance(messages[-1], ChatMessageTool):
                self.assertIsNone(messages[-1].error)
                data = json.loads(messages[-1].text)["data"]
                self.assertEqual(len(data["nodes"]), 1)  # no previous sample's node
                return ModelOutput.from_content(
                    "mockllm/model", data["nodes"][0]["name"]
                )
            return ModelOutput.for_tool_call(
                "mockllm/model",
                next(t.name for t in tools if t.name.endswith("search")),
                {},
            )

        self.run_task(
            [
                Sample(
                    id=fact,
                    input="QUESTION_SENTINEL: what was saved?",
                    target=fact,
                    metadata={"sessions": [fact]},
                )
                for fact in ["orchid", "tulip"]
            ],
            True,
            reply,
        )


if __name__ == "__main__":
    unittest.main()
