import asyncio

from pydantic import ValidationError
import pytest

from floret import registry
from floret.config import _api_key_override, _current_api_key
import floret.routing as routing
from floret.routing import (
    RoutingInput,
    RoutingPreferences,
    RoutingRegistryUnavailable,
    RoutingValidationError,
    validate_routing,
)

_RICH_WIRE_CATALOG = [
    {
        "name": "glm",
        "aliases": [],
        "category": "text",
        "brand": "Z.ai",
        "pricing": {"currency": "pollen"},
        "title": "GLM",
        "input_modalities": ["text"],
        "output_modalities": ["text"],
        "supported_endpoints": ["/v1/chat/completions"],
        "capabilities": [],
    },
    {
        "name": "gemini-search",
        "aliases": ["gemini-search-fast"],
        "category": "text",
        "brand": "Google",
        "pricing": {"currency": "pollen"},
        "title": "Google Gemini Search",
        "input_modalities": ["text", "image", "video"],
        "output_modalities": ["text"],
        "supported_endpoints": ["/v1/chat/completions"],
        "capabilities": ["web_search"],
        "paid_only": True,
    },
    {
        "name": "opaque-image-model-7",
        "aliases": [],
        "category": "image",
        "brand": "Example",
        "pricing": {"currency": "pollen"},
        "title": "Opaque Image Model",
        "input_modalities": ["text"],
        "output_modalities": ["image"],
        "supported_endpoints": ["/image/{prompt}"],
        "capabilities": [],
    },
    {
        "name": "nanobanana",
        "aliases": [],
        "category": "image",
        "brand": "Google",
        "pricing": {"currency": "pollen"},
        "title": "Nano Banana",
        "input_modalities": ["text", "image"],
        "output_modalities": ["image"],
        "supported_endpoints": ["/image/{prompt}", "/v1/images/edits"],
        "capabilities": [],
    },
    {
        "name": "wan-fast",
        "aliases": [],
        "category": "video",
        "brand": "Wan",
        "pricing": {"currency": "pollen"},
        "title": "Wan Fast",
        "input_modalities": ["text", "image"],
        "output_modalities": ["video"],
        "supported_endpoints": ["/video/{prompt}"],
        "capabilities": [],
    },
    {
        "name": "openai-audio",
        "aliases": [],
        "category": "text",
        "brand": "OpenAI",
        "pricing": {"currency": "pollen"},
        "title": "OpenAI Audio",
        "input_modalities": ["text"],
        "output_modalities": ["text", "audio"],
        "supported_endpoints": ["/v1/chat/completions"],
        "capabilities": [],
    },
]

_RICH_CATALOG = {item["name"]: item for item in _RICH_WIRE_CATALOG}


def _use_catalog(monkeypatch, catalog=None):
    async def fetch_model_catalog():
        return _RICH_CATALOG if catalog is None else catalog

    monkeypatch.setattr(routing, "fetch_model_catalog", fetch_model_catalog)


def test_omitted_and_auto_values_normalize_to_none():
    assert RoutingInput().to_preferences() == RoutingPreferences()
    assert (
        RoutingInput(
            text="auto",
            image_generation="auto",
            audio="auto",
        ).to_preferences()
        == RoutingPreferences()
    )


def test_explicit_values_are_preserved_and_frozen():
    preferences = RoutingInput(
        text="glm",
        image_generation="opaque-image-model-7",
    ).to_preferences()
    assert preferences.text == "glm"
    assert preferences.image_generation == "opaque-image-model-7"
    with pytest.raises(AttributeError):
        preferences.text = "openai"


def test_uppercase_auto_is_preserved_as_an_explicit_model_id():
    assert RoutingInput(text="AUTO").to_preferences().text == "AUTO"


@pytest.mark.parametrize("value", ["", " ", 123, None])
def test_explicit_invalid_preference_values_are_rejected(value):
    with pytest.raises(ValidationError):
        RoutingInput.model_validate({"text": value})


def test_unknown_routing_fields_are_rejected():
    with pytest.raises(ValidationError):
        RoutingInput.model_validate({"image": "flux"})


def test_rich_catalog_adapter_uses_real_wire_shape_and_search_capability():
    catalog = registry._adapt_rich_catalog(_RICH_WIRE_CATALOG)

    assert catalog["gemini-search"]["category"] == "text"
    assert catalog["gemini-search"]["capabilities"] == ["web_search"]
    assert catalog["gemini-search"]["input_modalities"] == [
        "text",
        "image",
        "video",
    ]


