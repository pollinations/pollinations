from __future__ import annotations

import asyncio

import pytest

from floret import registry


def model(name, *, paid_only=False, **extra):
    return {
        "name": name,
        "category": "text",
        "aliases": [f"{name}-alias"],
        "paid_only": paid_only,
        "capabilities": ["tools"],
        "input_modalities": ["text"],
        "output_modalities": ["text"],
        "supported_endpoints": ["/v1/chat/completions"],
        "pricing": {"promptTextTokens": "2", "currency": "pollen"},
        **extra,
    }


@pytest.fixture
def catalog(monkeypatch):
    for field in ("_registry_cache", "_policy_snapshot", "_catalog_revision"):
        monkeypatch.setattr(registry, field, getattr(registry, field))
    rows = [model("quest-a"), model("quest-best"), model("paid-best", paid_only=True)]
    registry.install_global_snapshot(
        {
            "version": "1",
            "catalog": rows,
            "review": {
                "revision": "review-1",
                "catalogRevision": "1",
                "incumbents": {"text.general": "paid-best"},
                "recommendations": [],
                "quest": {
                    "revision": "quest-1",
                    "catalogRevision": "1",
                    "incumbents": {"text.general": "quest-best"},
                    "recommendations": [],
                },
            },
        }
    )
    return {row["name"]: row for row in rows}


def test_quest_visibility_and_ranking_do_not_mutate_global_catalog(catalog):
    cache = registry._registry_cache
    with registry.model_scope(catalog, "quest"):
        assert set(registry.get_model_catalog()) == {"quest-a", "quest-best"}
        assert registry.pick_model("text") == "quest-best"
        assert (
            registry.choose_model("text", required_capabilities=frozenset({"tools"}))
            == "quest-best"
        )
        assert registry.require_model("quest-best-alias") == "quest-best"
        for forbidden in ("paid-best", "paid-best-alias", "missing"):
            with pytest.raises(ValueError, match="not available"):
                registry.require_model(forbidden)
        assert registry.get_model_meta("quest-a")["pricing"]["promptTextTokens"] == "2"
    assert registry._registry_cache is cache
    assert set(registry.get_model_catalog()) == set(catalog)
    assert registry.pick_model("text") == "paid-best"


async def test_concurrent_policies_and_exception_cleanup(catalog):
    async def run(pollen):
        with registry.model_scope(catalog, pollen):
            await asyncio.sleep(0)
            return registry.request_pollen(), registry.pick_model("text")

    assert await asyncio.gather(run("quest"), run("all")) == [
        ("quest", "quest-best"),
        ("all", "paid-best"),
    ]
    with pytest.raises(RuntimeError), registry.model_scope(catalog, "quest"):
        raise RuntimeError("cancelled")
    assert registry.request_pollen() == "all"
    assert set(registry.get_model_catalog()) == set(catalog)


def test_empty_pool_never_uses_paid_defaults_or_global_catalog(catalog):
    with registry.model_scope({"paid-best": catalog["paid-best"]}, "quest"):
        assert registry.get_model_catalog() == {}
        assert registry.pick_model("text") == ""
        with pytest.raises(ValueError, match="No eligible"):
            registry.choose_model("text", default="paid-best")
        with pytest.raises(ValueError, match="No eligible"):
            registry.default_model("text", "", "paid-best")


def test_model_choice_validates_capabilities_and_aliases(catalog):
    with registry.model_scope(catalog, "quest"):
        assert registry.choose_model("text", "quest-a-alias") == "quest-a"
        with pytest.raises(ValueError, match="not compatible"):
            registry.choose_model("image", "quest-a")
        with pytest.raises(ValueError, match="No eligible"):
            registry.choose_model(
                "text", required_capabilities=frozenset({"web_search"})
            )
    with registry.model_scope(catalog, "all"):
        assert registry.require_model("previously-accepted") == "previously-accepted"


