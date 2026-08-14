"""Unit tests for the agent loop with a mocked brain (no network)."""

from __future__ import annotations

import asyncio
from types import SimpleNamespace

import pytest

from floret import agent as agent_mod
from floret.routing import RoutingPreferences


def _tool_call(call_id: str, name: str, args: str):
    return SimpleNamespace(
        id=call_id,
        type="function",
        function=SimpleNamespace(name=name, arguments=args),
    )


def _assistant(content: str | None, tool_calls=None):
    msg = SimpleNamespace(content=content, tool_calls=tool_calls or None)
    return SimpleNamespace(choices=[SimpleNamespace(message=msg)])


class _FakeBrain:
    """Returns a scripted sequence of completions; records the messages it saw."""

    def __init__(self, sequence, final=None):
        self._sequence = list(sequence)
        self._final = final
        self.calls: list[list[dict]] = []
        self.kwargs_calls: list[dict] = []
        self.chat = SimpleNamespace(completions=SimpleNamespace(create=self._create))

    async def _create(self, **kwargs):
        self.calls.append(kwargs["messages"])
        self.kwargs_calls.append(kwargs)
        # The post-cap wrap-up call is made WITHOUT tools; serve the final message.
        if "tools" not in kwargs and self._final is not None:
            return self._final
        return self._sequence.pop(0)


@pytest.fixture(autouse=True)
def _stub_env(monkeypatch):
    monkeypatch.setattr(agent_mod, "build_system_prompt", lambda: "SYSTEM")


async def test_two_parallel_tool_calls_both_execute(monkeypatch):
    """A single assistant turn with two tool_calls must run BOTH, not just the first."""
    seen: list[dict] = []

    async def dispatch(name, args, routing=None):
        from floret.toolset import ToolResult

        seen.append({"name": name, "args": args})
        return ToolResult(
            brain=f"ran {name}",
            artifacts=[{"type": "image", "url": f"http://x/{args.get('prompt')}"}],
        )

    monkeypatch.setattr(agent_mod, "dispatch", dispatch)

    brain = _FakeBrain(
        [
            _assistant(
                "making two images",
                [
                    _tool_call("c1", "generate_image", '{"prompt": "cat"}'),
                    _tool_call("c2", "generate_image", '{"prompt": "dog"}'),
                ],
            ),
            _assistant("here are your images", None),
        ]
    )
    monkeypatch.setattr(agent_mod, "_client", lambda: brain)

    result = await agent_mod.run_agent([{"role": "user", "content": "cat and dog"}])

    assert len(seen) == 2
    assert {s["args"]["prompt"] for s in seen} == {"cat", "dog"}
    assert len(result["artifacts"]) == 2
    assert result["text"] == "here are your images"
    assert result["iterations"] == 2
    # Second brain call must contain one tool result per tool_call id.
    tool_msgs = [m for m in brain.calls[1] if m.get("role") == "tool"]
    assert {m["tool_call_id"] for m in tool_msgs} == {"c1", "c2"}


async def test_tool_error_is_fed_back_to_brain(monkeypatch):
    async def dispatch(name, args, routing=None):
        from floret.toolset import ToolResult

        return ToolResult(brain="ERROR from generate_image: boom", artifacts=[])

    monkeypatch.setattr(agent_mod, "dispatch", dispatch)

    brain = _FakeBrain(
        [
            _assistant("trying", [_tool_call("c1", "generate_image", "{}")]),
            _assistant("recovered", None),
        ]
    )
    monkeypatch.setattr(agent_mod, "_client", lambda: brain)

    result = await agent_mod.run_agent([{"role": "user", "content": "img"}])
    tool_msgs = [m for m in brain.calls[1] if m.get("role") == "tool"]
    assert "ERROR" in tool_msgs[0]["content"]
    assert result["text"] == "recovered"


async def test_run_agent_events_yields_tool_starts_then_final(monkeypatch):
    """The event stream must announce each tool call and end with the final result."""

    async def dispatch(name, args, routing=None):
        from floret.toolset import ToolResult

        return ToolResult(
            brain=f"ran {name}",
            artifacts=[{"type": "image", "url": f"http://x/{args.get('prompt')}"}],
        )

    monkeypatch.setattr(agent_mod, "dispatch", dispatch)

    brain = _FakeBrain(
        [
            _assistant(
                "making two images",
                [
                    _tool_call("c1", "generate_image", '{"prompt": "cat"}'),
                    _tool_call("c2", "generate_image", '{"prompt": "dog"}'),
                ],
            ),
            _assistant("here are your images", None),
        ]
    )
    monkeypatch.setattr(agent_mod, "_client", lambda: brain)

    events = [
        e
        async for e in agent_mod.run_agent_events(
            [{"role": "user", "content": "cat and dog"}]
        )
    ]

    tool_events = [e for e in events if e["type"] == "tool_start"]
    assert [e["name"] for e in tool_events] == ["generate_image", "generate_image"]
    final = events[-1]
    assert final["type"] == "final"
    assert final["text"] == "here are your images"
    assert len(final["artifacts"]) == 2
    assert final["iterations"] == 2


