from __future__ import annotations

import asyncio
import logging
import re
from typing import Any

import httpx

from polli_agent.config import settings

logger = logging.getLogger(__name__)

_registry_cache: dict[str, Any] | None = None
_lock = asyncio.Lock()
_METADATA_KEYS = {
    "id",
    "object",
    "owned_by",
    "capabilities",
    "pricing",
    "created",
    "input_modalities",
    "output_modalities",
    "supported_endpoints",
    "context_length",
}

_END_MAP = {
    "text": "/v1/chat/completions",
    "image": "/image/{prompt}",
    "video": "/video/{prompt}",
    "audio": "/audio/{text}",
    "transcript": "/audio",
}

_TIER_PRIORITY = {
    "fast": ["fast", "lite", "flash", "turbo", "small", "mini"],
    "balanced": [],
    "quality": ["quality", "hd", "pro", "opus", "large", "deep", "v4"],
}

_TIER_COST_WEIGHT = {
    "fast": 1.0,
    "balanced": 2.0,
    "quality": 3.5,
}

_IMAGE_TEXT_PATTERNS = [
    re.compile(p, re.I)
    for p in [
        r"\b(text|typo|font|letter|word|label|title|heading|caption|infographic|diagram|chart|graph|flowchart|mindmap|timeline|poster|banner|sign|badge|sticker|meme|comic|panel|speech.bubble|.subtitle|.overlay)\b",
        r"\b(render.*text|text.*render|legible|readable|typography)\b",
        r"\b(draw.*with.*text|text.*in.*image|image.*with.*text)\b",
    ]
]


async def _resolve_api_key() -> str:
    try:
        from polli_agent.config import _current_api_key

        return _current_api_key() or settings.openai_api_key
    except Exception:
        return settings.openai_api_key


def _tier_score(mid: str, meta: dict[str, Any], tier: str) -> float:
    name = mid.lower()
    hints = _TIER_PRIORITY.get(tier, [])
    score = 0.0
    for hint in hints:
        if hint in name:
            score += 10.0
    owned = (meta.get("owned_by") or "").lower()
    if owned == "pollinations-ai":
        score += 5.0
    caps = meta.get("capabilities") or {}
    cap_count = sum(1 for v in caps.values() if v)
    score += cap_count * 2.0
    ctx = meta.get("context_length")
    if isinstance(ctx, int) and ctx > 0:
        score += min(ctx / 100000, 5.0)
    pricing = meta.get("pricing") or {}
    completion = float(pricing.get("completion", 0) or 0)
    prompt_p = float(pricing.get("prompt", 0) or 0)
    cost = (completion + prompt_p) / 2 if (completion or prompt_p) else None
    if cost is not None:
        target = _TIER_COST_WEIGHT.get(tier, 2.0)
        score += max(0.0, -abs(cost - target) * 100)
    return score


