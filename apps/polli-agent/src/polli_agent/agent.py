"""The agentic loop: GLM (brain) calls tools until it produces a final answer."""

from __future__ import annotations

import asyncio
import logging
import re
from typing import Any

from openai import AsyncOpenAI

from polli_agent.config import _current_api_key, settings
from polli_agent.knowledge import build_system_prompt
from polli_agent.toolset import TOOL_SCHEMAS, dispatch, parse_args

logger = logging.getLogger(__name__)


def _client() -> AsyncOpenAI:
    # Chat/completions live under /v1; the bare host 404s. The SDK default timeout
    # (600s x retries) can silently stall a streaming response for many minutes;
    # fail fast instead so the loop surfaces the error and can retry.
    return AsyncOpenAI(
        base_url=f"{settings.openai_base_url.rstrip('/')}/v1",
        api_key=_current_api_key() or settings.openai_api_key,
        timeout=settings.brain_timeout_seconds,
        max_retries=1,
    )


_WORKSPACE_MEDIA_RE = re.compile(r"\b[\w-]+\.(mp4|webm|mov|mkv|mp3|wav|gif)\b", re.I)


def _mentions_unpublished_media(text: str) -> bool:
    """A final answer naming media files without a hosted URL delivered nothing."""
    return bool(_WORKSPACE_MEDIA_RE.search(text)) and (
        "media.pollinations.ai/" not in text
    )


def _tool_call_fields(call: Any) -> tuple[str, str, str]:
    """Normalize a tool_call from either an SDK object or a dict."""
    if isinstance(call, dict):
        fn = call.get("function", {})
        return call.get("id", ""), fn.get("name", ""), fn.get("arguments", "")
    return call.id, call.function.name, call.function.arguments


async def run_agent_events(
    messages: list[dict[str, Any]],
    *,
    model: str | None = None,
    max_iters: int | None = None,
):
    """Run the tool-calling loop, yielding progress events as they happen.

    Yields {"type": "tool_start", "name"} per tool call, then exactly one
    {"type": "final", "text", "artifacts", "iterations"}.
    """
    model = model or settings.brain_model
    max_iters = max_iters or settings.max_iters
    client = _client()
    semaphore = asyncio.Semaphore(settings.max_concurrency)

    convo: list[dict[str, Any]] = [
        {"role": "system", "content": build_system_prompt()},
        *messages,
    ]
    artifacts: list[dict[str, Any]] = []
    seen_calls: dict[str, int] = {}
    error_turns = 0
    publish_nudged = False

    for iteration in range(max_iters):
        completion = await client.chat.completions.create(
            model=model,
            messages=convo,
            tools=TOOL_SCHEMAS,
            tool_choice="auto",
        )
        msg = completion.choices[0].message
        tool_calls = msg.tool_calls or []

        # Record the assistant turn (with any tool_calls) verbatim.
        assistant_entry: dict[str, Any] = {
            "role": "assistant",
            "content": msg.content or "",
        }
        if tool_calls:
            assistant_entry["tool_calls"] = [
                {
                    "id": tc.id,
                    "type": "function",
                    "function": {
                        "name": tc.function.name,
                        "arguments": tc.function.arguments,
                    },
                }
                for tc in tool_calls
            ]
        convo.append(assistant_entry)

        if not tool_calls:
            text = msg.content or ""
            attached = any(
                a.get("type") in ("video", "audio")
                and str(a.get("url", "")).startswith("https://media.pollinations.ai/")
                for a in artifacts
            )
            if (
                not publish_nudged
                and not attached
                and _mentions_unpublished_media(text)
            ):
                # The work only exists inside the container; an unpublished file
                # is an undelivered result. Nudge once instead of accepting it.
                publish_nudged = True
                yield {"type": "nudge", "reason": "publishing final files"}
                convo.append(
                    {
                        "role": "system",
                        "content": (
                            "Your answer references media files that were never "
                            "published. Files in the workspace are NOT delivered "
                            "to the user. Call upload_media on each final file "
                            "and include the returned URLs in your answer."
                        ),
                    }
                )
                continue
            yield {
                "type": "final",
                "text": text,
                "artifacts": artifacts,
                "iterations": iteration + 1,
            }
            return

        for tc in tool_calls:
            _, name, _ = _tool_call_fields(tc)
            yield {"type": "tool_start", "name": name}

        # Execute every tool call in this turn concurrently.
        async def _run(call: Any) -> tuple[str, Any]:
            call_id, name, raw_args = _tool_call_fields(call)
            async with semaphore:
                result = await dispatch(name, parse_args(raw_args))
            return call_id, result

        keys = ["{}:{}".format(*_tool_call_fields(tc)[1:]) for tc in tool_calls]
        repeats = sum(1 for k in keys if seen_calls.get(k))
        for k in keys:
            seen_calls[k] = seen_calls.get(k, 0) + 1

        results = await asyncio.gather(*(_run(tc) for tc in tool_calls))
        for call_id, result in results:
            artifacts.extend(result.artifacts)
            convo.append(
                {"role": "tool", "tool_call_id": call_id, "content": result.brain}
            )

        # Loop detection: steer the brain with guidance instead of killing the run.
        all_errors = all(r.brain.startswith("ERROR") for _, r in results)
        error_turns = error_turns + 1 if all_errors else 0
        guidance: list[str] = []
        if repeats:
            guidance.append(
                f"You repeated {repeats} tool call(s) with identical arguments — "
                "identical inputs return identical (cached) results. Do not repeat "
                "them; use the results you already have or change the inputs."
            )
        if error_turns >= 2:
            guidance.append(
                "Your recent tool calls all failed. Read the error messages "
                "carefully — they state exactly what to change (models, parameters, "
                "durations). Adjust your approach; do not retry the same call."
            )
        if guidance:
            convo.append({"role": "system", "content": " ".join(guidance)})

    # Hit the iteration cap: ask the brain for a final wrap-up without tools.
    logger.warning("Agent hit max_iters=%s; forcing final answer", max_iters)
    convo.append(
        {
            "role": "system",
            "content": "Iteration limit reached. Write your final answer now using what you have.",
        }
    )
    final = await client.chat.completions.create(model=model, messages=convo)
    yield {
        "type": "final",
        "text": final.choices[0].message.content or "",
        "artifacts": artifacts,
        "iterations": max_iters,
    }


async def run_agent(
    messages: list[dict[str, Any]],
    *,
    model: str | None = None,
    max_iters: int | None = None,
) -> dict[str, Any]:
    """Run the tool-calling loop over `messages` (OpenAI chat format).

    Returns {"text", "artifacts", "iterations"}.
    """
    async for event in run_agent_events(messages, model=model, max_iters=max_iters):
        if event["type"] == "final":
            return {
                "text": event["text"],
                "artifacts": event["artifacts"],
                "iterations": event["iterations"],
            }
    raise RuntimeError("agent event stream ended without a final event")
