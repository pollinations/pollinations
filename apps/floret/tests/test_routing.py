from pydantic import ValidationError
import pytest

import floret.routing as routing
from floret.routing import (
    RoutingInput,
    RoutingPreferences,
    RoutingRegistryUnavailable,
    RoutingValidationError,
    validate_routing,
)

_CATALOG = {
    "glm": {
        "modalities": ["text"],
        "capabilities": {"web_search": False},
        "supported_endpoints": ["/v1/chat/completions"],
        "input_modalities": ["text"],
        "output_modalities": ["text"],
    },
    "gemini-search": {
        "modalities": ["text"],
        "capabilities": {"web_search": True},
        "supported_endpoints": ["/v1/chat/completions"],
        "input_modalities": ["text"],
        "output_modalities": ["text"],
    },
    "flux": {
        "modalities": ["image"],
        "capabilities": {},
        "supported_endpoints": ["/image/{prompt}"],
        "input_modalities": ["text"],
        "output_modalities": ["image"],
    },
    "nanobanana": {
        "modalities": ["image"],
        "capabilities": {},
        "supported_endpoints": ["/v1/images/edits"],
        "input_modalities": ["text", "image"],
        "output_modalities": ["image"],
    },
    "wan-fast": {
        "modalities": ["video"],
        "capabilities": {},
        "supported_endpoints": ["/video/{prompt}"],
        "input_modalities": ["text", "image"],
        "output_modalities": ["video"],
    },
    "openai-audio": {
        "modalities": ["audio"],
        "capabilities": {},
        "supported_endpoints": ["/v1/chat/completions"],
        "input_modalities": ["text"],
        "output_modalities": ["text", "audio"],
    },
}


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
        image_generation="flux",
    ).to_preferences()
    assert preferences.text == "glm"
    assert preferences.image_generation == "flux"
    with pytest.raises(AttributeError):
        preferences.text = "openai"


def test_uppercase_auto_is_preserved_as_an_explicit_model_id():
    assert RoutingInput(text="AUTO").to_preferences().text == "AUTO"


@pytest.mark.parametrize("value", ["", " ", 123])
def test_invalid_preference_values_are_rejected(value):
    with pytest.raises(ValidationError):
        RoutingInput(text=value)


def test_unknown_routing_fields_are_rejected():
    with pytest.raises(ValidationError):
        RoutingInput.model_validate({"image": "flux"})


async def test_validate_routing_accepts_all_capability_overrides(monkeypatch):
    monkeypatch.setattr(routing, "get_model_catalog", lambda: _CATALOG)

    preferences = await validate_routing(
        RoutingInput(
            text="glm",
            web_search="gemini-search",
            image_generation="flux",
            image_editing="nanobanana",
            video="wan-fast",
            audio="openai-audio",
        )
    )

    assert preferences == RoutingPreferences(
        text="glm",
        web_search="gemini-search",
        image_generation="flux",
        image_editing="nanobanana",
        video="wan-fast",
        audio="openai-audio",
    )


@pytest.mark.parametrize("model", ["missing", "AUTO"])
async def test_validate_routing_rejects_unknown_models(monkeypatch, model):
    monkeypatch.setattr(routing, "get_model_catalog", lambda: _CATALOG)

    with pytest.raises(RoutingValidationError) as error:
        await validate_routing(RoutingInput(text=model))

    assert error.value.field == "text"
    assert error.value.model == model
    assert error.value.reason == "unknown model"


@pytest.mark.parametrize(
    ("field", "model", "reason"),
    [
        ("text", "flux", "requires modality 'text'"),
        ("web_search", "glm", "requires capability 'web_search'"),
        (
            "image_generation",
            "nanobanana",
            "requires endpoint '/image/{prompt}'",
        ),
        ("image_editing", "flux", "requires input modality 'image'"),
        ("video", "flux", "requires modality 'video'"),
        ("audio", "glm", "requires output modality 'audio'"),
    ],
)
async def test_validate_routing_rejects_capability_mismatches(
    monkeypatch, field, model, reason
):
    monkeypatch.setattr(routing, "get_model_catalog", lambda: _CATALOG)

    with pytest.raises(RoutingValidationError) as error:
        await validate_routing(RoutingInput.model_validate({field: model}))

    assert error.value.field == field
    assert error.value.model == model
    assert error.value.reason == reason


