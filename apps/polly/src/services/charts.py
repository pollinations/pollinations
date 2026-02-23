"""Visualization via Gemini's native code_execution.

System prompt + data as user msg → Gemini with code_execution → image returned.
"""

import logging

import aiohttp

from ..config import config
from ..constants import POLLINATIONS_API_BASE

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = (
    "You are a world-class data visualization expert. Your only job is to visualize "
    "the provided data in the most effective, professional, colorful, and visually stunning "
    "way possible. You have no limits — charts, diagrams, infographics, illustrations, "
    "dashboards, custom graphics, anything. Pick whatever approach best represents the data. "
    "Use a dark background (#313338) with light text to match Discord's theme. "
    "Always execute your code and produce a PNG image."
)


async def data_visualization(data: str, **kwargs) -> dict:
    """Send data to Gemini with code_execution to produce a visualization."""
    try:
        async with aiohttp.ClientSession() as session:
            async with session.post(
                f"{POLLINATIONS_API_BASE}/v1/chat/completions",
                json={
                    "model": "gemini",
                    "messages": [
                        {"role": "system", "content": SYSTEM_PROMPT},
                        {"role": "user", "content": str(data)},
                    ],
                    "tools": [{"type": "function", "function": {"name": "code_execution"}}],
                },
                headers={
                    "Content-Type": "application/json",
                    "Authorization": f"Bearer {config.pollinations_token}",
                },
                timeout=aiohttp.ClientTimeout(total=90),
            ) as resp:
                if resp.status != 200:
                    error = await resp.text()
                    logger.error(f"Visualization API error: {resp.status} - {error[:200]}")
                    return {"success": False, "error": f"API error: {resp.status}"}
                resp_data = await resp.json()

        message = resp_data.get("choices", [{}])[0].get("message", {})
        for block in message.get("content_blocks", []):
            if block.get("type") == "image_url":
                url = block.get("image_url", {}).get("url", "")
                if url:
                    return {"success": True, "message": "Visualization generated.", "_image": url}

        logger.warning("No image returned from Gemini")
        return {"success": False, "error": "No image returned. Try rephrasing."}

    except TimeoutError:
        return {"success": False, "error": "Timed out."}
    except Exception as e:
        logger.error(f"Visualization failed: {e}", exc_info=True)
        return {"success": False, "error": str(e)}
