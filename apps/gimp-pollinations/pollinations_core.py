#!/usr/bin/env python3
"""Pure-Python settings, model ranking and fallback policy for Pollinations GIMP."""
from __future__ import annotations

import json
import math
import os
import tempfile
from dataclasses import asdict, dataclass, fields
from pathlib import Path
from typing import Iterable, Mapping


@dataclass
class Settings:
    language: str = "system"
    generation_model: str = "auto"
    generation_fallback_model: str = "auto"
    edit_model: str = "auto"
    edit_fallback_model: str = "auto"
    advisor_model: str = "auto"
    advisor_fallback_model: str = "auto"
    advisor_enabled: bool = True
    default_destination: str = "image"
    auto_recommend_model: bool = True
    prefer_quest_models: bool = True
    fallback_enabled: bool = True
    fallback_mode: str = "ask"  # ask | automatic | off
    allow_manual_auto_fallback: bool = False
    review_with_context: bool = False
    show_model_descriptions: bool = True
    prefer_official_models: bool = True
    include_community_models: bool = True
    health_window_minutes: int = 60
    preserve_original: bool = True
    group_separation_outputs: bool = True
    context_padding_percent: int = 40
    rmbg_provider: str = "clearbackdrop"  # clearbackdrop | off
    rmbg_use_in_separation: bool = True
    onboarding_done: bool = False
    # Kept for migration from the first prototype. New UI uses onboarding_done.
    first_run_done: bool = False


class SettingsStore:
    def __init__(self, path: str | os.PathLike[str]):
        self.path = Path(path)

    def exists(self) -> bool:
        return self.path.exists()

    def load(self) -> Settings:
        try:
            raw = json.loads(self.path.read_text(encoding="utf-8"))
        except (OSError, ValueError, TypeError):
            return Settings()
        if not isinstance(raw, dict):
            return Settings()
        allowed = {f.name for f in fields(Settings)}
        clean = {k: v for k, v in raw.items() if k in allowed}
        settings = Settings(**clean)
        settings.context_padding_percent = max(0, min(200, int(settings.context_padding_percent)))
        settings.health_window_minutes = max(5, min(10080, int(settings.health_window_minutes)))
        if settings.default_destination not in {"image", "layer"}:
            settings.default_destination = "image"
        if settings.fallback_mode not in {"ask", "automatic", "off"}:
            settings.fallback_mode = "ask"
        if settings.rmbg_provider not in {"clearbackdrop", "off"}:
            settings.rmbg_provider = "clearbackdrop"
        if settings.first_run_done and "onboarding_done" not in raw:
            settings.onboarding_done = True
        return settings

    def save(self, settings: Settings) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
        try:
            os.chmod(self.path.parent, 0o700)
        except OSError:
            pass
        fd, temp_path = tempfile.mkstemp(prefix=".settings-", dir=self.path.parent)
        try:
            with os.fdopen(fd, "w", encoding="utf-8") as handle:
                json.dump(asdict(settings), handle, ensure_ascii=False, indent=2)
                handle.write("\n")
                handle.flush()
                os.fsync(handle.fileno())
            os.chmod(temp_path, 0o600)
            os.replace(temp_path, self.path)
            os.chmod(self.path, 0o600)
        finally:
            try:
                os.unlink(temp_path)
            except FileNotFoundError:
                pass


# Task-quality hints only. Availability, pricing/access, modalities and health are
# live. This mirrors the OpenCode Pollinations plugin's registry + small patches.
_IMAGE_HINTS = {
    "generation": {
        "flux": 20,
        "zimage": 18,
        "klein": 16,
        "gptimage": 13,
        "gptimage-large": 12,
        "gpt-image-2": 11,
        "nova-canvas": 9,
    },
    "edit": {
        "kontext": 22,
        "p-image-edit": 20,
        "nova-canvas": 19,
        "klein": 17,
        "gptimage": 16,
        "gptimage-large": 16,
        "flux-2-flex": 15,
        "gpt-image-2": 14,
    },
    "context": {
        "kontext": 24,
        "nova-canvas": 23,
        "p-image-edit": 21,
        "klein": 18,
        "gptimage-large": 17,
        "gptimage": 16,
        "flux-2-flex": 16,
        "gpt-image-2": 15,
    },
    "separate": {
        "kontext": 25,
        "nova-canvas": 24,
        "p-image-edit": 22,
        "gptimage-large": 19,
        "gptimage": 18,
        "klein": 17,
        "gpt-image-2": 15,
    },
}