def test_omitted_paid_flag_and_nested_scope_contract(catalog):
    catalog["quest-a"].pop("paid_only")
    with registry.model_scope(catalog, "quest"):
        assert registry.require_model("quest-a") == "quest-a"
        with registry.model_scope(catalog, "all"):
            assert registry.request_pollen() == "quest"
            assert "paid-best" not in registry.get_model_catalog()


@pytest.mark.parametrize("stream", [False, True])
def test_quest_api_uses_scoped_catalog_for_entire_agent_run(
    catalog, monkeypatch, stream
):
    from fastapi.testclient import TestClient

    from floret import agent, api

    async def warm():
        pass

    async def fetch():
        return catalog

    async def events(messages, **kwargs):
        assert registry.request_pollen() == "quest"
        assert set(registry.get_model_catalog()) == {"quest-a", "quest-best"}
        assert agent.select_brain(kwargs.get("routing")) == "quest-best"
        await asyncio.sleep(0)
        yield {"type": "final", "text": "quest-ok", "artifacts": [], "iterations": 1}

    monkeypatch.setattr(registry, "warm_registry", warm)
    monkeypatch.setattr(registry, "fetch_model_catalog", fetch)
    monkeypatch.setattr("floret.routing.fetch_model_catalog", fetch)
    monkeypatch.setattr(agent, "_run_agent_events", events)
    response = TestClient(api.app).post(
        "/v1/chat/completions",
        headers={"Authorization": "Bearer ag_test", "pollen": "quest"},
        json={
            "model": "floret",
            "stream": stream,
            "messages": [{"role": "user", "content": "hi"}],
        },
    )
    assert response.status_code == 200
    assert "quest-ok" in response.text
    assert registry.request_pollen() == "all"


@pytest.mark.parametrize("stream", [False, True])
def test_quest_rejects_paid_pin_before_starting_stream(catalog, monkeypatch, stream):
    from fastapi.testclient import TestClient

    from floret import api

    async def warm():
        pass

    async def fetch():
        return catalog

    monkeypatch.setattr(registry, "warm_registry", warm)
    monkeypatch.setattr(registry, "fetch_model_catalog", fetch)
    monkeypatch.setattr("floret.routing.fetch_model_catalog", fetch)
    response = TestClient(api.app).post(
        "/v1/chat/completions",
        headers={"Authorization": "Bearer ag_test", "pollen": "quest"},
        json={
            "model": "floret",
            "stream": stream,
            "routing": {"text": "paid-best-alias"},
            "messages": [{"role": "user", "content": "hi"}],
        },
    )
    assert response.status_code == 422
    assert response.headers["content-type"].startswith("application/json")


@pytest.mark.parametrize(
    "headers, body, status",
    [
        ({"pollen": "free"}, {}, 422),
        ({"X-Pollinations-Pollen": "free"}, {}, 422),
        ({"pollen": "all", "X-Pollinations-Pollen": "quest"}, {}, 400),
        ({}, {"pollen": "quest"}, 422),
    ],
)
def test_invalid_pollen_rejected_before_generation(monkeypatch, headers, body, status):
    from fastapi.testclient import TestClient

    from floret import api

    async def run(*args, **kwargs):
        pytest.fail("Invalid pollen must not reach generation")

    monkeypatch.setattr(api, "run_agent", run)
    response = TestClient(api.app).post(
        "/v1/chat/completions",
        headers={"Authorization": "Bearer ag_test", **headers},
        json={"model": "floret", "messages": [], **body},
    )
    assert response.status_code == status


@pytest.mark.parametrize("stream", [False, True])
def test_catalog_failure_is_not_reported_as_invalid_user_input(monkeypatch, stream):
    from fastapi.testclient import TestClient

    from floret import api

    async def warm():
        pass

    async def fetch():
        raise ValueError("private upstream response detail")

    monkeypatch.setattr(registry, "warm_registry", warm)
    monkeypatch.setattr(registry, "fetch_model_catalog", fetch)
    response = TestClient(api.app).post(
        "/v1/chat/completions",
        headers={"Authorization": "Bearer ag_test", "pollen": "quest"},
        json={"model": "floret", "stream": stream, "messages": []},
    )
    assert response.status_code == 503
    assert response.json() == {"detail": "Model catalog unavailable."}


