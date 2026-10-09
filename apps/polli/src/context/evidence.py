"""Compact record of the tool results behind Polli's earlier answers in a thread.

Follow-ups are rebuilt from the Discord thread, which only holds Polli's prose. Without
the lookups that backed an answer, a later turn can "correct" a verified claim from
memory. This keeps a small, clipped summary of recent successful tool calls so the next
turn can see what each earlier claim rested on.

Entries are scoped to (thread, requester): tool results can depend on the requester's
permissions (admin tools, role-gated Discord channels), so one user's evidence is never
shown to another user in the same thread.
"""

from __future__ import annotations

import time
from collections import OrderedDict, deque

from ..utils.json import dumps

MAX_THREADS = 500
MAX_ENTRIES = 8
MAX_ARGS_CHARS = 300
MAX_RESULT_CHARS = 1200


def _clip(text: str, limit: int) -> str:
    return text if len(text) <= limit else text[: limit - 1] + "…"


def _serialize(value: object) -> str:
    if isinstance(value, str):
        return value
    try:
        return dumps(value)
    except TypeError:
        return str(value)


class ToolEvidenceStore:
    def __init__(self, max_threads: int = MAX_THREADS, max_entries: int = MAX_ENTRIES):
        self._entries: OrderedDict[tuple[int, int], deque[dict]] = OrderedDict()
        self._max_threads = max_threads
        self._max_entries = max_entries

    def record(self, thread_id: int, user_id: int, tool_calls: list[dict], tool_results: list) -> None:
        entries = []
        for call, result in zip(tool_calls, tool_results):
            # A failed lookup is not evidence for anything.
            if isinstance(result, dict):
                if result.get("error"):
                    continue
                # `_image`/`_images` and similar side channels are not text evidence.
                result = {key: value for key, value in result.items() if not str(key).startswith("_")}
            function = call.get("function") or {}
            name = str(function.get("name") or "tool").split(":")[-1]
            entries.append(
                {
                    "at": time.time(),
                    "tool": name,
                    "args": _clip(_serialize(function.get("arguments") or ""), MAX_ARGS_CHARS),
                    "result": _clip(_serialize(result), MAX_RESULT_CHARS),
                }
            )
        if not entries:
            return
        key = (thread_id, user_id)
        bucket = self._entries.pop(key, None) or deque(maxlen=self._max_entries)
        bucket.extend(entries)
        self._entries[key] = bucket
        while len(self._entries) > self._max_threads:
            self._entries.popitem(last=False)

    def render(self, thread_id: int, user_id: int) -> str | None:
        bucket = self._entries.get((thread_id, user_id))
        if not bucket:
            return None
        lines = [
            "## RECENT TOOL EVIDENCE (your own earlier lookups in this thread for this user, oldest first)",
            "These results backed your earlier answers. A claim they support is verified: do not overturn it "
            "without new evidence. If your new answer would contradict it, re-run the relevant lookup first, "
            "then confirm or correct it and say what changed. Results are clipped and may be stale.",
        ]
        for entry in bucket:
            stamp = time.strftime("%H:%M UTC", time.gmtime(entry["at"]))
            lines.append(f"- [{stamp}] {entry['tool']}({entry['args']}) → {entry['result']}")
        return "\n".join(lines)

    def clear(self, thread_id: int) -> None:
        for key in [key for key in self._entries if key[0] == thread_id]:
            del self._entries[key]


tool_evidence = ToolEvidenceStore()