def _flat_model_cost(model) -> float | None:
    # completionImageTokens is a per-image price only for flat-rate image models.
    if not getattr(model, "flat_rate", False):
        return None
    pricing = getattr(model, "pricing", {}) or {}
    try:
        value = float(pricing.get("completionImageTokens"))
        return value if value >= 0 else None
    except (TypeError, ValueError):
        return None


def _health_adjustment(health) -> float:
    if health is None:
        return 0.0
    status = getattr(health, "status", "unknown")
    if status == "off":
        return -1000.0
    if status == "degraded":
        return -90.0
    score = 0.0
    if getattr(health, "low_sample", False):
        score -= 1.0
    p50 = getattr(health, "latency_p50_ms", None)
    if isinstance(p50, (int, float)) and p50 > 0:
        if p50 <= 5000:
            score += 5
        elif p50 <= 10000:
            score += 2
        elif p50 <= 20000:
            score -= 3
        elif p50 <= 40000:
            score -= 9
        else:
            score -= 18
    # Tail latency matters more for an interactive editor than a good median.
    # A model with a 400ms p50 but 50s p95 must not become the default merely
    # because most requests are fast.
    p95 = getattr(health, "latency_p95_ms", None)
    if isinstance(p95, (int, float)) and p95 > 0:
        if p95 > 45000:
            score -= 32
        elif p95 > 30000:
            score -= 22
        elif p95 > 15000:
            score -= 12
        elif p95 > 8000:
            score -= 4
    error_rate = getattr(health, "error_rate_pct", None)
    if isinstance(error_rate, (int, float)):
        score -= min(20.0, error_rate * 1.5)
    return score


def image_model_score(
    model,
    task: str,
    *,
    prefer_official: bool = True,
    prefer_quest: bool = True,
    health=None,
) -> float:
    if task in {"edit", "context", "separate"} and not getattr(model, "supports_edit", False):
        return -10_000.0
    score = float(_IMAGE_HINTS.get(task, {}).get(getattr(model, "name", ""), 0))
    desc = (getattr(model, "description", "") or "").lower()
    community = bool(getattr(model, "community", False))
    paid = bool(getattr(model, "paid_only", False))
    if prefer_official and not community:
        score += 5
    if community:
        score -= 1
    if prefer_quest:
        score += 5 if not paid else -14
    refs = getattr(model, "max_reference_images", None)
    if task in {"edit", "context", "separate"} and refs:
        score += min(int(refs), 5) * 0.5
    words = {
        "generation": ("prompt following", "high-quality", "high-fidelity", "photoreal", "typography", "fast"),
        "edit": ("editing", "edit", "instruction", "reference"),
        "context": ("inpainting", "editing", "instruction", "context"),
        "separate": ("inpainting", "editing", "transparent", "background", "instruction"),
    }.get(task, ())
    score += sum(1.5 for word in words if word in desc)
    cost = _flat_model_cost(model)
    if cost is not None and cost > 0:
        score -= max(0.0, math.log10(cost * 1000 + 1) * 0.7)
    score += _health_adjustment(health)
    return score


def sorted_image_models(
    models: Iterable,
    task: str,
    *,
    prefer_official: bool = True,
    prefer_quest: bool = True,
    include_community: bool = True,
    health_by_name: Mapping[str, object] | None = None,
    exclude: Iterable[str] = (),
):
    excluded = set(exclude)
    pool = [
        m for m in models
        if getattr(m, "name", "") not in excluded
        and (include_community or not getattr(m, "community", False))
    ]
    if task in {"edit", "context", "separate"}:
        pool = [m for m in pool if getattr(m, "supports_edit", False)]
    health_by_name = health_by_name or {}
    return sorted(
        pool,
        key=lambda m: (
            -image_model_score(
                m,
                task,
                prefer_official=prefer_official,
                prefer_quest=prefer_quest,
                health=health_by_name.get(getattr(m, "name", "")),
            ),
            (getattr(m, "title", "") or getattr(m, "name", "")).lower(),
        ),
    )


def pick_image_model(models: Iterable, task: str, configured: str, settings: Settings, health_by_name=None):
    pool = list(models)
    if configured and configured != "auto":
        chosen = next((m for m in pool if getattr(m, "name", None) == configured), None)
        if chosen is not None and (task == "generation" or getattr(chosen, "supports_edit", False)):
            return chosen
    ranked = sorted_image_models(
        pool,
        task,
        prefer_official=settings.prefer_official_models,
        prefer_quest=settings.prefer_quest_models,
        include_community=settings.include_community_models,
        health_by_name=health_by_name,
    )
    return ranked[0] if ranked else None


