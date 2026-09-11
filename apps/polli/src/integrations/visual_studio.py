"""Isolated React/Tailwind screenshot renderer for Polli visual studio."""

from __future__ import annotations

import asyncio
import base64
import io
import json
import logging
import os
import re
import shutil
import tempfile
import uuid
from pathlib import Path
from typing import Any

from ..ai.client import pollinations_client
from ..ai.complexity import model_for_complexity

logger = logging.getLogger(__name__)

VISUAL_STUDIO_IMAGE = "polli-visual-studio:1"
MAX_PROMPT_CHARS = 4_000
MAX_JSX_CHARS = 20_000
MAX_DATA_CHARS = 12_000
MAX_PNG_BYTES = 20 * 1024 * 1024
MAX_IMAGES = 10
DEFAULT_VIEWPORT_WIDTH = 1440
DEFAULT_VIEWPORT_HEIGHT = 900
MIN_VIEWPORT_WIDTH = 320
MAX_VIEWPORT_WIDTH = 3840
MIN_VIEWPORT_HEIGHT = 240
MAX_VIEWPORT_HEIGHT = 2160
DOCKER_PREFLIGHT_TIMEOUT_SECONDS = 5
RENDER_TIMEOUT_SECONDS = 30
SECCOMP_PROFILE = Path(__file__).resolve().parents[2] / "seccomp_profile.json"
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


async def _run_bounded(*command: str, timeout: int) -> int:
    process = await asyncio.create_subprocess_exec(
        *command,
        stdin=asyncio.subprocess.DEVNULL,
        stdout=asyncio.subprocess.DEVNULL,
        stderr=asyncio.subprocess.DEVNULL,
        env={"PATH": os.environ.get("PATH", "")},
    )
    try:
        return await asyncio.wait_for(process.wait(), timeout=timeout)
    except (TimeoutError, asyncio.CancelledError):
        process.kill()
        await process.wait()
        raise


async def _remove_container(name: str) -> None:
    try:
        return_code = await _run_bounded("docker", "rm", "-f", name, timeout=DOCKER_PREFLIGHT_TIMEOUT_SECONDS)
        if return_code != 0:
            logger.warning("Failed to reap visual studio container %s", name)
    except (OSError, TimeoutError):
        logger.warning("Failed to reap visual studio container %s", name)


def _renderer_error(stderr: bytes) -> str:
    text = stderr.decode(errors="replace")[-4_000:]
    matches = re.findall(r"Error: ([^\r\n]+)", text)
    if matches:
        return f"Visual studio renderer rejected the page: {matches[-1]}"
    return "Visual studio is unavailable: isolated renderer failed."


async def _render_isolated(
    source: str, viewport_width: int = DEFAULT_VIEWPORT_WIDTH, viewport_height: int = DEFAULT_VIEWPORT_HEIGHT
) -> tuple[list[io.BytesIO], dict[str, Any]]:
    """Render the entire DOM in a networkless, privilege-dropped container."""
    if not shutil.which("docker"):
        raise ValueError("Visual studio is unavailable: Docker is not installed.")
    if not SECCOMP_PROFILE.is_file():
        raise ValueError("Visual studio is unavailable: sandbox profile is missing.")
    try:
        available = await _run_bounded("docker", "info", timeout=DOCKER_PREFLIGHT_TIMEOUT_SECONDS)
    except TimeoutError as exc:
        raise ValueError("Visual studio is unavailable: Docker daemon readiness timed out.") from exc
    if available != 0:
        raise ValueError("Visual studio is unavailable: Docker daemon is not running.")

    with tempfile.TemporaryDirectory(prefix="polli-visual-") as directory:
        work_dir = Path(directory)
        metadata_path = work_dir / "metadata.json"
        source_path = work_dir / "visual.jsx"
        source_path.write_text(source, encoding="utf-8")
        work_dir.chmod(0o755)
        source_path.chmod(0o644)
        metadata_path.touch()
        metadata_path.chmod(0o666)
        for index in range(1, MAX_IMAGES + 1):
            output_path = work_dir / f"visual-{index}.png"
            output_path.touch()
            output_path.chmod(0o666)
        container_name = f"polli-visual-{uuid.uuid4().hex}"
        command = [
            "docker",
            "run",
            "--name",
            container_name,
            "--network",
            "none",
            "--read-only",
            "--cap-drop",
            "ALL",
            "--cap-add",
            "SYS_CHROOT",
            "--security-opt",
            "no-new-privileges",
            "--security-opt",
            f"seccomp={SECCOMP_PROFILE}",
            "--pids-limit",
            "128",
            "--memory",
            "512m",
            "--cpus",
            "1",
            "--tmpfs",
            "/tmp:rw,noexec,nosuid,size=128m",
            "-v",
            f"{work_dir.resolve()}:/work:rw",
            VISUAL_STUDIO_IMAGE,
            "/work/visual.jsx",
            "/work/visual",
            "/work/metadata.json",
            str(viewport_width),
            str(viewport_height),
        ]
        process = await asyncio.create_subprocess_exec(
            *command,
            stdin=asyncio.subprocess.DEVNULL,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            env={"PATH": os.environ.get("PATH", "")},
        )
        stderr = b""
        try:
            _, stderr = await asyncio.wait_for(process.communicate(), timeout=RENDER_TIMEOUT_SECONDS)
        except TimeoutError as exc:
            raise ValueError("Visual studio renderer exceeded its time limit.") from exc
        finally:
            await asyncio.shield(_remove_container(container_name))
            if process.returncode is None:
                process.kill()
                await process.wait()
        if process.returncode or not metadata_path.is_file():
            logger.warning("Visual studio renderer failed: %s", stderr.decode(errors="replace")[-2_000:])
            raise ValueError(_renderer_error(stderr))

        metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
        image_metadata = metadata.get("images")
        if not isinstance(image_metadata, list) or not 1 <= len(image_metadata) <= MAX_IMAGES:
            raise ValueError("Visual studio is unavailable: renderer returned invalid image metadata.")
        images = []
        for index, _details in enumerate(image_metadata, start=1):
            output_path = work_dir / f"visual-{index}.png"
            if not output_path.is_file() or output_path.stat().st_size > MAX_PNG_BYTES:
                raise ValueError("Visual studio is unavailable: renderer output is too large or missing.")
            image = output_path.read_bytes()
            if not image.startswith(b"\x89PNG\r\n\x1a\n"):
                raise ValueError("Visual studio is unavailable: renderer returned an invalid PNG.")
            images.append(io.BytesIO(image))
        return images, metadata


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
