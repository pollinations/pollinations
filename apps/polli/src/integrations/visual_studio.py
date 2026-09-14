"""React/Tailwind screenshot renderer client for Polli visual studio."""

from __future__ import annotations

import asyncio
import base64
import io
import json
import logging
import os
import zipfile
from typing import Any

import httpx

from ..ai.client import pollinations_client
from ..ai.complexity import model_for_complexity

logger = logging.getLogger(__name__)

MAX_PROMPT_CHARS = 4_000
MAX_JSX_CHARS = 20_000
MAX_DATA_CHARS = 12_000
MAX_PNG_BYTES = 20 * 1024 * 1024
MAX_IMAGES = 10
MAX_METADATA_BYTES = 64 * 1024
MAX_RESPONSE_BYTES = MAX_PNG_BYTES * MAX_IMAGES + MAX_METADATA_BYTES
DEFAULT_VIEWPORT_WIDTH = 1440
DEFAULT_VIEWPORT_HEIGHT = 900
MIN_VIEWPORT_WIDTH = 320
MAX_VIEWPORT_WIDTH = 3840
MIN_VIEWPORT_HEIGHT = 240
MAX_VIEWPORT_HEIGHT = 2160
RENDER_TIMEOUT_SECONDS = 35
POLLI_STUDIO_SOCKET = os.environ.get("POLLI_STUDIO_SOCKET", "/run/polli-studio/renderer.sock")
_RENDER_SLOTS = asyncio.Semaphore(2)

SYSTEM_PROMPT = """Create one polished, self-contained React component for a screenshot.
Use only React JSX and literal Tailwind utility classes. Do not use imports, exports, hooks,
network requests, external images, SVG URLs, script tags, iframe, forms, or markdown fences.
Define `function Visual()` that returns the component. Use lucide-react icons exposed as `Icons`.
The supplied data is trusted display data; keep it visible, factual, responsive, and accessible.
Do not construct Tailwind class names dynamically. Return source code only."""


def _clean_source(source: str) -> str:
    source = source.strip()
    if source.startswith("```"):
        source = source.split("\n", 1)[1] if "\n" in source else ""
        if source.rstrip().endswith("```"):
            source = source.rstrip()[:-3]
    if len(source) > MAX_JSX_CHARS:
        raise ValueError(f"Visual source exceeds {MAX_JSX_CHARS} characters.")
    forbidden = (
        "import ",
        "export ",
        "require(",
        "fetch(",
        "xmlhttprequest",
        "<script",
        "<iframe",
        "<form",
        "javascript:",
    )
    if any(token in source.lower() for token in forbidden):
        raise ValueError("Visual source contains a disallowed browser capability.")
    if "function Visual" not in source:
        raise ValueError("Visual source must define function Visual().")
    return source


def _viewport(options: dict[str, Any]) -> tuple[int, int]:
    def dimension(name: str, default: int, minimum: int, maximum: int) -> int:
        value = options.get(name, default)
        if isinstance(value, bool) or not isinstance(value, int):
            raise ValueError(f"Visual {name} must be an integer.")
        if not minimum <= value <= maximum:
            raise ValueError(f"Visual {name} must be between {minimum} and {maximum}px.")
        return value

    return (
        dimension("viewport_width", DEFAULT_VIEWPORT_WIDTH, MIN_VIEWPORT_WIDTH, MAX_VIEWPORT_WIDTH),
        dimension("viewport_height", DEFAULT_VIEWPORT_HEIGHT, MIN_VIEWPORT_HEIGHT, MAX_VIEWPORT_HEIGHT),
    )


async def _generate_source(prompt: str, data: Any, complexity: str | None) -> str:
    if len(prompt) > MAX_PROMPT_CHARS:
        raise ValueError(f"Visual prompt exceeds {MAX_PROMPT_CHARS} characters.")
    serialized_data = json.dumps(data, ensure_ascii=False)
    if len(serialized_data) > MAX_DATA_CHARS:
        raise ValueError(f"Visual data exceeds {MAX_DATA_CHARS} characters.")
    result = await pollinations_client.generate_text(
        system_prompt=SYSTEM_PROMPT,
        user_prompt=f"Request:\n{prompt}\n\nData:\n{serialized_data}",
        model=model_for_complexity(complexity),
        temperature=0.25,
        max_tokens=4_000,
    )
    if not result:
        raise ValueError("Visual studio model returned no JSX.")
    return _clean_source(result)


