"""Media hosting (media.pollinations.ai) + workspace transfer tools.

`upload_media` turns local bytes (data URIs, bash-workspace files, or authenticated
Pollinations URLs) into public, unauthenticated URLs — the form video reference
frames and chat clients need. `fetch_media` is the inverse: it downloads media
into the bash workspace so ffmpeg can process it, keeping the API key out of the
shell environment.
"""

from __future__ import annotations

import base64
import mimetypes
import os
import uuid

from floret.config import settings  # noqa: F401  (patched in tests)
from floret.tools.gen import _fetch_bytes, _http_client, _key
from floret.tools.shell import _workdir

MEDIA_BASE = "https://media.pollinations.ai"

_EXT_BY_MIME = {"image/jpeg": ".jpg", "audio/mpeg": ".mp3"}


def _ext_for(mime: str) -> str:
    return _EXT_BY_MIME.get(mime) or mimetypes.guess_extension(mime) or ".bin"


def _workspace_path(name: str) -> str:
    """Resolve `name` inside the bash workspace, refusing path escapes."""
    workdir = os.path.realpath(_workdir())
    full = os.path.realpath(os.path.join(workdir, name))
    if os.path.commonpath([workdir, full]) != workdir:
        raise ValueError(f"path {name!r} is outside the workspace")
    return full


def _name_for_bytes(data: bytes) -> str:
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        ext = ".png"
    elif data.startswith(b"\xff\xd8\xff"):
        ext = ".jpg"
    elif data.startswith((b"<svg", b"<?xml")):
        ext = ".svg"
    elif data.startswith(b"GIF8"):
        ext = ".gif"
    elif data[4:8] == b"ftyp":
        ext = ".mp4"
    elif data.startswith(b"\x1aE\xdf\xa3"):
        ext = ".webm"
    elif data.startswith(b"OggS"):
        ext = ".ogg"
    elif data.startswith(b"fLaC"):
        ext = ".flac"
    elif data.startswith(b"ID3") or data.startswith(b"\xff\xfb"):
        ext = ".mp3"
    elif data.startswith(b"RIFF") and data[8:12] == b"WAVE":
        ext = ".wav"
    elif data.startswith(b"RIFF") and data[8:12] == b"WEBP":
        ext = ".webp"
    else:
        ext = ".bin"
    return f"{uuid.uuid4().hex}{ext}"


async def _read_source(source: str, filename: str | None) -> tuple[bytes, str]:
    """Return (bytes, filename) for a data URI, http(s) URL, or workspace path."""
    if source.startswith("data:"):
        header, _, b64 = source.partition(",")
        mime = header[len("data:") :].split(";")[0] or "application/octet-stream"
        return base64.b64decode(b64), filename or f"{uuid.uuid4().hex}{_ext_for(mime)}"
    if source.startswith(("http://", "https://")):
        data = await _fetch_bytes(source)
        path_name = os.path.basename(source.split("?", 1)[0])
        name = filename or (path_name if "." in path_name else _name_for_bytes(data))
        return data, name
    full = _workspace_path(source)
    if not os.path.isfile(full):
        raise ValueError(f"workspace file not found: {source!r}")
    with open(full, "rb") as f:
        return f.read(), filename or os.path.basename(full)


async def upload_media(source: str, filename: str | None = None) -> str:
    """Upload media to Pollinations hosting; returns a public URL (30-day retention)."""
    data, name = await _read_source(source, filename)
    mime = mimetypes.guess_type(name)[0] or "application/octet-stream"
    r = await _http_client().post(
        f"{MEDIA_BASE}/upload",
        headers={"Authorization": f"Bearer {_key()}"},
        files={"file": (name, data, mime)},
    )
    r.raise_for_status()
    return r.json()["url"]


async def fetch_media(url: str, filename: str | None = None) -> str:
    """Download media (with auth for Pollinations URLs) into the bash workspace.

    Returns the filename relative to the workspace, ready to use in `bash`.
    """
    name = filename or os.path.basename(url.split("?", 1)[0]) or "media.bin"
    full = _workspace_path(name)
    data = await _fetch_bytes(url)
    with open(full, "wb") as f:
        f.write(data)
    return os.path.relpath(full, os.path.realpath(_workdir()))
