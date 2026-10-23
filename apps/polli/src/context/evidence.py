"""Compact record of the tool results behind Polli's earlier answers in a thread.

Follow-ups are rebuilt from the Discord thread, which only holds Polli's prose. Without
the lookups that backed an answer, a later turn can "correct" a verified claim from
memory. This keeps a small, clipped summary of recent successful tool calls so the next
turn can see what each earlier claim rested on.

The summary is replayed as tool data (an assistant `tool_calls` message followed by `tool`
messages with matching call IDs), never as system text: fetched content can hold anything
and must not gain the authority of an instruction. The consistency rule itself lives in
the system prompt.

Entries are scoped to (thread, requester): tool results can depend on the requester's
permissions (admin tools, role-gated Discord channels), so one user's evidence is never
shown to another user in the same thread.
"""

from __future__ import annotations

import time
from collections import OrderedDict, deque

from ..utils.json import dumps, loads

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


def _arguments(value: object) -> str:
    """Replayed `tool_calls` arguments must stay a JSON object, even when clipped."""
    text = _serialize(value or "{}")
    if len(text) <= MAX_ARGS_CHARS:
        try:
            if isinstance(loads(text), dict):
                return text
        except ValueError:
            pass
    return dumps({"clipped_arguments": _clip(text, MAX_ARGS_CHARS)})


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
            entries.append(
                {
                    "id": str(call.get("id") or ""),
                    "at": time.time(),
                    "tool": str(function.get("name") or "tool").split(":")[-1],
                    "args": _arguments(function.get("arguments")),
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

    def replay(self, thread_id: int, user_id: int) -> list[dict]:
        """Earlier lookups as one assistant tool-call message plus a matching tool message per call."""
        bucket = self._entries.get((thread_id, user_id))
        if not bucket:
            return []
        calls, results, seen = [], [], set()
        for index, entry in enumerate(bucket):
            # Call IDs repeat across turns ("call_0", "1", ...); every replayed pair needs its own.
            call_id = entry["id"] if entry["id"] and entry["id"] not in seen else f"evidence_{index}"
            seen.add(call_id)
            stamp = time.strftime("%H:%M UTC", time.gmtime(entry["at"]))
            calls.append(
                {"id": call_id, "type": "function", "function": {"name": entry["tool"], "arguments": entry["args"]}}
            )
            results.append(
                {
                    "role": "tool",
                    "tool_call_id": call_id,
                    "name": entry["tool"],
                    "content": f"[recorded {stamp}, may be clipped or stale] {entry['result']}",
                }
            )
        return [
            {"role": "assistant", "content": "My earlier lookups in this thread for this user:", "tool_calls": calls},
            *results,
        ]

    def clear(self, thread_id: int) -> None:
        for key in [key for key in self._entries if key[0] == thread_id]:
            del self._entries[key]


tool_evidence = ToolEvidenceStore()