def _decode_response(content: bytes) -> tuple[list[io.BytesIO], dict[str, Any]]:
    if len(content) > MAX_RESPONSE_BYTES:
        raise ValueError("Visual studio worker output is too large.")
    try:
        with zipfile.ZipFile(io.BytesIO(content)) as archive:
            entries = archive.infolist()
            names = [entry.filename for entry in entries]
            expected = ["metadata.json", *[f"visual-{index}.png" for index in range(1, len(entries))]]
            if names != expected or len(entries) > MAX_IMAGES + 1:
                raise ValueError("Visual studio worker returned invalid archive names.")
            if any(entry.compress_type != zipfile.ZIP_STORED for entry in entries):
                raise ValueError("Visual studio worker returned compressed output.")
            limits = [MAX_METADATA_BYTES, *([MAX_PNG_BYTES] * (len(entries) - 1))]
            if any(entry.file_size > limit for entry, limit in zip(entries, limits, strict=True)):
                raise ValueError("Visual studio worker output is too large.")
            if sum(entry.file_size for entry in entries) > MAX_RESPONSE_BYTES:
                raise ValueError("Visual studio worker output is too large.")
            metadata = json.loads(archive.read("metadata.json"))
            images = []
            for index in range(1, len(entries)):
                image = archive.read(f"visual-{index}.png")
                if not image.startswith(b"\x89PNG\r\n\x1a\n"):
                    raise ValueError("Visual studio worker returned an invalid image.")
                images.append(io.BytesIO(image))
    except (OSError, zipfile.BadZipFile, json.JSONDecodeError) as exc:
        raise ValueError("Visual studio worker returned invalid output.") from exc
    image_metadata = metadata.get("images") if isinstance(metadata, dict) else None
    if not isinstance(image_metadata, list) or len(images) != len(image_metadata) or not images:
        raise ValueError("Visual studio worker returned invalid image metadata.")
    return images, metadata


async def _render_isolated(
    source: str, viewport_width: int, viewport_height: int
) -> tuple[list[io.BytesIO], dict[str, Any]]:
    """Ask the dedicated networkless renderer worker via its Unix socket."""
    transport = httpx.AsyncHTTPTransport(uds=POLLI_STUDIO_SOCKET)
    timeout = httpx.Timeout(RENDER_TIMEOUT_SECONDS, connect=5)
    try:
        async with httpx.AsyncClient(transport=transport, timeout=timeout) as client:
            async with client.stream(
                "POST",
                "http://polli-studio/render",
                json={"source": source, "width": viewport_width, "height": viewport_height},
            ) as response:
                if response.status_code == 429:
                    raise ValueError("Visual studio is busy; try again shortly.")
                if response.status_code != 200:
                    raise ValueError("Visual studio is unavailable: renderer worker rejected the request.")
                chunks: list[bytes] = []
                size = 0
                async for chunk in response.aiter_bytes():
                    size += len(chunk)
                    if size > MAX_RESPONSE_BYTES:
                        raise ValueError("Visual studio worker output is too large.")
                    chunks.append(chunk)
    except httpx.HTTPError as exc:
        raise ValueError("Visual studio is unavailable: renderer worker is not reachable.") from exc
    return _decode_response(b"".join(chunks))


async def render_studio(title: str, data: Any, options: dict[str, Any]) -> dict:
    """Generate React JSX and return full-page local screenshots via `_images`."""
    prompt = str(options.get("prompt") or title or "Create a concise visual summary.")
    try:
        viewport_width, viewport_height = _viewport(options)
        if _RENDER_SLOTS.locked():
            raise ValueError("Visual studio is busy; try again shortly.")
        async with _RENDER_SLOTS:
            source = await _generate_source(prompt, data, options.get("complexity"))
            images, metadata = await _render_isolated(source, viewport_width, viewport_height)
        encoded = [base64.b64encode(image.getvalue()).decode("ascii") for image in images]
        return {
            "success": True,
            "message": title or "Visual studio screenshot rendered.",
            "_images": [f"data:image/png;base64,{image}" for image in encoded],
            "capture": metadata,
        }
    except asyncio.CancelledError:
        raise
    except ValueError as exc:
        return {"success": False, "error": str(exc)}
    except Exception:
        logger.exception("Visual studio failed")
        return {"success": False, "error": "Visual studio rendering failed."}
