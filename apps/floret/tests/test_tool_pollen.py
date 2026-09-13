from __future__ import annotations

import json
from copy import deepcopy
from typing import Any
from urllib.parse import parse_qs, urlsplit

import httpx
import pytest

from floret import knowledge, registry, toolset
from floret.tools import gen, media


def model(
    name: str, category: str, endpoints: list[str], **extra: Any
) -> dict[str, Any]:
    return {
        "name": name,
        "category": category,
        "supported_endpoints": endpoints,
        "input_modalities": ["text"],
        "output_modalities": [category],
        "capabilities": [],
        "paid_only": False,
        "pricing": {"prompt": 1, "completion": 2},
        **extra,
    }


@pytest.fixture
def catalog(monkeypatch: pytest.MonkeyPatch) -> dict[str, dict[str, Any]]:
    monkeypatch.setattr(registry, "_registry_cache", registry._registry_cache)
    monkeypatch.setattr(registry, "_policy_snapshot", registry._policy_snapshot)
    monkeypatch.setattr(registry, "_catalog_revision", registry._catalog_revision)
    values = [
        model("quest/text", "text", ["/v1/chat/completions"], capabilities=["tools"]),
        model(
            "quest/search",
            "text",
            ["/v1/chat/completions"],
            capabilities=["web_search"],
        ),
        model("quest/image", "image", ["/image/{prompt}"], aliases=["quest-image"]),
        model(
            "quest/edit",
            "image",
            ["/v1/images/edits"],
            input_modalities=["text", "image"],
        ),
        model("quest/video", "video", ["/video/{prompt}"], video_capabilities=[]),
        model(
            "quest/frames",
            "video",
            ["/video/{prompt}"],
            input_modalities=["text", "image"],
            video_capabilities=["end_frame"],
        ),
        model(
            "quest/chat-audio",
            "audio",
            ["/v1/chat/completions"],
            voices=["quest-voice"],
        ),
        model("quest/speech", "audio", ["/v1/audio/speech"]),
        model(
            "quest/transcript",
            "audio",
            ["/v1/audio/transcriptions"],
            input_modalities=["audio"],
            output_modalities=["text"],
        ),
        model(
            "quest/changer",
            "audio",
            ["/v1/audio/voice-changer"],
            input_modalities=["audio"],
            output_modalities=["audio"],
        ),
        model(
            "quest/isolator",
            "audio",
            ["/v1/audio/voice-isolator"],
            input_modalities=["audio"],
            output_modalities=["audio"],
        ),
    ]
    paid = [
        {
            **item,
            "name": item["name"].replace("quest/", "paid/"),
            "aliases": [],
            "paid_only": True,
            "voices": ["paid-voice"],
        }
        for item in values
    ]
    paid[2]["aliases"] = [
        "nanobanana",
        "gptimage-large",
        "ideogram-v4-quality",
        "kontext",
        "p-image-edit",
    ]
    paid[5]["aliases"] = ["wan-fast", "veo", "wan-pro", "seedance-2.0"]
    paid[6]["aliases"] = ["openai-audio", "eleven-dialogue"]
    paid[8]["aliases"] = ["whisper"]
    paid[9]["aliases"] = ["eleven-voice-changer"]
    paid[10]["aliases"] = ["eleven-voice-isolator"]
    values += paid
    registry.install_global_snapshot({"version": "policy-test", "catalog": values})
    return {item["name"]: item for item in values}


def test_quest_schemas_and_knowledge_hide_paid_names_without_global_mutation(catalog):
    original = deepcopy(toolset.TOOL_SCHEMAS)
    with registry.model_scope(catalog, "quest"):
        schemas = toolset.tool_schemas()
        visible = (
            json.dumps(schemas)
            + knowledge.build_system_prompt()
            + knowledge.models_summary()
        )
        assert "quest/image" in visible
        for item in catalog.values():
            if item["paid_only"]:
                assert item["name"] not in visible
                for alias in item.get("aliases", []):
                    assert alias not in visible
        assert "paid-voice" not in visible
        for schema in schemas:
            parameter = schema["function"]["parameters"]["properties"].get("model")
            if parameter is not None:
                assert "default" not in parameter
                assert parameter["enum"]
                assert all(value.startswith("quest/") for value in parameter["enum"])
        schemas[0]["function"]["description"] = "request-local edit"
    assert toolset.TOOL_SCHEMAS == original
    assert toolset.tool_schemas() is toolset.TOOL_SCHEMAS
    assert "eleven-dialogue" in knowledge.build_system_prompt()


