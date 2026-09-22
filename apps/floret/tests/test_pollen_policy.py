from __future__ import annotations

from typing import Any

import pytest
from fastapi.testclient import TestClient

from floret import api, registry
from floret.tools import gen

_HEADERS = {"Authorization": "Bearer ag_test-token"}


def model(
    name: str,
    category: str,
    endpoint: str,
    *,
    paid_only: bool = False,
    aliases: list[str] | None = None,
    capabilities: list[str] | None = None,
) -> dict[str, Any]:
    return {
        "name": name,
        "aliases": aliases or [],
        "category": category,
        "paid_only": paid_only,
        "pricing": {"prompt": 1, "completion": 1},
        "capabilities": capabilities or [],
        "input_modalities": ["text"],
        "output_modalities": [category],
        "supported_endpoints": [endpoint],
    }


@pytest.fixture
def catalog(monkeypatch: pytest.MonkeyPatch) -> dict[str, dict[str, Any]]:
    value = {
        "quest-text": model(
            "quest-text",
            "text",
            "/v1/chat/completions",
            capabilities=["tools"],
        ),
        "paid-text": model(
            "paid-text",
            "text",
            "/v1/chat/completions",
            paid_only=True,
            aliases=["premium"],
            capabilities=["tools"],
        ),
        "quest-image": model("quest-image", "image", "/image/{prompt}"),
        "paid-image": model("paid-image", "image", "/image/{prompt}", paid_only=True),
    }
    registry.install_global_snapshot(
        {
            "version": "catalog-1",
            "catalog": list(value.values()),
            "review": {
                "revision": "review-1",
                "catalogRevision": "catalog-1",
                "incumbents": {
                    "text.general": "quest-text",
                    "image.general": "quest-image",
                },
                "recommendations": [],
            },
        }
    )

    async def noop() -> None:
        return None

    monkeypatch.setattr(registry, "warm_registry", noop)
    return value


def test_quest_scope_excludes_paid_only_but_not_priced_models(catalog):
    with registry.model_scope(catalog, "quest"):
        assert set(registry.get_model_catalog()) == {"quest-text", "quest-image"}
        assert (
            registry.choose_model(
                "text",
                endpoint="/v1/chat/completions",
                required_capabilities=frozenset({"tools"}),
            )
            == "quest-text"
        )
        with pytest.raises(ValueError, match="not available in Quest mode"):
            registry.require_model("premium")

    assert set(registry.get_model_catalog()) == set(catalog)


def test_quest_scope_keeps_its_catalog_snapshot(catalog):
    with registry.model_scope(catalog, "quest"):
        replacement = {
            **catalog,
            "quest-text": {**catalog["quest-text"], "paid_only": True},
        }
        registry.install_global_snapshot(
            {"version": "catalog-2", "catalog": list(replacement.values())}
        )
        assert registry.require_model("quest-text") == "quest-text"


async def test_generation_tool_rejects_paid_model_before_network(catalog):
    with registry.model_scope(catalog, "quest"):
        with pytest.raises(ValueError, match="not available in Quest mode"):
            await gen.generate_image("cat", model="paid-image")
        assert "model=quest-image" in (await gen.generate_image("cat"))[0]


@pytest.mark.parametrize("stream", [False, True])
def test_metadata_selects_quest_and_inner_model(monkeypatch, catalog, stream):
    calls: list[dict[str, Any]] = []

    async def fake_run(messages, **kwargs):
        calls.append(kwargs)
        return {"text": "done", "artifacts": [], "iterations": 1}

    async def fake_events(messages, **kwargs):
        calls.append(kwargs)
        yield {"type": "final", "text": "done", "artifacts": [], "iterations": 1}

    monkeypatch.setattr(api, "run_agent", fake_run)
    monkeypatch.setattr(api, "run_agent_events", fake_events)
    response = TestClient(api.app).post(
        "/v1/chat/completions",
        json={
            "model": "floret",
            "messages": [{"role": "user", "content": "hi"}],
            "stream": stream,
            "metadata": {"pollen": "quest", "model": "quest-text"},
        },
        headers=_HEADERS,
    )

    assert response.status_code == 200
    assert len(calls) == 1
    assert calls[0]["pollen"] == "quest"
    assert calls[0]["model"] == "quest-text"


def test_quest_rejects_paid_routing_before_agent(monkeypatch, catalog):
    async def unexpected(*args, **kwargs):
        raise AssertionError("agent must not start")

    monkeypatch.setattr(api, "run_agent", unexpected)
    response = TestClient(api.app).post(
        "/v1/chat/completions",
        json={
            "model": "floret",
            "messages": [{"role": "user", "content": "hi"}],
            "metadata": {"pollen": "quest"},
            "routing": {"image_generation": "paid-image"},
        },
        headers=_HEADERS,
    )

    assert response.status_code == 422
    assert response.json()["detail"]["reason"] == "unknown model"


@pytest.mark.parametrize(
    "metadata",
    [{"pollen": "invalid"}, {"model": " "}],
)
def test_invalid_agent_metadata_is_rejected(metadata):
    response = TestClient(api.app).post(
        "/v1/chat/completions",
        json={
            "model": "floret",
            "messages": [{"role": "user", "content": "hi"}],
            "metadata": metadata,
        },
        headers=_HEADERS,
    )

    assert response.status_code == 422
