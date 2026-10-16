from __future__ import annotations

import json

import httpx
import pytest
from fastapi.testclient import TestClient
from openai import AsyncOpenAI

from floret import agent, api, knowledge, registry, routing
from floret.tools import gen


@pytest.fixture
def catalog(monkeypatch):
    value = {
        "quest-text": {
            "id": "quest-text",
            "category": "text",
            "paid_only": False,
            "input_modalities": ["text"],
            "output_modalities": ["text"],
            "supported_endpoints": ["/v1/chat/completions"],
            "capabilities": ["tool_calling"],
            "pricing": {"completion": 1},
        },
        "paid-text": {
            "id": "paid-text",
            "category": "text",
            "paid_only": True,
            "input_modalities": ["text"],
            "output_modalities": ["text"],
            "supported_endpoints": ["/v1/chat/completions"],
            "capabilities": ["tool_calling"],
        },
        "quest-image": {
            "id": "quest-image",
            "category": "image",
            "paid_only": False,
            "input_modalities": ["text"],
            "output_modalities": ["image"],
            "supported_endpoints": ["/image/{prompt}"],
            "pricing": {"completion": 1},
        },
        "paid-image": {
            "id": "paid-image",
            "category": "image",
            "paid_only": True,
            "input_modalities": ["text"],
            "output_modalities": ["image"],
            "supported_endpoints": ["/image/{prompt}"],
        },
    }
    monkeypatch.setattr(
        registry, "_registry_cache", registry._normalize({"data": list(value.values())})
    )
    return value


def test_model_list_exposes_paid_only_without_hiding_priced_quest_models(catalog):
    summary = knowledge.models_summary()
    assert "quest-image (paid_only=false)" in summary
    assert "paid-image (paid_only=true)" in summary
    assert "quest-text (paid_only=false)" in summary
    assert "paid-text (paid_only=true)" in summary
    assert "paid_only" not in registry.get_model_params("paid-image")
    assert "explicitly" in knowledge.build_system_prompt()
    assert "select models with `paid_only=false`" in knowledge.build_system_prompt()


async def test_paid_model_remains_available_to_generation(catalog):
    assert (
        "model=paid-image" in (await gen.generate_image("cat", model="paid-image"))[0]
    )


@pytest.mark.parametrize("stream", [False, True])
def test_conversation_preference_and_metadata_reach_real_agent(
    monkeypatch, catalog, stream
):
    calls = []

    def respond(request):
        body = json.loads(request.content)
        calls.append(body)
        message = (
            {
                "role": "assistant",
                "content": None,
                "tool_calls": [
                    {
                        "id": "list-1",
                        "type": "function",
                        "function": {
                            "name": "list_models",
                            "arguments": '{"kind":"image"}',
                        },
                    }
                ],
            }
            if len(calls) == 1
            else {"role": "assistant", "content": "Quest-compatible models selected."}
        )
        return httpx.Response(
            200,
            json={
                "id": "chatcmpl-test",
                "object": "chat.completion",
                "created": 0,
                "model": body["model"],
                "choices": [
                    {
                        "index": 0,
                        "message": message,
                        "finish_reason": "tool_calls" if len(calls) == 1 else "stop",
                    }
                ],
            },
        )

    async def fetch_catalog():
        return catalog

    monkeypatch.setattr(routing, "fetch_model_catalog", fetch_catalog)
    monkeypatch.setattr(
        agent,
        "_client",
        lambda: AsyncOpenAI(
            api_key="test",
            base_url="https://brain.test/v1",
            http_client=httpx.AsyncClient(transport=httpx.MockTransport(respond)),
        ),
    )
    response = TestClient(api.app).post(
        "/v1/chat/completions",
        json={
            "model": "floret",
            "stream": stream,
            "messages": [
                {"role": "user", "content": "Use only Quest-compatible models."}
            ],
            "metadata": {"model": "paid-text", "image_generation": "paid-image"},
        },
        headers={"Authorization": "Bearer ag_test-token"},
    )

    assert response.status_code == 200
    assert "Quest-compatible models selected." in response.text
    assert len(calls) == 2
    assert all(call["model"] == "paid-text" for call in calls)
    assert calls[0]["messages"][1]["content"] == "Use only Quest-compatible models."
    tool_message = calls[1]["messages"][-1]
    assert tool_message["role"] == "tool"
    assert "quest-image (paid_only=false)" in tool_message["content"]
    assert "paid-image (paid_only=true)" in tool_message["content"]


def test_agent_settings_are_only_exposed_under_metadata():
    properties = api.ChatRequest.model_json_schema()["properties"]
    assert "metadata" in properties
    assert "routing" not in properties
    assert (
        api.ChatRequest.model_validate(
            {
                "model": "floret",
                "messages": [],
                "metadata": {"model": "quest-text"},
            }
        ).metadata.text
        == "quest-text"
    )