async def test_validate_routing_refreshes_an_empty_catalog(monkeypatch):
    refresh_calls = 0

    async def refresh():
        nonlocal refresh_calls
        refresh_calls += 1
        return {"models": _CATALOG, "by_modality": {}}

    monkeypatch.setattr(routing, "get_model_catalog", lambda: {})
    monkeypatch.setattr(routing, "refresh_registry", refresh)

    preferences = await validate_routing(RoutingInput(text="glm"))

    assert preferences.text == "glm"
    assert refresh_calls == 1


async def test_validate_routing_reports_registry_refresh_failure(monkeypatch):
    failure = RuntimeError("offline")

    async def refresh():
        raise failure

    monkeypatch.setattr(routing, "get_model_catalog", lambda: {})
    monkeypatch.setattr(routing, "refresh_registry", refresh)

    with pytest.raises(RoutingRegistryUnavailable) as error:
        await validate_routing(RoutingInput(text="glm"))

    assert error.value.__cause__ is failure


@pytest.mark.parametrize("value", [None, RoutingInput(), RoutingInput(text="auto")])
async def test_validate_routing_skips_registry_without_explicit_preferences(
    monkeypatch, value
):
    def unexpected_catalog_access():
        pytest.fail("registry should not be read")

    monkeypatch.setattr(routing, "get_model_catalog", unexpected_catalog_access)

    assert await validate_routing(value) == RoutingPreferences()


@pytest.mark.parametrize("supported_endpoints", [None, []])
async def test_validate_routing_allows_omitted_endpoint_metadata(
    monkeypatch, supported_endpoints
):
    catalog = {
        "text-without-endpoints": {
            **_CATALOG["glm"],
            "supported_endpoints": supported_endpoints,
        }
    }
    monkeypatch.setattr(routing, "get_model_catalog", lambda: catalog)

    preferences = await validate_routing(RoutingInput(text="text-without-endpoints"))

    assert preferences.text == "text-without-endpoints"


async def test_validate_routing_accepts_list_capability_metadata(monkeypatch):
    catalog = {
        "search-list": {
            **_CATALOG["gemini-search"],
            "capabilities": ["web_search"],
        }
    }
    monkeypatch.setattr(routing, "get_model_catalog", lambda: catalog)

    preferences = await validate_routing(RoutingInput(web_search="search-list"))

    assert preferences.web_search == "search-list"


def test_routing_preferences_expose_explicit_values_and_tool_models():
    preferences = RoutingPreferences(
        text="glm",
        web_search="gemini-search",
        image_generation="flux",
        image_editing="nanobanana",
        video="wan-fast",
        audio="openai-audio",
    )

    assert preferences.explicit() == {
        "text": "glm",
        "web_search": "gemini-search",
        "image_generation": "flux",
        "image_editing": "nanobanana",
        "video": "wan-fast",
        "audio": "openai-audio",
    }
    assert preferences.model_for_tool("generate_image") == "flux"
    assert preferences.model_for_tool("edit_image") == "nanobanana"
    assert preferences.model_for_tool("generate_video") == "wan-fast"
    assert preferences.model_for_tool("text_to_speech") == "openai-audio"
    assert preferences.model_for_tool("web_search") == "gemini-search"
    assert preferences.model_for_tool("unknown") is None


def test_prompt_block_is_empty_without_explicit_preferences():
    assert RoutingPreferences().prompt_block() == ""


def test_prompt_block_is_deterministic_and_uses_capability_labels():
    preferences = RoutingPreferences(
        text="glm",
        image_generation="flux",
        audio="openai-audio",
    )

    assert preferences.prompt_block() == (
        "\nUser-selected model constraints:"
        "\n- text reasoning: glm"
        "\n- image generation: flux"
        "\n- audio generation: openai-audio"
    )
