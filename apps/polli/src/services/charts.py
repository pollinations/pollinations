"""render_visual tool: tables/charts as image attachments.

The AI calls this single tool. The handler picks a path:
  - type="table"     -> local PIL renderer in media_handlers
  - type=<chart>     -> local matplotlib/seaborn in chart_renderer
  - type="free_form" -> Gemini code-execution sandbox (the original
                        data_visualization path, kept as a fallback for
                        anything outside the enum)

The result dict carries images via the ``_images`` (list) side-channel,
which `pollinations.py` extracts into content_blocks before the
result is shown to the model. The model only sees the text part.
"""

from __future__ import annotations

import asyncio
import base64
import io
import logging
from typing import Any

from ..config import config
from ..constants import POLLINATIONS_API_BASE
from .chart_renderer import (
    CHARTS_AVAILABLE,
    get_executor,
    render_chart,
)
from .chart_renderer import (
    SUPPORTED_TYPES as CHART_TYPES,
)
from .media_handlers import render_table_image
from .pollinations import pollinations_client

logger = logging.getLogger(__name__)

GEMINI_SYSTEM_PROMPT = (
    "You are a world-class data visualization expert. Your only job is to visualize "
    "the provided data in the most effective, professional, colorful, and visually stunning "
    "way possible. You have no limits — charts, diagrams, infographics, illustrations, "
    "dashboards, custom graphics, anything. Pick whatever approach best represents the data. "
    "Use a dark background (#313338) with light text to match Discord's theme. "
    "Always execute your code and produce a PNG image."
)


def _png_to_data_url(buf: io.BytesIO) -> str:
    buf.seek(0)
    encoded = base64.b64encode(buf.read()).decode("ascii")
    return f"data:image/png;base64,{encoded}"


def _ok(message: str, images: list[str]) -> dict:
    return {"success": True, "message": message, "_images": images}


def _err(error: str) -> dict:
    return {"success": False, "error": error}


# =============================================================================
# Table dispatch
# =============================================================================


async def _render_table(title: str, data: dict, options: dict) -> dict:
    headers = data.get("headers") or []
    rows = data.get("rows") or []

    if not headers or not rows:
        return _err("Table requires data.headers and data.rows.")

    # Coerce to plain strings for the renderer.
    headers = [str(h) for h in headers]
    rows = [[str(c) for c in row] for row in rows]

    buf, _links = await render_table_image(headers, rows)
    if buf is None:
        return _err("Table rendering failed (PIL unavailable or invalid input).")

    msg = title.strip() if title else "Table rendered."
    return _ok(msg, [_png_to_data_url(buf)])


# =============================================================================
# Chart dispatch (matplotlib/seaborn, off-thread)
# =============================================================================


async def _render_chart_async(chart_type: str, title: str, data: dict, options: dict) -> dict:
    loop = asyncio.get_running_loop()
    try:
        buf = await loop.run_in_executor(get_executor(), render_chart, chart_type, title, data, options)
    except Exception as e:
        logger.error(f"Chart executor failed: {e}", exc_info=True)
        return _err(f"Chart rendering raised: {e}")

    if buf is None:
        return _err(f"Chart type '{chart_type}' could not be rendered with the given data.")

    return _ok(title or f"{chart_type} chart rendered.", [_png_to_data_url(buf)])


# =============================================================================
# Free-form Gemini fallback (the original data_visualization path)
# =============================================================================


async def _render_free_form(prompt: str) -> dict:
    """Hand off to Gemini's code_execution for arbitrary visualizations."""
    try:
        session = await pollinations_client.get_session()
        async with session.post(
            f"{POLLINATIONS_API_BASE}/v1/chat/completions",
            json={
                "model": "gemini",
                "messages": [
                    {"role": "system", "content": GEMINI_SYSTEM_PROMPT},
                    {"role": "user", "content": str(prompt)},
                ],
                "tools": [{"type": "function", "function": {"name": "code_execution"}}],
            },
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {config.pollinations_token}",
            },
        ) as resp:
            if resp.status != 200:
                err = await resp.text()
                logger.error(f"Gemini viz error: {resp.status} - {err[:200]}")
                return _err(f"Visualization API error: {resp.status}")
            resp_data = await resp.json()

        message = resp_data.get("choices", [{}])[0].get("message", {})
        urls: list[str] = []
        for block in message.get("content_blocks", []):
            if block.get("type") == "image_url":
                url = block.get("image_url", {}).get("url", "")
                if url:
                    urls.append(url)

        if not urls:
            logger.warning("No image returned from Gemini free-form viz")
            return _err("No image returned. Try rephrasing.")

        return _ok("Visualization generated.", urls[:10])

    except TimeoutError:
        return _err("Timed out.")
    except Exception as e:
        logger.error(f"Free-form viz failed: {e}", exc_info=True)
        return _err(str(e))


# =============================================================================
# Public tool handler
# =============================================================================


async def render_visual(
    type: str | None = None,
    title: str = "",
    data: Any = None,
    options: dict | None = None,
    **kwargs,
) -> dict:
    """Tool handler. AI calls render_visual(type, title, data, options).

    Backward-compat: if called with ``data`` as a string and no ``type``, route
    to the Gemini free-form path (the legacy data_visualization signature).
    """
    options = options or {}
    chart_type = (type or "").strip().lower() if type else ""

    # Legacy / free-form path: AI passed a string blob.
    if chart_type in ("", "free_form", "freeform"):
        prompt = data if isinstance(data, str) else (kwargs.get("data") or "")
        if isinstance(data, dict):
            # AI provided structured data but no type — describe it for Gemini.
            prompt = f"{title}\n\n{data}".strip()
        if not prompt:
            return _err("render_visual requires either a recognized type + structured data, or a free_form prompt.")
        return await _render_free_form(prompt)

    if chart_type == "table":
        if not isinstance(data, dict):
            return _err("Table requires data: {headers, rows}.")
        return await _render_table(title, data, options)

    if chart_type in CHART_TYPES:
        if not isinstance(data, dict):
            return _err(f"{chart_type} requires data: {{labels, datasets}}.")
        if not CHARTS_AVAILABLE:
            # matplotlib/seaborn missing — fall through to Gemini.
            logger.info(f"Chart deps unavailable, escalating {chart_type} to free_form")
            return await _render_free_form(f"{title}\n\nRender a {chart_type} chart of:\n{data}")
        return await _render_chart_async(chart_type, title, data, options)

    # Unknown type — escalate to free-form so we never hard-fail.
    logger.info(f"Unknown render_visual type '{type}', escalating to free_form")
    prompt = f"{title}\n\nType requested: {type}\nData:\n{data}"
    return await _render_free_form(prompt)


# =============================================================================
# Backward-compat alias for the old tool name.
# =============================================================================


async def data_visualization(data: str = "", **kwargs) -> dict:
    """Legacy alias — accepted for back-compat. Routes to free-form path."""
    return await _render_free_form(data)