async def test_fetch_model_catalog_uses_authenticated_rich_endpoint(monkeypatch):
    requests = []

    class Response:
        def raise_for_status(self):
            return None

        def json(self):
            return _RICH_WIRE_CATALOG

    class Client:
        def __init__(self, *, timeout):
            assert timeout == 30

        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, traceback):
            return None

        async def get(self, url, *, headers):
            requests.append((url, headers))
            return Response()

    shared_cache = {"models": {"cached": {}}, "by_modality": {}}
    monkeypatch.setattr(registry, "_registry_cache", shared_cache)
    monkeypatch.setattr(registry.httpx, "AsyncClient", Client)
    monkeypatch.setattr(registry.settings, "openai_base_url", "https://example.test/")
    token = _api_key_override.set("caller-token")
    try:
        catalog = await registry.fetch_model_catalog()
    finally:
        _api_key_override.reset(token)

    assert requests == [
        (
            "https://example.test/models",
            {"Authorization": "Bearer caller-token"},
        )
    ]
    assert catalog["gemini-search"]["capabilities"] == ["web_search"]
    assert registry._registry_cache is shared_cache


async def test_validate_routing_accepts_all_capability_overrides(monkeypatch):
    _use_catalog(monkeypatch)

    preferences = await validate_routing(
        RoutingInput(
            text="glm",
            web_search="gemini-search",
            image_generation="opaque-image-model-7",
            image_editing="nanobanana",
            video="wan-fast",
            audio="openai-audio",
        )
    )

    assert preferences == RoutingPreferences(
        text="glm",
        web_search="gemini-search",
        image_generation="opaque-image-model-7",
        image_editing="nanobanana",
        video="wan-fast",
        audio="openai-audio",
    )


async def test_arbitrary_image_id_is_classified_from_authoritative_metadata(
    monkeypatch,
):
    _use_catalog(monkeypatch)

    preferences = await validate_routing(
        RoutingInput(image_generation="opaque-image-model-7")
    )

    assert preferences.image_generation == "opaque-image-model-7"


@pytest.mark.parametrize("model", ["missing", "AUTO"])
async def test_validate_routing_rejects_unknown_models(monkeypatch, model):
    _use_catalog(monkeypatch)

    with pytest.raises(RoutingValidationError) as error:
        await validate_routing(RoutingInput(text=model))

    assert error.value.field == "text"
    assert error.value.model == model
    assert error.value.reason == "unknown model"


@pytest.mark.parametrize(
    ("field", "model", "reason"),
    [
        ("text", "opaque-image-model-7", "requires category 'text'"),
        ("web_search", "glm", "requires capability 'web_search'"),
        (
            "image_generation",
            "nanobanana",
            "requires endpoint '/image/{prompt}'",
        ),
        ("image_editing", "opaque-image-model-7", "requires input modality 'image'"),
        ("video", "opaque-image-model-7", "requires category 'video'"),
        ("audio", "glm", "requires output modality 'audio'"),
    ],
)
async def test_validate_routing_rejects_capability_mismatches(
    monkeypatch, field, model, reason
):
    catalog = {
        key: ({**value, "supported_endpoints": ["/v1/images/edits"]})
        if key == "nanobanana"
        else value
        for key, value in _RICH_CATALOG.items()
    }
    _use_catalog(monkeypatch, catalog)

    with pytest.raises(RoutingValidationError) as error:
        await validate_routing(RoutingInput.model_validate({field: model}))

    assert error.value.field == field
    assert error.value.model == model
    assert error.value.reason == reason


async def test_explicit_validation_fetches_every_time_and_sees_catalog_changes(
    monkeypatch,
):
    calls = 0

    async def fetch_model_catalog():
        nonlocal calls
        calls += 1
        return _RICH_CATALOG if calls == 1 else {}

    monkeypatch.setattr(routing, "fetch_model_catalog", fetch_model_catalog)

    assert (await validate_routing(RoutingInput(text="glm"))).text == "glm"
    with pytest.raises(RoutingValidationError, match="unknown model"):
        await validate_routing(RoutingInput(text="glm"))
    assert calls == 2