def _infer_meta(item: dict[str, Any]) -> dict[str, Any]:
    mid = item.get("id", "")
    owned = (item.get("owned_by") or "").lower()
    caps = item.get("capabilities", {}) or {}
    modalities: list[str] = []
    if any(
        k in owned
        for k in ["audio", "tts", "eleven", "qwen-tts", "eleven-multilingual"]
    ) or any(k in mid for k in ["tts", "elevenlabs", "elevenflash", "qwen-tts"]):
        modalities.append("audio")
    if any(
        k in owned
        for k in ["transcribe", "scrib", "whisper", "universal-2", "universal-3-pro"]
    ) or any(k in mid for k in ["whisper", "scribe", "universal-2", "universal-3-pro"]):
        modalities.append("transcript")
    if any(k in owned for k in ["image", "pollen"]) or any(
        k in mid
        for k in [
            "flux",
            "seedream",
            "ideogram",
            "gptimage",
            "nanobanana",
            "qwen-image",
            "grok-imagine",
            "p-image",
            "nova-canvas",
            "zimage",
            "wan-image",
            "klein",
        ]
    ):
        modalities.append("image")
    if any(k in owned for k in ["video"]) or any(
        k in mid
        for k in ["wan", "veo", "seedance", "grok-video", "ltx", "p-video", "nova-reel"]
    ):
        modalities.append("video")
    if "embed" in owned or "embedding" in mid:
        modalities.append("embedding")
    if (
        not modalities
        or any(
            k in owned
            for k in [
                "text",
                "openai",
                "anthropic",
                "google",
                "mistral",
                "deepseek",
                "grok",
                "meta",
                "alibaba",
                "xai",
                "minimax",
                "step",
                "mercury",
            ]
        )
        or any(
            k in mid
            for k in [
                "gpt",
                "claude",
                "gemini",
                "openai",
                "mistral",
                "deepseek",
                "grok",
                "llama",
                "qwen",
                "polli",
                "perplexity",
                "kimi",
                "nova",
                "glm",
                "minimax",
                "step",
                "mercury",
            ]
        )
    ):
        pass
    if not modalities:
        modalities.append("text")

    # Normalize endpoint metadata from live API
    supported_endpoints = list(item.get("supported_endpoints") or [])
    input_modalities = list(item.get("input_modalities") or [])
    output_modalities = list(item.get("output_modalities") or [])
    voices = list(item.get("voices") or [])
    context_length = item.get("context_length")

    # Fix incorrect endpoint metadata from upstream
    if "video" in modalities and "/video/{prompt}" not in supported_endpoints:
        supported_endpoints.append("/video/{prompt}")
    if "audio" in modalities and "/audio/{text}" not in supported_endpoints:
        supported_endpoints.append("/audio/{text}")
    if "transcript" in modalities and "/audio" not in supported_endpoints:
        supported_endpoints.append("/audio")

    pricing = item.get("pricing") or {}
    params: dict[str, Any] = {}
    for key, val in item.items():
        if key in _METADATA_KEYS:
            continue
        params[key] = val
    return {
        "id": mid,
        "modalities": modalities,
        "pricing": pricing,
        "capabilities": caps,
        "params": params,
        "supported_endpoints": supported_endpoints,
        "input_modalities": input_modalities,
        "output_modalities": output_modalities,
        "voices": voices,
        "context_length": context_length,
    }


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
        try:
            async with httpx.AsyncClient(timeout=30) as client:
                r = await client.get(f"{base}/v1/models", headers=headers)
                r.raise_for_status()
                raw = r.json()
        except Exception as exc:
            logger.warning("Failed to fetch /v1/models: %s", exc)
            raw = {"data": []}
        _registry_cache = _normalize(raw)
        return _registry_cache


def get_model_catalog() -> dict[str, dict[str, Any]]:
    reg = _registry_cache or {}
    return reg.get("models", {})


def get_modalities_for_model(model_id: str) -> list[str]:
    reg = _registry_cache or {}
    model = reg.get("models", {}).get(model_id, {})
    return model.get("modalities", [])


def get_model_params(model_id: str) -> dict[str, Any]:
    reg = _registry_cache or {}
    model = reg.get("models", {}).get(model_id, {})
    return dict(model.get("params", {}))


def get_model_meta(model_id: str) -> dict[str, Any]:
    reg = _registry_cache or {}
    return reg.get("models", {}).get(model_id, {})


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


def _is_free_model(meta: dict[str, Any]) -> bool:
    pricing = meta.get("pricing") or {}
    completion = float(pricing.get("completion", 0) or 0)
    prompt_p = float(pricing.get("prompt", 0) or 0)
    if completion > 0 or prompt_p > 0:
        return False
    return True


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


def pick_model(
    modality: str, tier: str = "balanced", prompt: str = "", paid: bool = True
) -> str:
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

    # Filter by endpoint availability
    endpoint = _END_MAP.get(modality)
    if endpoint:
        pool = {
            mid: meta
            for mid, meta in pool.items()
            if endpoint in (meta.get("supported_endpoints") or [])
        }
    if not pool:
        return ""

    # Filter paid models when paid=False (free-only mode)
    if not paid:
        pool = {mid: meta for mid, meta in pool.items() if _is_free_model(meta)}
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
