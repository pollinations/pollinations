"""Hosted catalog loading preserves the shared agent HTTP contract."""

from __future__ import annotations

import httpx
import pytest
from fastapi.testclient import TestClient

from floret import api, registry


def test_catalog_cannot_be_installed_through_public_api():
    assert TestClient(api.app).post("/_internal/catalog", json={}).status_code == 404
    assert "/_internal/catalog" not in api.app.openapi()["paths"]


async def test_hosted_catalog_is_loaded_from_private_snapshot(monkeypatch):
    monkeypatch.setattr(
        registry.settings, "catalog_endpoint", "http://floret-catalog.internal/snapshot"
    )
    monkeypatch.setattr(registry, "_registry_cache", None)
    monkeypatch.setattr(registry, "_policy_snapshot", None)
    monkeypatch.setattr(registry, "_catalog_revision", None)
    real_client = httpx.AsyncClient
    calls = []

    def handler(request):
        calls.append(request)
        return httpx.Response(
            200,
            json={
                "version": "1",
                "catalog": [
                    {
                        "name": "test-image",
                        "category": "image",
                        "output_modalities": ["image"],
                        "supported_endpoints": ["/image/{prompt}"],
                    }
                ],
                "review": {
                    "revision": "1",
                    "catalogRevision": "1",
                    "incumbents": {"image.general": "test-image"},
                    "recommendations": [],
                },
            },
        )

    monkeypatch.setattr(
        registry.httpx,
        "AsyncClient",
        lambda **kwargs: real_client(transport=httpx.MockTransport(handler), **kwargs),
    )
    await registry.warm_registry()
    assert registry.pick_model("image") == "test-image"
    assert len(calls) == 1
    assert "authorization" not in calls[0].headers


async def test_chat_refreshes_catalog_before_model_selection(monkeypatch):
    monkeypatch.setattr(
        registry.settings, "catalog_endpoint", "http://floret-catalog.internal/snapshot"
    )
    monkeypatch.setattr(registry, "_registry_cache", None)
    monkeypatch.setattr(registry, "_policy_snapshot", None)
    monkeypatch.setattr(registry, "_catalog_revision", None)
    real_client = httpx.AsyncClient
    revision = 0

    def handler(request):
        nonlocal revision
        revision += 1
        return httpx.Response(
            200,
            json={
                "version": str(revision),
                "catalog": [
                    {
                        "name": f"image-{revision}",
                        "category": "image",
                        "output_modalities": ["image"],
                        "supported_endpoints": ["/image/{prompt}"],
                    }
                ],
            },
        )

    async def run_agent(messages, routing):
        return {"text": registry.pick_model("image"), "artifacts": []}

    monkeypatch.setattr(
        registry.httpx,
        "AsyncClient",
        lambda **kwargs: real_client(transport=httpx.MockTransport(handler), **kwargs),
    )
    monkeypatch.setattr(api, "run_agent", run_agent)
    client = TestClient(api.app)
    for expected in ("image-1", "image-2"):
        response = client.post(
            "/v1/chat/completions",
            headers={"Authorization": "Bearer ag_test"},
            json={
                "model": "floret",
                "messages": [{"role": "user", "content": "hello"}],
            },
        )
        assert response.status_code == 200
        assert response.json()["choices"][0]["message"]["content"] == expected


async def test_hosted_catalog_failure_preserves_last_valid_snapshot(monkeypatch):
    monkeypatch.setattr(
        registry.settings, "catalog_endpoint", "http://floret-catalog.internal/snapshot"
    )
    monkeypatch.setattr(registry, "_registry_cache", None)
    monkeypatch.setattr(registry, "_policy_snapshot", None)
    monkeypatch.setattr(registry, "_catalog_revision", None)
    registry.install_global_snapshot(
        {
            "version": "1",
            "catalog": [
                {
                    "name": "image",
                    "category": "image",
                    "output_modalities": ["image"],
                    "supported_endpoints": ["/image/{prompt}"],
                }
            ],
        }
    )
    previous = registry._registry_cache
    real_client = httpx.AsyncClient
    monkeypatch.setattr(
        registry.httpx,
        "AsyncClient",
        lambda **kwargs: real_client(
            transport=httpx.MockTransport(lambda request: httpx.Response(503)), **kwargs
        ),
    )
    await registry.warm_registry()
    assert registry._registry_cache is previous
    monkeypatch.setattr(registry, "_policy_snapshot", None)
    with pytest.raises(httpx.HTTPStatusError):
        await registry.warm_registry()
