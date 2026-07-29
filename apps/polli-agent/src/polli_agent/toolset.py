"""Tool schemas (OpenAI function-calling) + dispatch to implementations.

Each tool returns a `ToolResult`: `brain` is the text fed back to the model,
`artifacts` are the media items collected for the final API response.
"""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass, field
from typing import Any

from polli_agent.tools import gen, media, shell

logger = logging.getLogger(__name__)


@dataclass
class ToolResult:
    brain: str
    artifacts: list[dict[str, Any]] = field(default_factory=list)


# --------------------------------------------------------------------------- #
# Schemas exposed to the brain
# --------------------------------------------------------------------------- #
TOOL_SCHEMAS: list[dict[str, Any]] = [
    {
        "type": "function",
        "function": {
            "name": "generate_image",
            "description": (
                "Generate one or more images from a text prompt (text-to-image). "
                "Use n>1 to create several variations, e.g. steps of an explanation. "
                "For text/labels/diagrams/infographics prefer models good at typography "
                "(ideogram, gptimage, nanobanana); omit `model` to auto-pick the best."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "prompt": {"type": "string", "description": "What to depict."},
                    "model": {
                        "type": "string",
                        "description": "Optional model id; auto-picked if omitted.",
                    },
                    "width": {"type": "integer", "default": 1024},
                    "height": {"type": "integer", "default": 1024},
                    "n": {
                        "type": "integer",
                        "default": 1,
                        "description": "How many images.",
                    },
                },
                "required": ["prompt"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "edit_image",
            "description": (
                "Edit or transform an existing image (image-to-image). Provide the source "
                "image_url and a prompt describing the change. Pass two source URLs "
                "separated by '|' to blend/combine references. The edited image is attached "
                "to the reply automatically. Best models: nanobanana, kontext, p-image-edit."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "prompt": {"type": "string"},
                    "image_url": {
                        "type": "string",
                        "description": "Source image URL (or two, '|'-separated).",
                    },
                    "model": {"type": "string", "default": "nanobanana"},
                },
                "required": ["prompt", "image_url"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "generate_video",
            "description": (
                "Generate a video. Text-to-video from `prompt`; image-to-video by passing "
                "`image` (start frame); start+end-frame interpolation by passing both `image` "
                "and `end_image`. Only wan-fast, veo, wan-pro and seedance-2.0 honour an end "
                "frame (others silently ignore it) — one is auto-selected when you pass "
                "end_image. Frame URLs must be directly fetchable."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "prompt": {"type": "string"},
                    "model": {"type": "string"},
                    "image": {
                        "type": "string",
                        "description": "Start-frame image URL.",
                    },
                    "end_image": {
                        "type": "string",
                        "description": "End-frame image URL.",
                    },
                    "duration": {"type": "integer", "default": 5},
                    "aspect": {"type": "string", "default": "16:9"},
                },
                "required": ["prompt"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "text_to_speech",
            "description": (
                "Convert text to spoken audio. IMPORTANT: `text` is read aloud VERBATIM. "
                "Write the final narration/script yourself and pass it here — do NOT pass an "
                "instruction like 'read this' or a question; whatever you pass is what is spoken. "
                "Pick a voice from list_models voices if you want a specific one."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "text": {"type": "string", "description": "Exact words to speak."},
                    "voice": {"type": "string"},
                    "model": {"type": "string", "default": "openai-audio"},
                },
                "required": ["text"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "transcribe",
            "description": "Transcribe an audio or video URL (or data: URI) to text.",
            "parameters": {
                "type": "object",
                "properties": {
                    "audio_url": {"type": "string"},
                    "model": {"type": "string", "default": "gemini"},
                },
                "required": ["audio_url"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "web_search",
            "description": "Search the web for current information. Returns a text answer with facts.",
            "parameters": {
                "type": "object",
                "properties": {"query": {"type": "string"}},
                "required": ["query"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "upload_media",
            "description": (
                "Upload media to Pollinations hosting and get a public URL (valid 30+ "
                "days, no auth needed to fetch). Accepts a workspace file path (e.g. a "
                "frame extracted with ffmpeg), a data: URI, or any URL. Use this to turn "
                "local/edited media into URLs that generate_video or edit_image can consume."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "source": {
                        "type": "string",
                        "description": "Workspace path, data: URI, or URL.",
                    },
                    "filename": {
                        "type": "string",
                        "description": "Optional name (extension sets the content type).",
                    },
                },
                "required": ["source"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "fetch_media",
            "description": (
                "Download a media URL into the bash workspace (handles Pollinations "
                "auth for you — curl inside bash cannot). Returns the saved filename; "
                "use it directly in bash/ffmpeg commands afterwards."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "url": {"type": "string"},
                    "filename": {
                        "type": "string",
                        "description": "Optional filename to save as (e.g. clip1.mp4).",
                    },
                },
                "required": ["url"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "bash",
            "description": (
                "Run a shell command in the sandbox (has ffmpeg, curl, python). Use for "
                "media post-processing (concatenate clips, extract frames, mux audio), "
                "downloading files, or any computation. Working dir persists within a request."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "command": {"type": "string"},
                    "timeout": {"type": "integer", "default": 60},
                },
                "required": ["command"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "list_models",
            "description": (
                "List available Pollinations models, optionally filtered by kind "
                "(text|image|video|audio|transcript). Includes voices for audio."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "kind": {
                        "type": "string",
                        "enum": ["text", "image", "video", "audio", "transcript"],
                    }
                },
            },
        },
    },
]


# --------------------------------------------------------------------------- #
# Dispatch
# --------------------------------------------------------------------------- #
async def dispatch(name: str, args: dict[str, Any]) -> ToolResult:
    """Run one tool call and package brain-text + artifacts."""
    try:
        if name == "generate_image":
            urls = await gen.generate_image(**args)
            arts = [{"type": "image", "url": u} for u in urls]
            return ToolResult(
                brain="Generated images:\n" + "\n".join(urls), artifacts=arts
            )

        if name == "edit_image":
            url = await gen.edit_image(**args)
            if url.startswith("data:"):
                # Hosting fallback: never echo megabytes of base64 into context.
                brain = (
                    "Edited image created and attached to the reply "
                    f"(ref edit-{len(url) % 100000}). Do not restate its data."
                )
            else:
                brain = f"Edited image hosted at: {url}"
            return ToolResult(brain=brain, artifacts=[{"type": "image", "url": url}])

        if name == "generate_video":
            url = await gen.generate_video(**args)
            return ToolResult(
                brain=f"Generated video: {url}",
                artifacts=[{"type": "video", "url": url}],
            )

        if name == "text_to_speech":
            res = await gen.text_to_speech(**args)
            art = {
                "type": "audio",
                "data_uri": res["data_uri"],
                "b64": res["b64"],
                "format": res["format"],
                "transcript": res["transcript"],
            }
            # Feed the brain the transcript + a short data-uri marker, NOT the full base64.
            return ToolResult(
                brain=f"Audio generated (spoken verbatim): {res['transcript']!r}",
                artifacts=[art],
            )

        if name == "transcribe":
            text = await gen.transcribe(**args)
            return ToolResult(brain=f"Transcript:\n{text}")

        if name == "web_search":
            text = await gen.web_search(**args)
            return ToolResult(brain=text)

        if name == "upload_media":
            url = await media.upload_media(**args)
            src = str(args.get("filename") or args.get("source") or "").lower()
            # Video/audio uploads are deliverables — attach them so they reach the
            # user even if the brain forgets to link them. Images are usually
            # intermediate frames; generate_image/edit_image attach real ones.
            arts = []
            if src.endswith((".mp4", ".webm", ".mov", ".mkv")):
                arts = [{"type": "video", "url": url}]
            elif src.endswith((".mp3", ".wav", ".ogg", ".m4a", ".flac")):
                arts = [{"type": "audio", "url": url}]
            return ToolResult(brain=f"Uploaded. Public URL: {url}", artifacts=arts)

        if name == "fetch_media":
            path = await media.fetch_media(**args)
            return ToolResult(brain=f"Saved to workspace as: {path}")

        if name == "bash":
            out = await shell.bash(**args)
            return ToolResult(brain=out)

        if name == "list_models":
            from polli_agent.knowledge import models_summary

            return ToolResult(brain=models_summary(args.get("kind")))

        return ToolResult(brain=f"ERROR: unknown tool {name!r}")
    except TypeError as exc:
        return ToolResult(brain=f"ERROR: bad arguments for {name}: {exc}")
    except Exception as exc:  # returned to the brain so it can retry differently
        logger.warning("Tool %s failed: %s", name, exc)
        return ToolResult(brain=f"ERROR from {name}: {exc}")


def parse_args(raw: str | dict[str, Any]) -> dict[str, Any]:
    if isinstance(raw, dict):
        return raw
    try:
        return json.loads(raw or "{}")
    except json.JSONDecodeError:
        return {}