@pytest.mark.parametrize("stream", [False, True])
@pytest.mark.parametrize("pollen", [None, "quest"])
async def test_api_wrapper_uses_real_brain_request(
    catalog, monkeypatch, stream: bool, pollen: str | None
) -> None:
    import json

    import httpx
    from openai import AsyncOpenAI

    from floret import agent, api

    async def warm():
        pass

    async def fetch():
        return catalog

    monkeypatch.setattr(registry, "warm_registry", warm)
    monkeypatch.setattr(registry, "fetch_model_catalog", fetch)
    requests = []

    def respond(request):
        body = json.loads(request.content)
        requests.append(body)
        assert body["messages"][0]["role"] == "system"
        assert body["messages"][0]["content"].startswith("You are Floret,")
        if pollen == "quest":
            assert body["model"] == "quest-best"
            assert "paid-best" not in json.dumps(body)
        else:
            assert body["model"] == agent.settings.brain_model
        assert registry.request_pollen() == (pollen or "all")
        return httpx.Response(
            200,
            json={
                "id": "chat-test",
                "object": "chat.completion",
                "created": 0,
                "model": body["model"],
                "choices": [
                    {
                        "index": 0,
                        "finish_reason": "stop",
                        "message": {"role": "assistant", "content": "done"},
                    }
                ],
            },
        )

    async with AsyncOpenAI(
        api_key="ag_test",
        base_url="https://gen.test/v1",
        http_client=httpx.AsyncClient(transport=httpx.MockTransport(respond)),
    ) as client:
        monkeypatch.setattr(agent, "_client", lambda: client)
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=api.app), base_url="http://floret.test"
        ) as caller:
            response = await caller.post(
                "/v1/chat/completions",
                headers={
                    "Authorization": "Bearer ag_test",
                    **({"X-Pollinations-Pollen": pollen} if pollen else {}),
                },
                json={
                    "model": "floret",
                    "stream": stream,
                    "messages": [{"role": "user", "content": "hey"}],
                },
            )
    assert response.status_code == 200
    if stream:
        chunks = [
            json.loads(line[6:])
            for line in response.text.splitlines()
            if line.startswith("data: ") and line != "data: [DONE]"
        ]
        assert chunks and all(chunk["model"] == "floret" for chunk in chunks)
        assert any(
            choice["delta"].get("content") == "done"
            for chunk in chunks
            for choice in chunk["choices"]
        )
        assert response.text.endswith("data: [DONE]\n\n")
    else:
        assert response.json()["model"] == "floret"
        assert response.json()["choices"][0]["message"]["content"] == "done"
    assert len(requests) == 1
    assert registry.request_pollen() == "all"


async def test_quest_stream_close_cleans_up_scope_and_pump(catalog, monkeypatch):
    from floret import agent, api
    from floret.config import _api_key_override
    from floret.routing import RoutingPreferences

    started = asyncio.Event()
    stopped = asyncio.Event()

    async def events(messages, **kwargs):
        assert registry.request_pollen() == "quest"
        started.set()
        try:
            await asyncio.Event().wait()
            yield {"type": "final", "text": "unreachable", "artifacts": []}
        finally:
            stopped.set()

    monkeypatch.setattr(agent, "_run_agent_events", events)
    original_key = _api_key_override.get()
    frames = api._sse_events(
        [], "floret", "ag_test", RoutingPreferences(), True, "quest", catalog
    )
    await anext(frames)
    await asyncio.wait_for(started.wait(), 1)
    await frames.aclose()
    assert stopped.is_set()
    assert registry.request_pollen() == "all"
    assert _api_key_override.get() == original_key
