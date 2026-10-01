"""Publish data URIs and authenticated media URLs to public media hosting."""

from __future__ import annotations

import base64
import mimetypes
import os
import uuid

from floret.tools.gen import _fetch_bytes, _http_client, _key

MEDIA_BASE = "https://media.pollinations.ai"
MAX_UPLOAD_BYTES = 100 * 1024 * 1024

_EXT_BY_MIME = {"image/jpeg": ".jpg", "audio/mpeg": ".mp3"}


def _ext_for(mime: str) -> str:
    return _EXT_BY_MIME.get(mime) or mimetypes.guess_extension(mime) or ".bin"


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
    elif data.startswith((b"ID3", b"\xff\xfb")):
        ext = ".mp3"
    elif data.startswith(b"RIFF") and data[8:12] == b"WAVE":
        ext = ".wav"
    elif data.startswith(b"RIFF") and data[8:12] == b"WEBP":
        ext = ".webp"
    else:
        ext = ".bin"
    return f"{uuid.uuid4().hex}{ext}"


async def _read_source(source: str, filename: str | None) -> tuple[bytes, str]:
    """Return (bytes, filename) for a data URI or HTTP(S) URL."""
    if source.startswith("data:"):
        header, _, b64 = source.partition(",")
        if len(b64) > ((MAX_UPLOAD_BYTES + 2) // 3) * 4:
            raise ValueError(f"media exceeds {MAX_UPLOAD_BYTES} byte upload limit")
        mime = header[len("data:") :].split(";")[0] or "application/octet-stream"
        data = base64.b64decode(b64)
        if len(data) > MAX_UPLOAD_BYTES:
            raise ValueError(f"media exceeds {MAX_UPLOAD_BYTES} byte upload limit")
        return data, filename or f"{uuid.uuid4().hex}{_ext_for(mime)}"
    if source.startswith(("http://", "https://")):
        data = await _fetch_bytes(source, max_bytes=MAX_UPLOAD_BYTES)
        path_name = os.path.basename(source.split("?", 1)[0])
        name = filename or (
            path_name if mimetypes.guess_type(path_name)[0] else _name_for_bytes(data)
        )
        return data, name
    raise ValueError(
        "source must be an HTTP(S) URL or data URI; publish Computer files with assets publish"
    )


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
    payload = r.json()
    url = payload.get("url") if isinstance(payload, dict) else None
    if not isinstance(url, str) or not url:
        raise RuntimeError("media upload response did not contain a URL")
    return url
