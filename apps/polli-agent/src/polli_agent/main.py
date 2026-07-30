"""Thin programmatic entry point over the agent loop (CLI / scripts / tests)."""

from __future__ import annotations

from typing import Any

from polli_agent.agent import run_agent


async def run(
    text: str, *, history: list[dict[str, Any]] | None = None
) -> dict[str, Any]:
    """Run the agent on a single user turn (optionally with prior history)."""
    messages = list(history or [])
    messages.append({"role": "user", "content": text})
    return await run_agent(messages)
