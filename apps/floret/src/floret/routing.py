from __future__ import annotations

from dataclasses import dataclass, fields
from typing import Annotated, Any

from pydantic import BaseModel, ConfigDict, StringConstraints, model_validator

from floret.registry import fetch_model_catalog

ModelPreference = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1)]


@dataclass(frozen=True)
class CapabilityRequirement:
    category: str | None = None
    capability: str | None = None
    required_input: str | None = None
    required_output: str | None = None
    endpoint_when_present: str | None = None


_TOOL_FIELDS = {
    "generate_image": "image_generation",
    "edit_image": "image_editing",
    "generate_video": "video",
    "text_to_speech": "audio",
    "web_search": "web_search",
}

_FIELD_LABELS = {
    "text": "text reasoning",
    "web_search": "web search",
    "image_generation": "image generation",
    "image_editing": "image editing",
    "video": "video generation",
    "audio": "audio generation",
}

_REQUIREMENTS = {
    "text": CapabilityRequirement(
        category="text",
        required_output="text",
        endpoint_when_present="/v1/chat/completions",
    ),
    "web_search": CapabilityRequirement(
        category="text",
        capability="web_search",
        endpoint_when_present="/v1/chat/completions",
    ),
    "image_generation": CapabilityRequirement(
        category="image",
        required_input="text",
        required_output="image",
        endpoint_when_present="/image/{prompt}",
    ),
    "image_editing": CapabilityRequirement(
        category="image",
        required_input="image",
        required_output="image",
    ),
    "video": CapabilityRequirement(
        category="video",
        required_output="video",
        endpoint_when_present="/video/{prompt}",
    ),
    "audio": CapabilityRequirement(
        required_input="text",
        required_output="audio",
        endpoint_when_present="/v1/chat/completions",
    ),
}


@dataclass(frozen=True)
class RoutingPreferences:
    text: str | None = None
    web_search: str | None = None
    image_generation: str | None = None
    image_editing: str | None = None
    video: str | None = None
    audio: str | None = None

    def explicit(self) -> dict[str, str]:
        return {
            field.name: value
            for field in fields(self)
            if (value := getattr(self, field.name)) is not None
        }

    def model_for_tool(self, tool_name: str) -> str | None:
        field = _TOOL_FIELDS.get(tool_name)
        return getattr(self, field) if field is not None else None

    def prompt_block(self) -> str:
        explicit = self.explicit()
        if not explicit:
            return ""
        constraints = ", ".join(
            f"{_FIELD_LABELS[field]}={model}" for field, model in explicit.items()
        )
        return f"\nFixed models: {constraints}. Use them; do not claim otherwise."


class RoutingInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    text: ModelPreference | None = None
    web_search: ModelPreference | None = None
    image_generation: ModelPreference | None = None
    image_editing: ModelPreference | None = None
    video: ModelPreference | None = None
    audio: ModelPreference | None = None

    @model_validator(mode="before")
    @classmethod
    def reject_explicit_nulls(cls, value: Any) -> Any:
        if isinstance(value, dict):
            null_fields = [field for field, item in value.items() if item is None]
            if null_fields:
                raise ValueError(
                    f"routing fields cannot be null: {', '.join(null_fields)}"
                )
        return value

    def to_preferences(self) -> RoutingPreferences:
        return RoutingPreferences(
            text=None if self.text == "auto" else self.text,
            web_search=None if self.web_search == "auto" else self.web_search,
            image_generation=(
                None if self.image_generation == "auto" else self.image_generation
            ),
            image_editing=None if self.image_editing == "auto" else self.image_editing,
            video=None if self.video == "auto" else self.video,
            audio=None if self.audio == "auto" else self.audio,
        )


class RoutingValidationError(ValueError):
    def __init__(self, field: str, model: str, reason: str) -> None:
        self.field = field
        self.model = model
        self.reason = reason
        super().__init__(
            f"Invalid routing preference for '{field}' model '{model}': {reason}"
        )


class RoutingRegistryUnavailable(RuntimeError):
    pass


def _has_capability(meta: dict[str, object], capability: str) -> bool:
    capabilities = meta.get("capabilities") or {}
    if isinstance(capabilities, dict):
        return bool(capabilities.get(capability))
    if isinstance(capabilities, list):
        return capability in capabilities
    return False


def _string_values(meta: dict[str, object], key: str) -> list[str]:
    value = meta.get(key)
    if not isinstance(value, list):
        return []
    return [item for item in value if isinstance(item, str)]


def _validation_reason(
    meta: dict[str, object], requirement: CapabilityRequirement
) -> str | None:
    category = meta.get("category")
    categories = (
        [category] if isinstance(category, str) else _string_values(meta, "modalities")
    )
    if requirement.category and requirement.category not in categories:
        return f"requires category '{requirement.category}'"

    input_modalities = _string_values(meta, "input_modalities")
    if (
        requirement.required_input
        and requirement.required_input not in input_modalities
    ):
        return f"requires input modality '{requirement.required_input}'"

    output_modalities = _string_values(meta, "output_modalities")
    if (
        requirement.required_output
        and requirement.required_output not in output_modalities
    ):
        return f"requires output modality '{requirement.required_output}'"

    if requirement.capability and not _has_capability(meta, requirement.capability):
        return f"requires capability '{requirement.capability}'"

    endpoints = _string_values(meta, "supported_endpoints")
    if (
        endpoints
        and requirement.endpoint_when_present
        and requirement.endpoint_when_present not in endpoints
    ):
        return f"requires endpoint '{requirement.endpoint_when_present}'"
    return None


async def validate_routing(value: RoutingInput | None) -> RoutingPreferences:
    preferences = value.to_preferences() if value is not None else RoutingPreferences()
    explicit = preferences.explicit()
    if not explicit:
        return preferences

    try:
        catalog = await fetch_model_catalog()
    except Exception as exc:
        raise RoutingRegistryUnavailable("Model registry is unavailable") from exc

    for field, model in explicit.items():
        meta = catalog.get(model)
        if meta is None:
            raise RoutingValidationError(field, model, "unknown model")
        reason = _validation_reason(meta, _REQUIREMENTS[field])
        if reason is not None:
            raise RoutingValidationError(field, model, reason)
    return preferences
