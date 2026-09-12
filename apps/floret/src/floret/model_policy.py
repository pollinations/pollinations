"""Pure model selection from a trusted, revision-scoped policy snapshot."""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from types import MappingProxyType
from typing import Any


@dataclass(frozen=True)
class SelectionRequest:
    task_family: str
    modality: str
    endpoint: str | None = None
    required_capabilities: frozenset[str] = frozenset()
    input_modalities: frozenset[str] = frozenset()
    output_modalities: frozenset[str] = frozenset()
    eligible_model_ids: frozenset[str] | None = None
    pinned_model: str | None = None
    paid: bool = True


@dataclass(frozen=True)
class Recommendation:
    task_family: str
    model_id: str
    action: str
    reason: str
    source: str


@dataclass(frozen=True)
class PolicySnapshot:
    revision: str
    catalog_revision: str
    incumbents: Mapping[str, str]
    recommendations: tuple[Recommendation, ...]


def parse_policy_snapshot(value: Mapping[str, Any]) -> PolicySnapshot:
    """Validate the small JSON contract injected by the trusted outer Worker."""
    revision = value.get("revision")
    catalog_revision = value.get("catalog_revision", value.get("catalogRevision"))
    if not isinstance(revision, str) or not revision:
        raise ValueError("policy revision is required")
    if not isinstance(catalog_revision, str) or not catalog_revision:
        raise ValueError("catalog revision is required")
    raw_incumbents = value.get("incumbents", {})
    if isinstance(raw_incumbents, Mapping):
        incumbents = {
            str(task): str(model)
            for task, model in raw_incumbents.items()
            if isinstance(task, str) and isinstance(model, str)
        }
    elif isinstance(raw_incumbents, Sequence) and not isinstance(
        raw_incumbents, (str, bytes)
    ):
        incumbents = {}
        for raw in raw_incumbents:
            if not isinstance(raw, Mapping):
                raise TypeError("incumbent must be an object")
            task = raw.get("task_family", raw.get("taskFamily"))
            model = raw.get("model_id", raw.get("model"))
            if not isinstance(task, str) or not isinstance(model, str):
                raise TypeError("incumbent fields must be strings")
            incumbents[task] = model
    else:
        raise TypeError("incumbents must be an object or array")

    raw_recommendations = value.get("recommendations", [])
    if not isinstance(raw_recommendations, Sequence) or isinstance(
        raw_recommendations, (str, bytes)
    ):
        raise TypeError("recommendations must be an array")
    recommendations: list[Recommendation] = []
    for raw in raw_recommendations:
        if not isinstance(raw, Mapping):
            raise TypeError("recommendation must be an object")
        task_family = raw.get("task_family", raw.get("taskFamily"))
        model_id = raw.get("model_id", raw.get("model"))
        action = raw.get("action", "promote")
        reason = raw.get("reason")
        source = raw.get("source", "advisory")
        if not all(
            isinstance(item, str) and item
            for item in (task_family, model_id, action, reason, source)
        ):
            raise ValueError("recommendation fields must be non-empty strings")
        if action not in {"incumbent", "avoid", "promote", "rollback"}:
            raise ValueError("unsupported recommendation action")
        if source not in {"advisory", "measured"}:
            raise ValueError("recommendation source must be advisory or measured")
        assert isinstance(task_family, str)
        assert isinstance(model_id, str)
        assert isinstance(action, str)
        assert isinstance(reason, str)
        assert isinstance(source, str)
        recommendations.append(
            Recommendation(task_family, model_id, action, reason, source)
        )
    return PolicySnapshot(
        revision=revision,
        catalog_revision=catalog_revision,
        incumbents=MappingProxyType(incumbents),
        recommendations=tuple(recommendations),
    )


def _values(meta: Mapping[str, Any], key: str) -> frozenset[str]:
    value = meta.get(key) or []
    if isinstance(value, Mapping):
        return frozenset(str(item) for item, enabled in value.items() if enabled)
    if isinstance(value, (list, tuple, set, frozenset)):
        return frozenset(str(item) for item in value)
    return frozenset()