async def test_repeated_identical_calls_inject_guidance(monkeypatch):
    """Identical repeated tool calls must trigger corrective guidance, not a kill."""

    async def dispatch(name, args, routing=None):
        from floret.toolset import ToolResult

        return ToolResult(brain="a video url", artifacts=[])

    monkeypatch.setattr(agent_mod, "dispatch", dispatch)

    same = '{"prompt": "boat"}'
    brain = _FakeBrain(
        [
            _assistant("try", [_tool_call("c1", "generate_video", same)]),
            _assistant("try again", [_tool_call("c2", "generate_video", same)]),
            _assistant("ok, moving on", None),
        ]
    )
    monkeypatch.setattr(agent_mod, "_client", lambda: brain)

    result = await agent_mod.run_agent([{"role": "user", "content": "video"}])

    assert result["text"] == "ok, moving on"
    # After the repeated call, the brain's next context must contain guidance.
    third_call_msgs = brain.calls[2]
    guidance = [
        m
        for m in third_call_msgs
        if m["role"] == "system" and "repeat" in m["content"].lower()
    ]
    assert guidance, "expected loop guidance to be injected"


async def test_consecutive_error_turns_inject_guidance(monkeypatch):
    async def dispatch(name, args, routing=None):
        from floret.toolset import ToolResult

        return ToolResult(brain="ERROR from generate_video: boom", artifacts=[])

    monkeypatch.setattr(agent_mod, "dispatch", dispatch)

    brain = _FakeBrain(
        [
            _assistant("t1", [_tool_call("c1", "generate_video", '{"prompt":"a"}')]),
            _assistant("t2", [_tool_call("c2", "generate_video", '{"prompt":"b"}')]),
            _assistant("done", None),
        ]
    )
    monkeypatch.setattr(agent_mod, "_client", lambda: brain)

    await agent_mod.run_agent([{"role": "user", "content": "video"}])

    third_call_msgs = brain.calls[2]
    guidance = [
        m
        for m in third_call_msgs
        if m["role"] == "system" and "error" in m["content"].lower()
    ]
    assert guidance, "expected error-streak guidance to be injected"


async def test_unpublished_workspace_file_in_final_answer_triggers_nudge(monkeypatch):
    """A final answer referencing final.mp4 without a hosted URL is not done."""

    async def dispatch(name, args, routing=None):
        from floret.toolset import ToolResult

        return ToolResult(
            brain="Uploaded. Public URL: https://media.pollinations.ai/fin1",
            artifacts=[{"type": "video", "url": "https://media.pollinations.ai/fin1"}],
        )

    monkeypatch.setattr(agent_mod, "dispatch", dispatch)

    brain = _FakeBrain(
        [
            _assistant("Done! The result is saved as final.mp4 — enjoy!", None),
            _assistant(
                "publishing",
                [_tool_call("c1", "upload_media", '{"source":"final.mp4"}')],
            ),
            _assistant("Here it is: https://media.pollinations.ai/fin1", None),
        ]
    )
    monkeypatch.setattr(agent_mod, "_client", lambda: brain)

    result = await agent_mod.run_agent([{"role": "user", "content": "make a video"}])

    assert "media.pollinations.ai/fin1" in result["text"]
    assert [a["type"] for a in result["artifacts"]] == ["video"]
    # The nudge must have been injected after the premature final answer.
    second_call_msgs = brain.calls[1]
    nudges = [
        m
        for m in second_call_msgs
        if m["role"] == "system" and "upload_media" in m["content"]
    ]
    assert nudges, "expected publish nudge to be injected"


async def test_final_answer_with_hosted_url_is_not_nudged(monkeypatch):
    brain = _FakeBrain(
        [_assistant("Here: https://media.pollinations.ai/ok1 (final.mp4)", None)]
    )
    monkeypatch.setattr(agent_mod, "_client", lambda: brain)

    result = await agent_mod.run_agent([{"role": "user", "content": "video"}])
    assert result["iterations"] == 1  # accepted immediately, no extra loop


async def test_no_nudge_when_deliverable_already_attached(monkeypatch):
    """If a hosted av artifact exists, the deliverable reaches the user anyway."""

    async def dispatch(name, args, routing=None):
        from floret.toolset import ToolResult

        return ToolResult(
            brain="Uploaded. Public URL: https://media.pollinations.ai/fin9",
            artifacts=[{"type": "video", "url": "https://media.pollinations.ai/fin9"}],
        )

    monkeypatch.setattr(agent_mod, "dispatch", dispatch)

    brain = _FakeBrain(
        [
            _assistant("up", [_tool_call("c1", "upload_media", '{"source":"f.mp4"}')]),
            # Text forgets the URL but the artifact already carries the video.
            _assistant("All done — the final.mp4 turned out great!", None),
        ]
    )
    monkeypatch.setattr(agent_mod, "_client", lambda: brain)

    result = await agent_mod.run_agent([{"role": "user", "content": "video"}])
    assert result["iterations"] == 2  # no nudge round-trip
    assert [a["type"] for a in result["artifacts"]] == ["video"]