def pick_image_fallback(models: Iterable, task: str, configured: str, primary, settings: Settings, health_by_name=None):
    pool = list(models)
    primary_name = getattr(primary, "name", "") if primary else ""
    if configured and configured != "auto" and configured != primary_name:
        chosen = next((m for m in pool if getattr(m, "name", None) == configured), None)
        chosen_health = (health_by_name or {}).get(configured)
        if (
            chosen is not None
            and getattr(chosen_health, "status", None) != "off"
            and (task == "generation" or getattr(chosen, "supports_edit", False))
        ):
            return chosen
    ranked = sorted_image_models(
        pool,
        task,
        prefer_official=settings.prefer_official_models,
        prefer_quest=settings.prefer_quest_models,
        include_community=settings.include_community_models,
        health_by_name=health_by_name,
        exclude={primary_name},
    )
    return ranked[0] if ranked else None


_ADVISOR_HINTS = {
    "gpt-5.6-luna": 12,
    "z-ai/glm-5.3-flash": 11,
    "google/gemini-3.8-flash": 10,
    "openai": 9,
    "muse-glimmer": 8,
}
_STABLE_ADVISOR_OWNERS = {"OpenAI", "Z.ai", "Google", "Meta", "Anthropic", "Alibaba", "Mistral", "Cohere", "xAI"}


def advisor_model_score(model, health=None) -> float:
    inputs = set(getattr(model, "input_modalities", ()) or ())
    outputs = set(getattr(model, "output_modalities", ()) or ())
    if "image" not in inputs or "text" not in outputs or not getattr(model, "tools", False):
        return -10_000.0
    raw_name = getattr(model, "id", "")
    name = raw_name.lower()
    score = 10.0 + _ADVISOR_HINTS.get(raw_name, 0)
    owner = getattr(model, "owned_by", "") or ""
    if owner in _STABLE_ADVISOR_OWNERS:
        score += 5
    elif "/" in raw_name and owner:
        score -= 3
    if any(tag in name for tag in ("flash", "luna", "mini", "muse-glimmer")):
        score += 4
    if getattr(model, "reasoning", False):
        score += 1
    if getattr(model, "paid_only", False):
        score -= 5
    pricing = getattr(model, "pricing", {}) or {}
    try:
        out_cost = float(pricing.get("completionTextTokens", 0) or 0)
        if out_cost > 0:
            score -= min(4.0, math.log10(out_cost * 1e9 + 1) * 0.8)
    except (TypeError, ValueError):
        pass
    score += _health_adjustment(health)
    return score


def sorted_advisor_models(models: Iterable, health_by_name: Mapping[str, object] | None = None, exclude: Iterable[str] = ()):
    health_by_name = health_by_name or {}
    excluded = set(exclude)
    return sorted(
        [m for m in models if getattr(m, "id", "") not in excluded and advisor_model_score(m, health_by_name.get(getattr(m, "id", ""))) > -1000],
        key=lambda m: (-advisor_model_score(m, health_by_name.get(getattr(m, "id", ""))), getattr(m, "id", "")),
    )


def pick_advisor_model(models: Iterable, configured: str, health_by_name=None):
    pool = list(models)
    if configured and configured != "auto":
        chosen = next((m for m in pool if getattr(m, "id", None) == configured), None)
        if chosen is not None and advisor_model_score(chosen) > -1000:
            return chosen
    ranked = sorted_advisor_models(pool, health_by_name)
    return ranked[0] if ranked else None


def pick_advisor_fallback(models: Iterable, configured: str, primary, health_by_name=None):
    pool = list(models)
    primary_id = getattr(primary, "id", "") if primary else ""
    if configured and configured != "auto" and configured != primary_id:
        chosen = next((m for m in pool if getattr(m, "id", None) == configured), None)
        if chosen is not None and advisor_model_score(chosen) > -1000:
            return chosen
    ranked = sorted_advisor_models(pool, health_by_name, exclude={primary_id})
    return ranked[0] if ranked else None


# The canonical Pollinations image endpoint accepts width/height 256..4096.
# These are ergonomic presets, not a hardcoded model capability list.
ASPECT_PRESETS = (
    ("1:1", 1024, 1024),
    ("4:3", 1152, 864),
    ("3:4", 864, 1152),
    ("3:2", 1216, 832),
    ("2:3", 832, 1216),
    ("16:9", 1344, 768),
    ("9:16", 768, 1344),
)


def validate_dimensions(width: int, height: int) -> tuple[int, int]:
    return max(256, min(4096, int(width))), max(256, min(4096, int(height)))
