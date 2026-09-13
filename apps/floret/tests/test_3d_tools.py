"""3D model selection, authenticated generation, and delivered download links."""

from __future__ import annotations

import json
from typing import Any

import httpx
import pytest

from floret import knowledge, registry, toolset
from floret.api import _build_content
from floret.config import _api_key_override
from floret.tools import gen, media


@pytest.fixture
def catalog(monkeypatch: pytest.MonkeyPatch) -> dict[str, dict[str, Any]]:
    rows = [
        {
            "name": "quest/image-3d",
            "aliases": ["image-3d"],
            "category": "3d",
            "input_modalities": ["image"],
            "output_modalities": ["3d"],
            "paid_only": False,
            "supported_endpoints": ["/image/{prompt}"],
        },
        {
            "name": "paid/text-3d",
            "aliases": ["text-3d"],
            "category": "3d",
            "input_modalities": ["text", "image"],
            "output_modalities": ["3d"],
            "paid_only": True,
            "supported_endpoints": ["/image/{prompt}"],
        },
        {
            "name": "quest/image",
            "category": "image",
            "input_modalities": ["text"],
            "output_modalities": ["image"],
            "paid_only": False,
            "supported_endpoints": ["/image/{prompt}"],
        },
    ]
    monkeypatch.setattr(registry, "_registry_cache", registry._registry_cache)
    monkeypatch.setattr(registry, "_policy_snapshot", registry._policy_snapshot)
    monkeypatch.setattr(registry, "_catalog_revision", registry._catalog_revision)
    registry.install_global_snapshot({"version": "3d-test", "catalog": rows})
    return registry.get_model_catalog()


@pytest.mark.parametrize(
    ("image", "pin", "expected"),
    [
        (None, None, "paid/text-3d"),
        (None, "text-3d", "paid/text-3d"),
        ("https://example.test/reference.png", "image-3d", "quest/image-3d"),
    ],
)
@pytest.mark.parametrize("mime", ["model/gltf-binary", "application/ply"])
async def test_generation_uses_catalog_inputs_and_delivers_enclosure(
    catalog: dict[str, dict[str, Any]],
    monkeypatch: pytest.MonkeyPatch,
    image: str | None,
    pin: str | None,
    expected: str,
    mime: str,
) -> None:
    requests = []
    url = "https://media.pollinations.ai/model-file"

    def handle(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        return httpx.Response(
            200,
            content=b"model bytes",
            headers={
                "Content-Type": mime,
                "Link": f'<{url}>; rel="enclosure"',
            },
        )

    token = _api_key_override.set("ag_3d-caller")
    try:
        async with httpx.AsyncClient(transport=httpx.MockTransport(handle)) as client:
            monkeypatch.setattr(gen, "_http_client", lambda: client)
            with registry.model_scope(catalog):
                result = await toolset.dispatch(
                    "generate_3d",
                    {
                        "prompt": "a cat/dog? #1",
                        "image": image,
                        "model": pin,
                        "resolution": "high",
                        "seed": 42,
                    },
                )
    finally:
        _api_key_override.reset(token)
    assert not result.brain.startswith("ERROR"), result.brain
    assert len(requests) == 1
    request = requests[0]
    assert request.method == "POST"
    assert request.url.raw_path == b"/3d/a%20cat%2Fdog%3F%20%231"
    assert request.headers["authorization"] == "Bearer ag_3d-caller"
    assert json.loads(request.content) == {
        "model": expected,
        "resolution": "high",
        "seed": 42,
        **({"image": [image]} if image else {}),
    }
    assert result.artifacts == [{"type": "3d", "url": url, "mime_type": mime}]
    markdown, parts = await _build_content("", result.artifacts)
    assert markdown == f"[Download 3d]({url})"
    assert parts == [{"type": "text", "text": markdown}]


async def test_quest_image_first_flow_rehosts_reference_with_caller_auth(
    catalog: dict[str, dict[str, Any]],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    requests = []

    def handle(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        assert request.headers["authorization"] == "Bearer ag_quest"
        if request.url.path == "/image/reference":
            return httpx.Response(200, content=b"\x89PNG\r\n\x1a\nimage")
        if request.url.path == "/upload":
            return httpx.Response(
                200, json={"url": "https://media.pollinations.ai/reference"}
            )
        assert json.loads(request.content) == {
            "model": "quest/image-3d",
            "image": ["https://media.pollinations.ai/reference"],
        }
        return httpx.Response(
            200,
            headers={"Link": '<https://media.pollinations.ai/model>; rel="enclosure"'},
        )

    token = _api_key_override.set("ag_quest")
    try:
        async with httpx.AsyncClient(transport=httpx.MockTransport(handle)) as client:
            monkeypatch.setattr(gen, "_http_client", lambda: client)
            monkeypatch.setattr(media, "_http_client", lambda: client)
            with registry.model_scope(catalog, "quest"):
                url, _ = await gen.generate_3d(
                    "object", image=gen._base() + "/image/reference?model=quest/image"
                )
                assert url == "https://media.pollinations.ai/model"
    finally:
        _api_key_override.reset(token)
    assert [request.url.path for request in requests] == [
        "/image/reference",
        "/upload",
        "/3d/object",
    ]


@pytest.mark.parametrize(
    ("pollen", "args"),
    [
        ("quest", {"prompt": "object"}),
        ("quest", {"prompt": "object", "model": "text-3d"}),
        ("all", {"prompt": "object", "model": "image-3d"}),
        ("all", {"prompt": "object", "model": "quest/image"}),
        ("all", {"prompt": "object", "resolution": "huge"}),
        ("all", {"prompt": ".."}),
    ],
)
async def test_incompatible_3d_requests_fail_before_network(
    catalog, monkeypatch, pollen, args
):
    def no_network():
        pytest.fail("incompatible request reached network")

    monkeypatch.setattr(gen, "_http_client", no_network)
    with registry.model_scope(catalog, pollen), pytest.raises(ValueError):
        await gen.generate_3d(**args)


@pytest.mark.parametrize(
    "headers", [{}, {"Link": '<https://untrusted.test/model>; rel="enclosure"'}]
)
async def test_missing_public_enclosure_is_not_reported_as_success(
    catalog, monkeypatch, headers
):
    async with httpx.AsyncClient(
        transport=httpx.MockTransport(lambda _: httpx.Response(200, headers=headers))
    ) as client:
        monkeypatch.setattr(gen, "_http_client", lambda: client)
        result = await toolset.dispatch("generate_3d", {"prompt": "object"})
    assert result.brain.startswith("ERROR")
    assert "no public file URL" in result.brain
    assert result.artifacts == []


def test_3d_catalog_guides_input_choice_and_quest_eligibility(catalog):
    with registry.model_scope(catalog, "quest"):
        summary = knowledge.models_summary("3d")
        assert "quest/image-3d: accepts image" in summary
        assert "paid/text-3d" not in summary
        tools = {
            tool["function"]["name"]: tool["function"]
            for tool in toolset.tool_schemas()
        }
        assert tools["generate_3d"]["parameters"]["properties"]["model"]["enum"] == [
            "quest/image-3d"
        ]
        prompt = knowledge.build_system_prompt()
        assert "generate_3d" in prompt and "image-first" in prompt
        assert "runFfmpeg" in prompt and "assets publish" in prompt
        assert "fetch_media" not in prompt