def _automatic(meta: Mapping[str, Any]) -> bool:
    if any(
        meta.get(key) is True
        for key in (
            "hidden",
            "alpha",
            "fallback",
            "is_fallback",
            "fallbackOnly",
            "fallback_only",
        )
    ):
        return False
    status = str(meta.get("status") or meta.get("stage") or "").lower()
    return status not in {"alpha", "hidden", "fallback"}


def _free(meta: Mapping[str, Any]) -> bool:
    pricing = meta.get("pricing") or {}
    if not isinstance(pricing, Mapping):
        return True
    # Preserve existing semantics: absent/zero prompt and completion prices are free.
    return not any(
        isinstance(pricing.get(key), (int, float)) and pricing[key] > 0
        for key in ("prompt", "completion")
    )


def is_compatible(
    model_id: str,
    meta: Mapping[str, Any],
    request: SelectionRequest,
    *,
    automatic: bool = True,
) -> bool:
    """Apply metadata compatibility and request-local access constraints."""
    if (
        request.eligible_model_ids is not None
        and model_id not in request.eligible_model_ids
    ):
        return False
    if automatic and not _automatic(meta):
        return False
    if not request.paid and not _free(meta):
        return False
    if request.modality not in _values(meta, "modalities") and request.modality != str(
        meta.get("category") or ""
    ):
        return False
    if request.endpoint and request.endpoint not in _values(
        meta, "supported_endpoints"
    ):
        return False
    if not request.required_capabilities <= _values(meta, "capabilities"):
        return False
    if not request.input_modalities <= _values(meta, "input_modalities"):
        return False
    return request.output_modalities <= _values(meta, "output_modalities")


def eligible_models(
    catalog: Mapping[str, Mapping[str, Any]], request: SelectionRequest
) -> tuple[str, ...]:
    return tuple(
        sorted(
            model_id
            for model_id, meta in catalog.items()
            if is_compatible(model_id, meta, request)
        )
    )


def select_model(
    catalog: Mapping[str, Mapping[str, Any]],
    policy: PolicySnapshot,
    request: SelectionRequest,
    *,
    catalog_revision: str,
) -> str | None:
    """Select pin, revision-valid recommendation, or stable incumbent.

    The function never infers quality. Recommendations are accepted only for the
    exact catalog revision reviewed by the trusted authority.
    """
    if request.pinned_model is not None:
        meta = catalog.get(request.pinned_model)
        if meta is None or not is_compatible(
            request.pinned_model, meta, request, automatic=False
        ):
            return None
        return request.pinned_model

    eligible = eligible_models(catalog, request)
    if not eligible:
        return None
    family_recommendations = tuple(
        item
        for item in policy.recommendations
        if item.task_family == request.task_family
    )
    avoided = {
        item.model_id for item in family_recommendations if item.action == "avoid"
    }
    allowed = tuple(model_id for model_id in eligible if model_id not in avoided)
    if not allowed:
        return None
    incumbent = policy.incumbents.get(request.task_family)
    if incumbent not in allowed:
        incumbent = None

    if policy.catalog_revision == catalog_revision:
        matching = [
            item
            for item in family_recommendations
            if item.model_id in allowed
            and item.action in {"incumbent", "promote", "rollback"}
        ]
        if matching:
            # Authority emits at most one decision per family/revision; reject ambiguity.
            unique = {(item.action, item.model_id) for item in matching}
            if len(unique) == 1:
                return matching[0].model_id

    # Unknown/new models do not displace an incumbent without reviewed evidence.
    return incumbent or allowed[0]


def comparable_price(
    left: Mapping[str, Any], right: Mapping[str, Any]
) -> tuple[float, float, str] | None:
    """Return prices only when both declare the same dimension and unit."""
    left_price = left.get("pricing")
    right_price = right.get("pricing")
    if not isinstance(left_price, Mapping) or not isinstance(right_price, Mapping):
        return None
    left_unit = left_price.get("unit")
    right_unit = right_price.get("unit")
    if not isinstance(left_unit, str) or left_unit != right_unit:
        return None
    for dimension in ("completion", "prompt", "price"):
        left_value = left_price.get(dimension)
        right_value = right_price.get(dimension)
        if isinstance(left_value, (int, float)) and isinstance(
            right_value, (int, float)
        ):
            return float(left_value), float(right_value), left_unit
    return None