def test_tools_without_eligible_models_are_not_offered(catalog):
    only_text = {"quest/text": catalog["quest/text"]}
    with registry.model_scope(only_text, "quest"):
        names = {item["function"]["name"] for item in toolset.tool_schemas()}
        assert "generate_text" in names
        assert "generate_image" not in names
        assert "text_to_speech" not in names
        assert "transcribe" not in names
        assert "web_search" not in names
        assert "fetch_media" in names


@pytest.mark.parametrize(
    ("operation", "arguments", "paid_model"),
    [
        ("generate_text", {"prompt": "hello"}, "paid/text"),
        ("generate_image", {"prompt": "hello"}, "nanobanana"),
        (
            "edit_image",
            {"prompt": "hello", "image_url": "https://source.test/image"},
            "paid/edit",
        ),
        (
            "generate_video",
            {"prompt": "hello", "end_image": "https://source.test/end"},
            "wan-fast",
        ),
        ("text_to_speech", {"text": "hello"}, "openai-audio"),
        ("generate_audio", {"text": "hello"}, "paid/speech"),
        ("transcribe", {"audio_url": "https://source.test/audio"}, "whisper"),
        (
            "transform_audio",
            {"audio_url": "https://source.test/audio", "endpoint": "voice-changer"},
            "eleven-voice-changer",
        ),
        (
            "transform_audio",
            {"audio_url": "https://source.test/audio", "endpoint": "voice-isolator"},
            "eleven-voice-isolator",
        ),
        ("web_search", {"query": "hello"}, "paid/search"),
    ],
)
async def test_paid_tools_and_aliases_fail_before_any_network(
    catalog, monkeypatch, operation, arguments, paid_model
):
    def no_network():
        pytest.fail("disallowed model reached network setup")

    monkeypatch.setattr(gen, "_http_client", no_network)
    with registry.model_scope(catalog, "quest"), pytest.raises(ValueError):
        await getattr(gen, operation)(**arguments, model=paid_model)


async def test_quest_default_images_and_end_frames_use_eligible_models(catalog):
    with registry.model_scope(catalog, "quest"):
        image = (await gen.generate_image("hello"))[0]
        assert parse_qs(urlsplit(image).query)["model"] == ["quest/image"]
        video = await gen.generate_video("hello", end_image="https://source.test/end")
        assert parse_qs(urlsplit(video).query)["model"] == ["quest/frames"]
        with pytest.raises(ValueError):
            await gen.generate_video(
                "hello", model="quest/video", end_image="https://source.test/end"
            )
    no_frames = {key: value for key, value in catalog.items() if key != "quest/frames"}
    with registry.model_scope(no_frames, "quest"), pytest.raises(ValueError):
        await gen.generate_video("hello", end_image="https://source.test/end")