async def test_nudge_emits_visible_stream_event(monkeypatch):
    """SSE consumers must see why the run continues after a rejected final."""
    brain = _FakeBrain(
        [
            _assistant("Saved as final.mp4!", None),
            _assistant("https://media.pollinations.ai/ok2", None),
        ]
    )
    monkeypatch.setattr(agent_mod, "_client", lambda: brain)

    events = [
        e async for e in agent_mod.run_agent_events([{"role": "user", "content": "v"}])
    ]
    assert [e["type"] for e in events] == ["nudge", "final"]


async def test_iteration_cap_forces_final_answer(monkeypatch):
    async def dispatch(name, args, routing=None):
        from floret.toolset import ToolResult

        return ToolResult(brain="ok", artifacts=[])

    monkeypatch.setattr(agent_mod, "dispatch", dispatch)

    # Brain that never stops calling tools, plus one final (post-cap) completion.
    loopers = [
        _assistant("again", [_tool_call(f"c{i}", "bash", '{"command":"echo hi"}')])
        for i in range(10)
    ]
    brain = _FakeBrain(loopers, final=_assistant("forced final", None))
    monkeypatch.setattr(agent_mod, "_client", lambda: brain)

    result = await agent_mod.run_agent(
        [{"role": "user", "content": "loop"}], max_iters=3
    )
    assert result["iterations"] == 3
    assert result["text"] == "forced final"


async def test_routing_object_reaches_dispatch(monkeypatch):
    seen = []

    async def dispatch(name, args, routing=None):
        from floret.toolset import ToolResult

        seen.append(routing)
        return ToolResult(brain="image", artifacts=[])

    monkeypatch.setattr(agent_mod, "dispatch", dispatch)
    brain = _FakeBrain(
        [
            _assistant(
                "making image",
                [_tool_call("c1", "generate_image", '{"prompt":"x"}')],
            ),
            _assistant("done", None),
        ]
    )
    monkeypatch.setattr(agent_mod, "_client", lambda: brain)
    routing = RoutingPreferences(image_generation="flux")

    await agent_mod.run_agent([{"role": "user", "content": "image"}], routing=routing)

    assert seen == [routing]
    assert seen[0] is routing


async def test_concurrent_runs_keep_routing_preferences_isolated(monkeypatch):
    seen = []

    async def dispatch(name, args, routing=None):
        from floret.toolset import ToolResult

        seen.append((args["prompt"], routing))
        return ToolResult(brain="image", artifacts=[])

    monkeypatch.setattr(agent_mod, "dispatch", dispatch)
    brains = iter(
        [
            _FakeBrain(
                [
                    _assistant(
                        "first",
                        [_tool_call("c1", "generate_image", '{"prompt":"first"}')],
                    ),
                    _assistant("done", None),
                ]
            ),
            _FakeBrain(
                [
                    _assistant(
                        "second",
                        [_tool_call("c2", "generate_image", '{"prompt":"second"}')],
                    ),
                    _assistant("done", None),
                ]
            ),
        ]
    )
    monkeypatch.setattr(agent_mod, "_client", lambda: next(brains))
    first = RoutingPreferences(image_generation="flux")
    second = RoutingPreferences(image_generation="nanobanana")

    await asyncio.gather(
        agent_mod.run_agent([{"role": "user", "content": "first"}], routing=first),
        agent_mod.run_agent([{"role": "user", "content": "second"}], routing=second),
    )

    assert set(seen) == {("first", first), ("second", second)}


async def test_routing_prompt_lists_only_explicit_preferences(monkeypatch):
    brain = _FakeBrain([_assistant("done", None)])
    monkeypatch.setattr(agent_mod, "_client", lambda: brain)

    await agent_mod.run_agent(
        [{"role": "user", "content": "image"}],
        routing=RoutingPreferences(image_generation="flux"),
    )

    system_prompt = brain.calls[0][0]["content"]
    assert "image generation: flux" in system_prompt
    assert "video generation:" not in system_prompt


async def test_text_routing_model_reaches_every_brain_call(monkeypatch):
    async def dispatch(name, args, routing=None):
        from floret.toolset import ToolResult

        return ToolResult(brain="ok", artifacts=[])

    monkeypatch.setattr(agent_mod, "dispatch", dispatch)
    brain = _FakeBrain(
        [
            _assistant("again", [_tool_call("c1", "bash", '{"command":"true"}')]),
            _assistant("again", [_tool_call("c2", "bash", '{"command":"true"}')]),
        ],
        final=_assistant("forced final", None),
    )
    monkeypatch.setattr(agent_mod, "_client", lambda: brain)
    routing = RoutingPreferences(text="openai-large")

    await agent_mod.run_agent(
        [{"role": "user", "content": "loop"}], max_iters=2, routing=routing
    )

    assert [call["model"] for call in brain.kwargs_calls] == [
        "openai-large",
        "openai-large",
        "openai-large",
    ]
