from __future__ import annotations

import asyncio
import logging
import re
from typing import Any

import httpx

from weaver.config import settings

logger = logging.getLogger(__name__)

_registry_cache: dict[str, Any] | None = None
_lock = asyncio.Lock()

_TIER_PRIORITY = {
    "fast": ["fast", "lite", "flash", "turbo", "small", "mini"],
    "balanced": [],
    "quality": ["quality", "hd", "pro", "opus", "large", "deep", "v4"],
}

_IMAGE_TEXT_PATTERNS = [
    re.compile(p, re.IGNORECASE)
    for p in [
        r"\b(text|typo|font|letter|word|label|title|heading|caption|infographic|diagram|chart|graph|flowchart|mindmap|timeline|poster|banner|sign|badge|sticker|meme|comic|panel|speech.bubble|.subtitle|.overlay)\b",
        r"\b(render.*text|text.*render|legible|readable|typography)\b",
        r"\b(draw.*with.*text|text.*in.*image|image.*with.*text)\b",
    ]
]


async def _resolve_api_key() -> str:
    from weaver.config import resolve_api_key

    return resolve_api_key()


def _tier_score(mid: str, meta: dict[str, Any], tier: str) -> float:
    name = mid.lower()
    hints = _TIER_PRIORITY.get(tier, [])
    score = sum(10.0 for hint in hints if hint in name)
    ctx = meta.get("context_length")
    if isinstance(ctx, int) and ctx > 0:
        score += min(ctx / 100000, 5.0)
    return score


def _model_modalities(item: dict[str, Any]) -> list[str]:
    """Map the gateway contract to the tool categories Weaver can call."""
    inputs = set(item.get("input_modalities") or [])
    outputs = set(item.get("output_modalities") or [])
    endpoints = set(item.get("supported_endpoints") or [])
    modalities: list[str] = []

    if "/v1/chat/completions" in endpoints:
        modalities.append("text")
    if "/image/{prompt}" in endpoints:
        if "image" in outputs:
            modalities.append("image")
        if "video" in outputs:
            modalities.append("video")
    if (
        "text" in inputs
        and "audio" in outputs
        and endpoints.intersection({"/v1/chat/completions", "/audio/{text}"})
    ):
        modalities.append("audio")
    if (
        "audio" in inputs
        and "text" in outputs
        and endpoints.intersection({"/v1/chat/completions", "/audio/{text}"})
    ):
        modalities.append("transcript")
    if "embedding" in outputs and "/v1/embeddings" in endpoints:
        modalities.append("embedding")

    return modalities


def _infer_meta(item: dict[str, Any]) -> dict[str, Any]:
    return {**item, "modalities": _model_modalities(item)}


def _normalize(raw: dict[str, Any]) -> dict[str, Any]:
    models: dict[str, dict[str, Any]] = {}
    by_modality: dict[str, dict[str, dict[str, Any]]] = {}
    for item in raw.get("data", []):
        mid = item.get("id", "")
        if not mid:
            continue
        meta = _infer_meta(item)
        models[mid] = meta
        for mod in meta.get("modalities", []):
            by_modality.setdefault(mod, {})[mid] = meta
    return {"models": models, "by_modality": by_modality}


async def get_registry() -> dict[str, Any]:
    global _registry_cache
    if _registry_cache is not None:
        return _registry_cache
    async with _lock:
        if _registry_cache is not None:
            return _registry_cache
        key = await _resolve_api_key()
        base = settings.openai_base_url.rstrip("/")
        headers = {"Authorization": f"Bearer {key}"} if key else {}
        async with httpx.AsyncClient(timeout=30) as client:
            r = await client.get(f"{base}/v1/models", headers=headers)
            r.raise_for_status()
            raw = r.json()
        _registry_cache = _normalize(raw)
        return _registry_cache


def get_model_catalog() -> dict[str, dict[str, Any]]:
    reg = _registry_cache or {}
    return reg.get("models", {})


def get_voices() -> list[str]:
    reg = _registry_cache or {}
    audio_models = reg.get("by_modality", {}).get("audio", {})
    voices: set[str] = set()
    for meta in audio_models.values():
        for v in meta.get("voices", []):
            voices.add(v)
    return sorted(voices) if voices else ["nova"]


def _prompt_needs_text_image(prompt: str) -> bool:
    return any(p.search(prompt) for p in _IMAGE_TEXT_PATTERNS)


# Prompt-aware image model priority for text-heavy/infographic/diagram prompts
# Ordered: best text rendering → good text → fast/cost-effective → general quality
_IMAGE_TEXT_PRIORITY: list[str] = [
    "ideogram-v4-quality",
    "ideogram-v4-balanced",
    "ideogram-v4-turbo",
    "gptimage-large",
    "gpt-image-2",
    "gptimage",
    "nanobanana-2-lite",
    "nanobanana-2",
    "nanobanana-pro",
    "nanobanana",
    "seedream-pro",
    "seedream5",
    "seedream",
    "flux",
    "qwen-image",
    "grok-imagine-pro",
    "grok-imagine",
    "zimage",
    "p-image",
    "nova-canvas",
    "klein",
    "wan-image",
    "wan-image-pro",
    "p-image-edit",
    "kontext",
]


async def warm_registry() -> None:
    if _registry_cache is None:
        await get_registry()


def pick_model(modality: str, tier: str = "balanced", prompt: str = "") -> str:
    if _registry_cache is None:
        try:
            loop = asyncio.get_event_loop()
            if loop.is_running():
                logger.warning(
                    "pick_model called in running event loop with empty cache; returning empty model"
                )
                return ""
            loop.run_until_complete(get_registry())
        except RuntimeError:
            logger.warning(
                "pick_model called without event loop; returning empty model"
            )
            return ""
    catalog = (_registry_cache or {}).get("by_modality", {})
    pool = catalog.get(modality, {})
    if not pool:
        return ""

    # Image-specific: prompt-aware priority for text/infographic/diagram
    if modality == "image" and prompt and _prompt_needs_text_image(prompt):
        for model_id in _IMAGE_TEXT_PRIORITY:
            if model_id in pool:
                return model_id

    scored = []
    for mid, meta in pool.items():
        score = _tier_score(mid, meta, tier)
        scored.append((score, mid))
    scored.sort(reverse=True)
    return scored[0][1] if scored else ""