@pytest.mark.parametrize(
    ("name", "arguments", "expected"),
    [
        ("generate_text", {"prompt": "hello", "model": "quest/text"}, "quest/text"),
        (
            "edit_image",
            {"prompt": "hello", "image_url": "data:image/png;base64,eA=="},
            "quest/edit",
        ),
        ("text_to_speech", {"text": "hello"}, "quest/chat-audio"),
        ("text_to_speech", {"text": "hello", "model": "quest/speech"}, "quest/speech"),
        (
            "transcribe",
            {"audio_url": "data:audio/mpeg;base64,eA=="},
            "quest/transcript",
        ),
        (
            "change_voice",
            {"audio_url": "https://source.test/audio", "voice": "voice"},
            "quest/changer",
        ),
        ("isolate_voice", {"audio_url": "https://source.test/audio"}, "quest/isolator"),
        ("web_search", {"query": "hello"}, "quest/search"),
    ],
)
async def test_dispatch_default_and_explicit_models_reach_correct_endpoint(
    catalog, monkeypatch, name, arguments, expected
):
    requests = []

    def respond(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        if request.url.host == "source.test":
            assert "authorization" not in request.headers
            return httpx.Response(200, content=b"source audio")
        assert request.headers["Authorization"] == "Bearer ag_test"
        if request.url.path == "/upload":
            return httpx.Response(
                200, json={"url": "https://media.pollinations.ai/result.png"}
            )
        if request.url.path == "/v1/images/edits":
            return httpx.Response(200, json={"data": [{"b64_json": "eA=="}]})
        if request.url.path == "/v1/audio/transcriptions":
            return httpx.Response(200, json={"text": "transcript"})
        if request.url.path.startswith("/v1/audio/"):
            return httpx.Response(
                200, content=b"audio", headers={"content-type": "audio/mpeg"}
            )
        return httpx.Response(
            200,
            json={
                "choices": [
                    {
                        "message": {
                            "content": "hello",
                            "audio": {"data": "eA==", "transcript": "hello"},
                        }
                    }
                ]
            },
        )

    async with httpx.AsyncClient(transport=httpx.MockTransport(respond)) as client:
        monkeypatch.setattr(gen, "_http_client", lambda: client)
        monkeypatch.setattr(media, "_http_client", lambda: client)
        monkeypatch.setattr(gen, "_key", lambda: "ag_test")
        monkeypatch.setattr(media, "_key", lambda: "ag_test")
        with registry.model_scope(catalog, "quest"):
            result = await toolset.dispatch(name, arguments)
        assert not result.brain.startswith("ERROR"), result.brain
    generation = [
        request for request in requests if request.url.path.startswith("/v1/")
    ]
    assert len(generation) == 1
    request = generation[0]
    if request.headers["content-type"].startswith("application/json"):
        body = json.loads(request.content)
        assert body["model"] == expected
        assert "pollen" not in body
    else:
        assert f"\r\n\r\n{expected}\r\n".encode() in request.content
    assert b"paid/" not in request.content


@pytest.mark.parametrize(
    "suffix",
    [
        "/image/test?model=paid/image",
        "/image/test?model=nanobanana",
        "/image/test",
        "/image/test?model=quest/image&model=paid/image",
        "/unknown/test?model=quest/image",
    ],
)
@pytest.mark.parametrize("entry", ["fetch_bytes", "upload_media", "fetch_media"])
async def test_media_tools_cannot_execute_disallowed_or_implicit_gen_models(
    catalog, monkeypatch, tmp_path, suffix, entry
):
    def no_network():
        pytest.fail("disallowed URL reached network setup")

    monkeypatch.setattr(gen, "_http_client", no_network)
    monkeypatch.setattr(media, "_workdir", lambda: str(tmp_path))
    url = gen._base() + suffix
    with registry.model_scope(catalog, "quest"), pytest.raises(ValueError):
        if entry == "fetch_bytes":
            await gen._fetch_bytes(url)
        elif entry == "upload_media":
            await media.upload_media(url)
        else:
            await media.fetch_media(url, filename="output.png")


async def test_media_allowed_alias_is_canonicalized_and_external_media_stays_unauthenticated(
    catalog, monkeypatch
):
    requests = []

    def respond(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        return httpx.Response(200, content=b"image")

    async with httpx.AsyncClient(transport=httpx.MockTransport(respond)) as client:
        monkeypatch.setattr(gen, "_http_client", lambda: client)
        monkeypatch.setattr(gen, "_key", lambda: "ag_test")
        with registry.model_scope(catalog, "quest"):
            assert (
                await gen._fetch_bytes(
                    gen._base() + "/image/test?model=quest-image&width=512"
                )
                == b"image"
            )
            assert await gen._fetch_bytes("https://media.example/file.png") == b"image"
    assert requests[0].url.params["model"] == "quest/image"
    assert requests[0].url.params["width"] == "512"
    assert requests[0].headers["Authorization"] == "Bearer ag_test"
    assert "pollen" not in requests[0].url.params
    assert "Authorization" not in requests[1].headers


@pytest.mark.parametrize(
    ("name", "arguments", "expected"),
    [
        ("web_search", {"query": "hello"}, "gemini-search"),
        ("text_to_speech", {"text": "hello"}, "openai-audio"),
        ("transcribe", {"audio_url": "data:audio/mpeg;base64,eA=="}, "whisper"),
    ],
)
async def test_all_preserves_legacy_fixed_tool_defaults(
    catalog, monkeypatch, name, arguments, expected
):
    requests = []

    def respond(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        if request.url.path == "/v1/audio/transcriptions":
            return httpx.Response(200, json={"text": "hello"})
        return httpx.Response(
            200,
            json={
                "choices": [
                    {"message": {"content": "hello", "audio": {"data": "eA=="}}}
                ]
            },
        )

    async with httpx.AsyncClient(transport=httpx.MockTransport(respond)) as client:
        monkeypatch.setattr(gen, "_http_client", lambda: client)
        monkeypatch.setattr(gen, "_key", lambda: "ag_test")
        with registry.model_scope(catalog, "all"):
            await getattr(gen, name)(**arguments)
    assert len(requests) == 1
    if name == "transcribe":
        assert f"\r\n\r\n{expected}\r\n".encode() in requests[0].content
    else:
        assert json.loads(requests[0].content)["model"] == expected