async def test_explicit_validation_isolates_caller_catalogs(monkeypatch):
    caller_catalogs = {
        "caller-a": {"a-model": {**_RICH_CATALOG["glm"], "name": "a-model"}},
        "caller-b": {"b-model": {**_RICH_CATALOG["glm"], "name": "b-model"}},
    }

    async def fetch_model_catalog():
        await asyncio.sleep(0)
        return caller_catalogs[_current_api_key()]

    async def validate_for(key, model):
        token = _api_key_override.set(key)
        try:
            return await validate_routing(RoutingInput(text=model))
        finally:
            _api_key_override.reset(token)

    monkeypatch.setattr(routing, "fetch_model_catalog", fetch_model_catalog)

    caller_a, caller_b = await asyncio.gather(
        validate_for("caller-a", "a-model"),
        validate_for("caller-b", "b-model"),
    )

    assert caller_a.text == "a-model"
    assert caller_b.text == "b-model"


async def test_explicit_validation_neither_reads_nor_mutates_shared_cache(monkeypatch):
    shared_cache = {
        "models": {"wrong-model": {"category": "text"}},
        "by_modality": {"text": {}},
    }
    monkeypatch.setattr(registry, "_registry_cache", shared_cache)
    _use_catalog(monkeypatch)

    preferences = await validate_routing(RoutingInput(text="glm"))

    assert preferences.text == "glm"
    assert registry._registry_cache is shared_cache


async def test_validate_routing_reports_registry_fetch_failure(monkeypatch):
    failure = RuntimeError("offline")

    async def fetch_model_catalog():
        raise failure

    monkeypatch.setattr(routing, "fetch_model_catalog", fetch_model_catalog)

    with pytest.raises(RoutingRegistryUnavailable) as error:
        await validate_routing(RoutingInput(text="glm"))

    assert error.value.__cause__ is failure


@pytest.mark.parametrize("value", [None, RoutingInput(), RoutingInput(text="auto")])
async def test_validate_routing_skips_registry_without_explicit_preferences(
    monkeypatch, value
):
    async def unexpected_catalog_access():
        pytest.fail("registry should not be fetched")

    monkeypatch.setattr(routing, "fetch_model_catalog", unexpected_catalog_access)

    assert await validate_routing(value) == RoutingPreferences()


@pytest.mark.parametrize("supported_endpoints", [None, []])
async def test_validate_routing_allows_omitted_endpoint_metadata(
    monkeypatch, supported_endpoints
):
    catalog = {
        "text-without-endpoints": {
            **_RICH_CATALOG["glm"],
            "name": "text-without-endpoints",
            "supported_endpoints": supported_endpoints,
        }
    }
    _use_catalog(monkeypatch, catalog)

    preferences = await validate_routing(RoutingInput(text="text-without-endpoints"))

    assert preferences.text == "text-without-endpoints"


def test_routing_preferences_expose_explicit_values_and_tool_models():
    preferences = RoutingPreferences(
        text="glm",
        web_search="gemini-search",
        image_generation="opaque-image-model-7",
        image_editing="nanobanana",
        video="wan-fast",
        audio="openai-audio",
    )

    assert preferences.explicit() == {
        "text": "glm",
        "web_search": "gemini-search",
        "image_generation": "opaque-image-model-7",
        "image_editing": "nanobanana",
        "video": "wan-fast",
        "audio": "openai-audio",
    }
    assert preferences.model_for_tool("generate_image") == "opaque-image-model-7"
    assert preferences.model_for_tool("edit_image") == "nanobanana"
    assert preferences.model_for_tool("generate_video") == "wan-fast"
    assert preferences.model_for_tool("text_to_speech") == "openai-audio"
    assert preferences.model_for_tool("web_search") == "gemini-search"
    assert preferences.model_for_tool("unknown") is None


def test_prompt_block_is_empty_without_explicit_preferences():
    assert RoutingPreferences().prompt_block() == ""


def test_prompt_block_has_exact_required_guidance_suffix():
    preferences = RoutingPreferences(
        text="glm",
        image_generation="opaque-image-model-7",
        audio="openai-audio",
    )

    assert preferences.prompt_block() == (
        "\nUser-selected model constraints:"
        "\n- text reasoning: glm"
        "\n- image generation: opaque-image-model-7"
        "\n- audio generation: openai-audio"
        "\nUse these fixed models for the matching tools. Do not claim that another model was used."
    )
